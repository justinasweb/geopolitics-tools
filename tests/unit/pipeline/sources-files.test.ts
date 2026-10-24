// The zip and Excel readers, and the fetchers that need them or answer in bulk: FAOSTAT, the
// Pink Sheet, UK sanctions, submarine cables, and the IMF sources (switched off). No network.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toCsv, parseCsv } from '../../../pipeline/lib/csv.ts';
import type { FetchResult } from '../../../pipeline/lib/source.ts';
import { readXlsx } from '../../../pipeline/lib/xlsx.ts';
import { listFile, openEntry, unzip } from '../../../pipeline/lib/zip.ts';
import cables, { trim } from '../../../pipeline/sources/cables.ts';
import faostat, { FILES, fixEncoding, latestComplete, mainSuppliers } from '../../../pipeline/sources/faostat.ts';
import imfWeo from '../../../pipeline/sources/imf-weo.ts';
import pinksheet, { SERIES, findLink } from '../../../pipeline/sources/pinksheet.ts';
import portwatch from '../../../pipeline/sources/portwatch.ts';
import ukSanctions from '../../../pipeline/sources/uk-sanctions.ts';
import { ctxFor, fakeHttp, makeXlsx, makeZip } from './helpers.ts';

const body = (r: FetchResult, name: string) => {
  const f = r.files.find((x) => x.name === name)!;
  return typeof f.body === 'string' ? f.body : new TextDecoder().decode(f.body);
};
const iso = (i: number) => String.fromCharCode(65 + (i % 26), 65 + (Math.floor(i / 26) % 26), 65 + Math.floor(i / 676));

describe('zip and xlsx', () => {
  it('unpacks in memory and streams one entry from disk', async () => {
    const zip = makeZip({ 'a.txt': 'hello', 'dir/b.csv': 'x,y\n'.repeat(1000) });
    expect(new TextDecoder().decode((await unzip(zip)).get('a.txt'))).toBe('hello');
    const path = join(mkdtempSync(join(tmpdir(), 'gt-zip-')), 'f.zip');
    writeFileSync(path, zip);
    const entries = await listFile(path);
    expect(entries.map((e) => [e.name, e.size])).toEqual([['a.txt', 5], ['dir/b.csv', 4000]]);
    let text = '';
    for await (const c of await openEntry(path, entries[1])) text += String(c);
    expect(text).toBe('x,y\n'.repeat(1000));
  });

  it('reads a sheet by name, with shared strings, gaps and numbers as Excel shows them', async () => {
    const wb = await readXlsx(makeXlsx('Monthly Prices', [['Title & more'], [], [null, 'A', null, 'C'], ['1960M01', 70.09999999999999, null, 3]]));
    expect(wb.sheets).toEqual(['Cover', 'Monthly Prices']);
    expect(wb.rows('Monthly Prices')).toEqual([['Title & more'], [], ['', 'A', '', 'C'], ['1960M01', '70.1', '', '3']]);
    expect(() => wb.rows('Annual')).toThrow('no sheet "Annual"; the workbook has Cover, Monthly Prices');
  });
});

