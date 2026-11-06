// POST /api/correction: the correction form (decision D10). Forwards a reader's report to the owner's Telegram and
// keeps nothing: no storage, no cookies, no logging of the report. The form is src/components/CorrectionForm.astro.
//
// Abuse protection that needs no cookies and no third-party script:
//   - a honeypot field ("website") people never see: a bot that fills it gets a quiet "ok" and nothing is sent;
//   - a minimum fill time: the form sends how long it was open, and anything under MIN_FILL_MS is refused;
//   - a per-IP rate limit through Cloudflare's rate limiting binding (CORRECTION_LIMIT in wrangler.jsonc). Without
//     the binding (unit tests, a plan without it) an in-memory limit per Worker isolate does the same, less strictly.
//
// Errors are short codes ({ ok: false, error, field? }); the form turns them into words from src/i18n/.

import { CORRECTION_LIMITS, MIN_FILL_MS, type CorrectionError } from '../src/lib/correction';

export interface CorrectionEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  CORRECTION_LIMIT?: RateLimit;
}

export { CORRECTION_LIMITS, MIN_FILL_MS, type CorrectionError };

export interface Report { message: string; page: string; email: string; source: string }

const reply = (body: object, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra } });
const fail = (error: CorrectionError, status: number, field?: keyof Report, extra?: Record<string, string>) =>
  reply(field ? { ok: false, error, field } : { ok: false, error }, status, extra);

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
// Control characters other than tab and newline have no place in a report.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim() : '');

/** Checks a parsed body. Returns the report, or the first problem and the field it is in. */
export function validate(body: Record<string, unknown>): Report | { error: CorrectionError; field: keyof Report } {
  const r: Report = { message: clean(body.message), page: clean(body.page), email: clean(body.email), source: clean(body.source) };
  if (!r.message) return { error: 'required', field: 'message' };
  if (r.message.length > CORRECTION_LIMITS.message) return { error: 'too_long', field: 'message' };
  if (!r.page.startsWith('/') || r.page.startsWith('//') || r.page.length > CORRECTION_LIMITS.page || /\s/.test(r.page)) return { error: 'page', field: 'page' };
  if (r.email && (r.email.length > CORRECTION_LIMITS.email || !EMAIL.test(r.email))) return { error: 'email', field: 'email' };
  if (r.source.length > CORRECTION_LIMITS.source) return { error: 'too_long', field: 'source' };
  return r;
}

/** Escapes text for Telegram's HTML parse mode, which needs only these three. */
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A reader's line that starts like an Edit prompt's ref line ("ref <id> <hash>", src/lib/review.ts) gets a mark in
// front, so a report never reads as one.
const neutralise = (s: string) => s.replace(/^(\s*)(ref )/gim, '$1› $2');

/** The Telegram message: page, source and reply address as labelled lines, then the report. */
export function telegramText(r: Report, host = 'geopolitics.tools') {
  return [
    `📝 <b>Correction report</b>`,
    `<b>Page:</b> ${escapeHtml(host + r.page)}`,
    ...(r.source ? [`<b>Source line:</b> ${escapeHtml(r.source)}`] : []),
    `<b>Reply to:</b> ${r.email ? escapeHtml(r.email) : 'no email left'}`,
    '',
    escapeHtml(neutralise(r.message)),
  ].join('\n');
}

// Fallback limit when there is no binding: per isolate, so a busy site spread over many isolates lets more through.
const seen = new Map<string, number[]>();
function memoryLimit(key: string, now: number) {
  const recent = (seen.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= CORRECTION_LIMITS.perMinute) return false;
  recent.push(now);
  seen.set(key, recent);
  if (seen.size > 5000) seen.clear();
  return true;
}
/** For tests: forget the in-memory counts. */
export const resetMemoryLimit = () => seen.clear();

/** The body as text, read piece by piece; null as soon as it passes `limit` bytes (a missing Content-Length says nothing). */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function correction(request: Request, env: CorrectionEnv, now = Date.now()): Promise<Response> {
  if (request.method !== 'POST') return fail('method', 405, undefined, { Allow: 'POST' });

  // Only this site's own pages post here. Browsers always send Origin on a fetch POST; a missing one is let through
  // (curl, older clients) and meets the other checks.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail('origin', 403);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const allowed = env.CORRECTION_LIMIT ? (await env.CORRECTION_LIMIT.limit({ key: ip })).success : memoryLimit(ip, now);
  if (!allowed) return fail('rate_limited', 429, undefined, { 'Retry-After': '60' });

  if (Number(request.headers.get('Content-Length') ?? 0) > CORRECTION_LIMITS.body) return fail('too_large', 413);
  const raw = await readLimited(request, CORRECTION_LIMITS.body);
  if (raw === null) return fail('too_large', 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('bad_request', 400);
  }

  // A filled honeypot gets the same answer as a real report, so a bot learns nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') return reply({ ok: true });
  if (typeof body.elapsed !== 'number' || !Number.isFinite(body.elapsed) || body.elapsed < MIN_FILL_MS) return fail('too_fast', 400);

  const report = validate(body);
  if ('error' in report) return fail(report.error, 400, report.field);

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return fail('unavailable', 503);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: telegramText(report),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    });
    if (!res.ok) {
      console.log(JSON.stringify({ correction: 'telegram', status: res.status }));
      return fail('send_failed', 502);
    }
  } catch {
    return fail('send_failed', 502);
  }
  return reply({ ok: true });
}
