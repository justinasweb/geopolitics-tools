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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export type DigestResult = 'holding' | 'not archived' | 'not live' | 'sent' | 'not sent';

/** Sends the owner the digest for review, with Post and Don't post. */
export async function digest(id: string, b: Bot, o: { holding: boolean; check?: (url: string) => Promise<number> }): Promise<DigestResult> {
  if (o.holding) { say(T.digestHolding); return 'holding'; }
  const w = loadWeek(id);
  if (!w) { await b.send(T.digestNotArchived(weekNumber(id))); return 'not archived'; }
  const url = weekUrl(id);
  const status = await (o.check ?? pageStatus)(url);
  if (status !== 200) { await b.send(T.digestNotLive(url, status || 'no answer')); return 'not live'; }
  const s = publishedText(`week:${id}`);
  const post = digestPost(id, w, s && s.ai ? s.text : null);
  await b.send(escapeHtml(T.digestIntro(weekNumber(id))), { parse_mode: 'HTML' });
  const sent = await b.send(post, { reply_markup: digestKeyboard(id, T.buttons), link_preview_options: { is_disabled: false, url } });
  return sent ? 'sent' : 'not sent';
}

async function pageStatus(url: string): Promise<number> {
  try {
    return (await fetch(url, { method: 'HEAD', redirect: 'manual' })).status;
  } catch {
    return 0;
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