describe('pinksheet', () => {
  const names = [...SERIES.map((s) => (s === 'Potassium chloride' ? 'Potassium chloride **' : s)), 'Tea, avg 3 auctions'];
  const workbook = (lastYear: number, lastMonth: number) => {
    const rows: (string | number | null)[][] = [['World Bank Commodity Price Data (The Pink Sheet)'], ['Monthly prices in nominal US dollars'], [], [null, ...names], [null, ...names.map(() => '($/unit)')]];
    for (let y = 1960; y <= lastYear; y++) for (let m = 1; m <= (y === lastYear ? lastMonth : 12); m++) rows.push([`${y}M${String(m).padStart(2, '0')}`, ...names.map((_, i) => i + 0.5)]);
    return makeXlsx('Monthly Prices', rows);
  };
  const page = '<a href="https://thedocs.worldbank.org/en/doc/abc/related/CMO-Historical-Data-Monthly.xlsx">Monthly prices</a>';

  it('finds the workbook on the Commodity Markets page and saves the monthly sheet', async () => {
    expect(findLink(page)).toBe('https://thedocs.worldbank.org/en/doc/abc/related/CMO-Historical-Data-Monthly.xlsx');
    const r = await pinksheet.fetch(ctxFor(fakeHttp([[/commodity-markets/, () => page], [/CMO-Historical/, () => new Response(workbook(2026, 9))]])));
    const rows = parseCsv(body(r, 'monthly-prices.csv'));
    expect(rows[0].slice(0, 3)).toEqual(['month', 'Crude oil, Brent', 'Natural gas, US']);
    expect(rows[1][1]).toBe('($/unit)');
    expect(rows.at(-1)![0]).toBe('2026M09');
    expect(r.dataTo).toBe('2026-09');
  });

  it("refuses last year's workbook and a page without the link", async () => {
    await expect(pinksheet.fetch(ctxFor(fakeHttp([[/commodity-markets/, () => page], [/CMO-Historical/, () => new Response(workbook(2025, 12))]])))).rejects.toThrow(/2025-12, more than 3 months old/);
    await expect(pinksheet.fetch(ctxFor(fakeHttp([[/commodity-markets/, () => '<html></html>']])))).rejects.toThrow(/no link/);
  });
});

describe('uk-sanctions', () => {
  it('finds the header under the report date, trims columns and dedupes alias rows', async () => {
    const header = ['Last Updated', 'Unique ID', 'Name 6', 'Name type', 'Regime Name', 'Designation Type', 'Date Designated', 'Address Country', 'UK Statement of Reasons'];
    const rows = Array.from({ length: 2100 }, (_, i) => [
      ['20/10/2026', `RUS${i}`, `Name ${i}`, 'Primary Name', 'Russia', 'Entity', '01/03/2022', 'Russia', 'long text'],
      ['20/10/2026', `RUS${i}`, `Name ${i}`, 'Primary Name', 'Russia', 'Entity', '01/03/2022', 'Russia', 'other long text'],
    ]).flat();
    rows[0][0] = rows[1][0] = '23/10/2026';
    const r = await ukSanctions.fetch(ctxFor(fakeHttp([[/sanctionslist/, () => toCsv([['Report Date: 24/10/2026'], header, ...rows])]])));
    const out = parseCsv(body(r, 'sanctions.csv'));
    expect(out[0]).toEqual(['Unique ID', 'Designation Type', 'Regime Name', 'Last Updated', 'Date Designated', 'Name type', 'Name 6', 'Address Country']);
    expect(out[1]).toEqual(['RUS0', 'Entity', 'Russia', '2026-10-23', '2022-03-01', 'Primary Name', 'Name 0', 'Russia']);
    expect(out.length - 1).toBe(2100);
    expect(r.dataTo).toBe('2026-10-23');
  });

  it('names the columns when the export changes', async () => {
    await expect(ukSanctions.fetch(ctxFor(fakeHttp([[/sanctionslist/, () => 'Unique ID,Name\n1,a\n']])))).rejects.toThrow(/Designation Type, Regime Name missing; the file has Unique ID, Name/);
  });
});

