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
import faostat, { DOMAINS, fixEncoding, m49, pickYear } from '../../../pipeline/sources/faostat.ts';
import imfWeo from '../../../pipeline/sources/imf-weo.ts';
import pinksheet, { FILES, findLink, norm } from '../../../pipeline/sources/pinksheet.ts';
import portwatch from '../../../pipeline/sources/portwatch.ts';
import ukSanctions from '../../../pipeline/sources/uk-sanctions.ts';
import M49_ISO3 from '../../../pipeline/reference/m49-iso3.json';
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
  const headers = Object.values(FILES).flatMap(([, cols]) => Object.values(cols).map(([, match]) => (match === 'Potassium chloride' ? 'Potassium chloride **' : match)));
  const workbook = (lastYear: number, lastMonth: number) => {
    const rows: (string | number | null)[][] = [['World Bank Commodity Price Data (The Pink Sheet)'], ['Monthly prices in nominal US dollars'], [], [null, 'Crude oil, Brent', ...headers], [null, '($/bbl)', ...headers.map(() => '($/unit)')]];
    for (let y = 1960; y <= lastYear; y++) for (let m = 1; m <= (y === lastYear ? lastMonth : 12); m++) rows.push([`${y}M${String(m).padStart(2, '0')}`, 80, ...headers.map((_, i) => (i === 0 && y < 2020 ? '\u2026' : i + 0.12345))]);
    return makeXlsx('Monthly Prices', rows);
  };
  const page = '<a href="https://thedocs.worldbank.org/en/doc/abc/related/CMO-Historical-Data-Monthly.xlsx">Monthly prices</a>';

  it('finds the workbook on the Commodity Markets page and writes the three sample-format files from 2010', async () => {
    expect(findLink(page)).toBe('https://thedocs.worldbank.org/en/doc/abc/related/CMO-Historical-Data-Monthly.xlsx');
    expect(norm('Potassium chloride **')).toBe('Potassium chloride');
    const r = await pinksheet.fetch(ctxFor(fakeHttp([[/commodity-markets/, () => page], [/CMO-Historical/, () => new Response(workbook(2026, 9))]])));
    expect(r.files.map((f) => f.name)).toEqual(['cmo_food_prices.json', 'cmo_metals_prices.json', 'cmo_gas_prices.json']);
    const food = JSON.parse(body(r, 'cmo_food_prices.json'));
    expect(food.columns.WHEAT_US_HRW).toBe('Wheat, US HRW');
    expect(food.data[0]).toEqual({ period: '2010M01', WHEAT_US_HRW: null, MAIZE: 1.123, RICE_05: 2.123, SOYBEANS: 3.123, POTASH: 4.123, DAP: 5.123, PHOSROCK: 6.123 });
    expect(food.data.at(-1).period).toBe('2026M09');
    expect(JSON.parse(body(r, 'cmo_gas_prices.json')).columns).toEqual({ NGAS_US: 'Natural gas, US (Henry Hub)', NGAS_EUR: 'Natural gas, Europe (TTF)', NGAS_JP: 'Liquefied natural gas, Japan' });
    expect(r.dataTo).toBe('2026-09');
  });

  it("refuses last year's workbook, a renamed column and a page without the link", async () => {
    await expect(pinksheet.fetch(ctxFor(fakeHttp([[/commodity-markets/, () => page], [/CMO-Historical/, () => new Response(workbook(2025, 12))]])))).rejects.toThrow(/2025-12, more than 3 months old/);
    const renamed = makeXlsx('Monthly Prices', [[null, 'Maize', 'Copper'], [null, '$', '$'], ...Array.from({ length: 200 }, (_, i) => [`${2010 + Math.floor(i / 12)}M${String((i % 12) + 1).padStart(2, '0')}`, 1, 2])]);
    await expect(pinksheet.fetch(ctxFor(fakeHttp([[/commodity-markets/, () => page], [/CMO-Historical/, () => new Response(renamed)]]), {}, new Date('2026-09-15T00:00:00Z')))).rejects.toThrow(/column "Wheat, US HRW" not found/);
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
    const nodes = [
      { type: 'node', id: 9, lat: 51.5001, lon: -0.1234, tags: { telecom: 'cable_landing_station', name: 'Bude' } },
      ...Array.from({ length: 20 }, (_, i) => ({ type: 'way', id: 1000 + i, center: { lat: 10, lon: 20 }, tags: { telecom: 'cable_landing_station', building: 'service' } })),
    ];
    const calls: string[] = [];
    const r = await cables.fetch(ctxFor(fakeHttp([[/overpass-api/, () => new Response('busy', { status: 504 })], [/kumi/, () => ({ elements: [...ways, ...nodes] })]], calls)));
    expect(calls.some((c) => c.includes('kumi'))).toBe(true);
    const saved = JSON.parse(body(r, 'overpass.json'));
    expect(saved.elements[0]).toEqual({ type: 'way', id: 0, tags: { communication: 'line', location: 'underwater', name: 'Cable 0' }, line: [[2.346, 1.235], null] });
    expect(saved.elements[320]).toEqual({ type: 'node', id: 9, tags: { telecom: 'cable_landing_station', name: 'Bude' }, at: [-0.123, 51.5] });
    expect(saved.elements.at(-1)).toEqual(trim(nodes.at(-1) as never));
    expect(saved.elements.at(-1).at).toEqual([20, 10]);
    expect(r.rows).toBe(341);
  });

  it('refuses an answer Overpass cut short', async () => {
    await expect(cables.fetch(ctxFor(fakeHttp([[/overpass-api/, () => ({ remark: 'runtime error: Query timed out', elements: [] })]])))).rejects.toThrow(/Query timed out/);
  });
});

