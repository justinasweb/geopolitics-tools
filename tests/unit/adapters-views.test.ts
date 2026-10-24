import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { matchReports, rawDir, resetMatchers } from '../../src/adapters/core.ts';
import { type OsmElement, cablesByPlace, cutLosses, inZone, parseCables, outages, tbpsOf } from '../../src/adapters/digital.ts';
import { gem } from '../../src/adapters/gem.ts';
import { hazards, parseQuakes, placeFromText } from '../../src/adapters/hazards.ts';
import { minerals, MINERALS } from '../../src/adapters/minerals.ts';
import { chokepoints, statusFor } from '../../src/adapters/portwatch.ts';
import { prices } from '../../src/adapters/prices.ts';
import { parseTicTable5, treasuryHistory, treasuryHolders } from '../../src/adapters/treasury.ts';
import { countryAt } from '../../src/lib/geo.ts';

const FIXTURES = new URL('../fixtures/prototype/', import.meta.url).pathname;
// The prototype kept these under its own folder names.
const raw = rawDir(FIXTURES, { 'usgs-quakes': 'usgsquakes', 'usgs-minerals': 'usgs', pinksheet: 'worldbank', 'treasury-history': 'treasury' });

beforeEach(() => resetMatchers());

describe('country shapes', () => {
  it('places points in Natural Earth shapes, Northern Cyprus in Cyprus and the sea in none', () => {
    expect(countryAt(2.35, 48.86)).toBe('FRA');
    expect(countryAt(139.69, 35.69)).toBe('JPN');
    expect(countryAt(33.36, 35.19)).toBe('CYP');
    expect(countryAt(-30, 30)).toBeNull();
    expect(matchReports()).toEqual(['naturalearth: every iso3 code matched']);
  });
});

describe('hazards', () => {
  it('reads GDACS alerts and USGS quakes, placing most quakes in a country', () => {
    const h = hazards(raw);
    expect(h.filter((e) => e.kind === 'EQ').length).toBe(470);
    expect(new Set(h.map((e) => e.kind))).toEqual(new Set(['EQ', 'TC', 'FL', 'DR', 'WF', 'VO']));
    expect(h.every((e) => ['green', 'orange', 'red', 'none'].includes(e.alert))).toBe(true);
    expect(h[0].from >= h.at(-1)!.from).toBe(true);
    const gd = h.filter((e) => e.kind !== 'EQ');
    expect(gd.every((e) => e.place)).toBe(true);
    // The samples' quakes are made up, many at sea; at least the ones on land must be placed.
    expect(h.filter((e) => e.kind === 'EQ' && e.place).length).toBeGreaterThan(200);
    expect(matchReports().every((r) => r.includes('every'))).toBe(true);
  });

  it('places a quake by its shape first, then by the country at the end of its place text', () => {
    const q = (lon: number, lat: number, place: string) => parseQuakes({ features: [{ id: 'x', geometry: { coordinates: [lon, lat, 10] }, properties: { mag: 6, place, time: 0, alert: 'yellow' } }] })[0];
    expect(q(139.7, 35.7, '10 km N of Tokyo, Japan').place).toBe('JPN');
    expect(q(143.5, 38.2, 'off the east coast of Honshu, Japan').place).toBe('JPN');
    expect(q(-160, 54, '100 km S of Sand Point, Alaska').place).toBe('USA');
    expect(q(-30, 0, 'central Mid-Atlantic Ridge').place).toBeNull();
    expect(q(139.7, 35.7, '').alert).toBe('orange');
    expect(placeFromText('190 km S of Tonga')).toBe('TON');
  });
});

