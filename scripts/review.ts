// The Telegram review step's commands (docs/telegram.md), run by the ai-review workflow. Run through npm:
//
//   npm run ai:review -- send <id>…                      send drafts to the owner with Approve, Edit and Skip
//   npm run ai:review -- send --changed <from> <to>      send the drafts whose files changed between two commits
//   npm run ai:review -- approve <id> --text-hash <h>    the owner tapped Approve on that version
//   npm run ai:review -- skip <id> --text-hash <h>       the owner tapped Skip
//   npm run ai:review -- edit <id> --text-hash <h>       the owner replied to Edit; the text is in REVIEW_TEXT
//
// Each decision runs the same steps as the command line (src/lib/ai/store.ts) and tells the owner how it went. A
// decision that cannot be recorded (the text changed since, the correction fails the check) is reported to the owner
// and changes nothing; the run still succeeds, since nothing is broken. GITHUB_OUTPUT gets commit=true when a file
// changed, and deploy=true when what the site shows may have changed.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { TELEGRAM_TEXT as T } from '../src/i18n/telegram.en.ts';
import { kindOf, type FactsFile } from '../src/lib/ai/facts.ts';
import { approveText, editText, readText, skipText, stateOf, textHash, TEXTS_DIR, type StoredText } from '../src/lib/ai/store.ts';
import { currentFacts } from '../src/lib/ai/texts.ts';
import { HASH, REVIEW_ID, reviewKeyboard } from '../src/lib/review.ts';
import { weekNumber } from '../src/lib/week/period.ts';
import { bot, escapeHtml, type Bot } from './telegram.ts';

const today = () => new Date().toISOString().slice(0, 10);
const say = (s: string) => process.stdout.write(`${s}\n`);
const output = (k: string, v: string) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
class Stop extends Error {}

/** "This week's summary, week 45 of 2026 (2 November 2026 to 8 November 2026)". */
export const label = (id: string, facts: FactsFile | null) => `${T.kind[kindOf(id)] ?? id}, ${facts?.subject ?? id}`;

/** The review message: title, the draft exactly as it would be published, what it is, and the three buttons. */
export function reviewMessage(t: StoredText, facts: FactsFile | null) {
  const hash = textHash(t.text);
  const text = [
    `📝 <b>${escapeHtml(T.reviewTitle(T.kind[kindOf(t.id)] ?? t.id, facts?.subject ?? t.id))}</b>`,
    '',
    escapeHtml(t.text),
    '',
    `<i>${escapeHtml(T.reviewMeta({ id: t.id, drafted: t.drafted, model: t.model, edited: t.edited, hash }))}</i>`,
    escapeHtml(T.reviewHelp),
  ].join('\n');
  return { text, extra: { parse_mode: 'HTML', reply_markup: reviewKeyboard(t.id, hash, T.buttons) } };
}

/** Sends one draft for review. Only a draft (not approved, skipped, stale or the owner's own) is sent. */
export async function sendReview(id: string, b: Bot): Promise<boolean> {
  const t = readText(id);
  const facts = currentFacts(id);
  const state = stateOf(t, t?.author === 'ai' ? facts : null);
  if (!t || state !== 'draft') { say(`${id}: ${state}, not sent for review`); return false; }
  const m = reviewMessage(t, facts);
  const sent = await b.send(m.text, m.extra);
  say(`${id}: ${sent ? 'sent for review' : 'not sent (Telegram is not configured or refused it)'}`);
  return sent;
}

/** The short texts whose files changed between two commits. */
export function changedIds(from: string, to: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', from, to, '--', TEXTS_DIR], { encoding: 'utf8' });
  return out.split('\n').map((p) => p.match(/\/(dossiers|history|rivers|weeks)\/([^/]+)\.json$/)).filter((m) => m !== null)
    .map((m) => `${{ dossiers: 'dossier', history: 'history', rivers: 'river', weeks: 'week' }[m[1]]}:${m[2]}`).filter((id) => REVIEW_ID.test(id));
}

export type Decision = 'approve' | 'skip' | 'edit';

/** Records one decision and tells the owner. Returns whether a file changed. */
export async function decide(action: Decision, id: string, hash: string, b: Bot, o: { text?: string; on?: string } = {}): Promise<boolean> {
  if (!REVIEW_ID.test(id)) throw new Stop(`Not a text reviewed on Telegram: "${id}"`);
  if (!HASH.test(hash)) throw new Stop(`Not a text hash: "${hash}"`);
  const facts = currentFacts(id);
  const name = label(id, facts);
  const on = o.on ?? today();
  try {
    if (!facts) throw new Error(`${id}: no facts to check against${kindOf(id) === 'dossier' ? ' (dossier facts need the data snapshot)' : ''}.`);
    if (action === 'approve') {
      approveText(id, facts, { on, via: 'telegram', textHash: hash });
      await b.send(T.approved(name));
    } else if (action === 'skip') {
      skipText(id, { on, textHash: hash });
      await b.send(kindOf(id) === 'week' ? T.weekSkipped(weekNumber(id.slice(5))) : T.skipped(name));
    } else {
      editText(id, o.text ?? '', facts, { on, textHash: hash });
      await sendReview(id, b);
    }
    say(`${id}: ${action} recorded`);
    return true;
  } catch (e) {
    const reason = (e as Error).message;
    say(`${id}: ${action} not recorded: ${reason}`);
    await b.send(action === 'edit' ? T.editFailed(name, reason) : T.failed(T.what[action], name, reason));
    return false;
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const named = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
  const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const b = bot();
  if (cmd === 'send') {
    const changed = args.indexOf('--changed');
    const ids = changed >= 0 ? changedIds(args[changed + 1], args[changed + 2]) : named;
    if (!ids.length) say('Nothing to send.');
    for (const id of ids) {
      if (!REVIEW_ID.test(id)) throw new Stop(`Not a text reviewed on Telegram: "${id}" (long pages are approved in a pull request)`);
      await sendReview(id, b);
    }
    return;
  }
  if (cmd === 'approve' || cmd === 'skip' || cmd === 'edit') {
    const [id] = named;
    const hash = flag('text-hash') ?? '';
    const changed = await decide(cmd, id, hash, b, { text: process.env.REVIEW_TEXT });
    output('commit', String(changed));
    output('deploy', String(changed && cmd !== 'edit'));
    return;
  }
  throw new Stop('Commands: send, approve, skip, edit (see docs/telegram.md)');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    if (e instanceof Stop) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    } else throw e;
  });
}
