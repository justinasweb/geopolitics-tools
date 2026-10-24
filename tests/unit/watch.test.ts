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

  it('reports GitHub errors without failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    expect((await watch({ GH_DISPATCH_TOKEN: 'bad' }, now)).errors).toEqual(['GitHub: listing runs: HTTP 401']);
  });
});