describe('cables', () => {
  it('keeps cable ways, relations and landing points with trimmed tags and rounded coordinates', async () => {
    const ways = Array.from({ length: 320 }, (_, i) => ({ type: 'way', id: i, tags: { communication: 'line', location: 'underwater', name: `Cable ${i}`, note: 'x' }, geometry: [{ lat: 1.23456, lon: 2.34567 }, null] }));
    const nodes = [{ type: 'node', id: 9, lat: 51.5001, lon: -0.1234, tags: { telecom: 'landing_point', name: 'Bude' } }];
    const calls: string[] = [];
    const r = await cables.fetch(ctxFor(fakeHttp([[/overpass-api/, () => new Response('busy', { status: 504 })], [/kumi/, () => ({ elements: [...ways, ...nodes] })]], calls)));
    expect(calls.some((c) => c.includes('kumi'))).toBe(true);
    const saved = JSON.parse(body(r, 'overpass.json'));
    expect(saved.elements[0]).toEqual({ type: 'way', id: 0, tags: { communication: 'line', location: 'underwater', name: 'Cable 0' }, line: [[2.346, 1.235], null] });
    expect(saved.elements.at(-1)).toEqual(trim(nodes[0] as never));
    expect(r.rows).toBe(321);
  });

  it('refuses an answer Overpass cut short', async () => {
    await expect(cables.fetch(ctxFor(fakeHttp([[/overpass-api/, () => ({ remark: 'runtime error: Query timed out', elements: [] })]])))).rejects.toThrow(/Query timed out/);
  });
});

describe('faostat', () => {
  const AREA = ['Area Code', 'Area Code (M49)', 'Area', 'Item Code', 'Item Code (CPC)', 'Item', 'Element Code', 'Element', 'Year Code', 'Year', 'Unit', 'Value', 'Flag', 'Note'];
  const PAIR = ['Reporter Country Code', 'Reporter Country Code (M49)', 'Reporter Countries', 'Partner Country Code', 'Partner Country Code (M49)', 'Partner Countries', 'Item Code', 'Item Code (CPC)', 'Item', 'Element Code', 'Element', 'Year Code', 'Year', 'Unit', 'Value', 'Flag'];
  const crops = ['Wheat', 'Maize (corn)', 'Rice', 'Soya beans', 'Barley'];

  const areaFile = (elements: string[]) => {
    const rows = [AREA];
    for (let a = 0; a < 200; a++) for (const item of crops) for (const el of elements) for (let y = 1995; y <= 2024; y++)
      rows.push([String(a), `'${a}`, a === 0 ? "Côte d'Ivoire" : `Area ${a}`, '1', '', item, '5510', el, String(y), String(y), 't', '100', 'A', '']);
    return makeZip({ 'Data_E_All_Data_(Normalized).csv': toCsv(rows), 'Data_E_Flags.csv': 'Flag\n' });
  };
  const matrix = () => {
    const rows = [PAIR];
    for (let r = 0; r < 400; r++) for (const item of ['Wheat', 'Barley']) for (const y of [2023, 2024]) {
      if (y === 2024 && r >= 20) continue; // 2024 has only a few reporters so far
      for (let p = 0; p < 30; p++) rows.push([String(r), '', `R${r}`, String(p), '', `P${p}`, '1', '', item, '5610', 'Import quantity', String(y), String(y), 't', String(p < 2 ? 1000 : 1), '']);
    }
    return makeZip({ 'Trade_DetailedTradeMatrix_E_All_Data_(Normalized).csv': toCsv(rows) });
  };

  it('keeps the four crops since 2000 and cuts the matrix to main suppliers in the latest complete year', async () => {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {
      [FILES.crops]: areaFile(['Production', 'Area harvested']),
      [FILES.trade]: areaFile(['Import quantity', 'Import value']),
      [FILES.fertilizers]: areaFile(['Agricultural Use']),
      [FILES.matrix]: matrix(),
    };
    const ctx = ctxFor(fakeHttp([[/bulks-faostat/, (url) => new Response(files[decodeURIComponent(url.split('/').pop()!)])]]));
    const r = await faostat.fetch(ctx);
    const c = parseCsv(body(r, 'crops.csv'));
    expect(c[0]).toEqual(['Area Code', 'Area', 'Item Code', 'Item', 'Element Code', 'Element', 'Year', 'Unit', 'Value', 'Area Code (M49)', 'Flag']);
    expect(c.length - 1).toBe(200 * 4 * 25);
    expect(c[1][1]).toBe("Côte d'Ivoire");
    expect(parseCsv(body(r, 'trade.csv')).length - 1).toBe(200 * 4 * 25);
    expect(parseCsv(body(r, 'fertilizers.csv')).length - 1).toBe(200 * 5 * 25);
    const m = parseCsv(body(r, 'matrix.csv'));
    // 2023, not the thin 2024; wheat only; per importer two main suppliers (2,000 of 2,028 t) and one remainder row.
    expect(new Set(m.slice(1).map((x) => x[m[0].indexOf('Year')]))).toEqual(new Set(['2023']));
    expect(m.length - 1).toBe(400 * 3);
    expect(m[3]).toContain('Other partners (28)');
    expect(r.dataTo).toBe('2024');
  });

  it('decodes UTF-8 kept lines read byte for byte, and leaves Latin-1 ones alone', () => {
    expect(fixEncoding(Buffer.from('"Côte"', 'utf8').toString('latin1'))).toBe('"Côte"');
    expect(fixEncoding(Buffer.from('"Côte"', 'latin1').toString('latin1'))).toBe('"Côte"');
  });

  it('folds suppliers past 90% or past ten into one row, and finds the latest complete year', () => {
    const header = ['Reporter Country Code', 'Partner Country Code', 'Partner Countries', 'Item Code', 'Value'];
    const rows = Array.from({ length: 15 }, (_, p) => ['1', String(p), `P${p}`, '15', '10']);
    const out = mainSuppliers(header, rows);
    expect(out).toHaveLength(11);
    expect(out.at(-1)).toEqual(['1', '', 'Other partners (5)', '15', '50']);
    expect(latestComplete([['2023', 'a'], ['2023', 'b'], ['2024', 'a']], 0, 1)).toBe('2023');
  });
});

