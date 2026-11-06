// What the Telegram review step agrees on (docs/telegram.md): the scripts that send a draft for review
// (scripts/review.ts, scripts/week.ts), the Worker that receives the button taps (worker/telegram.ts) and the GitHub
// Actions run that records the decision (.github/workflows/ai-review.yml). Nothing is stored between them: each
// button carries the text's id and the hash of the exact version shown, and the run acts only on that version.
// Imports nothing, so the Worker can use it as it is.

/** The short texts reviewed on Telegram: dossier, history and river summaries, and This week's summary. */
export const REVIEW_ID = /^(dossier:[A-Z]{3}|history:[a-z0-9-]{1,30}|river:[a-z0-9-]{1,30}|week:\d{4}-(0[1-9]|[1-4]\d|5[0-3]))$/;
/** The text hash (src/lib/ai/store.ts, textHash): 12 hex characters. */
export const HASH = /^[0-9a-f]{12}$/;
export const WEEK = /^\d{4}-(0[1-9]|[1-4]\d|5[0-3])$/;
/** The longest correction the Worker passes on (Telegram's own limit is 4,096 characters). */
export const MAX_EDIT = 3500;

/** Review buttons: a = Approve, e = Edit, s = Skip. Digest buttons: p = Post, x = Don't post. */
export type Callback =
  | { action: 'a' | 'e' | 's'; id: string; hash: string }
  | { action: 'p' | 'x'; week: string };

/** Telegram allows 64 bytes of callback data; the longest here ("e|history:…30…|hash") stays under it. */
export const callbackData = (c: Callback) => ('week' in c ? `${c.action}|${c.week}` : `${c.action}|${c.id}|${c.hash}`);

export function parseCallback(data: unknown): Callback | null {
  if (typeof data !== 'string' || data.length > 64) return null;
  const [action, a, b, ...rest] = data.split('|');
  if (rest.length) return null;
  if ((action === 'a' || action === 'e' || action === 's') && REVIEW_ID.test(a ?? '') && HASH.test(b ?? '')) return { action, id: a, hash: b };
  if ((action === 'p' || action === 'x') && WEEK.test(a ?? '') && b === undefined) return { action, week: a };
  return null;
}

export interface Button { text: string; callback_data: string }
export const reviewKeyboard = (id: string, hash: string, t: { approve: string; edit: string; skip: string }) => ({
  inline_keyboard: [[
    { text: t.approve, callback_data: callbackData({ action: 'a', id, hash }) },
    { text: t.edit, callback_data: callbackData({ action: 'e', id, hash }) },
    { text: t.skip, callback_data: callbackData({ action: 's', id, hash }) },
  ]] as Button[][],
});
export const digestKeyboard = (week: string, t: { post: string; dontPost: string }) => ({
  inline_keyboard: [[
    { text: t.post, callback_data: callbackData({ action: 'p', week }) },
    { text: t.dontPost, callback_data: callbackData({ action: 'x', week }) },
  ]] as Button[][],
});

/** The line at the end of the Edit prompt that says which text and version a reply corrects. */
export const editRef = (id: string, hash: string) => `ref ${id} ${hash}`;
/**
 * Reads the ref line of an Edit prompt. `head` is the prompt's fixed first line: the bot sends other messages that
 * carry outside text (a correction report holds a reader's words), and only a message that opens with it counts.
 */
export function parseEditRef(text: unknown, head: string): { id: string; hash: string } | null {
  if (typeof text !== 'string' || !head || text.split('\n', 1)[0] !== head) return null;
  const m = text.match(/(?:^|\n)ref (\S+) ([0-9a-f]{12})\s*$/);
  return m && REVIEW_ID.test(m[1]) ? { id: m[1], hash: m[2] } : null;
}

/** The inputs of the ai-review workflow run that records a decision. */
export type ReviewAction = 'approve' | 'skip' | 'edit';
export const ACTIONS: Record<'a' | 's', ReviewAction> = { a: 'approve', s: 'skip' };
export const REVIEW_WORKFLOW = 'ai-review.yml';
export const WEEK_WORKFLOW = 'week.yml';

// ---- The weekly digest's day --------------------------------------------------------------------------------------

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** When the digest is prepared and sent to the owner for review: Monday, 08:00 UTC, unless DIGEST_AT says otherwise. */
export const DIGEST_DEFAULT = 'mon 08';

/** "mon 08" → Monday (1) at 08 UTC. A value it cannot read falls back to the default. */
export function digestAt(v?: string): { day: number; hour: number } {
  const m = (v ?? '').trim().toLowerCase().match(/^([a-z]{3})[a-z]*\s+(\d{1,2})(?::00)?$/);
  const day = m ? DAYS.indexOf(m[1]) : -1;
  const hour = m ? Number(m[2]) : -1;
  if (day < 0 || hour < 0 || hour > 23) return v && v.trim() ? digestAt(DIGEST_DEFAULT) : { day: 1, hour: 8 };
  return { day, hour };
}

/** Whether the hourly cron at `now` is the digest's hour. The cron runs once an hour, so this is true once a week. */
export const digestDue = (now: Date, setting?: string) => {
  const { day, hour } = digestAt(setting);
  return now.getUTCDay() === day && now.getUTCHours() === hour;
};
