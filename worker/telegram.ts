// POST /api/telegram: the bot's webhook (docs/telegram.md). Telegram calls it when the owner taps a button under a
// draft sent for review (Approve, Edit, Skip) or under the weekly digest (Post, Don't post), or replies to an Edit
// prompt with corrected text.
//
// - Only Telegram can call it: every call must carry the secret given to setWebhook (TELEGRAM_WEBHOOK_SECRET) in
//   the X-Telegram-Bot-Api-Secret-Token header, compared in constant time.
// - Only the owner can act: taps and messages count only from the owner's private chat with the bot
//   (TELEGRAM_CHAT_ID). Anything else gets a plain 200, so Telegram does not retry it, and nothing happens.
// - It stores nothing. A decision on a draft starts a GitHub Actions run (ai-review.yml, with GH_DISPATCH_TOKEN) that
//   records it in the repository with the text's id and the hash of the version the owner saw, both carried in the
//   button itself; the normal deploy follows. The digest's Post button sends the message the owner saw, as it is,
//   to the channel (TELEGRAM_CHANNEL_ID), and never while the site is on the holding page (HOLDING).
//
// It also holds the weekly digest's clock: the hourly Cron Trigger calls digestCron, which starts the week workflow's
// digest at the hour DIGEST_AT names (default Monday 08:00 UTC).
import { TELEGRAM_TEXT as T } from '../src/i18n/telegram.en';
import { ACTIONS, MAX_EDIT, REVIEW_WORKFLOW, WEEK_WORKFLOW, digestDue, editRef, parseCallback, parseEditRef } from '../src/lib/review';
import { dispatch, type GitHubEnv } from './github';

export interface TelegramEnv extends GitHubEnv {
  TELEGRAM_BOT_TOKEN?: string;
  /** The owner's private chat with the bot: alerts, correction reports and reviews go there. */
  TELEGRAM_CHAT_ID?: string;
  /** The secret_token given to setWebhook. Without it the webhook answers 503 and does nothing. */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** The public channel the weekly digest is posted to (its @name or numeric id). */
  TELEGRAM_CHANNEL_ID?: string;
  /** "true" while the site's domain serves the holding page: nothing is posted to the channel. */
  HOLDING?: string;
  /** The digest's day and hour, "mon 08" (UTC). */
  DIGEST_AT?: string;
}

/** What one update led to, for the log and the tests. */
export type Outcome =
  | { did: 'ignored'; why: string }
  | { did: 'dispatched'; action: string; id: string; status: number }
  | { did: 'edit-prompt'; id: string }
  | { did: 'posted' | 'not-posted' | 'refused'; week: string; why?: string }
  | { did: 'help' | 'replied'; why?: string };

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

/** Equal strings, compared without stopping at the first difference. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function tg(env: TelegramEnv, method: string, body: object): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

interface Chat { id: number | string; type?: string }
interface User { id: number | string; is_bot?: boolean }
interface Message { message_id: number; chat: Chat; from?: User; text?: string; entities?: unknown[]; reply_to_message?: Message }
interface CallbackQuery { id: string; from: User; data?: string; message?: Message }
export interface Update { update_id?: number; message?: Message; callback_query?: CallbackQuery }

const isOwner = (env: TelegramEnv, chat?: Chat, from?: User) =>
  Boolean(chat && from && chat.type === 'private' && String(chat.id) === env.TELEGRAM_CHAT_ID && String(from.id) === env.TELEGRAM_CHAT_ID);
/** The bot's own user id is the part of its token before the colon. */
const botId = (env: TelegramEnv) => (env.TELEGRAM_BOT_TOKEN ?? '').split(':')[0];

export async function telegramWebhook(request: Request, env: TelegramEnv): Promise<Response> {
  if (request.method !== 'POST') return reply({ ok: false, error: 'method not allowed' }, 405);
  if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply({ ok: false, error: 'not configured' }, 503);
  if (!sameSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', env.TELEGRAM_WEBHOOK_SECRET)) return reply({ ok: false, error: 'forbidden' }, 401);
  if (Number(request.headers.get('Content-Length') ?? 0) > 65_536) return reply({ ok: false, error: 'too large' }, 413);
  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return reply({ ok: true });
  }
  const outcome = await handleUpdate(update, env);
  // The log names what was done, never the text of a message.
  console.log(JSON.stringify({ telegram: outcome }));
  return reply({ ok: true });
}

export async function handleUpdate(u: Update, env: TelegramEnv): Promise<Outcome> {
  if (u.callback_query) return onCallback(u.callback_query, env);
  if (u.message) return onMessage(u.message, env);
  return { did: 'ignored', why: 'no message or button' };
}

