import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../../worker/index';
import { digestCron, handleUpdate, sameSecret, type TelegramEnv } from '../../worker/telegram';
import { callbackData, digestAt, digestDue, editRef, parseCallback, parseEditRef } from '../../src/lib/review';

// The bot's webhook (worker/telegram.ts) and the protocol it shares with the scripts (src/lib/review.ts).
// fetch is stubbed: every call to Telegram or GitHub is recorded, nothing leaves the test.

const OWNER = '1001';
const BOT = '777';
const env: TelegramEnv = {
  TELEGRAM_BOT_TOKEN: `${BOT}:secret-token`, TELEGRAM_CHAT_ID: OWNER, TELEGRAM_WEBHOOK_SECRET: 'hook-secret',
  GH_DISPATCH_TOKEN: 'gh', TELEGRAM_CHANNEL_ID: '@geopoliticstools',
};
type Call = { url: string; body: Record<string, unknown> };

function stubFetch(o: { dispatch?: number; channel?: number } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url, body });
    if (url.endsWith('/dispatches')) return new Response(null, { status: o.dispatch ?? 204 });
    if (url.endsWith('/sendMessage') && body.chat_id === env.TELEGRAM_CHANNEL_ID) return new Response('{}', { status: o.channel ?? 200 });
    return Response.json({ ok: true });
  }));
  return calls;
}
const method = (c: Call) => c.url.split('/').pop();
afterEach(() => vi.unstubAllGlobals());

const owner = { id: Number(OWNER), is_bot: false };
const chat = { id: Number(OWNER), type: 'private' };
const tap = (data: string, o: { from?: { id: number }; chat?: { id: number; type: string }; text?: string } = {}) => ({
  callback_query: { id: 'q1', from: o.from ?? owner, data, message: { message_id: 50, chat: o.chat ?? chat, text: o.text ?? 'draft', entities: [{ type: 'url', offset: 0, length: 5 }] } },
});

describe('the review protocol', () => {
  it('round-trips the buttons and refuses anything else', () => {
    for (const c of [{ action: 'a', id: 'week:2026-45', hash: 'abcdef012345' }, { action: 's', id: 'history:nato', hash: '0123456789ab' }, { action: 'e', id: 'dossier:USA', hash: 'abcdef012345' }, { action: 'p', week: '2026-45' }] as const) {
      expect(parseCallback(callbackData(c))).toEqual(c);
      expect(callbackData(c).length).toBeLessThanOrEqual(64);
    }
    for (const bad of ['a|page:about|abcdef012345', 'a|week:2026-45|xyz', 'a|week:2026-45|abcdef012345|x', 'p|2026-60', 'z|week:2026-45|abcdef012345', 42, undefined]) expect(parseCallback(bad)).toBeNull();
  });

  it('reads which text and version an Edit reply corrects from the prompt it answers', () => {
    expect(parseEditRef(`Reply with the corrected text.\n\n${editRef('river:nile', 'abcdef012345')}`)).toEqual({ id: 'river:nile', hash: 'abcdef012345' });
    expect(parseEditRef('ref page:about abcdef012345')).toBeNull();
    expect(parseEditRef('no ref')).toBeNull();
  });

  it('runs the digest on Monday at 08 UTC unless DIGEST_AT says otherwise', () => {
    expect(digestAt()).toEqual({ day: 1, hour: 8 });
    expect(digestAt('tuesday 6')).toEqual({ day: 2, hour: 6 });
    expect(digestAt('nonsense')).toEqual({ day: 1, hour: 8 });
    expect(digestDue(new Date('2026-11-09T08:41:00Z'))).toBe(true);
    expect(digestDue(new Date('2026-11-09T09:41:00Z'))).toBe(false);
    expect(digestDue(new Date('2026-11-10T06:41:00Z'), 'tue 06')).toBe(true);
  });

  it('compares secrets whole', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
  });
});

