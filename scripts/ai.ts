// The AI drafting pipeline's commands (docs/ai-drafting.md). Run through npm:
//
//   npm run ai:status                       every text: its facts, and whether it is drafted, approved or stale
//   npm run ai:facts [-- <id>…]             write the generated facts files (dossiers need a data snapshot)
//   npm run ai:draft -- <id>… | --all [--pr]   draft with the API (ANTHROPIC_API_KEY), check, save as drafts;
//                                           --pr commits them on a new branch and opens a pull request
//   npm run ai:paste -- <id> <file>         the manual path: check a draft made in a Claude chat and save it
//   npm run ai:own -- <id> <file>           save the owner's own text; it is never overwritten and has no AI label
//   npm run ai:check [-- <id>…]             check stored texts against their facts (CI runs this)
//   npm run ai:approve -- <id> [--text-hash <h>] [--via cli|telegram]   approve a short text
//
// A text id is dossier:USA, history:nato, river:nile, page:about or hub:power.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { checkDraft, problemLines, strayNumbers } from '../src/lib/ai/check.ts';
import { AI_MODEL, MANUAL_MODEL } from '../src/lib/ai/config.ts';
import { anthropicClient, draftText, NoKeyError, type DraftClient } from '../src/lib/ai/draft.ts';
import { canonical, duplicateFacts, factsHash, factsPath, kindOf, loadFacts, refusals, validateFacts, type FactsFile } from '../src/lib/ai/facts.ts';
import { tryLoadDossierFacts } from '../src/lib/ai/current.ts';
import { hubFacts, pageFacts } from '../src/lib/ai/page-facts.ts';
import { approveText, currentHash, isLong, readText, saveDraft, stateOf, textHash, writeText, type Via } from '../src/lib/ai/store.ts';
import { currentFacts, isTextId, TEXT_IDS } from '../src/lib/ai/texts.ts';
import { place } from '../src/lib/places.ts';

const today = () => new Date().toISOString().slice(0, 10);
const say = (s: string) => process.stdout.write(`${s}\n`);
class Stop extends Error {}
const stop = (s: string): never => { throw new Stop(s); };

