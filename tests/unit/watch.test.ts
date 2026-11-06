import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldAlert, watch, type WatchEnv } from '../../worker/watch';

const now = new Date('2026-10-24T20:41:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

function github(runs: { event: string; created_at: string }[], calls: { url: string; method: string; body?: string }[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (url.includes('api.telegram.org')) return new Response('{"ok":true}');
    if (url.endsWith('/dispatches')) return new Response(null, { status: 204 });
    return Response.json({ workflow_runs: runs });
  });
}

const bucket = (generated?: string) => ({ get: async () => (generated ? { json: async () => ({ generated }) } : null) }) as unknown as NonNullable<WatchEnv['SNAPSHOTS']>;

afterEach(() => vi.unstubAllGlobals());

describe('data watch', () => {
  it('starts a run when none started in the last 50 minutes, ignoring pull request runs', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal('fetch', github([{ event: 'pull_request', created_at: ago(5) }, { event: 'schedule', created_at: ago(78) }], calls));
    const r = await watch({ GH_DISPATCH_TOKEN: 't' }, now);
    expect(r).toMatchObject({ dispatched: true, lastRun: ago(78), errors: [] });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', body: '{"ref":"main"}' });
    expect(calls.at(-1)!.url).toBe('https://api.github.com/repos/justinasweb/geopolitics-tools/actions/workflows/data.yml/dispatches');
  });

  it('leaves it when GitHub ran on schedule, and does nothing without a token', async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', github([{ event: 'schedule', created_at: ago(18) }], calls));
    expect((await watch({ GH_DISPATCH_TOKEN: 't' }, now)).dispatched).toBe(false);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect((await watch({}, now)).dispatched).toBeNull();
  });

  it('alerts on Telegram when status.json passes 6 hours, then daily', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal('fetch', github([], calls));
    const env: WatchEnv = { SNAPSHOTS: bucket(ago(6.5 * 60)), TELEGRAM_BOT_TOKEN: 'b', TELEGRAM_CHAT_ID: 'c' };
    const r = await watch(env, now);
    expect(r).toMatchObject({ statusAgeHours: 6.5, alerted: true });
    expect(JSON.parse(calls[0].body!).text).toMatch(/no pipeline run has finished for 6 hours/);
    expect((await watch({ ...env, SNAPSHOTS: bucket(ago(3 * 60)) }, now)).alerted).toBe(false);
    expect([5.9, 6, 6.9, 7, 23, 24, 24.5, 25, 48.2].map(shouldAlert)).toEqual([false, true, true, false, false, true, true, false, true]);
  });
});

describe('a missing, invalid or unreadable status.json', () => {
  type Obj = string | Error | null;
  /** A bucket with status.json and the watch's own record; an Error makes that read or write fail. */
  function store(status: Obj, record: Obj = null, putFails = false) {
    const objects: Record<string, Obj> = { 'status.json': status, 'watch/status-alert.json': record };
    const put = vi.fn(async (key: string, value: string) => {
      if (putFails) throw new Error('R2 down');
      objects[key] = value;
    });
    const get = async (key: string) => {
      const o = objects[key];
      if (o instanceof Error) throw o;
      return o === null ? null : { json: async () => JSON.parse(o) };
    };
    return { bucket: { get, put } as unknown as NonNullable<WatchEnv['SNAPSHOTS']>, objects, put };
  }
  const run = async (b: ReturnType<typeof store>, at = now) => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal('fetch', github([], calls));
    const r = await watch({ SNAPSHOTS: b.bucket, TELEGRAM_BOT_TOKEN: 'b', TELEGRAM_CHAT_ID: 'c' }, at);
    return { r, sent: calls.filter((c) => c.url.includes('api.telegram.org')).map((c) => JSON.parse(c.body!).text as string) };
  };

  it('alerts when status.json is missing, and records when', async () => {
    const b = store(null);
    const { r, sent } = await run(b);
    expect(r.alerted).toBe(true);
    expect(sent[0]).toMatch(/status\.json is missing/);
    expect(JSON.parse(b.objects['watch/status-alert.json'] as string)).toEqual({ at: now.toISOString() });
  });

  it('alerts when status.json is not JSON, has no readable date, or cannot be read', async () => {
    for (const status of ['{not json', '{"generated":"soon"}', '{}', new Error('R2 500')]) {
      const { r, sent } = await run(store(status));
      expect(r.alerted).toBe(true);
      expect(sent).toHaveLength(1);
    }
  });

  it('alerts at most once in 24 hours', async () => {
    expect((await run(store(null, JSON.stringify({ at: ago(3 * 60) })))).r.alerted).toBe(false);
    expect((await run(store(null, JSON.stringify({ at: ago(23.9 * 60) })))).r.alerted).toBe(false);
    expect((await run(store(null, JSON.stringify({ at: ago(24 * 60) })))).r.alerted).toBe(true);
  });

  it('without its record (unreadable or unwritable) alerts only in the 08 UTC hour, so still once a day', async () => {
    expect((await run(store(null, new Error('R2 500')))).r.alerted).toBe(false);
    expect((await run(store(null, null, true))).r.alerted).toBe(false);
    const at8 = new Date('2026-10-24T08:41:00Z');
    expect((await run(store(null, new Error('R2 500')), at8)).r.alerted).toBe(true);
    expect((await run(store(null, null, true), at8)).r.alerted).toBe(true);
  });
});

describe('data watch errors', () => {
  it('reports GitHub errors without failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    expect((await watch({ GH_DISPATCH_TOKEN: 'bad' }, now)).errors).toEqual(['GitHub: listing runs: HTTP 401']);
  });
});