describe('the webhook', () => {
  const post = (body: unknown, headers: Record<string, string> = { 'X-Telegram-Bot-Api-Secret-Token': 'hook-secret' }, e: Partial<Env> = env, host = 'geopolitics.tools') =>
    worker.fetch(new Request(`https://${host}/api/telegram`, { method: 'POST', headers, body: JSON.stringify(body) }) as never, { ASSETS: {} as Env['ASSETS'], ...e } as Env, {} as never);

  it('answers only Telegram, with the secret token, and only when configured', async () => {
    const calls = stubFetch();
    expect((await post(tap('a|week:2026-45|abcdef012345'), {})).status).toBe(401);
    expect((await post(tap('a|week:2026-45|abcdef012345'), { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' })).status).toBe(401);
    expect((await post(tap('a|week:2026-45|abcdef012345'), undefined, { ...env, TELEGRAM_WEBHOOK_SECRET: undefined })).status).toBe(503);
    expect((await worker.fetch(new Request('https://geopolitics.tools/api/telegram') as never, { ASSETS: {} as Env['ASSETS'], ...env } as Env, {} as never)).status).toBe(405);
    expect(calls).toEqual([]);
  });

  it('is reachable while the domain is on the holding page', async () => {
    stubFetch();
    expect((await post({ update_id: 1 }, undefined, { ...env, HOLDING: 'true' })).status).toBe(200);
  });

  it('starts the review run on Approve, then takes the buttons away', async () => {
    const calls = stubFetch();
    const res = await post(tap('a|week:2026-45|abcdef012345'));
    expect(res.status).toBe(200);
    const d = calls.find((c) => c.url.endsWith('/dispatches'))!;
    expect(d.url).toBe('https://api.github.com/repos/justinasweb/geopolitics-tools/actions/workflows/ai-review.yml/dispatches');
    expect(d.body).toEqual({ ref: 'main', inputs: { action: 'approve', id: 'week:2026-45', hash: 'abcdef012345' } });
    expect(calls.map(method)).toEqual(['dispatches', 'answerCallbackQuery', 'editMessageReplyMarkup']);
  });

  it('records Skip the same way', async () => {
    const calls = stubFetch();
    expect(await handleUpdate(tap('s|river:nile|abcdef012345'), env)).toMatchObject({ did: 'dispatched', action: 'skip', id: 'river:nile', status: 204 });
    expect(calls[0].body).toMatchObject({ inputs: { action: 'skip' } });
  });

  it('keeps the buttons and says so when the run cannot be started', async () => {
    const calls = stubFetch({ dispatch: 403 });
    await handleUpdate(tap('a|week:2026-45|abcdef012345'), env);
    expect(calls.map(method)).toEqual(['dispatches', 'answerCallbackQuery']);
    expect(calls[1].body).toMatchObject({ show_alert: true });
  });

  it('ignores anyone but the owner, in the owner’s private chat', async () => {
    const calls = stubFetch();
    expect(await handleUpdate(tap('a|week:2026-45|abcdef012345', { from: { id: 2002 } }), env)).toMatchObject({ did: 'ignored' });
    expect(await handleUpdate(tap('a|week:2026-45|abcdef012345', { chat: { id: Number(OWNER), type: 'group' } }), env)).toMatchObject({ did: 'ignored' });
    expect(await handleUpdate({ message: { message_id: 1, chat: { id: 2002, type: 'private' }, from: { id: 2002 }, text: '/start' } }, env)).toMatchObject({ did: 'ignored' });
    expect(calls).toEqual([]);
  });

  it('asks for the corrected text on Edit, and passes the reply on to be checked', async () => {
    const calls = stubFetch();
    expect(await handleUpdate(tap('e|river:nile|abcdef012345'), env)).toEqual({ did: 'edit-prompt', id: 'river:nile' });
    const prompt = calls.find((c) => method(c) === 'sendMessage')!;
    expect(prompt.body.reply_markup).toMatchObject({ force_reply: true });
    expect(parseEditRef(prompt.body.text)).toEqual({ id: 'river:nile', hash: 'abcdef012345' });

    calls.length = 0;
    const reply = { message: { message_id: 61, chat, from: owner, text: '  The corrected text.  ', reply_to_message: { message_id: 60, chat, from: { id: Number(BOT), is_bot: true }, text: prompt.body.text as string } } };
    expect(await handleUpdate(reply, env)).toMatchObject({ did: 'dispatched', action: 'edit', id: 'river:nile' });
    expect(calls[0].body).toEqual({ ref: 'main', inputs: { action: 'edit', id: 'river:nile', hash: 'abcdef012345', text: 'The corrected text.' } });
  });

  it('does not take a reply to someone else’s message, or an over-long one, as a correction', async () => {
    const calls = stubFetch();
    const to = { message_id: 60, chat, from: { id: 999, is_bot: true }, text: `x\n\n${editRef('river:nile', 'abcdef012345')}` };
    expect(await handleUpdate({ message: { message_id: 61, chat, from: owner, text: 'x', reply_to_message: to } }, env)).toEqual({ did: 'help' });
    const ours = { ...to, from: { id: Number(BOT), is_bot: true } };
    expect(await handleUpdate({ message: { message_id: 62, chat, from: owner, text: 'x'.repeat(4000), reply_to_message: ours } }, env)).toMatchObject({ did: 'replied', why: 'too long' });
    expect(calls.some((c) => c.url.endsWith('/dispatches'))).toBe(false);
  });

  it('posts the digest to the channel exactly as the owner saw it, only on Post', async () => {
    const calls = stubFetch();
    expect(await handleUpdate(tap('p|2026-45', { text: 'Week 45 on geopolitics.tools' }), env)).toEqual({ did: 'posted', week: '2026-45' });
    const sent = calls.find((c) => method(c) === 'sendMessage')!;
    expect(sent.body).toMatchObject({ chat_id: '@geopoliticstools', text: 'Week 45 on geopolitics.tools', entities: [{ type: 'url', offset: 0, length: 5 }] });
    expect(sent.body.reply_markup).toBeUndefined();

    calls.length = 0;
    expect(await handleUpdate(tap('x|2026-45'), env)).toEqual({ did: 'not-posted', week: '2026-45' });
    expect(calls.some((c) => c.body.chat_id === '@geopoliticstools')).toBe(false);
  });

  it('never posts while the site is on the holding page, or without a channel', async () => {
    const calls = stubFetch();
    expect(await handleUpdate(tap('p|2026-45'), { ...env, HOLDING: 'true' })).toMatchObject({ did: 'refused', why: 'holding' });
    expect(await handleUpdate(tap('p|2026-45'), { ...env, TELEGRAM_CHANNEL_ID: undefined })).toMatchObject({ did: 'refused', why: 'no channel' });
    expect(calls.some((c) => c.body.chat_id === '@geopoliticstools')).toBe(false);
  });
});

describe('the digest’s clock', () => {
  it('starts the week workflow’s digest at its hour, never while on the holding page', async () => {
    const calls = stubFetch();
    expect(await digestCron(env, new Date('2026-11-09T07:41:00Z'))).toEqual({ digest: 'not due' });
    expect(await digestCron({ ...env, HOLDING: 'true' }, new Date('2026-11-09T08:41:00Z'))).toEqual({ digest: 'holding' });
    expect(calls).toEqual([]);
    expect(await digestCron(env, new Date('2026-11-09T08:41:00Z'))).toEqual({ digest: 204 });
    expect(calls[0].url).toMatch(/workflows\/week\.yml\/dispatches$/);
    expect(calls[0].body).toEqual({ ref: 'main', inputs: { task: 'digest' } });
  });
});
