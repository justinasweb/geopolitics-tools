import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../pipeline/lib/csv.ts';
import { decodeText, importFile, prepare, readInput } from '../../../pipeline/lib/importer.ts';
import { loadState, readRaw, run, type Snapshot } from '../../../pipeline/lib/runner.ts';
import { HOUR, DAY, type Source } from '../../../pipeline/lib/source.ts';
import { IMPORTED, KINDS } from '../../../pipeline/sources/imported.ts';
import { createHttp } from '../../../pipeline/lib/http.ts';
import { makeXlsx, makeZip, tempStores } from './helpers.ts';

const FIXTURES = new URL('../../fixtures/prototype/', import.meta.url).pathname;
const fixture = (p: string) => readFileSync(join(FIXTURES, p), 'utf8');
const now = new Date('2026-10-24T12:00:00Z');
const enc = (s: string) => new TextEncoder().encode(s);
const dir = () => mkdtempSync(join(tmpdir(), 'gt-import-'));

// Where the prototype kept each kind's sample (the Treasury history and USGS minerals now have their own source folders).
const SAMPLES: Record<string, string> = {
  'sipri': 'sipri/tiv_2015-2025.csv',
  'wpp-total': 'wpp/total_population.csv',
  'wpp-indicators': 'wpp/demographic_indicators.csv',
  'wpp-age': 'wpp/population_by_age.csv',
  'gem-coal': 'gem/coal_plants.csv',
  'gem-nuclear': 'gem/nuclear_plants.csv',
  'gem-lng': 'gem/lng_terminals.csv',
  'gem-pipelines': 'gem/pipelines.geojson',
  'aqueduct-baseline': 'aqueduct/rankings_baseline.csv',
  'aqueduct-future': 'aqueduct/rankings_future.csv',
  'aquastat': 'aquastat/water_resources.csv',
  'gdw': 'gdw/dams.csv',
  'aiddata': 'aiddata/gcdf_v3.csv',
  'usgs': 'usgs/MCS2026_Commodities_Data.csv',
  'treasury-history': 'treasury/mfh_history.csv',
};

const csvKind = (columns: string[], extra: Partial<(typeof KINDS)[string]> = {}) => ({ source: 't', save: 't.csv', about: '', how: 'csv' as const, columns, ...extra });
const table = (n: number) => ['a,b,c', ...Array.from({ length: n }, (_, i) => `${i},x${i},y`)].join('\n');

