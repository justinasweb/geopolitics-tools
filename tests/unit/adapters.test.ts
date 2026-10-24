import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { matchReports, rawDir, resetMatchers, type Raw } from '../../src/adapters/core.ts';
import { food, parseFaoCrops, RICE_MILLED } from '../../src/adapters/faostat.ts';
import { arms } from '../../src/adapters/sipri.ts';
import { displacement } from '../../src/adapters/unhcr.ts';
import { demography, ageShares } from '../../src/adapters/wpp.ts';
import { water } from '../../src/adapters/water.ts';
import { lending } from '../../src/adapters/aiddata.ts';
import { emissions } from '../../src/adapters/owid.ts';
import { worldBank, weo } from '../../src/adapters/worldbank.ts';
import { INDICATORS, latestYear, registry, valueAt } from '../../src/data/indicators.ts';
import { FLOWS, loadFlows, topSupplier } from '../../src/data/flows.ts';
import { INDICATOR_TEXT, FLOW_TEXT } from '../../src/i18n/en.ts';
import { formatValue } from '../../src/lib/format.ts';

const FIXTURES = new URL('../fixtures/prototype/', import.meta.url).pathname;

/** The prototype's samples as a snapshot. UNHCR is split into the three files the live fetcher writes. */
function sampleSnapshot(): Raw {
  const dir = mkdtempSync(join(tmpdir(), 'gt-snap-'));
  mkdirSync(join(dir, 'unhcr'));
  const items = JSON.parse(readFileSync(join(FIXTURES, 'unhcr/population.json'), 'utf8')).items as Record<string, unknown>[];
  const total = (key: 'coo_iso' | 'coa_iso') => {
    const by = new Map<string, Record<string, unknown>>();
    for (const r of items) {
      const k = `${r.year}|${r[key]}`;
      const o = by.get(k) ?? { year: r.year, [key]: r[key], refugees: 0, asylum_seekers: 0, oip: 0, idps: 0, returned_refugees: 0 };
      for (const c of ['refugees', 'asylum_seekers', 'oip', 'idps', 'returned_refugees']) o[c] = Number(o[c]) + Number(r[c] ?? 0);
      by.set(k, o);
    }
    return { items: [...by.values()] };
  };
  writeFileSync(join(dir, 'unhcr/by-origin.json'), JSON.stringify(total('coo_iso')));
  writeFileSync(join(dir, 'unhcr/by-host.json'), JSON.stringify(total('coa_iso')));
  writeFileSync(join(dir, 'unhcr/pairs.json'), JSON.stringify({ items }));
  const samples = rawDir(FIXTURES, { 'imf-weo': 'imf' });
  const split = rawDir(dir);
  return { has: (s, f) => (s === 'unhcr' ? split : samples).has(s, f), list: (s) => (s === 'unhcr' ? split : samples).list(s), text: (s, f) => (s === 'unhcr' ? split : samples).text(s, f), json: (s, f) => (s === 'unhcr' ? split : samples).json(s, f) };
}

beforeEach(() => resetMatchers());

