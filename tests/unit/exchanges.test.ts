import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { matchReports, resetMatchers } from '../../src/adapters/core.ts';
import { EXAMPLE_ORG, parsePeeringDb } from '../../src/adapters/peeringdb.ts';
import { formatDate } from '../../src/lib/format.ts';

// The exchange points view, built from the sample PeeringDB files (tests/fixtures/prototype/peeringdb).
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Exchanges = typeof import('../../src/lib/exchanges.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
type Data = typeof import('../../src/lib/data.ts');
type Links = typeof import('../../src/lib/source-links.ts');
let V: Views;
let X: Exchanges;
let L: Layers;
let R: Routes;
let D: Data;
let S: Links;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  X = await import('../../src/lib/exchanges.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
  D = await import('../../src/lib/data.ts');
  S = await import('../../src/lib/source-links.ts');
});

describe('PeeringDB adapter', () => {
  beforeEach(() => resetMatchers());
  type IxRow = NonNullable<Parameters<typeof parsePeeringDb>[0]['data']>[number];
  const ix = (over: IxRow[] = []) => ({
    meta: { generated: Date.parse('2026-11-10T18:42:03Z') / 1000 },
    data: [
      { id: 1, name: 'Big IX', city: 'Frankfurt', country: 'DE', net_count: 900, status: 'ok' },
      { id: 2, name: 'Small IX', city: 'Lagos', country: 'NG', net_count: 40, status: 'ok' },
      { id: 3, name: 'No Facility IX', city: 'Dili', country: 'TL', net_count: 3, status: 'ok' },
      ...over,
    ],
  });
  const fac = { data: [
    { id: 10, name: 'Fac A', latitude: 50.1, longitude: 8.7, status: 'ok' },
    { id: 11, name: 'Fac B', latitude: 50.2, longitude: 8.6, status: 'ok' },
    { id: 12, name: 'Fac without location', latitude: null, longitude: null, status: 'ok' },
    { id: 13, name: 'Lagos Fac', latitude: 6.5, longitude: 3.4, status: 'ok' },
  ] };
  // Listed out of id order: Fac B (link 20) is Big IX's first; Small IX's first facility has no location.
  const ixfac = { data: [
    { id: 21, ix_id: 1, fac_id: 10 }, { id: 20, ix_id: 1, fac_id: 11 },
    { id: 30, ix_id: 2, fac_id: 12 }, { id: 31, ix_id: 2, fac_id: 13 },
  ] };

  it('places each exchange at its first listed facility with a location, and orders by networks', () => {
    const e = parsePeeringDb(ix(), fac, ixfac);
    expect(e.generated).toBe('2026-11-10');
    expect(e.list.map((x) => [x.name, x.place, x.networks])).toEqual([['Big IX', 'DEU', 900], ['Small IX', 'NGA', 40], ['No Facility IX', 'TLS', 3]]);
    expect(e.list[0].at).toEqual({ lat: 50.2, lon: 8.6, facility: 'Fac B' });
    expect(e.list[1].at?.facility).toBe('Lagos Fac');
    expect(e.list[2].at).toBeNull();
    expect(matchReports()).toContain('peeringdb: every iso2 code matched');
  });

  it('leaves out exchanges that are not live and PeeringDB’s example, and counts the ones with no matching country', () => {
    const e = parsePeeringDb(ix([
      { id: 4, name: 'Gone IX', country: 'FR', net_count: 5, status: 'deleted' },
      { id: 5, name: 'Nowhere IX', country: 'ZZ', net_count: 1, status: 'ok' },
      { id: 4095, org_id: EXAMPLE_ORG, name: 'PeeringDB Example IX', country: 'AQ', net_count: 2, status: 'ok' },
    ]), fac, ixfac);
    expect(e.list.map((x) => x.name)).not.toContain('Gone IX');
    expect(e.list.map((x) => x.name)).not.toContain('PeeringDB Example IX');
    expect(e.unmatched).toBe(1);
  });
});

describe('exchange points view', () => {
  it('builds at /internet/exchanges, a count of listed exchanges by country', () => {
    expect(R.route('view:internet:exchanges')!.path).toBe('/internet/exchanges');
    const p = V.viewPage('exchanges')!;
    const counts = new Map<string, number>();
    for (const x of X.exchangeList()) counts.set(x.place, (counts.get(x.place) ?? 0) + 1);
    const y = p.byYear[p.year];
    expect(y.rows.length).toBe(counts.size);
    for (const r of y.rows) expect(r.value).toBe(counts.get(r.id));
    expect(y.world).toBe(X.exchangeList().length);
    expect(p.years).toEqual([p.year]);
  });

  it('marks each exchange with a location, sized by networks, and lists a country’s exchanges in its panel', () => {
    const f = L.layerFile('internet-exchanges');
    const marks = f.overlays!.find((o) => o.id === 'exchanges')!;
    if (marks.kind !== 'points') throw new Error('exchange marks are not points');
    const placed = X.exchangeList().filter((x) => x.at);
    expect(marks.items).toHaveLength(placed.length);
    const big = marks.items.find((m) => m.tip.startsWith(`${placed[0].name},`))!;
    const small = marks.items.find((m) => m.tip.startsWith(`${placed.at(-1)!.name},`))!;
    expect(big.r!).toBeGreaterThanOrEqual(small.r!);
    expect(big.r!).toBeLessThanOrEqual(14);
    const id = placed[0].place;
    const block = f.more![id][0];
    expect(block.rows[0].name).toBe(X.exchangesIn(id)[0].name);
    expect(block.rows.length).toBe(Math.min(5, X.exchangesIn(id).length));
  });

  it('credits PeeringDB with a link and the fetch date, and offers no download', () => {
    const p = V.viewPage('exchanges')!;
    const fetched = D.data().snapshot.sources.peeringdb!.fetched;
    const credit = V.creditOf(p);
    expect(credit).toBe(`PeeringDB, fetched on ${formatDate(fetched)}`);
    expect(S.sourceLinksHtml(credit)).toMatch(/^<a href="https:\/\/www\.peeringdb\.com\/" rel="noopener">PeeringDB<\/a>, fetched on /);
    expect(D.licenceOf('peeringdb')!.downloads).toBe('shown only');
  });

  it('says what the counts are without ranking words', () => {
    const p = V.viewPage('exchanges')!;
    const text = [V.lede(p), ...V.summary(p), p.text.caveat].join(' ');
    expect(text).toMatch(/listed in PeeringDB/);
    expect(text).not.toMatch(/\b(dominant|leading|vulnerable|hub of)\b/i);
  });
});