describe('import kinds', () => {
  it('has a sample for every kind and a source for every kind', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(KINDS).sort());
    for (const k of Object.values(KINDS)) expect(IMPORTED.some((s) => s.id === k.source)).toBe(true);
  });

  it.each(Object.keys(SAMPLES))('accepts the prototype sample for %s and keeps it as it is', async (id) => {
    const kind = KINDS[id];
    const text = fixture(SAMPLES[id]);
    const out = prepare(kind, await readInput(SAMPLES[id], enc(text)), now);
    if (kind.how === 'raw') expect(out.body).toBe(text);
    else if (kind.how === 'geojson') expect(JSON.parse(out.body)).toEqual(JSON.parse(text));
    else {
      // Compared as records: hand-kept columns now come last (the LNG sample has StopYear in the middle).
      const records = (csv: string) => {
        const [head, ...rows] = parseCsv(csv);
        return rows.map((r) => Object.fromEntries(head.map((c, i) => [c, r[i]])));
      };
      const sample = records(text);
      const kept = id === 'wpp-age' ? sample.filter((r) => Number(r.Time) % 5 === 0 || r.Time === '2026') : sample;
      expect(records(out.body)).toEqual(kept);
      expect(parseCsv(out.body)[0]).toEqual([...kind.columns!, ...(kind.added ?? [])]);
      expect(out.added).toEqual([]);
    }
    expect(out.rows).toBeGreaterThanOrEqual(10);
  });

  it('keeps the needed columns in order, drops the rest, and appends hand-kept columns', () => {
    const lng = KINDS['gem-lng'];
    const header = ['Extra', ...lng.columns!.slice().reverse()];
    const rows = Array.from({ length: 12 }, (_, i) => header.map((c) => (c === 'Extra' ? 'drop me' : `${c}-${i}`)));
    const out = prepare(lng, { text: [header, ...rows].map((r) => r.join(',')).join('\n') }, now);
    const got = parseCsv(out.body);
    expect(got[0]).toEqual([...lng.columns!, 'StopYear']);
    expect(got[1]).toEqual([...lng.columns!.map((c) => `${c}-0`), '']);
    expect(out.added).toEqual(['StopYear']);
  });

  it('stops on a missing column and lists the columns the file has', () => {
    expect(() => prepare(KINDS.aquastat, { text: 'Area,ISO3,Year,Value\nA,AAA,2020,1' }, now)).toThrow(/missing columns: Variable, Unit\nColumns in the file: Area, ISO3, Year, Value/);
  });

  it('filters UN population rows to countries and the three main variants', () => {
    const rows = ['Variant,ISO3_code,Location,Time,PopTotal'];
    for (let i = 0; i < 12; i++) rows.push(`Medium,AA${String.fromCharCode(65 + i)},X,2020,1`);
    rows.push('Medium,,World,2020,8000000', 'Constant fertility,AAA,X,2020,1', 'Low,AAA,X,2020,1');
    const out = prepare(KINDS['wpp-total'], { text: rows.join('\n') }, now);
    expect(out.rows).toBe(13);
    expect(out.body).not.toMatch(/World|Constant/);
  });

  it('refuses too few rows, and far fewer than the last import unless allowed', () => {
    const k = csvKind(['a', 'b']);
    expect(() => prepare(k, { text: table(5) }, now)).toThrow(/only 5 rows kept/);
    const before = prepare(k, { text: table(200) }, now).body;
    expect(() => prepare(k, { text: table(50) }, now, before)).toThrow(/50 values now against 200/);
    expect(prepare(k, { text: table(50) }, now, before, true).rows).toBe(50);
  });

  it('runs each raw kind’s check', () => {
    expect(() => prepare(KINDS.sipri, { text: 'Supplier,Recipient,2020\nA,B,1' }, now)).toThrow(/SIPRI/);
    expect(() => prepare(KINDS.usgs, { text: 'Commodity,Country,Year,Value\n' }, now)).toThrow(/"Statistics"/);
    expect(() => prepare(KINDS['treasury-history'], { text: 'Name,2020\nA,1' }, now)).toThrow(/Country followed by years/);
    expect(() => prepare(KINDS['gem-pipelines'], { text: '{"type":"Feature"}' }, now)).toThrow(/FeatureCollection/);
    expect(() => prepare(KINDS['gem-pipelines'], { text: '{"type":"FeatureCollection","features":[{"properties":{"ProjectID":"P1"}}]}' }, now)).toThrow(/lack properties: PipelineName/);
  });

  it('names USGS files by edition, so older editions sit beside the new one', () => {
    const save = KINDS.usgs.save as (from: string) => string;
    expect(save('8dc131e5-MCS2026_Commodities_Data.csv')).toBe('MCS2026_Commodities_Data.csv');
    expect(save('mcs2024_commodities_data.csv')).toBe('MCS2024_Commodities_Data.csv');
    expect(() => save('commodities.csv')).toThrow(/edition/);
  });
});

describe('reading downloads', () => {
  it('reads UTF-8 (dropping a byte-order mark) and falls back to Windows-1252', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('Côte')]))).toBe('Côte');
    expect(decodeText(new Uint8Array([0x43, 0xf4, 0x74, 0x65, 0x20, 0x96]))).toBe('Côte –');
  });

  it('reads gzipped and zipped files, and asks which file when a zip holds several', async () => {
    expect(await readInput('a.csv.gz', gzipSync(enc('x,y')))).toEqual({ text: 'x,y' });
    expect(await readInput('a.zip', makeZip({ '__MACOSX/._a.csv': 'junk', 'readme.pdf': 'no', 'data/a.csv': 'x,y' }))).toEqual({ text: 'x,y' });
    const two = makeZip({ 'a.csv': 'a', 'b.csv': 'b' });
    await expect(readInput('t.zip', two)).rejects.toThrow(/2 files \(a.csv, b.csv\); name one with --entry=/);
    expect(await readInput('t.zip', two, { entry: 'b.csv' })).toEqual({ text: 'b' });
    await expect(readInput('t.pdf', enc('x'))).rejects.toThrow(/can't read/);
  });

  it('reads a workbook: finds the sheet and the header row under a title, and pads short rows', async () => {
    const columns = ['GEM location ID', 'Country/Area', 'Plant name', 'Capacity (MW)', 'Status', 'Start year', 'Retired year', 'Latitude', 'Longitude'];
    const rows = Array.from({ length: 12 }, (_, i) => [`L${i}`, 'China', `Plant ${i}`, 600 + i, 'Operating', 2003]);
    const book = makeXlsx('Units', [['Global Coal Plant Tracker, July 2026'], [], columns, ...rows]);
    const input = await readInput('Global-Coal-Plant-Tracker-July-2026.xlsx', book, { columns });
    expect(input).toMatchObject({ sheet: 'Units' });
    const out = parseCsv(prepare(KINDS['gem-coal'], input, now).body);
    expect(out[0]).toEqual(columns);
    expect(out[1]).toEqual(['L0', 'China', 'Plant 0', '600', 'Operating', '2003', '', '', '']);
    expect(out.length).toBe(13);
    await expect(readInput('b.xlsx', book, { columns: ['Nope'] })).rejects.toThrow(/no sheet with the columns Nope; the workbook has Cover, Units/);
    await expect(readInput('b.xlsx', book, { sheet: 'Plants' })).rejects.toThrow(/no sheet "Plants"/);
    expect(() => prepare(KINDS.sipri, input, now)).toThrow(/not a workbook/);
  });
});