describe('adapters on the prototype samples', () => {
  const raw = sampleSnapshot();

  it('World Bank and IMF series by internal id, with every code matched', () => {
    const pop = worldBank(raw, 'SP.POP.TOTL');
    expect(pop.USA[2025]).toBe(341_800_000);
    expect(Object.keys(pop).length).toBeGreaterThan(20);
    const growth = weo(raw, 'NGDP_RPCH');
    expect(growth.USA[2020]).toBe(-2.2);
    expect(matchReports().every((r) => r.includes('every'))).toBe(true);
  });

  it('UNHCR origins, hosts, internally displaced and pairs', () => {
    const d = displacement(raw);
    expect(Object.keys(d.origin)).toContain('SYR');
    expect(d.host.TUR[2015]).toBeGreaterThan(2_000_000);
    expect(d.pairs[0].people).toBeGreaterThanOrEqual(d.pairs.at(-1)!.people);
    expect(d.pairs.every((p) => p.from !== p.to)).toBe(true);
  });

  it('OWID CO2, skipping aggregates and keeping the world row', () => {
    const e = emissions(raw);
    expect(Object.keys(e.byField.co2).length).toBeGreaterThan(10);
    expect(Object.keys(e.byField.co2).every((id) => /^[A-Z]{3}$/.test(id))).toBe(true);
    expect(Object.keys(e.world).length).toBeGreaterThan(0);
  });

  it('FAOSTAT crops, fertilisers (3102 as nitrogen) and the trade matrix', () => {
    const f = food(raw);
    expect(Object.keys(f.crops.wheat.production).length).toBeGreaterThan(10);
    const [id, years] = Object.entries(f.crops.wheat.use)[0];
    const y = Number(Object.keys(years)[0]);
    const b = f.crops.wheat;
    expect(years[y]).toBeCloseTo(Math.max(0, b.production[id][y] + b.imports[id][y] - b.exports[id][y]));
    expect(Object.keys(f.fertilisers.nitrogen.use).length).toBeGreaterThan(0);
    expect(f.fertilisers.potash.use).not.toEqual({});
    expect(f.flows.wheat?.[0].amount).toBeGreaterThan(0);
  });

  it('counts rice in milled equivalent, from FAOSTAT’s own total, not the sum of its forms', () => {
    const row = (item: number, el: number, v: number) => ({ 'Area Code (ISO3)': 'IND', Area: 'India', 'Item Code': item, 'Element Code': el, Year: 2023, Unit: 't', Value: v });
    const c = parseFaoCrops({ data: [row(27, 5510, 3_000_000)] }, { data: [row(30, 5910, 500_000), row(31, 5910, 400_000), row(27, 5910, 100_000), row(30, 5610, 0)] });
    expect(c.rice.production.IND[2023]).toBeCloseTo(3 * RICE_MILLED);
    expect(c.rice.exports.IND[2023]).toBeCloseTo(0.5);
    expect(c.rice.use.IND[2023]).toBeCloseTo(3 * RICE_MILLED - 0.5);
  });

  it('UN population, SIPRI, water, dams and Chinese lending', () => {
    const w = demography(raw);
    expect(w.total.Medium.CHN[1950]).toBe(544_000_000);
    const ages = Object.values(w.ages.CHN)[0];
    const s = ageShares(ages)!;
    expect(s.young + s.working + s.old).toBeCloseTo(1);
    const a = arms(raw);
    expect(a.pairs.some((p) => p.from === 'USA')).toBe(true);
    const wa = water(raw);
    expect(Object.keys(wa.stress).length).toBeGreaterThan(5);
    expect(wa.dams.length).toBeGreaterThan(5);
    const l = lending(raw);
    expect(l.years.length).toBeGreaterThan(5);
    expect(Object.values(l.top).every((t) => t.length <= 5)).toBe(true);
  });

  it('matches every country name and code in the imported samples', () => {
    arms(raw);
    water(raw);
    lending(raw);
    demography(raw);
    expect(matchReports()).toEqual(['sipri: every name matched', 'aqueduct: every iso3 code matched', 'aquastat: every iso3 code matched', 'gdw: every iso3 code matched', 'aiddata: every iso3 code matched', 'wpp: every iso3 code matched']);
  });
});

describe('indicator registry and flows', () => {
  const raw = sampleSnapshot();

  it('has text for every indicator and flow, and a loader or a reason for each', () => {
    for (const d of Object.values(INDICATORS)) {
      expect(INDICATOR_TEXT[d.id], d.id).toBeDefined();
      expect(Boolean(d.load) || Boolean(d.pending), d.id).toBe(true);
    }
    for (const k of Object.keys(FLOWS)) expect(FLOW_TEXT[k], k).toBeDefined();
  });

  it('loads indicators, derived ones included, and finds values and the latest year', () => {
    const r = registry(raw);
    const gdppc = r.load('gdppc');
    expect(gdppc.values.USA[2025]).toBeCloseTo(r.get('gdp').USA[2025] / r.get('population').USA[2025]);
    expect(valueAt(gdppc, 'USA', 2025)?.year).toBe(2025);
    expect(valueAt(gdppc, 'USA', 2030, 10)?.year).toBe(2025);
    expect(latestYear(gdppc)).toBe(2024);
    expect(r.load('waterstress').indicator.static).toBe(true);
    expect(() => r.get('oilprod')).toThrow(/waiting for an API key/);
    for (const id of ['co2pc', 'wheatprod', 'armsimp', 'chinaloans', 'popun', 'refin', 'refinpc']) expect(Object.keys(r.get(id)).length, id).toBeGreaterThan(0);
  });

  it('loads flows and finds a buyer’s main supplier', () => {
    const f = loadFlows(raw, 'arms');
    expect(f.period).toMatch(/^\d{4}–\d{4}$/);
    const buyer = f.pairs[0].to;
    const top = topSupplier(f, buyer)!;
    expect(top.share).toBeGreaterThan(0);
    expect(top.share).toBeLessThanOrEqual(1);
    expect(loadFlows(raw, 'refugees').pairs.length).toBeGreaterThan(0);
    expect(() => loadFlows(raw, 'oil')).toThrow(/Comtrade/);
  });

  it('formats values the registry way', () => {
    expect(formatValue(2.345e12, { kind: 'money' })).toBe('$2.35 tn');
    expect(formatValue(-4.2e9, { kind: 'money' })).toBe('−$4.2 bn');
    expect(formatValue(8_123_456, { kind: 'count' })).toBe('8.1 m');
    expect(formatValue(0.053, { kind: 'share' })).toBe('5.3%');
    expect(formatValue(12.345, { kind: 'percent', digits: 1 })).toBe('12.3%');
    expect(formatValue(1234.5, { kind: 'number', unit: 'kb/d' })).toBe('1,235 kb/d');
    expect(formatValue(1234.5, { kind: 'number', unit: 'Mt', digits: 1 }, 'de')).toBe('1.234,5 Mt');
    expect(formatValue(null, { kind: 'count' })).toBe('–');
  });
});
