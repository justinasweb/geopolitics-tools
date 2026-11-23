// This week's summary and the weekly digest (docs/telegram.md), run by the week workflow. Run through npm:
//
//   npm run week:summary [-- --week 2026-45]   after the data run froze a week: write its facts, draft the summary
//                                              (ANTHROPIC_API_KEY), check it, save it as a draft and send it to the
//                                              owner for review. Without a key, or if the draft fails the check
//                                              twice, the week has no summary and its page shows the cards only.
//   npm run week:digest [-- --week 2026-45]    on the digest's day: send the owner the post for the Telegram channel
//                                              (a link to the week's archive page and its approved summary, or the
//                                              three counts) with a Post button. Nothing reaches the channel until
//                                              the owner taps Post, and nothing at all while SITE_HOLDING is true.
//
// Both read the frozen week from data/raw/weeks/<id>.json (pipeline/pull.ts brings it from R2). Without --week they
// take the last closed week. GITHUB_OUTPUT gets commit=true when the summary run saved files, and deploy=true when it
// handled a newly archived week, so the archive page goes live (production rebuilds only on a deploy).
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { TELEGRAM_TEXT as T } from '../src/i18n/telegram.en.ts';
import { range } from '../src/i18n/week.en.ts';
import { SECTION_SLUGS } from '../src/i18n/slugs.en.ts';
import { anthropicClient, draftText, NoKeyError, type DraftClient } from '../src/lib/ai/draft.ts';
import { factsPath, validateFacts, type FactsFile } from '../src/lib/ai/facts.ts';
import { readText, saveDraft } from '../src/lib/ai/store.ts';
import { publishedText } from '../src/lib/ai/texts.ts';
import { weekCounts, weekFacts } from '../src/lib/ai/week-facts.ts';
import { place } from '../src/lib/places.ts';
import { siteName } from '../src/lib/site.ts';
import { digestKeyboard, WEEK } from '../src/lib/review.ts';
import type { WeekData } from '../src/lib/week/model.ts';
import { lastClosedWeek, weekNumber, weekRange } from '../src/lib/week/period.ts';
import { sendReview } from './review.ts';
import { bot, escapeHtml, type Bot } from './telegram.ts';

const say = (s: string) => process.stdout.write(`${s}\n`);
const output = (k: string, v: string) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const today = () => new Date().toISOString().slice(0, 10);
const weeksDir = () => join(process.env.GT_DATA_DIR ?? join(process.cwd(), 'data/raw'), 'weeks');

export function loadWeek(id: string, dir = weeksDir()): WeekData | null {
  const p = join(dir, `${id}.json`);
  if (!existsSync(p)) return null;
  const w = JSON.parse(readFileSync(p, 'utf8')) as WeekData;
  return w.v === 1 && w.cards.length ? w : null;
}

/** The week's archive page on the site. */
export const weekUrl = (id: string, host = siteName) => `https://${host}/${SECTION_SLUGS['this-week']}/${id}`;

export interface SummaryResult { outcome: 'not frozen' | 'exists' | 'no figures' | 'no key' | 'drafted' | 'dropped' | 'refused'; detail?: string }

/** Writes the week's facts, drafts its summary and sends it for review. Never redrafts a week that has a text. */
export async function summary(id: string, client: () => DraftClient, b: Bot, on = today()): Promise<SummaryResult> {
  const w = loadWeek(id);
  if (!w) return { outcome: 'not frozen' };
  const textId = `week:${id}`;
  const old = readText(textId);
  if (old) return { outcome: 'exists', detail: old.skipped ? 'skipped' : old.approved ? 'approved' : 'draft' };
  const facts = weekFacts(id, w);
  const errors = validateFacts(facts, (p) => Boolean(place(p)));
  if (errors.length) throw new Error(`${textId}: the generated facts have errors: ${errors.join('; ')}`);
  if (facts.facts.length < 2) return { outcome: 'no figures' };
  writeFacts(facts);
  let c: DraftClient;
  try {
    c = client();
  } catch (e) {
    if (!(e instanceof NoKeyError)) throw e;
    await b.send(T.summaryNoKey(weekNumber(id)));
    return { outcome: 'no key' };
  }
  const r = await draftText(facts, c);
  if (!r.ok) {
    if (r.reason === 'refused') return { outcome: 'refused', detail: r.problems.join('\n') };
    await b.send(T.summaryDropped(weekNumber(id), r.problems.join('\n')));
    return { outcome: 'dropped', detail: r.problems.join('\n') };
  }
  saveDraft(textId, { text: r.text, model: r.model, facts, on });
  await sendReview(textId, b);
  return { outcome: 'drafted' };
}

