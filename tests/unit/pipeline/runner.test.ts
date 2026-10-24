import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Alerter } from '../../../pipeline/lib/alert.ts';
import { createHttp } from '../../../pipeline/lib/http.ts';
import { run, loadState, type Snapshot } from '../../../pipeline/lib/runner.ts';
import { HOUR, DAY, CheckError, type Source, type FetchResult } from '../../../pipeline/lib/source.ts';
import type { Stores } from '../../../pipeline/lib/store.ts';
import { tempStores } from './helpers.ts';

const http = createHttp((async () => new Response('')) as unknown as typeof fetch, 0);

function fakeSource(id: string, behave: () => FetchResult | Promise<FetchResult>, extra: Partial<Source> = {}): Source {
  return { id, name: `Source ${id}`, every: HOUR, staleAfter: 3 * DAY, enabled: true, attribution: 'A', licence: 'L', fetch: async () => behave(), ...extra };
}

function recorder(): Alerter & { sent: string[] } {
  const sent: string[] = [];
  return { configured: true, sent, send: async (t) => { sent.push(t); } };
}

const read = async (stores: Stores, bucket: 'raw' | 'snapshots', key: string) => {
  const b = await stores[bucket].get(key);
  return b ? new TextDecoder().decode(b) : null;
};

const hour = (h: number) => new Date(Date.UTC(2026, 9, 24, h));