function ids(args: string[], all: boolean): string[] {
  const named = args.filter((a) => !a.startsWith('--'));
  if (all || !named.length) return TEXT_IDS;
  for (const id of named) if (!isTextId(id)) stop(`Unknown text "${id}". Texts: ${TEXT_IDS.join(', ')}`);
  return named;
}
const flag = (args: string[], name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

/** The facts a generator makes now, for the files that are generated (dossiers, pages, hubs). */
function generated(id: string): FactsFile | null {
  const [kind, name] = [kindOf(id), id.split(':')[1]];
  if (kind === 'dossier') return tryLoadDossierFacts(name);
  if (kind === 'page') return pageFacts(name, today());
  if (kind === 'hub') return hubFacts(name, today());
  return null;
}

function writeFacts(f: FactsFile) {
  const p = factsPath(f.id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(f, null, 2)}\n`);
}

/** Problems that make a facts file unusable, and warnings the owner should see. */
function lint(f: FactsFile): { errors: string[]; warnings: string[] } {
  const errors = validateFacts(f, (p) => Boolean(place(p)));
  const warnings = [
    ...f.facts.flatMap((x) => strayNumbers(x, f.names).map((n) => `fact "${x.id}": "${n}" in the statement is not its value; give it a fact of its own`)),
    ...duplicateFacts(f).map(([a, b]) => `facts "${a.id}" and "${b.id}" say the same thing; keep one ("${a.statement}" / "${b.statement}")`),
  ];
  return { errors, warnings };
}

function cmdFacts(args: string[]) {
  for (const id of ids(args, args.includes('--all'))) {
    const g = generated(id);
    const f = g ?? loadFacts(id);
    if (!f) { say(`${id}: no facts${kindOf(id) === 'dossier' ? ' (dossier facts need a data snapshot: npm run data:pull)' : ''}`); continue; }
    const { errors, warnings } = lint(f);
    if (g) {
      if (!errors.length) {
        // Keep each fact's date when nothing else changed, so a regeneration does not rewrite every date.
        const old = loadFacts(id);
        if (old && factsHash(old) === factsHash(g)) { say(`${id}: unchanged`); continue; }
        writeFacts(g);
      }
      say(`${id}: ${errors.length ? 'not written' : 'written'}, ${g.facts.length} facts${g.sample ? ' (from the sample data: drafting will refuse it)' : ''}`);
    } else say(`${id}: by hand, ${f.facts.length} facts`);
    for (const e of errors) say(`  error: ${e}`);
    for (const w of warnings) say(`  warning: ${w}`);
  }
}

function factsState(id: string): string {
  const f = currentFacts(id);
  if (!f) return kindOf(id) === 'dossier' ? 'needs a data snapshot' : 'missing';
  const bits: string[] = [`${f.facts.length} facts`];
  const unverified = f.facts.filter((x) => x.unverified).length;
  if (unverified) bits.push(`${unverified} unverified`);
  if (f.sample) bits.push('sample data');
  const g = kindOf(id) === 'page' || kindOf(id) === 'hub' ? generated(id) : null;
  if (g && factsHash(g) !== factsHash(f)) bits.push('out of date with the code: run npm run ai:facts');
  if (validateFacts(f, (p) => Boolean(place(p))).length) bits.push('invalid');
  const dups = duplicateFacts(f).length;
  if (dups) bits.push(`${dups} duplicate${dups === 1 ? '' : 's'}: see npm run ai:facts`);
  return bits.join(', ');
}

function cmdStatus(args: string[]) {
  const rows = ids(args, true).map((id) => {
    const t = readText(id);
    const state = stateOf(t, t?.author === 'ai' ? currentFacts(id) : null);
    const legacy = t && t.author === 'ai' && !t.factsHash ? ' (drafted before the pipeline)' : '';
    return `${id.padEnd(24)} ${(state + legacy).padEnd(36)} ${factsState(id)}`;
  });
  say(`${'Text'.padEnd(24)} ${'Text state'.padEnd(36)} Facts`);
  rows.forEach(say);
}

/** Checks one stored text against its current facts; returns lines to show, empty when it passes. */
function checkStored(id: string): { lines: string[]; checked: boolean } {
  const t = readText(id);
  if (!t || !t.text.trim()) return { lines: [], checked: false };
  if (t.author === 'owner') return { lines: [], checked: false };
  // Drafts made before the pipeline carry no facts hash; they are checked once they are approved or redrafted.
  if (!t.factsHash && !t.approved) return { lines: [], checked: false };
  const f = currentFacts(id);
  if (!f) return { lines: kindOf(id) === 'dossier' ? [] : [`${id}: no facts file`], checked: false };
  const out: string[] = [];
  if (t.factsHash !== currentHash(t, f)) out.push(`${id}: ${t.usedFacts ? `facts it uses (${t.usedFacts.length})` : 'its facts'} changed since it was drafted (stored ${t.factsHash ?? 'none'}, now ${currentHash(t, f)}): redraft it, or for a pasted text run npm run ai:paste again.`);
  const r = checkDraft(t.text, f);
  if (!r.ok) out.push(`${id}: the text does not pass the check:`, ...problemLines(r));
  if (t.approved && !t.approvedOn) out.push(`${id}: approved, but approvedOn (the approval date, YYYY-MM-DD) is missing.`);
  return { lines: out, checked: true };
}

function cmdCheck(args: string[]) {
  let failed = 0;
  let checked = 0;
  for (const id of ids(args, args.includes('--all'))) {
    const r = checkStored(id);
    if (r.checked) checked++;
    if (r.lines.length) { failed++; r.lines.forEach(say); }
  }
  say(`${checked} texts checked, ${failed} with problems.`);
  if (failed) process.exitCode = 1;
}

function cmdPaste(args: string[], author: 'ai' | 'owner') {
  const [id, file] = args.filter((a) => !a.startsWith('--'));
  if (!id || !file) stop(`Usage: npm run ai:${author === 'ai' ? 'paste' : 'own'} -- <text id> <file>`);
  if (!isTextId(id)) stop(`Unknown text "${id}".`);
  if (!existsSync(file)) stop(`No file ${file}.`);
  const text = readFileSync(file, 'utf8').trim();
  if (author === 'owner') {
    const old = readText(id);
    writeText({ id, text, author: 'owner', approved: true, approvedOn: today(), approvedVia: 'cli', drafted: today(), model: undefined, factsHash: old?.factsHash });
    say(`${id}: saved as the owner's own text. The drafting script will never overwrite it, and it carries no AI label.`);
    return;
  }
  const f = currentFacts(id) ?? stop(`${id}: no facts to check against.`);
  const refused = refusals(f);
  if (refused.length) stop(`${id}: nothing can be drafted from these facts yet:\n${refused.join('\n')}`);
  const r = checkDraft(text, f);
  if (!r.ok) stop(`${id}: the pasted draft does not pass the check:\n${problemLines(r).join('\n')}`);
  saveDraft(id, { text, model: MANUAL_MODEL, facts: f, on: today() });
  say(`${id}: passed the check and saved as a draft (text hash ${textHash(text)}). It shows on the site once approved.`);
}

