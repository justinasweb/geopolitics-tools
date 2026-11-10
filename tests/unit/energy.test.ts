import { beforeAll, describe, expect, it } from 'vitest';
import { rawDir } from '../../src/adapters/core.ts';
import { chipFlows, comtrade, crudeFlows, fertiliserFlows, gasBcm, gasFlows, gasUnreported, parseComtrade, partners } from '../../src/adapters/comtrade.ts';
import { gas, oil, oilPrices, parseOil } from '../../src/adapters/eia.ts';
import { ENERGY_TEXT } from '../../src/i18n/energy.en.ts';

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

  it('drops a quantity that cannot be in kilograms: its price per kg far below the product’s that year', () => {
    // Pipeline gas at about $0.6 a kg, and one reporter whose "kg" are litres: 68 billion tonnes for $7.5 bn.
    const gas = (reporterISO: string, partnerISO: string, netWgt: number, primaryValue: number) => ({ period: 2025, reporterISO, flowCode: 'M', partnerISO, cmdCode: '271121', netWgt, primaryValue });
    const rows = parseComtrade([{ data: [
      gas('DEU', 'NOR', 30e9, 18e9), gas('ITA', 'DZA', 15e9, 9e9), gas('CHN', 'RUS', 23e9, 12e9), gas('GBR', 'NOR', 25e9, 16e9),
      gas('MEX', 'USA', 68_336_127_773_249, 7_479_659_362),
      // Too little for its value is fine: small shipments of bottled gas cost more per kg.
      gas('GUY', 'USA', 1000, 114_000),
    ] }]);
    const mex = rows.find((r) => r.reporter === 'MEX')!;
    expect(mex.kg).toBeNull();
    expect(mex.usd).toBe(7_479_659_362);
    expect(rows.find((r) => r.reporter === 'GUY')!.kg).toBe(1000);
    const flows = gasFlows(rows);
    expect(flows.some((f) => f.from === 'USA' && f.to === 'MEX')).toBe(false);
    expect(flows[0]).toMatchObject({ from: 'NOR', to: 'DEU' });
  });

  it('uses the exporter’s own report of a flow whose importer row was dropped, and marks it', () => {
    const row = (reporterISO: string, partnerISO: string, flowCode: string, netWgt: number, primaryValue: number) => ({ period: 2025, reporterISO, flowCode, partnerISO, cmdCode: '271121', netWgt, primaryValue });
    const rows = parseComtrade([{ data: [
      row('DEU', 'NOR', 'M', 30e9, 18e9), row('ITA', 'DZA', 'M', 15e9, 9e9), row('CHN', 'RUS', 'M', 23e9, 12e9), row('GBR', 'NOR', 'M', 25e9, 16e9),
      // Mexico's import "kg" are not kg; the United States reports the same flow as 52 Mt for $7.4 bn.
      row('MEX', 'USA', 'M', 68_336_127_773_249, 7_479_659_362), row('USA', 'MEX', 'X', 52e9, 7.4e9),
      // Morocco's import from Spain is dropped too, and Spain's own report fails the same check: no flow.
      row('MAR', 'ESP', 'M', 5.3e9, 2.3e8), row('ESP', 'MAR', 'X', 5.3e9, 2.3e8),
    ] }]);
    const flows = gasFlows(rows);
    const mx = flows.find((f) => f.from === 'USA' && f.to === 'MEX')!;
    expect(mx.amount).toBeCloseTo(52e9 / 0.75e9, 3);
    expect(mx.mirror).toBe(true);
    expect(flows.find((f) => f.from === 'NOR' && f.to === 'DEU')!.mirror).toBeUndefined();
    expect(flows.some((f) => f.from === 'ESP' && f.to === 'MAR')).toBe(false);
  });

  it('reads gas by the reporter’s own volume when its weight is Comtrade’s estimate, and never the estimate alone', () => {
    const row = (reporterISO: string, partnerISO: string, flowCode: string, netWgt: number, primaryValue: number, extra: Record<string, unknown> = {}) =>
      ({ period: 2024, reporterISO, flowCode, partnerISO, cmdCode: '271121', netWgt, primaryValue, ...extra });
    const est = { isNetWgtEstimated: true };
    const rows = parseComtrade([{ data: [
      row('DEU', 'NOR', 'M', 30e9, 18e9), row('ITA', 'DZA', 'M', 15e9, 9e9), row('GBR', 'NOR', 'M', 25e9, 16e9),
      // The United States reports its imports from Canada in m³; the 12.3 Mt is Comtrade's estimate.
      row('USA', 'CAN', 'M', 12_283_889_834.93, 6_197_719_596, { ...est, qtyUnitCode: 8, altQtyUnitCode: 12, altQty: 86_143_576_033 }),
      // Mexico's "kg" are litres, as its second quantity's unit says: 66.3 bcm, its own report.
      row('MEX', 'USA', 'M', 66_256_610_000_000, 4_705_397_166, { qtyUnitCode: 8, qty: 66_256_610_000_000, altQtyUnitCode: 7, altQty: 66_256_610_000_000 }),
      // China gives no quantity: an estimated weight only. Russia does not report: no flow.
      row('CHN', 'RUS', 'M', 15.9e9, 8e9, { ...est, altQtyUnitCode: 8, altQty: 0 }),
      // France's weight is estimated too, and Belgium reports the flow: the exporter's report, marked.
      row('FRA', 'BEL', 'M', 28e9, 14e9, { ...est, altQtyUnitCode: 18, altQty: 0 }), row('BEL', 'FRA', 'X', 2.2e9, 1.2e9),
    ] }]);
    const flows = gasFlows(rows);
    const at = (from: string, to: string) => flows.find((f) => f.from === from && f.to === to);
    expect(at('CAN', 'USA')!.amount).toBeCloseTo(86.14, 2);
    expect(at('CAN', 'USA')!.mirror).toBeUndefined();
    expect(at('USA', 'MEX')!.amount).toBeCloseTo(66.26, 2);
    expect(at('USA', 'MEX')!.mirror).toBeUndefined();
    expect(at('RUS', 'CHN')).toBeUndefined();
    expect(at('BEL', 'FRA')).toMatchObject({ amount: 2.2e9 / 0.75e9, mirror: true });
  });

  it('lists the gas flows neither side reports a quantity for, only from files that carry the second quantity', () => {
    const row = (reporterISO: string, partnerISO: string, flowCode: string, netWgt: number, extra: Record<string, unknown> = {}) =>
      ({ period: 2025, reporterISO, flowCode, partnerISO, cmdCode: '271121', netWgt, primaryValue: 1e9, isNetWgtEstimated: true, ...extra });
    const rows = parseComtrade([{ data: [
      // China gives no quantity and Russia does not report.
      row('CHN', 'RUS', 'M', 13.8e9, { altQtyUnitCode: -1, altQty: 0 }),
      // France gives none, but Belgium reports the flow: shown as Belgium's report, not listed.
      row('FRA', 'BEL', 'M', 10e9, { altQtyUnitCode: 18, altQty: 0 }), row('BEL', 'FRA', 'X', 1.1e9, { isNetWgtEstimated: false }),
      // A file from before the second quantity was kept: not known, so not listed.
      row('CHN', 'TKM', 'M', 12.3e9),
    ] }]);
    expect(gasUnreported(rows).map((f) => `${f.from}>${f.to}`)).toEqual(['RUS>CHN']);
    expect(gasUnreported(rows)[0]).toMatchObject({ kind: 'pipe', amount: 13.8e9 / 0.75e9 });
  });

  it('reads an LNG volume as liquid or gas by its size against the estimated weight', () => {
    const row = (partnerISO: string, netWgt: number, altQty: number) =>
      ({ period: 2024, reporterISO: 'USA', flowCode: 'X', partnerISO, cmdCode: '271111', netWgt, primaryValue: 1e9, isNetWgtEstimated: true, altQtyUnitCode: 12, altQty });
    const rows = parseComtrade([{ data: [row('FRA', 6e9, 23.6e6), row('JPN', 6e9, 9e9), row('ESP', 6e9, 6e8)] }]);
    const r = (p: string) => rows.find((x) => x.partner === p)!;
    expect(gasBcm(r('FRA'), 'lng')).toBeCloseTo((23.6e6 * 612) / 1e9, 3);
    expect(gasBcm(r('JPN'), 'lng')).toBeCloseTo(9, 3);
    // 0.1 m³ a kg is neither: no figure.
    expect(gasBcm(r('ESP'), 'lng')).toBeNull();
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

  it('shows a place’s balance in the latest year with both output and use, so net trade comes with them', () => {
    const p = E.energyPage('oil-production')!;
    for (const id of p.byYear[p.year].rows.map((r) => r.id).slice(0, 10)) {
      const y = E.balanceYear(p, id, p.year);
      expect(y).toBeLessThanOrEqual(p.year);
      const b = E.balanceOf(p, id, y);
      if (b.consumption !== undefined) expect(b.production).toBeDefined();
    }
    for (const f of ['oil', 'gas']) {
      const file = L.layerFile(`energy-${f}-production`);
      for (const blocks of Object.values(file.more ?? {})) {
        const bal = blocks.find((b) => b.label.startsWith('Balance'));
        // The note on net trade goes with a net trade row only.
        if (bal?.caption) expect(bal.rows.some((r) => r.name === ENERGY_TEXT.netTrade)).toBe(true);
      }
    }
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