describe('importing into the stores', () => {
  const http = createHttp((async () => new Response('')) as unknown as typeof fetch, 0);
  const alerter = { configured: false, send: async () => false };
  const fetched: Source = { id: 'a', name: 'A', every: HOUR, staleAfter: DAY, enabled: true, attribution: 'A', licence: 'L', fetch: async () => ({ files: [{ name: 'x.json', body: '1' }], rows: 1 }) };
  const write = (name: string, text: string) => {
    const p = join(dir(), name);
    writeFileSync(p, text);
    return p;
  };
  const base = (stores: ReturnType<typeof tempStores>, kindId: string, path: string, at = now) => ({ stores, kindId, kind: KINDS[kindId], path, sources: [fetched], imported: IMPORTED, now: at, log: () => {} });

  it('saves the file, records it and publishes a snapshot, and saves nothing new for the same file again', async () => {
    const stores = tempStores();
    const path = write('8dc131e5-MCS2026_Commodities_Data.csv', fixture(SAMPLES.usgs));
    const r = await importFile(base(stores, 'usgs', path));
    expect(r).toMatchObject({ source: 'usgs-minerals', file: 'MCS2026_Commodities_Data.csv', changed: true, snapshot: '2026-10-24T1200Z' });
    const st = (await loadState(stores)).sources['usgs-minerals'];
    expect(st.imported).toEqual({ 'MCS2026_Commodities_Data.csv': { from: '8dc131e5-MCS2026_Commodities_Data.csv', at: now.toISOString(), rows: r.rows } });
    expect(new TextDecoder().decode((await readRaw(stores, st.files['MCS2026_Commodities_Data.csv']))!)).toBe(fixture(SAMPLES.usgs));
    const snap = JSON.parse(new TextDecoder().decode((await stores.snapshots.get('latest.json'))!)) as Snapshot;
    expect(snap.sources['usgs-minerals']).toMatchObject({ name: 'USGS Mineral Commodity Summaries', imported: st.imported });
    const status = JSON.parse(new TextDecoder().decode((await stores.snapshots.get('status.json'))!));
    expect(status.sources['usgs-minerals']).toMatchObject({ imported: true, lastImport: now.toISOString() });
    expect(status.sources.a).toMatchObject({ enabled: true });

    const again = await importFile(base(stores, 'usgs', path, new Date('2026-10-25T09:00:00Z')));
    expect(again).toMatchObject({ changed: false, snapshot: '2026-10-24T1200Z' });
  });

  it('keeps several files of one source, and the hourly run keeps imported files in its snapshots', async () => {
    const stores = tempStores();
    await importFile(base(stores, 'wpp-total', write('WPP2024_TotalPopulationBySex.csv', fixture(SAMPLES['wpp-total']))));
    const gz = join(dir(), 'WPP2024_PopulationByAge5GroupSex_Medium.csv.gz');
    writeFileSync(gz, gzipSync(enc(fixture(SAMPLES['wpp-age']))));
    await importFile(base(stores, 'wpp-age', gz));
    const r = await run({ sources: [fetched], imported: IMPORTED, stores, http, alerter, now: new Date('2026-10-24T13:00:00Z'), log: () => {} });
    const snap = JSON.parse(new TextDecoder().decode((await stores.snapshots.get(`snapshots/${r.snapshot}.json`))!)) as Snapshot;
    expect(Object.keys(snap.sources).sort()).toEqual(['a', 'wpp']);
    expect(Object.keys(snap.sources.wpp.files).sort()).toEqual(['population_by_age.csv', 'total_population.csv']);
  });

  it('does not lose an import made while an hourly run is going', async () => {
    const stores = tempStores();
    const slow: Source = { ...fetched, fetch: async () => {
      await importFile(base(stores, 'treasury-history', write('mfh_history.csv', fixture(SAMPLES['treasury-history']))));
      return { files: [{ name: 'x.json', body: '2' }], rows: 1 };
    } };
    await run({ sources: [slow], imported: IMPORTED, stores, http, alerter, now: new Date('2026-10-24T13:00:00Z'), log: () => {} });
    const state = await loadState(stores);
    expect(Object.keys(state.sources).sort()).toEqual(['a', 'treasury-history']);
    const snap = JSON.parse(new TextDecoder().decode((await stores.snapshots.get('latest.json'))!)) as Snapshot;
    expect(Object.keys(snap.sources).sort()).toEqual(['a', 'treasury-history']);
  });
});
