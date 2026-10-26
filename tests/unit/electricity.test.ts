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
