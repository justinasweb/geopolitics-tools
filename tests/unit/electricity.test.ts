import { beforeAll, describe, expect, it } from 'vitest';
import { parseEmber, partOf } from '../../src/adapters/ember.ts';

// The electricity views and the Ember adapter, built from the sample file.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: Views;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

const row = (series: string, twh: number, extra = {}) => ({ entity: 'France', entity_code: 'FRA', is_aggregate_entity: false, date: '2024', series, is_aggregate_series: false, generation_twh: twh, ...extra });

describe('Ember adapter', () => {
  it('adds the nine series into seven groups and works out shares itself', () => {
    const p = parseEmber({ data: [row('Nuclear', 60), row('Gas', 10), row('Other fossil', 5), row('Wind', 15), row('Solar', 10), row('Fossil', 15, { is_aggregate_series: true })] });
    const m = p.mix.FRA[2024];
    expect(m.total).toBe(100);
    expect(m.groups.gas).toBe(15);
    expect(partOf(m, 'lowcarbon')).toBeCloseTo(0.85);
    expect(partOf(m, 'gas')).toBeCloseTo(0.1);
    expect(partOf(m, 'windsolar')).toBeCloseTo(0.25);
    expect(p.world).toEqual({});
  });
});

describe('Ember adapter: a part that goes missing', () => {
  const at = (date: string) => (series: string, twh: number) => row(series, twh, { date });
  const y22 = at('2022'), y23 = at('2023'), y24 = at('2024');

  it('leaves out a year that lacks a part the country reported above zero before', () => {
    // Gas is there in 2022 and 2024, not in 2023: 2023's total and shares would look complete but leave it out.
    const p = parseEmber({ data: [y22('Coal', 40), y22('Gas', 30), y22('Hydro', 30), y23('Coal', 40), y23('Hydro', 30), y24('Coal', 40), y24('Gas', 30), y24('Hydro', 30)] });
    expect(Object.keys(p.mix.FRA).map(Number)).toEqual([2022, 2024]);
    expect(p.mix.FRA[2023]).toBeUndefined();
  });

  it('keeps years before a part starts, and gaps after years it was zero', () => {
    // Wind starts in 2023; nuclear is reported as 0 in 2022 and then not at all: neither was generating.
    const p = parseEmber({ data: [y22('Coal', 50), y22('Nuclear', 0), y23('Coal', 50), y23('Wind', 5), y24('Coal', 50), y24('Wind', 10)] });
    expect(Object.keys(p.mix.FRA).map(Number)).toEqual([2022, 2023, 2024]);
    expect(p.mix.FRA[2023].total).toBe(55);
  });

  it('treats the world file the same way', () => {
    const w = (date: string, series: string, twh: number) => ({ ...row(series, twh, { date }), entity: 'World', entity_code: 'OWID_WRL' });
    const p = parseEmber({ data: [] }, { data: [w('2022', 'Coal', 10), w('2022', 'Gas', 5), w('2023', 'Coal', 10)] });
    expect(Object.keys(p.world)).toEqual(['2022']);
  });
});

describe('electricity views', () => {
  it('builds five layers, low-carbon at /electricity and gas at /electricity/gas', () => {
    const pages = V.familyPages('electricity');
    expect(pages.map((p) => R.live(`view:electricity:${p.id}`)?.path)).toEqual(['/electricity', '/electricity/wind-solar', '/electricity/coal', '/electricity/gas', '/electricity/nuclear']);
    expect(R.paths.energy('gas', 'production')).toBe('/gas');
  });

  it('gives the world share from the world mix and changes in percentage points', () => {
    const p = V.viewPage('lowcarbon')!;
    const y = p.byYear[p.year];
    expect(y.world).toBeGreaterThan(0);
    expect(y.world).toBeLessThan(1);
    expect(V.changeText(p, 0.012)).toBe('+1.2 pts');
    expect(V.lede(p)).toMatch(/of the world’s electricity in \d{4}\. \d+ of \d+ countries got 80% or more/);
  });

  it('puts each country’s power mix in its panel', () => {
    const f = L.layerFile('electricity-coalpower');
    const block = f.more!.CHN.at(-1)!;
    expect(block.label).toBe(`Power mix, ${f.year}`);
    expect(block.rows.at(-1)!.name).toBe('Total generated');
    expect(block.rows[0].name).toBe('Coal');
  });
});