async function onCallback(q: CallbackQuery, env: TelegramEnv): Promise<Outcome> {
  const msg = q.message;
  if (!msg || !isOwner(env, msg.chat, q.from)) return { did: 'ignored', why: 'not the owner' };
  const c = parseCallback(q.data);
  if (!c) {
    await answerer(env, q)(T.stale);
    return { did: 'ignored', why: 'unknown button' };
  }

  if (!('week' in c)) return onReview(c, q, msg, env);
  return onDigest(c, q, msg, env);
}

type Answer = (text?: string, alert?: boolean) => Promise<Response>;
const answerer = (env: TelegramEnv, q: CallbackQuery): Answer => (text, alert = false) =>
  tg(env, 'answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text, show_alert: alert } : {}) });
const buttonsOff = (env: TelegramEnv, msg: Message) => tg(env, 'editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } });

async function onReview(c: { action: 'a' | 'e' | 's'; id: string; hash: string }, q: CallbackQuery, msg: Message, env: TelegramEnv): Promise<Outcome> {
  const answer = answerer(env, q);
  const clearButtons = () => buttonsOff(env, msg);
  if (c.action === 'a' || c.action === 's') {
    const status = await dispatch(env, REVIEW_WORKFLOW, { action: ACTIONS[c.action], id: c.id, hash: c.hash });
    if (status !== 204) {
      await answer(T.dispatchFailed(status || 'no GH_DISPATCH_TOKEN'), true);
      return { did: 'dispatched', action: ACTIONS[c.action], id: c.id, status };
    }
    await answer(T.recorded[c.action]);
    await clearButtons();
    return { did: 'dispatched', action: ACTIONS[c.action], id: c.id, status };
  }

  if (c.action === 'e') {
    await answer();
    await tg(env, 'sendMessage', {
      chat_id: msg.chat.id, text: T.editPrompt(c.id, editRef(c.id, c.hash)),
      reply_markup: { force_reply: true, input_field_placeholder: c.id },
    });
    return { did: 'edit-prompt', id: c.id };
  }
  return { did: 'ignored', why: 'unknown button' };
}

async function onDigest(c: { action: 'p' | 'x'; week: string }, q: CallbackQuery, msg: Message, env: TelegramEnv): Promise<Outcome> {
  const answer = answerer(env, q);
  const clearButtons = () => buttonsOff(env, msg);
  if (c.action === 'x') {
    await answer(T.notPosted);
    await clearButtons();
    return { did: 'not-posted', week: c.week };
  }

  // Post: the message the owner saw goes to the channel as it is (its text and formatting, without the buttons).
  if (env.HOLDING === 'true') {
    await answer(T.postHolding, true);
    return { did: 'refused', week: c.week, why: 'holding' };
  }
  if (!env.TELEGRAM_CHANNEL_ID) {
    await answer(T.postNoChannel, true);
    return { did: 'refused', week: c.week, why: 'no channel' };
  }
  if (!msg.text) {
    await answer(T.stale);
    return { did: 'refused', week: c.week, why: 'no text' };
  }
  const res = await tg(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHANNEL_ID, text: msg.text, ...(msg.entities ? { entities: msg.entities } : {}),
    link_preview_options: { is_disabled: false },
  });
  if (!res.ok) {
    await answer(T.postFailed(res.status), true);
    return { did: 'refused', week: c.week, why: `channel ${res.status}` };
  }
  await answer(T.posted);
  await clearButtons();
  return { did: 'posted', week: c.week };
}

async function onMessage(m: Message, env: TelegramEnv): Promise<Outcome> {
  if (!isOwner(env, m.chat, m.from)) return { did: 'ignored', why: 'not the owner' };
  const send = (text: string) => tg(env, 'sendMessage', { chat_id: m.chat.id, text, reply_parameters: { message_id: m.message_id } });
  const to = m.reply_to_message;
  const ref = to && String(to.from?.id) === botId(env) ? parseEditRef(to.text) : null;
  if (!ref) {
    await send(T.help);
    return { did: 'help' };
  }
  const text = (m.text ?? '').trim();
  if (!text) {
    await send(T.editNoText);
    return { did: 'replied', why: 'no text' };
  }
  if (text.length > MAX_EDIT) {
    await send(T.editTooLong(MAX_EDIT));
    return { did: 'replied', why: 'too long' };
  }
  const status = await dispatch(env, REVIEW_WORKFLOW, { action: 'edit', id: ref.id, hash: ref.hash, text });
  await send(status === 204 ? T.editReceived : T.dispatchFailed(status || 'no GH_DISPATCH_TOKEN'));
  return { did: 'dispatched', action: 'edit', id: ref.id, status };
}

/** The hourly cron's part: at the digest's hour, start the week workflow's digest (never while on the holding page). */
export async function digestCron(env: TelegramEnv, now: Date): Promise<{ digest: 'not due' | 'holding' | number }> {
  if (!digestDue(now, env.DIGEST_AT)) return { digest: 'not due' };
  if (env.HOLDING === 'true') return { digest: 'holding' };
  return { digest: await dispatch(env, WEEK_WORKFLOW, { task: 'digest' }) };
}
