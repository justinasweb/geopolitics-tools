import { beforeAll, describe, expect, it } from 'vitest';
import { rawDir } from '../../src/adapters/core.ts';
import { chipFlows, comtrade, crudeFlows, fertiliserFlows, gasFlows, parseComtrade, partners } from '../../src/adapters/comtrade.ts';
import { gas, oil, oilPrices, parseOil } from '../../src/adapters/eia.ts';

// The oil and gas views and the Comtrade and EIA adapters, built from the sample files.
process.env.GT_DATA = 'sample';
type Energy = typeof import('../../src/lib/energy.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
type Deps = typeof import('../../src/lib/dependence.ts');
let E: Energy;
let L: Layers;
let R: Routes;
let D: Deps;
beforeAll(async () => {
  E = await import('../../src/lib/energy.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
  D = await import('../../src/lib/dependence.ts');
});

const FIXTURES = new URL('../fixtures/prototype/', import.meta.url).pathname;
const raw = rawDir(FIXTURES);

describe('UN Comtrade adapter', () => {
  it('reads every file, by M49 code or by ISO3, and drops world and "not elsewhere specified" partners', () => {
    const rows = parseComtrade([{ data: [
      { period: 2024, reporterCode: 842, flowCode: 'M', partnerCode: 490, cmdCode: '8542', netWgt: 1, primaryValue: 9 },
      { period: 2024, reporterCode: 842, flowCode: 'M', partnerCode: 0, cmdCode: '8542', primaryValue: 99 },
      { period: '2024', reporterISO: 'DEU', flowCode: 'M', partnerISO: 'W00', cmdCode: 3104, netWgt: 5 },
      { period: '2024', reporterISO: 'DEU', flowCode: 'M', partnerISO: 'X1 ', cmdCode: 3104, netWgt: 5 },
      { period: '2024', reporterISO: 'DEU', flowCode: 'M', partnerISO: 'CAN', cmdCode: 3104, netWgt: 2e9 },
    ] }]);
    expect(rows).toEqual([
      { year: 2024, reporter: 'USA', partner: 'TWN', flow: 'M', cmd: '8542', kg: 1, usd: 9 },
      { year: 2024, reporter: 'DEU', partner: 'CAN', flow: 'M', cmd: '3104', kg: 2e9, usd: null },
    ]);
    expect(fertiliserFlows(rows, 'potash')).toEqual([{ from: 'CAN', to: 'DEU', amount: 2, year: 2024 }]);
    expect(chipFlows(rows, 'chips')[0]).toMatchObject({ from: 'TWN', to: 'USA', amount: 9 });
  });

  it('turns crude into barrels a day and gas into cubic metres, pipeline and LNG apart', () => {
    const rows = comtrade(raw);
    const crude = crudeFlows(rows);
    const cn = crude.find((f) => f.from === 'RUS' && f.to === 'CHN')!;
    // 107 Mt a year at 7.33 barrels a tonne is about 2.15 million barrels a day.
    expect(cn.amount).toBeCloseTo((107_060_027_285 / 1000) * 7.33 / 365 / 1000, 3);
    const g = gasFlows(rows);
    expect(new Set(g.map((f) => f.kind))).toEqual(new Set(['pipe', 'lng']));
    expect(g.find((f) => f.from === 'RUS' && f.to === 'CHN' && f.kind === 'pipe')!.amount).toBeCloseTo(23_250_000_000 / 0.75e9, 3);
    const usa = partners(rows, 'USA')!;
    expect(usa.year).toBe(2024);
    expect(usa.exports[0].id).toBe('CAN');
  });
});

describe('EIA adapter', () => {
  it('reads oil, gas and prices; net oil trade uses all liquids, not crude', () => {
    const o = oil(raw);
    expect(o.liquids.USA[2024]).toBeGreaterThan(o.production.USA[2024]);
    expect(o.net.USA[2024]).toBeCloseTo(o.liquids.USA[2024] - o.consumption.USA[2024]);
    expect(o.reserves.VEN[2024]).toBeGreaterThan(200);
    expect(gas(raw).net.RUS[2024]).toBeGreaterThan(0);
    const p = oilPrices(raw);
    expect(p.brent.length).toBeGreaterThan(100);
    expect(p.brent[0].date < p.brent.at(-1)!.date).toBe(true);
    const bcf = parseOil({ response: { data: [{ period: '2024', productId: 57, activityName: 'Production', countryRegionId: 'XXX', unit: 'TBPD', value: '--' }] } });
    expect(bcf.production).toEqual({});
  });
});

describe('oil and gas views', () => {
  it('builds four measures per fuel at /oil, /oil/consumption, /oil/trade, /oil/reserves', () => {
    const pages = E.energyPages();
    expect(pages.map((p) => p.id).sort()).toEqual(['gas-consumption', 'gas-production', 'gas-reserves', 'gas-trade', 'oil-consumption', 'oil-production', 'oil-reserves', 'oil-trade']);
    expect(R.paths.energy('oil', 'production')).toBe('/oil');
    expect(R.paths.energy('gas', 'trade')).toBe('/gas/trade');
    expect(R.live('view:oil:production')!.aliases).toEqual(['/oil/production']);
    for (const p of pages) {
      expect(p.years.at(-1)).toBe(p.year);
      const rows = p.byYear[p.year].rows;
      expect(rows.map((r) => r.value)).toEqual([...rows.map((r) => r.value)].sort((a, b) => b - a));
    }
  });

  it('stops at the last well-reported year and lists who has not reported the next', () => {
    const p = E.energyPage('oil-production')!;
    // The sample's 2025 has 38 of 54 producers.
    expect(p.year).toBe(2024);
    expect(p.years).not.toContain(2025);
  });

  it('writes figures in plain units and colours net trade from exporter to importer', () => {
    expect(E.amount('oil', 'production', 13_200)).toBe('13.2 m b/d');
    expect(E.amount('oil', 'production', 450)).toBe('450k b/d');
    expect(E.amount('gas', 'consumption', 1035.4)).toBe('1,035 bcm');
    expect(E.amount('oil', 'reserves', 303.2)).toBe('303 bn barrels');
    const t = E.energyPage('oil-trade')!;
    const rows = t.byYear[t.year].rows;
    expect(E.classFor(t, rows[0].value, null)).toBeLessThanOrEqual(2);
    expect(E.classFor(t, 0, null)).toBe(4);
    expect(E.classFor(t, rows.at(-1)!.value, null)).toBeGreaterThanOrEqual(6);
    expect(E.lede(t)).toMatch(/largest net exporter of oil in 2024/);
    expect(E.balanceOf(E.energyPage('oil-reserves')!, 'SAU', 2024).reserveYears).toBeGreaterThan(30);
  });

  it('draws the largest flows on trade maps only; gas as pipeline and dashed LNG arcs', () => {
    for (const p of E.energyPages()) {
      const f = L.layerFile(`energy-${p.id}`);
      expect(f.data.map((d) => d.year)).toEqual(p.years);
      if (p.layer !== 'trade') expect(f.overlays).toBeUndefined();
    }
    const g = L.layerFile('energy-gas-trade');
    expect(g.overlays!.map((o) => o.kind === 'arcs' && Boolean(o.dashed))).toEqual([false, true]);
    expect(g.source).toMatch(/UN Comtrade/);
  });

  it('fills the oil and gas rows of the dependencies table, with partners from Comtrade', () => {
    const rows = D.dependencies('CHN');
    const o = rows.find((r) => r.resource === 'oil')!;
    expect(o.state).toBe('ok');
    expect(o.tag).toBe('most');
    expect(o.partners[0]).toBe('RUS');
    expect(D.dependencies('RUS').find((r) => r.resource === 'gas')!.tag).toBe('exp');
  });
});