describe('internet', () => {
  /** The prototype's cable file turned into the Overpass answer the fetcher saves: ways and landing stations. */
  const overpass = () => {
    const geo = JSON.parse(readFileSync(`${FIXTURES}cables/submarine_cables.geojson`, 'utf8'));
    const elements: OsmElement[] = [];
    let id = 1;
    const seen = new Set<string>();
    for (const f of geo.features) {
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) elements.push({ type: 'way', id: id++, tags: { name: f.properties.name, communication: 'line', capacity: `${f.properties.tbps} Tbps`, start_date: String(f.properties.rfs) }, line });
      for (const l of f.properties.landings) {
        const k = `${l.lon},${l.lat}`;
        if (!seen.has(k)) { seen.add(k); elements.push({ type: 'node', id: id++, tags: { telecom: 'cable_landing_station', name: l.name }, at: [l.lon, l.lat] }); }
      }
    }
    return { geo, json: { elements } };
  };

  it('joins cable ways by name and finds their landings and countries', () => {
    const { geo, json } = overpass();
    const cables = parseCables(json);
    expect(cables.length).toBe(new Set(geo.features.map((f: { properties: { name: string } }) => f.properties.name)).size);
    const smw6 = cables.find((c) => c.name === 'SEA-ME-WE 6')!;
    expect(smw6.tbps).toBe(100);
    expect(smw6.rfs).toBe(2025);
    const places = new Set(smw6.landings.map((l) => l.place));
    expect(places.has('SGP') && places.has('MYS') && places.has('BGD')).toBe(true);
    expect(cablesByPlace(cables).SGP).toContain(smw6.id);
  });

  it('places every sample landing in its country; an address beats a nearby coast', () => {
    const { geo, json } = overpass();
    const want = new Map<string, string>();
    for (const f of geo.features) for (const l of f.properties.landings) want.set(`${l.lon},${l.lat}`, l.iso3);
    // Matsu is too small for the 1:50m shapes, so only its address puts it in Taiwan.
    for (const e of json.elements as { tags: Record<string, string> }[]) if (e.tags?.name === 'Matsu') e.tags['addr:country'] = 'TW';
    const got = parseCables(json).flatMap((c) => c.landings.filter((l) => l.name).map((l) => [`${l.lon},${l.lat}`, l.place]));
    expect(got.filter(([k, p]) => want.get(k!) !== p)).toEqual([]);
  });

  it('finds cables through a zone and what a cut there costs each landing', () => {
    const zones = JSON.parse(readFileSync(`${FIXTURES}cables/zones.json`, 'utf8')).zones as { id: string; bbox: [number, number, number, number] }[];
    const red = zones.find((z) => z.id === 'red-sea')!;
    const cables = parseCables(overpass().json);
    const through = cables.filter((c) => inZone(c, red.bbox));
    expect(through.length).toBeGreaterThan(3);
    const losses = cutLosses(through.find((c) => c.name === 'SEA-ME-WE 6')!, red.bbox);
    expect(losses.find((l) => l.place === 'SGP')!.lost).toBeGreaterThan(0);
    expect(losses.every((l) => l.lost >= 0 && l.lost <= 1)).toBe(true);
    expect(tbpsOf('40 Tbps')).toBe(40);
    expect(tbpsOf('unknown')).toBeNull();
  });

  it('reads IODA country outages, newest first', () => {
    const o = outages(raw);
    expect(o.length).toBeGreaterThan(10);
    expect(o.map((e) => e.place)).toContain('IRQ');
    expect(o[0].start >= o.at(-1)!.start).toBe(true);
    expect(matchReports()).toEqual(['ioda: every iso2 code matched']);
  });
});

describe('resources and money', () => {
  it('reads the shown USGS minerals from the newest edition, with shares that add up', () => {
    const m = minerals(raw);
    expect(m.map((x) => x.label.toLowerCase())).toEqual(MINERALS.filter((n) => m.some((x) => x.label.toLowerCase() === n.toLowerCase())).map((n) => n.toLowerCase()));
    const li = m.find((x) => x.id === 'lithium')!;
    const total = li.producers.reduce((s, p) => s + (p.share ?? 0), 0) + (li.other.share ?? 0);
    expect(total).toBeCloseTo(1);
    expect(li.producers[0].place).toBe('AUS');
    expect(li.years.length).toBeGreaterThan(1);
    expect(matchReports()).toEqual(['usgs-minerals: every name matched']);
  });

  it('reads GEM pipelines, terminals and plants with countries matched', () => {
    const g = gem(raw);
    const ns1 = g.pipelines.find((p) => p.name === 'Nord Stream 1')!;
    expect(ns1.places).toEqual(['RUS', 'DEU']);
    expect(ns1.stop).toBe(2022);
    expect(g.terminals[0].place).toBe('QAT');
    expect(g.plants.find((p) => p.name === 'Kashiwazaki-Kariwa')!.stop).toBe(2012);
    expect(matchReports()).toEqual(['gem: every name matched']);
  });

  it('reads TIC Table 5 and the year-end history, leaving totals out', () => {
    const t = treasuryHolders(raw);
    expect(t.months[0]).toBe('2026-08');
    expect(t.holders[0]).toMatchObject({ label: 'Japan', place: 'JPN' });
    expect(t.holders.find((h) => h.label === 'China, Mainland')!.place).toBe('CHN');
    expect(t.holders.some((h) => /total/i.test(h.label))).toBe(false);
    expect(treasuryHistory(raw).CHN[2015]).toBe(1246);
    // The live table ends with notes, tab-separated like the rows.
    const notes = `${readFileSync(`${FIXTURES}treasury/slt_table5.txt`, 'utf8')}\nNotes:\t\t\t\t\t\t\t\t\t\t\t\t\t\nThe data in this table are collected\t\t\t\t\t\t\t\t\t\t\t\t\t\n`;
    expect(parseTicTable5(notes).holders.length).toBe(t.holders.length);
    expect(matchReports().every((r) => r.includes('every'))).toBe(true);
  });

  it('reads PortWatch chokepoints with a status against the year', () => {
    const c = chokepoints(raw);
    expect(c.length).toBe(9);
    const suez = c.find((p) => p.name === 'Suez Canal')!;
    expect(suez.series.length).toBeLessThanOrEqual(365);
    expect(suez.change).toBeCloseTo(suez.avg7! / suez.baseline! - 1);
    expect(statusFor(-0.5)).toBe('disrupted');
  });

  it('reads the Pink Sheet food, metals and gas prices', () => {
    const p = prices(raw);
    expect(p.series.COPPER[0]).toEqual({ date: '2016-01', value: 4486 });
    expect(p.series.NGAS_EUR.length).toBeGreaterThan(12);
    expect(Object.keys(p.labels)).toContain('GOLD');
  });
});