describe('IMF sources (switched off)', () => {
  it('are off until the IMF answers', () => {
    expect(imfWeo.enabled).toMatch(/IMF/);
    expect(portwatch.enabled).toMatch(/IMF/);
  });

  it('imf-weo keeps countries and drops groups', async () => {
    const countries = Object.fromEntries(Array.from({ length: 190 }, (_, i) => [iso(i), { label: `C${i}` }]));
    const values = (code: string) => ({ values: { [code]: { ...Object.fromEntries(Object.keys(countries).map((c) => [c, { 2024: 1, 2031: 2 }])), WEOWORLD: { 2024: 9 } } } });
    const r = await imfWeo.fetch(ctxFor(fakeHttp([[/countries$/, () => ({ countries })], [/v1\/(\w+)$/, (u) => values(u.split('/').pop()!)]])));
    const ngdpd = JSON.parse(body(r, 'NGDPD.json'));
    expect(Object.keys(ngdpd.values.NGDPD)).toHaveLength(190);
    expect(ngdpd.values.NGDPD.WEOWORLD).toBeUndefined();
    expect(r.dataTo).toBe('2031');
  });

  it('portwatch pages through the feature service', async () => {
    const day = (i: number) => ({ attributes: { ObjectId: i, date: 1_760_000_000_000 + i * 86_400_000, portid: `chokepoint${i % 24}`, portname: 'Suez Canal', n_total: 50 } });
    const calls: string[] = [];
    const r = await portwatch.fetch(ctxFor(fakeHttp([[/Chokepoints/, (u) => {
      const off = Number(new URL(u).searchParams.get('resultOffset'));
      return { features: Array.from({ length: off < 8000 ? 2000 : 1500 }, (_, i) => day(off + i)), exceededTransferLimit: off < 8000 };
    }]], calls)));
    expect(calls).toHaveLength(5);
    expect(r.rows).toBe(9500);
    expect(JSON.parse(body(r, 'chokepoints.json'))[0]).not.toHaveProperty('ObjectId');
  });
});
