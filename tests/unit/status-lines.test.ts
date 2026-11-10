import { beforeAll, describe, expect, it } from 'vitest';

// One-line ranking summaries (topic hubs, home page) and share images name figures outside the tables. A figure the
// tables tag (Estimate, Projection, Preliminary) carries the same word there: "India (estimate)". The sample data has
// no tagged figure among the ones these lines name, so each test marks one as FAOSTAT would (estimatedBy).
process.env.GT_DATA = 'sample';
type Hubs = typeof import('../../src/lib/hubs.ts');
type Home = typeof import('../../src/lib/home.ts');
type Og = typeof import('../../src/lib/og-cards.ts');
type Ind = typeof import('../../src/lib/indicator.ts');
type Reg = typeof import('../../src/data/indicators.ts');
type Routes = typeof import('../../src/lib/routes.ts');
type Country = typeof import('../../src/lib/country.ts');
type Food = typeof import('../../src/lib/food.ts');
let H: Hubs, M: Home, O: Og, I: Ind, R: Reg, P: Routes, C: Country, F: Food;
beforeAll(async () => {
  [H, M, O, I, R, P, C, F] = await Promise.all([
    import('../../src/lib/hubs.ts'), import('../../src/lib/home.ts'), import('../../src/lib/og-cards.ts'), import('../../src/lib/indicator.ts'),
    import('../../src/data/indicators.ts'), import('../../src/lib/routes.ts'), import('../../src/lib/country.ts'), import('../../src/lib/food.ts'),
  ]);
});

/** Marks the first-ranked figure of an indicator as an estimate; returns that place. */
function markTop(id: string): string {
  const m = I.indicatorModel(id)!;
  const top = m.common[0];
  R.INDICATORS[id].estimatedBy = { ...R.INDICATORS[id].estimatedBy, [top.id]: { [top.year]: 1 } };
  return top.id;
}
const route = (kind: string, id: string) => P.routes().find((r) => r.kind === kind && r.id === id)!;

describe('tags in one-line summaries and share images', () => {
  it('topLine names each place with its figure’s tag, in the tables’ word', () => {
    const rows = [{ id: 'CHN', value: 3, year: 2024 }, { id: 'IND', value: 2, year: 2024 }, { id: 'USA', value: 1, year: 2024 }];
    const tag = (r: { id: string }) => (r.id === 'IND' ? 'estimate' : r.id === 'USA' ? 'preliminary' : undefined);
    expect(H.topLine(rows, String, tag)).toBe('Top 3: China, India (estimate), United States (preliminary)');
    const tied = [{ id: 'FRA', value: 1, year: 2024 }, { id: 'SWE', value: 1, year: 2024 }];
    expect(H.topLine(tied, () => '100%', (r) => (r.id === 'SWE' ? 'projection' : undefined))).toBe('Tied first at 100%: France and Sweden (projection)');
  });

  it('labels an estimate in the hubs’ and home page’s ranking lines', () => {
    const ids = Object.values(R.INDICATORS).filter((i) => ['energy', 'food'].includes(i.group) && I.indicatorModel(i.id)?.indexed).map((i) => i.id);
    for (const id of [...ids, 'milusd', 'co2pc', 'refin']) if (I.indicatorModel(id)) markTop(id);
    const hub = H.hubModel('resources')!;
    expect(hub.rankings.length).toBeGreaterThan(0);
    for (const r of hub.rankings) expect(r.top, r.id).toContain('(estimate)');
    const home = M.places().rankings;
    expect(home.length).toBeGreaterThan(0);
    for (const r of home) expect(r.top, r.label).toContain('(estimate)');
    // Builds the hub and home page models from every sample file: about 2 s here, over 5 s on a slow CI runner.
  }, 30_000);

  it('labels an estimate on the indicator, country and food share images', () => {
    markTop('co2');
    const ind = O.card(route('indicator', 'co2'));
    expect(ind.bars![0].text).toMatch(/\(estimate\)$/);
    expect(ind.bars![1].text).not.toContain('estimate');
    expect(ind.caption).toContain('(estimate)');

    const country = route('country', P.routes().find((r) => r.kind === 'country')!.id);
    const f = C.countryModel(country.id)!.figures[0];
    R.INDICATORS[f.id].estimatedBy = { ...R.INDICATORS[f.id].estimatedBy, [country.id]: { [f.year]: 1 } };
    expect(O.card(country).caption).toMatch(/\(estimate\)$/);

    const food = P.routes().find((r) => r.kind === 'view' && r.id.startsWith('food:') && F.foodPage(r.id.split(':')[1])?.layer === 'production')!;
    const p = F.foodPage(food.id.split(':')[1])!;
    const first = p.byYear[p.year].rows[0].id;
    (p.balance.estimated.production[first] ??= {})[p.year] = 1;
    expect(O.card(food).bars![0].text).toMatch(/\(\d[^)]*%, estimate\)$/);
  });
});
