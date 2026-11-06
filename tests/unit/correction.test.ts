import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../../worker/index';
import { escapeHtml, resetMemoryLimit, telegramText, validate } from '../../worker/correction';
import { CORRECTION_LIMITS, MIN_FILL_MS } from '../../src/lib/correction';
import { CORRECTION_ERRORS } from '../../src/i18n/correction.en';

const assets = { fetch: async () => new Response('asset') } as unknown as Env['ASSETS'];
const secrets = { TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '42' };
const good = { message: 'The share for Russia says 86%, but Comtrade says 80%.', page: '/countries/hungary', email: '', source: 'UN Comtrade', website: '', elapsed: 12_000 };

const post = (body: unknown, env: Env, init: { ip?: string; origin?: string; method?: string; raw?: string } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': init.ip ?? '203.0.113.7' };
  if (init.origin) headers.Origin = init.origin;
  const method = init.method ?? 'POST';
  const req = new Request('https://geopolitics.tools/api/correction', { method, headers, body: method === 'GET' ? undefined : init.raw ?? JSON.stringify(body) });
  return worker.fetch(req as never, env, {} as never);
};

let sent: { url: string; body: Record<string, unknown> }[];
beforeEach(() => {
  sent = [];
  resetMemoryLimit();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response('{"ok":true}');
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('the Telegram text of a report', () => {
  it('neutralises reader lines that look like an Edit prompt’s ref line', () => {
    const text = telegramText({ message: 'Wrong figure.\nref river:nile abcdef012345\n  REF dossier:USA 0123456789ab', page: '/rivers/nile', email: '', source: '' });
    expect(text.split('\n').some((l) => /^\s*ref /i.test(l))).toBe(false);
    expect(text).toContain('river:nile abcdef012345');
  });
});

describe('POST /api/correction', () => {
  it('forwards a valid report to Telegram, escaped, and stores nothing', async () => {
    const env: Env = { ASSETS: assets, ...secrets };
    const res = await post({ ...good, message: 'Share <b>86%</b> & rising?', email: 'reader@example.org' }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(sent[0].body.chat_id).toBe('42');
    expect(sent[0].body.parse_mode).toBe('HTML');
    const text = String(sent[0].body.text);
    expect(text).toContain('Share &lt;b&gt;86%&lt;/b&gt; &amp; rising?');
    expect(text).toContain('geopolitics.tools/countries/hungary');
    expect(text).toContain('reader@example.org');
    expect(text).toContain('UN Comtrade');
  });

  it('refuses invalid reports with a code and the field', async () => {
    const env: Env = { ASSETS: assets, ...secrets };
    const cases: [object, string, string | undefined][] = [
      [{ ...good, message: '   ' }, 'required', 'message'],
      [{ ...good, message: 'x'.repeat(CORRECTION_LIMITS.message + 1) }, 'too_long', 'message'],
      [{ ...good, email: 'not-an-email' }, 'email', 'email'],
      [{ ...good, page: 'https://elsewhere.example/' }, 'page', 'page'],
      [{ ...good, page: '//elsewhere.example/' }, 'page', 'page'],
    ];
    for (const [body, error, field] of cases) {
      const res = await post(body, env, { ip: `198.51.100.${error.length}${field?.length}` });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error, field });
    }
    expect(sent).toHaveLength(0);
  });

  it('refuses bad requests: wrong method, not JSON, too large, another site', async () => {
    const env: Env = { ASSETS: assets, ...secrets };
    const get = await post(null, env, { method: 'GET' });
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST');
    expect((await post(null, env, { raw: 'message=hi', ip: '1' })).status).toBe(400);
    expect((await post(null, env, { raw: '[]', ip: '2' })).status).toBe(400);
    expect((await post({ ...good, message: 'x'.repeat(CORRECTION_LIMITS.body) }, env, { ip: '3' })).status).toBe(413);
    expect((await post(good, env, { origin: 'https://evil.example', ip: '4' })).status).toBe(403);
    expect((await post(good, env, { origin: 'https://geopolitics.tools', ip: '5' })).status).toBe(200);
  });

  it('answers a filled honeypot as if it worked, and sends nothing', async () => {
    const res = await post({ ...good, website: 'https://spam.example' }, { ASSETS: assets, ...secrets });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it('refuses a form sent faster than a person could fill it, or without its timing', async () => {
    const env: Env = { ASSETS: assets, ...secrets };
    for (const elapsed of [MIN_FILL_MS - 1, undefined, '9000']) {
      const res = await post({ ...good, elapsed }, env, { ip: String(elapsed) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('too_fast');
    }
    expect(sent).toHaveLength(0);
  });

  it('rate-limits per IP through the binding', async () => {
    const seen: string[] = [];
    const CORRECTION_LIMIT = { limit: async ({ key }: { key: string }) => { seen.push(key); return { success: seen.filter((k) => k === key).length <= 2 }; } };
    const env = { ASSETS: assets, ...secrets, CORRECTION_LIMIT } as Env;
    expect((await post(good, env)).status).toBe(200);
    expect((await post(good, env)).status).toBe(200);
    const third = await post(good, env);
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBe('60');
    expect(await third.json()).toEqual({ ok: false, error: 'rate_limited' });
    expect((await post(good, env, { ip: '192.0.2.1' })).status).toBe(200);
    expect(seen[0]).toBe('203.0.113.7');
    expect(sent).toHaveLength(3);
  });

  it('rate-limits in memory when there is no binding', async () => {
    const env: Env = { ASSETS: assets, ...secrets };
    const codes = [];
    for (let i = 0; i <= CORRECTION_LIMITS.perMinute; i++) codes.push((await post(good, env)).status);
    expect(codes.at(-1)).toBe(429);
    expect(codes.slice(0, -1).every((c) => c === 200)).toBe(true);
  });

  it('says when it cannot send: no Telegram secrets, or Telegram refuses', async () => {
    const none = await post(good, { ASSETS: assets });
    expect(none.status).toBe(503);
    expect((await none.json()).error).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 400 })));
    const refused = await post(good, { ASSETS: assets, ...secrets }, { ip: '6' });
    expect(refused.status).toBe(502);
    expect((await refused.json()).error).toBe('send_failed');
  });
});

describe('correction helpers', () => {
  it('cleans what it keeps', () => {
    expect(validate({ message: '  hi\r\nthere\u0007 ', page: '/water?year=2020' })).toEqual({ message: 'hi\nthere', page: '/water?year=2020', email: '', source: '' });
    expect(validate({ message: 7, page: '/' })).toEqual({ error: 'required', field: 'message' });
  });
  it('escapes for Telegram HTML', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
    expect(telegramText({ message: 'm', page: '/p', email: '', source: '' })).not.toContain('Source line');
  });
  it('has words for every error the endpoint returns', () => {
    for (const code of ['method', 'origin', 'too_large', 'bad_request', 'rate_limited', 'too_fast', 'required', 'too_long', 'email', 'page', 'unavailable', 'send_failed', 'network']) {
      expect(CORRECTION_ERRORS[code as keyof typeof CORRECTION_ERRORS]).toBeTruthy();
    }
  });
});
