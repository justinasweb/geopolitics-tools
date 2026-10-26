import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { rawDir } from '../../src/adapters/core.ts';
import { food } from '../../src/adapters/faostat.ts';
import { formatValue } from '../../src/lib/format.ts';
import { FOOD_LAYER_SLUGS, FOOD_SLUGS } from '../../src/i18n/slugs.en.ts';

// The food and fertiliser views, built from the sample files.
process.env.GT_DATA = 'sample';
type Food = typeof import('../../src/lib/food.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let F: Food;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  F = await import('../../src/lib/food.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

const HEAD = 'Area Code,Area,Item Code,Item,Element Code,Element,Year,Unit,Value,Area Code (M49),Flag';
/** A snapshot in the fetcher's first format: FAOSTAT's own CSV columns, places by M49 code. */
function csvSnapshot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gt-fao-'));
  mkdirSync(join(dir, 'faostat'));
  const w = (f: string, lines: string[]) => writeFileSync(join(dir, 'faostat', f), [lines[0], ...lines.slice(1)].join('\n'));
  w('crops.csv', [HEAD,
    "41,\"China, mainland\",15,Wheat,5510,Production,2023,t,140000000,'156,A",
    "351,China,15,Wheat,5510,Production,2023,t,141000000,'159,A",
    "5000,World,15,Wheat,5510,Production,2023,t,790000000,'001,A",
    "5100,Africa,15,Wheat,5510,Production,2023,t,30000000,'002,A",
    "59,Egypt,15,Wheat,5510,Production,2023,t,9000000,'818,E",
  ]);
  w('trade.csv', [HEAD,
    "59,Egypt,15,Wheat,5610,Import quantity,2023,t,13000000,'818,A",
    "200,Singapore,15,Wheat,5610,Import quantity,2023,t,250000,'702,A",
    "41,\"China, mainland\",15,Wheat,5610,Import quantity,2023,t,12000000,'156,A",
    "41,\"China, mainland\",15,Wheat,5910,Export quantity,2023,t,1000000,'156,A",
    "51000,Africa (excluding intra-trade),15,Wheat,5610,Import quantity,2023,t,1,'002.03,A",
  ]);
  w('fertilizers.csv', [HEAD, "33,Canada,3104,Nutrient potash K2O (total),5510,Production,2023,t,13600000,'124,E"]);
  w('matrix.csv', [
    'Reporter Country Code,Reporter Countries,Partner Country Code,Partner Countries,Item Code,Item,Element,Year,Unit,Value,Reporter Country Code (M49),Partner Country Code (M49)',
    "59,Egypt,185,Russian Federation,15,Wheat,Import quantity,2023,t,5500000,'818,'643",
    "59,Egypt,,Other partners (3),15,Wheat,Import quantity,2023,t,800000,'818,",
  ]);
  return dir;
}

describe('FAOSTAT in the CSV format', () => {
  it('reads places by M49 code, keeps World apart and drops FAO’s totals and its "China"', () => {
    const f = food(rawDir(csvSnapshot()));
    const w = f.crops.wheat;
    expect(w.production.CHN[2023]).toBe(140);
    expect(w.world.production[2023]).toBe(790);
    expect(Object.keys(w.production).sort()).toEqual(['CHN', 'EGY']);
    expect(f.fertilisers.potash.production.CAN[2023]).toBeCloseTo(13.6);
    // Remainder rows ("Other partners") have no partner and are left out.
    expect(f.flows.wheat).toEqual([{ from: 'RUS', to: 'EGY', amount: 5.5, year: 2023 }]);
  });

  it('works out use for importers that grow none and countries with no exports listed', () => {
    const w = food(rawDir(csvSnapshot())).crops.wheat;
    expect(w.use.SGP[2023]).toBeCloseTo(0.25);
    expect(w.use.EGY[2023]).toBeCloseTo(22);
    expect(w.use.CHN[2023]).toBeCloseTo(151);
  });

  it('keeps FAOSTAT’s estimate flags, and a use worked out from an estimate is one too', () => {
    const f = food(rawDir(csvSnapshot()));
    expect(f.crops.wheat.estimated.production.EGY[2023]).toBe(1);
    expect(f.crops.wheat.estimated.use.EGY[2023]).toBe(1);
    expect(f.crops.wheat.estimated.use.CHN).toBeUndefined();
    expect(f.fertilisers.potash.estimated.production.CAN[2023]).toBe(1);
  });
});

describe('food views', () => {
  it('writes million tonnes, and tonnes below one million', () => {
    expect(formatValue(148.4, { kind: 'mt' })).toBe('148 Mt');
    expect(formatValue(12.34, { kind: 'mt' })).toBe('12.3 Mt');
    expect(formatValue(0.5432, { kind: 'mt' })).toBe('543,000 t');
    expect(formatValue(-0.0008, { kind: 'mt' })).toBe('−800 t');
  });

  it('rounds the trade scale’s edges to 1, 2 or 5', () => {
    expect([0.03, 0.4, 1, 1.2, 3, 7].map(F.nice)).toEqual([0.05, 0.5, 1, 2, 5, 10]);
  });

  it('builds production, use and trade for each commodity with data, at /food/{commodity}[/{measure}]', () => {
    const pages = F.foodPages();
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      expect(R.paths.food(p.commodity, p.layer)).toBe(`/food/${FOOD_SLUGS[p.commodity]}${FOOD_LAYER_SLUGS[p.layer] ? `/${FOOD_LAYER_SLUGS[p.layer]}` : ''}`);
      expect(p.years.at(-1)).toBe(p.year);
      expect(p.years[0]).toBeGreaterThanOrEqual(F.FIRST_YEAR);
      const rows = p.byYear[p.year].rows;
      expect(rows.map((r) => r.value)).toEqual([...rows.map((r) => r.value)].sort((a, b) => b - a));
    }
    expect(R.paths.food('soy', 'trade')).toBe('/food/soybeans/trade');
  });

  it('colours net trade from exporter (1) to importer (7), and shares on the other measures', () => {
    const t = F.foodPages().find((p) => p.layer === 'trade')!;
    const rows = t.byYear[t.year].rows;
    expect(F.classFor(t, rows[0].value, null)).toBeLessThanOrEqual(F.classFor(t, rows.at(-1)!.value, null));
    expect(F.classFor(t, 0, null)).toBe(4);
    expect(t.edges).toHaveLength(6);
    const prod = F.foodPages().find((p) => p.layer === 'production')!;
    const y = prod.byYear[prod.year];
    expect(F.classFor(prod, y.world! * 0.3, y.world)).toBe(5);
  });

  it('writes a layer file per page, with flows on trade maps only (fertilisers from UN Comtrade)', () => {
    for (const p of F.foodPages()) {
      const f = L.layerFile(`food-${p.id}`);
      expect(f.scale).toBe(p.layer === 'trade' ? 'div' : 'seq');
      expect(f.data.map((d) => d.year)).toEqual(p.years);
      if (p.layer !== 'trade') expect(f.overlays).toBeUndefined();
      else expect(f.overlays?.[0].kind).toBe('arcs');
      if (p.id === 'potash-trade') {
        expect(p.flows[0].year).toBe(p.flowYear);
        expect(f.source).toMatch(/UN Comtrade/);
      }
      for (const d of f.data) for (const e of Object.values(d.v)) expect([-1, 1, 2, 3, 4, 5, 6, 7]).toContain(e[0]);
    }
  });
});