describe('runner', () => {
  it('saves gzipped files, records state and publishes a snapshot and a status', async () => {
    const stores = tempStores();
    const a = fakeSource('a', () => ({ files: [{ name: 'x.json', body: '{"v":1}' }], rows: 1, dataTo: '2025' }));
    const r = await run({ sources: [a], stores, http, alerter: recorder(), now: hour(10), log: () => {} });
    expect(r.changed).toBe(true);
    expect(r.snapshot).toBe('2026-10-24T1000Z');
    const raw = await stores.raw.get('a/2026-10-24T1000Z/x.json.gz');
    expect(new TextDecoder().decode(gunzipSync(raw!))).toBe('{"v":1}');
    const snap = JSON.parse((await read(stores, 'snapshots', 'latest.json'))!) as Snapshot;
    expect(snap.sources.a.files['x.json'].key).toBe('a/2026-10-24T1000Z/x.json.gz');
    expect(snap.sources.a.dataTo).toBe('2025');
    expect(await read(stores, 'snapshots', 'snapshots/2026-10-24T1000Z.json')).not.toBeNull();
    const status = JSON.parse((await read(stores, 'snapshots', 'status.json'))!);
    expect(status.sources.a).toMatchObject({ ok: true, stale: false, failuresInRow: 0, rows: 1 });
  });

  it('saves no new copy and no new snapshot when the data did not change', async () => {
    const stores = tempStores();
    const a = fakeSource('a', () => ({ files: [{ name: 'x.json', body: 'same' }], rows: 1 }));
    await run({ sources: [a], stores, http, alerter: recorder(), now: hour(10), log: () => {} });
    const r = await run({ sources: [a], stores, http, alerter: recorder(), now: hour(11), log: () => {} });
    expect(r.reports[0].outcome).toBe('unchanged');
    expect(r.changed).toBe(false);
    expect(r.snapshot).toBe('2026-10-24T1000Z');
    expect(await stores.raw.get('a/2026-10-24T1100Z/x.json.gz')).toBeNull();
    const st = (await loadState(stores)).sources.a;
    expect(st.lastSuccess).toBe(hour(11).toISOString());
    expect(st.lastChange).toBe(hour(10).toISOString());
  });

  it('keeps the last good file when a fetch fails, gives it to the fetcher, and alerts on the second failure', async () => {
    const stores = tempStores();
    let fail = false;
    let seen: string | null = null;
    const a = fakeSource('a', () => ({ files: [{ name: 'x.json', body: 'good' }], rows: 1 }), {
      fetch: async (ctx) => {
        seen = await ctx.previous('x.json');
        if (fail) throw new CheckError('only 3 values');
        return { files: [{ name: 'x.json', body: 'good' }], rows: 1 };
      },
    });
    const alerts = recorder();
    await run({ sources: [a], stores, http, alerter: alerts, now: hour(10), log: () => {} });
    fail = true;
    const r1 = await run({ sources: [a], stores, http, alerter: alerts, now: hour(11), log: () => {} });
    expect(seen).toBe('good');
    expect(r1.reports[0].outcome).toBe('failed');
    expect(alerts.sent).toHaveLength(0);
    const r2 = await run({ sources: [a], stores, http, alerter: alerts, now: hour(12), log: () => {} });
    expect(r2.alerts).toBe(1);
    expect(alerts.sent[0]).toMatch(/Source a failed 2 times in a row\. only 3 values/);
    expect(alerts.sent[0]).toMatch(/last good data fetched 2026-10-24 10:00 UTC/);
    const snap = JSON.parse((await read(stores, 'snapshots', 'latest.json'))!) as Snapshot;
    expect(snap.sources.a.files['x.json'].key).toBe('a/2026-10-24T1000Z/x.json.gz');
    const status = JSON.parse((await read(stores, 'snapshots', 'status.json'))!);
    expect(status.sources.a).toMatchObject({ ok: false, failuresInRow: 2, lastError: 'only 3 values' });

    fail = false;
    await run({ sources: [a], stores, http, alerter: alerts, now: hour(14), log: () => {} });
    expect(alerts.sent.at(-1)).toMatch(/working again/);
  });

  it('skips sources that are not due or switched off, unless named with --only', async () => {
    const stores = tempStores();
    let calls = 0;
    const daily = fakeSource('d', () => { calls++; return { files: [{ name: 'f', body: String(calls) }], rows: 1 }; }, { every: DAY });
    const off = fakeSource('off', () => { calls += 100; return { files: [{ name: 'f', body: 'x' }], rows: 1 }; }, { enabled: 'waits for an API key' });
    await run({ sources: [daily, off], stores, http, alerter: recorder(), now: hour(1), log: () => {} });
    const r = await run({ sources: [daily, off], stores, http, alerter: recorder(), now: hour(5), log: () => {} });
    expect(r.reports.map((x) => x.outcome)).toEqual(['not due', 'off']);
    expect(calls).toBe(1);
    await run({ sources: [daily, off], stores, http, alerter: recorder(), now: hour(6), only: ['off'], log: () => {} });
    expect(calls).toBe(101);
  });

  it('isolates failures: one broken source does not stop the others', async () => {
    const stores = tempStores();
    const bad = fakeSource('bad', () => { throw new Error('boom'); });
    const good = fakeSource('good', () => ({ files: [{ name: 'f', body: 'ok' }], rows: 1 }));
    const r = await run({ sources: [bad, good], stores, http, alerter: recorder(), now: hour(1), log: () => {} });
    expect(r.reports.map((x) => x.outcome)).toEqual(['failed', 'changed']);
  });
});

it('saves an unchanged file again before its retention rule would delete the last good copy', async () => {
  const stores = tempStores();
  const a = fakeSource('a', () => ({ files: [{ name: 'f', body: 'same' }], rows: 1 }), { keepDays: 14 });
  await run({ sources: [a], stores, http, alerter: recorder(), now: new Date('2026-10-01T00:00Z'), log: () => {} });
  const r1 = await run({ sources: [a], stores, http, alerter: recorder(), now: new Date('2026-10-05T00:00Z'), log: () => {} });
  expect(r1.reports[0].outcome).toBe('unchanged');
  const r2 = await run({ sources: [a], stores, http, alerter: recorder(), now: new Date('2026-10-09T00:00Z'), log: () => {} });
  expect(r2.reports[0].outcome).toBe('changed');
  expect(await stores.raw.get('a/2026-10-09T0000Z/f.gz')).not.toBeNull();
});