describe('faostat', () => {
  const AREA = ['Area Code', 'Area Code (M49)', 'Area', 'Item Code', 'Item Code (CPC)', 'Item', 'Element Code', 'Element', 'Year Code', 'Year', 'Unit', 'Value', 'Flag', 'Note'];
  const PAIR = ['Reporter Country Code', 'Reporter Country Code (M49)', 'Reporter Countries', 'Partner Country Code', 'Partner Country Code (M49)', 'Partner Countries', 'Item Code', 'Item Code (CPC)', 'Item', 'Element Code', 'Element', 'Year Code', 'Year', 'Unit', 'Value', 'Flag'];
  // 70 countries by M49 code, plus FAO's "China" (159, no ISO3 code: mainland + Hong Kong, Macao, Taiwan), World (001) and a region (5100, no M49).
  const M49S = [...new Set(['156', '076', '840', '250', '276', '356', '384', ...Object.keys(M49_ISO3)])].slice(0, 70);
  const areas: [string, string][] = [...M49S.map((c, i): [string, string] => [`'${c}`, c === '384' ? 'C\u00f4te d\'Ivoire' : `Area ${i}`]), ["'159", 'China'], ["'001", 'World'], ['', 'Africa']];
  const items: [number, string][] = [[15, 'Wheat'], [27, 'Rice'], [56, 'Maize (corn)'], [236, 'Soya beans'], [44, 'Barley'], [3102, 'Nutrient nitrogen N (total)'], [3103, 'Nutrient phosphate P2O5 (total)'], [3104, 'Nutrient potash K2O (total)']];
  const areaFile = (elements: [number, string][]) => {
    const rows = [AREA];
    for (const [code, name] of areas) for (const [ic, item] of items) for (const [ec, el] of elements) for (let y = 2012; y <= 2024; y++)
      rows.push(['1', code, name, String(ic), '', item, String(ec), el, String(y), String(y), 't', '100', 'A', '']);
    return makeZip({ 'Data_E_All_Data_(Normalized).csv': toCsv(rows), 'Data_E_Flags.csv': 'Flag\n' });
  };
  const matrix = () => {
    const rows = [PAIR];
    for (const [r, rep] of M49S.entries()) for (const y of [2022, 2023, 2024]) {
      if (y === 2024 && r >= 20) continue; // 2024: only a few reporters so far
      for (const [p, par] of M49S.slice(0, 14).entries()) for (const [ic, item] of [[15, 'Wheat'], [44, 'Barley']] as const)
        rows.push(['1', `'${rep}`, `R${r}`, '1', `'${par}`, `P${p}`, String(ic), '', item, '5610', 'Import quantity', String(y), String(y), 't', String(p === 13 ? 500 : 100_000 - p), '']);
    }
    return makeZip({ 'Trade_DetailedTradeMatrix_E_All_Data_(Normalized).csv': toCsv(rows) });
  };

  it('writes API-format rows by ISO3 code since 2015, keeping World and dropping aggregates and FAO\'s "China"', async () => {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {
      [DOMAINS.QCL.zip]: areaFile([[5510, 'Production'], [5312, 'Area harvested']]),
      [DOMAINS.TCL.zip]: areaFile([[5610, 'Import quantity'], [5622, 'Import value']]),
      [DOMAINS.RFN.zip]: areaFile([[5157, 'Agricultural Use'], [5510, 'Production']]),
      [DOMAINS.TM.zip]: matrix(),
    };
    const r = await faostat.fetch(ctxFor(fakeHttp([[/bulks-faostat/, (url) => new Response(files[decodeURIComponent(url.split('/').pop()!)])]])));
    expect(r.files.map((f) => f.name)).toEqual(['QCL_production.json', 'TCL_trade.json', 'RFN_fertilizers.json', 'TM_matrix.json']);
    const qcl = JSON.parse(body(r, 'QCL_production.json'));
    expect(qcl.retrieved).toBe('2026-10-24');
    // The prototype's sample keys, in order.
    expect(Object.keys(qcl.data[0])).toEqual(['Domain Code', 'Area Code (ISO3)', 'Area', 'Element Code', 'Element', 'Item Code', 'Item', 'Year Code', 'Year', 'Unit', 'Value', 'Flag']);
    expect(qcl.data[0]).toMatchObject({ 'Domain Code': 'QCL', 'Area Code (ISO3)': 'CHN', 'Element Code': 5510, 'Item Code': 15, Year: 2015, Value: 100 });
    expect(qcl.data.length).toBe((70 + 1) * 4 * 10);
    expect(qcl.data.find((x: { Area: string }) => x.Area === 'World')['Area Code (ISO3)']).toBe('');
    expect(qcl.data.some((x: { Area: string }) => x.Area === 'China' || x.Area === 'Africa')).toBe(false);
    expect(qcl.data.find((x: { 'Area Code (ISO3)': string }) => x['Area Code (ISO3)'] === 'CIV').Area).toBe('C\u00f4te d\'Ivoire');
    expect(JSON.parse(body(r, 'TCL_trade.json')).data.length).toBe(71 * 4 * 10);
    const rfn = JSON.parse(body(r, 'RFN_fertilizers.json'));
    expect(new Set(rfn.data.map((x: { 'Item Code': number }) => x['Item Code']))).toEqual(new Set([3102, 3103, 3104]));
    expect(rfn.data.length).toBe(71 * 3 * 2 * 10);

    const tm = JSON.parse(body(r, 'TM_matrix.json'));
    expect(tm.source).toMatch(/Detailed trade matrix, 2023/);
    expect(Object.keys(tm.data[0])).toEqual(['Domain Code', 'Reporter Country Code (ISO3)', 'Reporter Countries', 'Partner Country Code (ISO3)', 'Partner Countries', 'Element Code', 'Element', 'Item Code', 'Item', 'Year Code', 'Year', 'Unit', 'Value', 'Flag']);
    // Wheat only; per importer the 10 largest suppliers, not itself, none under 1,000 t.
    expect(new Set(tm.data.map((x: { Item: string }) => x.Item))).toEqual(new Set(['Wheat']));
    expect(tm.data.filter((x: { 'Reporter Country Code (ISO3)': string }) => x['Reporter Country Code (ISO3)'] === 'CHN')).toHaveLength(10);
    expect(tm.data.every((x: Record<string, unknown>) => x['Reporter Country Code (ISO3)'] !== x['Partner Country Code (ISO3)'] && (x.Value as number) >= 1000)).toBe(true);
    expect(r.dataTo).toBe('2024');
  });

  it('decodes UTF-8 kept lines read byte for byte, and leaves Latin-1 ones alone', () => {
    expect(fixEncoding(Buffer.from('"C\u00f4te"', 'utf8').toString('latin1'))).toBe('"C\u00f4te"');
    expect(fixEncoding(Buffer.from('"C\u00f4te"', 'latin1').toString('latin1'))).toBe('"C\u00f4te"');
    expect(m49("'4")).toBe('004');
  });

  it('picks the latest year with at least 80% of the year before\'s reporters', () => {
    const r = (n: number) => new Set(Array.from({ length: n }, (_, i) => String(i)));
    expect(pickYear(new Map([[2022, r(150)], [2023, r(140)], [2024, r(30)]]))).toBe(2023);
    expect(pickYear(new Map([[2023, r(150)], [2024, r(130)]]))).toBe(2024);
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
    expect(r.files.map((f) => f.name)).toEqual(['NGDP_RPCH.json', 'PCPIPCH.json', 'GGXWDG_NGDP.json', 'GGXCNL_NGDP.json', 'LUR.json', 'BCA_NGDPD.json']);
    const lur = JSON.parse(body(r, 'LUR.json'));
    expect(Object.keys(lur.values.LUR)).toHaveLength(190);
    expect(lur.values.LUR.WEOWORLD).toBeUndefined();
    expect(r.dataTo).toBe('2031');
  });

  it('portwatch saves the chokepoints and their daily rows in the ArcGIS format, dates as days', async () => {
    const t0 = Date.UTC(2025, 8, 1);
    const daily = (i: number) => ({ attributes: { date: t0 + Math.floor(i / 28) * 86_400_000, year: 2025, portid: `chokepoint${i % 28}`, portname: 'Suez Canal', n_total: 50 } });
    const calls: string[] = [];
    const r = await portwatch.fetch(ctxFor(fakeHttp([
      [/chokepoints_database/, () => ({ features: Array.from({ length: 28 }, (_, i) => ({ attributes: { portid: `chokepoint${i}`, portname: 'Suez Canal', lat: 30, lon: 32 } })) })],
      [/Daily_Chokepoints_Data/, (u) => {
        const off = Number(new URL(u).searchParams.get('resultOffset'));
        return { features: Array.from({ length: off < 10_000 ? 2000 : 1300 }, (_, i) => daily(off + i)), exceededTransferLimit: off < 10_000 };
      }],
    ], calls)));
    expect(calls.filter((c) => c.includes('Daily'))).toHaveLength(6);
    expect(new URL(calls[1]).searchParams.get('where')).toBe('year >= 2025');
    const saved = JSON.parse(body(r, 'chokepoints_daily.json'));
    expect(saved.features[0].attributes).toEqual({ date: '2025-09-19', portid: 'chokepoint0', portname: 'Suez Canal', n_total: 50 });
    expect(JSON.parse(body(r, 'chokepoints.json')).features).toHaveLength(28);
    expect(r.dataTo).toBe('2026-10-09');
  });
});