function writeFacts(f: FactsFile) {
  const p = factsPath(f.id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(f, null, 2)}\n`);
}

/** The digest post: the week, its approved summary (with the AI note) or its counts, and the link. Plain text, so
 *  what the owner sees is exactly what the channel gets. */
export function digestPost(id: string, w: WeekData, summaryText: string | null, host = siteName): string {
  const { from, to } = weekRange(id);
  const lines = [T.digestTitle(weekNumber(id), range(from, to, { long: true })), ''];
  if (summaryText) lines.push(summaryText, '', T.digestAi);
  else {
    const counts = weekCounts(w);
    if (counts.length) lines.push(T.digestCountsLead, ...counts.map((c) => `• ${T.digestCounts[c.kind](c.n, c.lists)}`));
  }
  lines.push('', T.digestLink(weekUrl(id, host)));
  return lines.join('\n');
}

export type DigestResult = 'holding' | 'not archived' | 'not live' | 'deploy failed' | 'sent' | 'not sent';

/** What the check of the week's page found: its status, and whether Cloudflare blocked the check itself (a 403 with
 *  cf-mitigated or a challenge page), which says nothing about whether the page is live. */
export interface PageCheck { status: number; blocked?: boolean }
/** Whether a production deploy (ci.yml's production job) that includes the commit adding the week succeeded. */
export interface DeployCheck { state: 'ok' | 'failed' | 'unknown'; detail: string }

/** Sends the owner the digest for review, with Post and Don't post. It refuses only when the page is really missing
 *  (404, 410) or the deploy failed: a check Cloudflare blocks, or that gets no answer or a server error, falls back to
 *  the deploy, and the owner, who reviews every digest before it is posted, is told the page was not checked. */
export async function digest(id: string, b: Bot, o: { holding: boolean; check?: (url: string) => Promise<PageCheck>; deployed?: (id: string) => Promise<DeployCheck> }): Promise<DigestResult> {
  if (o.holding) { say(T.digestHolding); return 'holding'; }
  const w = loadWeek(id);
  if (!w) { await b.send(T.digestNotArchived(weekNumber(id))); return 'not archived'; }
  const url = weekUrl(id);
  const page = await (o.check ?? checkPage)(url);
  if (page.status === 404 || page.status === 410) { await b.send(T.digestNotLive(url, page.status)); return 'not live'; }
  if (page.status !== 200) {
    const why = page.blocked ? T.digestBlocked(page.status) : page.status ? String(page.status) : 'no answer';
    const d = await (o.deployed ?? productionDeployed)(id);
    say(`week ${id}: could not check ${url} (${why}); deploy ${d.state}: ${d.detail}`);
    if (d.state === 'failed') { await b.send(T.digestDeployFailed(url, why, d.detail)); return 'deploy failed'; }
    await b.send(T.digestUnchecked(url, why, d.state === 'ok' ? d.detail : null));
  }
  const s = publishedText(`week:${id}`);
  const post = digestPost(id, w, s && s.ai ? s.text : null);
  await b.send(escapeHtml(T.digestIntro(weekNumber(id))), { parse_mode: 'HTML' });
  const sent = await b.send(post, { reply_markup: digestKeyboard(id, T.buttons), link_preview_options: { is_disabled: false, url } });
  return sent ? 'sent' : 'not sent';
}

/** Says who is asking, so the check is not taken for an anonymous bot (it runs from GitHub Actions). */
export const DIGEST_AGENT = 'geopolitics-tools-digest (+https://geopolitics.tools)';

/** Checks the week's page with a GET (some protections refuse HEAD) and tells a Cloudflare block apart from the page's
 *  own answer. */
export async function checkPage(url: string, get: typeof fetch = fetch): Promise<PageCheck> {
  try {
    const r = await get(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': DIGEST_AGENT, Accept: 'text/html' } });
    if (r.status !== 403) return { status: r.status };
    if (r.headers.has('cf-mitigated')) return { status: 403, blocked: true };
    const body = await r.text().catch(() => '');
    return { status: 403, blocked: /challenge-platform|cf-chl|cf_chl_opt|Just a moment\.\.\.|Attention Required! \| Cloudflare/i.test(body) };
  } catch {
    return { status: 0 };
  }
}

const run = promisify(execFile);
/** `gh api` as JSON (GH_TOKEN in the workflow). */
const ghApi = async (path: string): Promise<unknown> => JSON.parse((await run('gh', ['api', path], { maxBuffer: 16 * 1024 * 1024 })).stdout);

/**
 * The fallback when the page cannot be checked: the commit that added the week's facts (the summary run commits them
 * and then starts the production deploy), and ci.yml's runs on main whose commit includes it. A successful production
 * job among them means the week's page was deployed; only failed ones mean it was not. Anything else is unknown.
 */
export async function productionDeployed(id: string, api: (path: string) => Promise<unknown> = ghApi, repo = process.env.GITHUB_REPOSITORY): Promise<DeployCheck> {
  if (!repo) return { state: 'unknown', detail: 'GITHUB_REPOSITORY is not set' };
  try {
    const path = `src/data/ai/facts/weeks/${id}.json`;
    const commits = (await api(`repos/${repo}/commits?sha=main&path=${encodeURIComponent(path)}&per_page=1`)) as { sha: string }[];
    const sha = commits[0]?.sha;
    if (!sha) return { state: 'unknown', detail: `no commit on main adds ${path}` };
    const { workflow_runs: runs } = (await api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&per_page=30`)) as { workflow_runs: { id: number; head_sha: string; event: string; html_url: string }[] };
    let failed: string | null = null;
    for (const r of runs.filter((x) => x.event === 'push' || x.event === 'workflow_dispatch')) {
      if (r.head_sha !== sha) {
        const { status } = (await api(`repos/${repo}/compare/${sha}...${r.head_sha}`)) as { status: string };
        if (status !== 'ahead' && status !== 'identical') continue;
      }
      const { jobs } = (await api(`repos/${repo}/actions/runs/${r.id}/jobs`)) as { jobs: { name: string; conclusion: string | null }[] };
      const prod = jobs.find((j) => j.name === 'production');
      if (prod?.conclusion === 'success') return { state: 'ok', detail: r.html_url };
      if (prod?.conclusion === 'failure') failed ??= r.html_url;
    }
    return failed ? { state: 'failed', detail: failed } : { state: 'unknown', detail: `no finished production deploy includes ${sha.slice(0, 7)}` };
  } catch (e) {
    return { state: 'unknown', detail: `GitHub API: ${(e as Error).message.split('\n')[0]}` };
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const i = args.indexOf('--week');
  const id = i >= 0 ? args[i + 1] : lastClosedWeek(today());
  if (!WEEK.test(id ?? '')) throw new Error(`Not a week: "${id}" (expected 2026-45)`);
  const b = bot();
  if (cmd === 'summary') {
    const r = await summary(id, () => anthropicClient(), b);
    say(`week ${id}: ${r.outcome}${r.detail ? `\n${r.detail}` : ''}`);
    output('commit', String(['drafted', 'dropped', 'no key'].includes(r.outcome)));
    // Production rebuilds only on a deploy: start one so the week's archive page is live before the digest links to it.
    output('deploy', String(r.outcome !== 'not frozen' && r.outcome !== 'exists'));
    return;
  }
  if (cmd === 'digest') {
    say(`week ${id}: digest ${await digest(id, b, { holding: process.env.SITE_HOLDING === 'true' })}`);
    return;
  }
  throw new Error('Commands: summary, digest (see docs/telegram.md)');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
  });
}