function cmdApprove(args: string[]) {
  const [id] = args.filter((a) => !a.startsWith('--'));
  if (!id || !isTextId(id)) stop('Usage: npm run ai:approve -- <text id> [--text-hash <hash>] [--via cli|telegram]');
  const via = (flag(args, 'via') ?? (isLong(id) ? 'pr' : 'cli')) as Via;
  if (!['cli', 'telegram', 'pr'].includes(via)) stop('--via is cli, telegram or pr');
  const f = currentFacts(id) ?? stop(`${id}: no facts to check against.`);
  const t = approveText(id, f, { on: flag(args, 'on') ?? today(), via, textHash: flag(args, 'text-hash') });
  say(`${id}: approved on ${t.approvedOn} (${via}).`);
}

export interface DraftRun { drafted: { id: string; text: string; model: string; attempts: number }[]; skipped: string[]; dropped: { id: string; problems: string[] }[] }

/** Drafts every text asked for that can be drafted, and saves each passing draft. */
export async function runDrafts(list: string[], client: DraftClient): Promise<DraftRun> {
  const run: DraftRun = { drafted: [], skipped: [], dropped: [] };
  for (const id of list) {
    const t = readText(id);
    if (t?.author === 'owner') { run.skipped.push(`${id}: written by the owner, never redrafted`); continue; }
    const g = kindOf(id) === 'dossier' ? generated(id) : null;
    if (g) writeFacts(g);
    const f = g ?? loadFacts(id);
    if (!f) { run.skipped.push(`${id}: no facts${kindOf(id) === 'dossier' ? ' (needs a data snapshot)' : ''}`); continue; }
    const errors = validateFacts(f, (p) => Boolean(place(p)));
    if (errors.length) { run.skipped.push(`${id}: the facts file has errors: ${errors.join('; ')}`); continue; }
    if (t?.factsHash && t.factsHash === currentHash(t, f) && t.text.trim()) { run.skipped.push(`${id}: already drafted from these facts (${t.approved ? 'approved' : 'waiting for approval'})`); continue; }
    const r = await draftText(f, client);
    if (r.ok) { saveDraft(id, { text: r.text, model: r.model, facts: f, on: today() }); run.drafted.push({ id, text: r.text, model: r.model, attempts: r.attempts }); } else if (r.reason === 'refused') run.skipped.push(...r.problems.map((p) => `${p}`));
    else run.dropped.push({ id, problems: r.problems });
  }
  return run;
}

