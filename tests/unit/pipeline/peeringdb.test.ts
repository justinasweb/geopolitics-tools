// The PeeringDB fetcher against a stub of its bootstrap files: what it saves, and that any error stops it at once.
import { describe, expect, it } from 'vitest';
import type { FetchResult } from '../../../pipeline/lib/source.ts';
import peeringdb, { FIELDS, MIN } from '../../../pipeline/sources/peeringdb.ts';
import { ctxFor, fakeHttp, type Route } from './helpers.ts';

const NOW = new Date('2026-11-11T12:00:00Z');
const generated = NOW.getTime() / 1000 - 6 * 3600;

const records = (kind: keyof typeof MIN, n = MIN[kind] + 10) => Array.from({ length: n }, (_, i) => {
  const id = i + 1;
  if (kind === 'ix') return { id, org_id: 1, name: `IX ${id}`, name_long: '', city: 'Ashburn', country: 'US', net_count: id, fac_count: 1, tech_email: 'noc@example.net', status: 'ok', updated: '2026-01-01T00:00:00Z' };
  if (kind === 'fac') return { id, name: `Fac ${id}`, city: 'Ashburn', country: 'US', latitude: 39, longitude: -77, address1: '1 Main St', status: 'ok' };
  return { id, ix_id: id, fac_id: id, name: 'Fac', status: 'ok' };
});

const file = (kind: keyof typeof MIN, over: { at?: number; n?: number } = {}) => ({ meta: { generated: over.at ?? generated }, data: records(kind, over.n) });

const ok = (): Route[] => (['ix', 'fac', 'ixfac'] as const).map((k) => [new RegExp(`/${k}-0\\.json$`), () => file(k)]);
const ctx = (routes: Route[], calls: string[] = [], previous: Record<string, string> = {}) => {
  const c = ctxFor(fakeHttp(routes, calls), previous, NOW);
  c.env = { PEERINGDB_PAUSE_MS: '0' };
  return c;
};
const saved = (r: FetchResult, name: string) => JSON.parse(r.files.find((f) => f.name === name)!.body as string);

describe('peeringdb', () => {
  it('fetches the ix, fac and ixfac bootstrap files once each, anonymously, and no network file', async () => {
    const calls: string[] = [];
    const r = await peeringdb.fetch(ctx(ok(), calls));
    expect(calls).toEqual(['https://public.peeringdb.com/ix-0.json', 'https://public.peeringdb.com/fac-0.json', 'https://public.peeringdb.com/ixfac-0.json']);
    expect(r.files.map((f) => f.name)).toEqual(['ix.json', 'fac.json', 'ixfac.json']);
    expect(r.rows).toBe(MIN.ix + 10);
    expect(r.dataTo).toBe('2026-11-11');
    expect(peeringdb.every).toBe(7 * 24);
  });

  it('keeps PeeringDB’s shape with only the fields the adapter reads', async () => {
    const r = await peeringdb.fetch(ctx(ok()));
    const ix = saved(r, 'ix.json');
    expect(ix.meta.generated).toBe(generated);
    expect(Object.keys(ix.data[0])).toEqual([...FIELDS.ix]);
    expect(ix.data[0].tech_email).toBeUndefined();
    expect(Object.keys(saved(r, 'fac.json').data[0])).toEqual([...FIELDS.fac]);
    expect(Object.keys(saved(r, 'ixfac.json').data[0])).toEqual([...FIELDS.ixfac]);
  });

  it('stops on the first HTTP error without retrying or fetching the rest', async () => {
    const calls: string[] = [];
    const routes: Route[] = [[/\/fac-0\.json$/, () => new Response('busy', { status: 503 })], ...ok()];
    await expect(peeringdb.fetch(ctx(routes, calls))).rejects.toThrow(/HTTP 503/);
    expect(calls).toEqual(['https://public.peeringdb.com/ix-0.json', 'https://public.peeringdb.com/fac-0.json']);
  });

  it('stops on a rate limit (429) without retrying', async () => {
    const calls: string[] = [];
    await expect(peeringdb.fetch(ctx([[/ix-0\.json$/, () => new Response('slow down', { status: 429 })]], calls))).rejects.toThrow(/HTTP 429/);
    expect(calls).toHaveLength(1);
  });

  it('refuses a file that is not JSON, has no data, no generated time, or is days old', async () => {
    const swap = (r: () => unknown): Route[] => [[/ix-0\.json$/, r as Route[1]], ...ok()];
    await expect(peeringdb.fetch(ctx(swap(() => '<html>maintenance</html>')))).rejects.toThrow(/not JSON/);
    await expect(peeringdb.fetch(ctx(swap(() => ({ meta: { generated } }))))).rejects.toThrow(/no data list/);
    await expect(peeringdb.fetch(ctx(swap(() => ({ data: records('ix') }))))).rejects.toThrow(/no meta\.generated/);
    await expect(peeringdb.fetch(ctx(swap(() => file('ix', { at: generated - 10 * 86_400 }))))).rejects.toThrow(/generated 10 days ago/);
  });

  it('refuses too few records, or far fewer than the last good copy', async () => {
    await expect(peeringdb.fetch(ctx([[/ix-0\.json$/, () => file('ix', { n: 100 })], ...ok()]))).rejects.toThrow(/only 100 ix records/);
    const previous = { 'ixfac.json': JSON.stringify({ data: records('ixfac', 6_000) }) };
    await expect(peeringdb.fetch(ctx(ok(), [], previous))).rejects.toThrow(/ixfac\.json: \d+ values now against 6000/);
  });

  it('refuses a file whose records lack a field the adapter reads', async () => {
    const bare = { meta: { generated }, data: records('fac').map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'latitude'))) };
    await expect(peeringdb.fetch(ctx([[/\/fac-0\.json$/, () => bare], ...ok()]))).rejects.toThrow(/fac-0\.json lacks latitude/);
  });
});
