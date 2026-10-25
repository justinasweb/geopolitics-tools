import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { arc, equalEarth, fromMap, mapLatOfY, toMap, WORLD_BOUNDS, X_MAX } from '../../src/lib/map/projection.ts';
import { parseMinerals } from '../../src/adapters/minerals.ts';
import { concentration, shareClass, shareText } from '../../src/lib/minerals.ts';
import { nearestYear, readState, writeState, type StateContext } from '../../src/scripts/map/state.ts';
import { countryPanelHtml, tooltipHtml } from '../../src/scripts/map/panel.ts';
import type { LayerFile } from '../../src/lib/map/types.ts';

// The page engine reads the sample files here (the prototype's fixtures), never a live snapshot.
process.env.GT_DATA = 'sample';
const LIVE = new URL('../fixtures/live/', import.meta.url).pathname;

describe('projection', () => {
  it('puts Equal Earth on a Web Mercator map without stretching it', () => {
    expect(equalEarth(0, 0)).toEqual([0, 0]);
    expect(toMap(180, 0)[0]).toBeCloseTo(180, 9);
    // Equal Earth's width-to-height ratio is about 2.05:1; the map keeps it.
    const top = equalEarth(0, 90)[1];
    expect((2 * X_MAX) / (2 * top)).toBeCloseTo(2.05, 1);
    for (const [lon, lat] of [[10, 50], [-70, -33], [151, -34], [37.6, 55.8]]) {
      const [x, y] = equalEarth(lon, lat);
      const m = toMap(lon, lat);
      expect(mapLatOfY(y)).toBeCloseTo(m[1], 9);
      const back = fromMap(...m);
      expect(back[0]).toBeCloseTo(x, 9);
      expect(back[1]).toBeCloseTo(y, 9);
    }
  });

  it('frames the world from 58°S to 84°N, inside what Web Mercator can draw', () => {
    const [[w, s], [e, n]] = WORLD_BOUNDS;
    expect([w, e]).toEqual([-180, 180]);
    expect(s).toBeCloseTo(toMap(0, -58)[1], 9);
    expect(n).toBeCloseTo(toMap(0, 84)[1], 9);
    expect(Math.abs(s)).toBeLessThan(85.05);
    expect(n).toBeLessThan(85.05);
  });

  it('draws a flow as a curve from one place to the other, bent to one side', () => {
    const a = arc([-74, 40.7], [2.35, 48.9]);
    expect(a).toHaveLength(33);
    expect(a[0][0]).toBeCloseTo(toMap(-74, 40.7)[0], 6);
    expect(a.at(-1)![1]).toBeCloseTo(toMap(2.35, 48.9)[1], 6);
    // The reverse flow bends the other way, so the two never overlap.
    const b = arc([2.35, 48.9], [-74, 40.7]);
    expect(Math.sign(a[16][1] - (a[0][1] + a[32][1]) / 2)).not.toBe(Math.sign(b[16][1] - (b[0][1] + b[32][1]) / 2));
  });
});

describe('basemap', () => {
  type B = typeof import('../../src/lib/map/basemap.ts');
  let B: B;
  beforeAll(async () => { B = await import('../../src/lib/map/basemap.ts'); });

  it('gives each Natural Earth shape its place, following the territories policy', () => {
    const { countries } = B.basemap();
    const by = (code: string) => countries.features.find((f) => f.properties.code === code)?.properties.id;
    expect(by('AUS')).toBe('AUS');
    // Somaliland and Northern Cyprus shade with the figures sources report for Somalia and Cyprus.
    expect(by('SOL')).toBe('SOM');
    expect(by('CYN')).toBe('CYP');
    // The Siachen Glacier maps to no place and keeps its name for the tooltip.
    expect(countries.features.find((f) => f.properties.code === 'KAS')?.properties).toEqual({ id: null, code: 'KAS', name: 'Siachen Glacier' });
    // Western Sahara is its own shape; Antarctica is left out.
    expect(by('SAH')).toBe('ESH');
    expect(countries.features.some((f) => f.properties.code === 'ATA')).toBe(false);
    for (const f of countries.features) for (const poly of f.geometry.coordinates) for (const [lng, lat] of poly[0]) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThan(85.06);
    }
  });

  it('draws disputed land boundaries as lines, and no coastlines among them', () => {
    const { disputed } = B.basemap();
    const names = disputed.features.map((f) => f.properties.name);
    expect(names).toContain('Crimea');
    expect(names.length).toBeGreaterThan(15);
    // The Kurils are islands: their boundary is at sea, so there is no land line to dash.
    expect(names.some((n) => /kuril/i.test(n))).toBe(false);
  });

  it('anchors flows at the centre of each place’s largest shape', () => {
    const at = B.anchors();
    const [x, y] = at.AUS;
    const [ax, ay] = equalEarth(134, -25);
    expect(Math.hypot(x - ax, y - ay)).toBeLessThan(0.1);
  });
});