export function prBody(run: DraftRun): string {
  const lines = ['AI drafts from the facts files, made with `npm run ai:draft` and checked figure by figure against them (docs/ai-drafting.md).', ''];
  const long = run.drafted.filter((d) => isLong(d.id));
  const short = run.drafted.filter((d) => !isLong(d.id));
  if (long.length) {
    lines.push('## Pages to approve in this pull request', '', 'Open each page on the Preview. To approve one, edit its file in this pull request: set `approved: true` and `approvedOn:` to today\'s date (YYYY-MM-DD), then merge. Leave `approved: false` to keep it as a draft.', '');
    for (const d of long) lines.push(`- \`${d.id}\`: ${kindOf(d.id) === 'hub' ? d.text : `${d.text.split(/\s+/).length} words`}`);
    lines.push('');
  }
  if (short.length) {
    lines.push('## Short texts', '', 'These are saved as drafts and show nothing on the site until approved. Once this pull request is merged, each is sent to the owner on Telegram with Approve, Edit and Skip (docs/telegram.md); `npm run ai:approve -- <id>` still works too.', '');
    for (const d of short) lines.push(`### ${d.id}`, '', `> ${d.text.replace(/\n+/g, ' ')}`, '', `Text hash ${textHash(d.text)}, ${d.model}, ${d.attempts === 1 ? 'passed first time' : 'passed on the redraft'}.`, '');
  }
  if (run.dropped.length) {
    lines.push('## Dropped', '', 'Failed the check twice; nothing was saved.', '');
    for (const d of run.dropped) lines.push(`- \`${d.id}\`:`, ...d.problems.map((p) => `  ${p}`));
    lines.push('');
  }
  if (run.skipped.length) lines.push('## Not drafted', '', ...run.skipped.map((s) => `- ${s}`), '');
  return lines.join('\n');
}

async function cmdDraft(args: string[]) {
  const list = ids(args, args.includes('--all'));
  let client: DraftClient;
  try { client = anthropicClient(); } catch (e) { if (e instanceof NoKeyError) stop(e.message); throw e; }
  say(`Drafting ${list.length} text(s) with ${AI_MODEL}…`);
  const run = await runDrafts(list, client);
  const body = prBody(run);
  say(body);
  if (!args.includes('--pr') || !run.drafted.length) return;
  const branch = `ai-drafts/${today()}-${Date.now().toString(36)}`;
  const git = (...a: string[]) => execFileSync('git', a, { stdio: 'inherit' });
  git('switch', '-c', branch);
  git('add', 'src/data/ai', 'src/content');
  git('commit', '-m', `AI drafts: ${run.drafted.map((d) => d.id).join(', ')}`);
  git('push', '-u', 'origin', branch);
  writeFileSync('.ai-pr-body.md', body);
  execFileSync('gh', ['pr', 'create', '--title', `AI drafts (${today()})`, '--body-file', '.ai-pr-body.md', '--head', branch], { stdio: 'inherit' });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'facts': return cmdFacts(args);
    case 'status': return cmdStatus(args);
    case 'check': return cmdCheck(args);
    case 'paste': return cmdPaste(args, 'ai');
    case 'own': return cmdPaste(args, 'owner');
    case 'approve': return cmdApprove(args);
    case 'draft': return cmdDraft(args);
    case 'hash': { const f = currentFacts(args[0]); return say(f ? `${factsHash(f)}\n${canonical(f).length} bytes` : 'no facts'); }
    default: stop('Commands: status, facts, draft, paste, own, check, approve (see docs/ai-drafting.md)');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    if (e instanceof Stop || e instanceof NoKeyError || (e instanceof Error && /^(page|hub|dossier|river|history):/.test(e.message))) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    } else throw e;
  });
}