describe('blocs', () => {
  it('lists members by internal place id, all known', async () => {
    const { blocs, BLOC_ORDER } = await import('../../src/lib/blocs.ts');
    const b = blocs();
    expect([...b.keys()].sort()).toEqual([...BLOC_ORDER].sort());
    expect(b.get('unsc-p5')!.sort()).toEqual(['CHN', 'FRA', 'GBR', 'RUS', 'USA']);
    expect(b.get('g7')).toHaveLength(7);
    expect(b.get('nato')).toContain('SWE');
  });
});

describe('USGS minerals, real format (MCS 2026)', () => {
  const ms = parseMinerals(readFileSync(`${LIVE}usgs-minerals/MCS2026_Commodities_Data.csv`, 'utf8'));
  const li = ms.find((m) => m.id === 'lithium')!;

  it('reads both years, the world totals and the estimate flags', () => {
    expect(li.years).toEqual([2024, 2025]);
    expect(li.byYear[2025].estimated).toBe(true);
    expect(li.byYear[2025].world).toBe(290000);
    const au = li.byYear[2025].producers.find((p) => p.place === 'AUS')!;
    expect(au.value).toBe(92000);
    expect(au.estimated).toBe(true);
  });

  it('keeps the US as withheld, out of the shares, and measures concentration on the rest', () => {
    const us = li.byYear[2025].producers.find((p) => p.place === 'USA')!;
    expect(us.withheld).toBe(true);
    expect(us.share).toBeNull();
    expect(Math.round(li.byYear[2025].hhi)).toBe(2024);
    expect(concentration(li.byYear[2025].hhi)).toBe('high');
  });
  // Checked against the chapters of Mineral Commodity Summaries 2026 (phase 5a): the eight minerals, their leading
  // producers, world totals, what the tonnage counts, and the rows the shares must handle.
  const by = (id: string) => ms.find((m) => m.id === id)!;
  const p = (id: string, place: string, year = 2025) => by(id).byYear[year].producers.find((x) => x.place === place);

  it('reads all eight minerals, in the site order', () => {
    expect(ms.map((m) => m.id)).toEqual(['lithium', 'cobalt', 'rare-earths', 'gallium', 'graphite', 'nickel', 'palladium', 'tungsten']);
    for (const m of ms) expect(m.years).toEqual([2024, 2025]);
  });

  it('has the leading producers and world totals USGS publishes', () => {
    const top = Object.fromEntries(ms.map((m) => [m.id, [m.byYear[2025].producers[0].place, m.byYear[2025].producers[0].value, m.byYear[2025].world]]));
    expect(top).toEqual({
      lithium: ['AUS', 92000, 290000], cobalt: ['COD', 230000, 310000], 'rare-earths': ['CHN', 270000, 390000], gallium: ['CHN', 900000, 900000],
      graphite: ['CHN', 1400000, 1800000], nickel: ['IDN', 2600000, 3900000], palladium: ['RUS', 84000, 190000], tungsten: ['CHN', 67000, 85000],
    });
    expect(p('cobalt', 'COD', 2024)?.value).toBe(226000);
    expect(p('palladium', 'ZAF', 2024)?.value).toBe(82600);
    expect(by('rare-earths').byYear[2024].world).toBe(380000);
  });

  it('counts "Other countries" as USGS reports it, and shares of whichever is larger, the parts or the rounded total', () => {
    expect(by('cobalt').byYear[2025].other.value).toBe(9100);
    // 230,000 of 314,600 (the countries plus 9,100 other), not of the rounded 310,000.
    expect(p('cobalt', 'COD')!.share).toBeCloseTo(230000 / 314600, 6);
    // Palladium's parts (194,100) pass the rounded world total (190,000).
    expect(p('palladium', 'RUS')!.share).toBeCloseTo(84000 / 194100, 6);
    for (const m of ms) for (const y of m.years) {
      const sum = m.byYear[y].producers.reduce((s, x) => s + (x.share ?? 0), 0);
      expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('leaves out countries USGS lists with zero production (—)', () => {
    expect(p('gallium', 'USA')).toBeUndefined();
    expect(p('tungsten', 'USA')).toBeUndefined();
    expect(p('tungsten', 'KAZ', 2024)).toBeUndefined();
    expect(p('tungsten', 'KAZ')?.value).toBe(2400);
    for (const id of ['CAN', 'GRL', 'ZAF', 'TZA']) expect(p('rare-earths', id)).toBeUndefined();
    for (const m of ms) for (const y of m.years) for (const x of m.byYear[y].producers) expect(x.withheld || x.small || (x.value ?? 0) > 0).toBe(true);
  });

  it('says what is measured and what the tonnage counts', () => {
    expect(ms.filter((m) => m.measure === 'primary').map((m) => m.id)).toEqual(['gallium']);
    expect(Object.fromEntries(ms.map((m) => [m.id, m.basis]))).toEqual({
      lithium: 'lithium content', cobalt: 'cobalt content', 'rare-earths': 'rare-earth-oxide equivalent', gallium: 'gallium content',
      graphite: null, nickel: 'nickel content', palladium: 'platinum-group-metal content', tungsten: 'tungsten content',
    });
    expect(by('nickel').revisions).toBe('Production in 2024 for Canada was revised significantly based on a Government report.');
    expect(by('gallium').revisions).toBeNull();
  });

  it('keeps the notes on single figures, without the estimate marker', () => {
    expect(p('rare-earths', 'CHN', 2024)?.note).toBe('Production quota; does not include undocumented production.');
    expect(p('rare-earths', 'MMR')?.note).toBe('Estimated based on reported import data for China. Source: Trade Data Monitor Inc.');
    expect(p('cobalt', 'COD')?.note).toBeNull();
    expect(li.byYear[2025].worldNote).toBe('Excludes U.S. production.');
  });
});

describe('share classes and words', () => {
  it('bins shares as the legend says', () => {
    expect([0.005, 0.01, 0.049, 0.05, 0.2, 0.25, 0.6].map(shareClass)).toEqual([1, 2, 2, 3, 4, 5, 5]);
    expect(shareText(0.317)).toBe('32%');
    expect(shareText(0.043)).toBe('4.3%');
    expect(shareText(0.0004)).toBe('<0.1%');
    expect([999, 1000, 1800, 1801].map(concentration)).toEqual(['low', 'moderate', 'moderate', 'high']);
  });
});

describe('layer files', () => {
  let L: LayerFile;
  beforeAll(async () => {
    const { layerFile, mapLayers } = await import('../../src/lib/map/layers.ts');
    expect(mapLayers().map((l) => l.id)).toContain('minerals-lithium');
    L = layerFile('minerals-lithium');
  });

  it('holds every year, worded, with places in rank order and withheld places marked', () => {
    expect(L.years.length).toBe(L.data.length);
    expect(L.year).toBe(L.years.at(-1));
    const y = L.data.at(-1)!;
    expect(y.order[0]).toBe('AUS');
    expect(y.v.AUS[4]).toBe(1);
    expect(y.v.USA[0]).toBe(0);
    for (const id of y.order) expect(y.v[id][0]).toBeGreaterThanOrEqual(1);
    expect(y.blocs.brics).toMatch(/BRICS members mined/);
    expect(L.text.kicker).toContain('{year}');
    expect(L.slugs.AUS).toBe('australia');
  });

  it('builds the tooltip and the panel from the file alone, escaped', () => {
    const y = L.data.at(-1)!;
    const tip = tooltipHtml(L, y, 'AUS', '');
    expect(tip).toContain('Australia');
    expect(tip).toContain(y.v.AUS[1]);
    expect(tip).toContain(L.source);
    expect(tooltipHtml(L, y, 'USA', '')).toContain(L.text.withheld);
    expect(tooltipHtml(L, y, null, 'Siachen <Glacier>')).toContain('Siachen &lt;Glacier&gt;');
    const panel = countryPanelHtml(L, L.data.length - 1, 'AUS');
    expect(panel).toContain('data-show-row="AUS"');
    expect(panel).toContain(`1 of ${y.order.length} listed`);
    expect(countryPanelHtml(L, 0, 'FRA')).not.toContain('data-show-row');
  });
});

describe('view state in the URL', () => {
  const ctx: StateContext = { years: [2021, 2022, 2023, 2024, 2025], latest: 2025, slugs: { AUS: 'australia', CHL: 'chile' }, blocs: { brics: {}, g7: {} } };

  it('reads year, country and bloc, moving a year the source lacks to the nearest one', () => {
    expect(readState('?year=2023&country=chile&bloc=g7', ctx)).toEqual({ year: 2023, country: 'CHL', bloc: 'g7' });
    expect(readState('?year=2010', ctx)).toEqual({ year: 2021, askedYear: 2010 });
    expect(readState('?country=aus&bloc=nope', ctx)).toEqual({ country: 'AUS' });
    expect(nearestYear([2020, 2022], 2021)).toBe(2022);
  });

  it('writes only what differs from the plain view, keeping other parameters', () => {
    const u = new URL('https://geopolitics.tools/minerals/lithium?utm=x');
    expect(writeState(u, { year: 2025 }, ctx).search).toBe('?utm=x');
    expect(writeState(u, { year: 2023, country: 'AUS', bloc: 'brics' }, ctx).search).toBe('?utm=x&year=2023&country=australia&bloc=brics');
  });
});
