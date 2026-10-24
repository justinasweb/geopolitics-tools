// FAOSTAT, from the open bulk downloads (the API now needs an account) → faostat/:
//   QCL_production.json   production of wheat, maize, rice and soybeans
//   TCL_trade.json        their import and export quantities
//   RFN_fertilizers.json  nitrogen, phosphate and potash: production, trade and agricultural use
//   TM_matrix.json        who imports these from whom: the latest well-reported year, each importer's
//                         10 largest suppliers per commodity, flows of at least 1,000 t
// Each is written in the row format the FAOSTAT API returns with area_cs=ISO3, the format of the
// prototype's samples: { source, retrieved, data: [rows] }. Ported from the prototype's fetcher,
// which was checked against the live files: countries are matched by UN M49 code, so FAO's regional
// and income aggregates and "China" (mainland plus Hong Kong, Macao and Taiwan) drop out; World is
// kept with an empty ISO3 code. Each bulk file is a zip of a CSV; the trade matrix is about 50
// million rows, so the zips are saved to disk and read as streams, the matrix twice.
// FAOSTAT's matrix has no fertiliser rows in practice: potash and phosphate flows come from UN Comtrade.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { saveTo } from '../lib/http.ts';
import { parseCsv } from '../lib/csv.ts';
import { listFile, openEntry } from '../lib/zip.ts';
import { type Source, type FetchContext, DAY, CheckError, check, guardShrink, json } from '../lib/source.ts';

const FROM = 2015;
const TM_TOP = 10;
const TM_MIN = 1000;
const CROPS = [15, 27, 28, 29, 30, 31, 56, 236];
/** 3102 nitrogen, 3103 phosphate, 3104 potash (the prototype's sample put phosphate under 3102). */
const NUTRIENTS = [3102, 3103, 3104];

export interface Domain { zip: string; save: string; title: string; items: number[]; elements: number[]; matrix?: true }
export const DOMAINS: Record<string, Domain> = {
  QCL: { zip: 'Production_Crops_Livestock_E_All_Data_(Normalized).zip', save: 'QCL_production.json', title: 'Crops and livestock products, production', items: [15, 27, 56, 236], elements: [5510] },
  TCL: { zip: 'Trade_CropsLivestock_E_All_Data_(Normalized).zip', save: 'TCL_trade.json', title: 'Crops and livestock products, trade', items: CROPS, elements: [5610, 5910] },
  RFN: { zip: 'Inputs_FertilizersNutrient_E_All_Data_(Normalized).zip', save: 'RFN_fertilizers.json', title: 'Fertilizers by Nutrient', items: NUTRIENTS, elements: [5157, 5510, 5610, 5910] },
  TM: { zip: 'Trade_DetailedTradeMatrix_E_All_Data_(Normalized).zip', save: 'TM_matrix.json', title: 'Detailed trade matrix', items: [...CROPS, ...NUTRIENTS], elements: [5610], matrix: true },
};

const M49: Record<string, string> = JSON.parse(readFileSync(new URL('../reference/m49-iso3.json', import.meta.url), 'utf8'));
/** FAOSTAT writes M49 codes as '004 (with a quote, so spreadsheets keep the zeros). */
export const m49 = (code: string) => code.trim().replace(/^'/, '').padStart(3, '0');
const iso = (code: string) => M49[m49(code)];

const utf8 = new TextDecoder('utf-8', { fatal: true });
/** Lines are read as latin1, which keeps every byte; a kept line is then decoded as UTF-8 if it is valid UTF-8. */
export const fixEncoding = (line: string) => {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(line)) return line;
  try { return utf8.decode(Buffer.from(line, 'latin1')); } catch { return line; }
};

type Row = { at: Record<string, number>; r: string[] };

/** The data CSV inside a bulk zip, row by row; a line is parsed only when the cheap text test passes. */
async function* rows(path: string, wanted: (line: string) => boolean): AsyncGenerator<Row> {
  const entries = await listFile(path);
  const entry = entries.find((e) => /All_Data.*\.csv$/i.test(e.name) && !/Flags|AreaCodes|ItemCodes|Elements/i.test(e.name));
  if (!entry) throw new CheckError(`no data CSV in the zip; it has ${entries.map((e) => e.name).join(', ')}`);
  const stream = await openEntry(path, entry);
  stream.setEncoding('latin1');
  let at: Record<string, number> | undefined;
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    if (!at) {
      at = Object.fromEntries((parseCsv(line.replace(/^(\ufeff|\u00ef\u00bb\u00bf)/, ''))[0] ?? []).map((h, i) => [h.trim(), i]));
      continue;
    }
    if (wanted(line)) yield { at, r: parseCsv(fixEncoding(line))[0] ?? [] };
  }
}

const need = (at: Record<string, number>, columns: string[], what: string) => {
  const missing = columns.filter((c) => at[c] === undefined);
  if (missing.length) throw new CheckError(`${what}: column(s) ${missing.join(', ')} missing; the bulk format changed (it has ${Object.keys(at).join(', ')})`);
};

/** A cheap test on the raw line: one of the wanted item codes appears as a whole field. */
const hasItem = (d: Domain) => {
  const re = new RegExp(`(^|,)"?(${d.items.join('|')})"?(,|$)`);
  return (line: string) => re.test(line);
};

export async function readArea(path: string, name: string, d: Domain) {
  const items = new Set(d.items);
  const elements = new Set(d.elements);
  const out: Record<string, string | number>[] = [];
  let checked = false;
  for await (const { at, r } of rows(path, hasItem(d))) {
    if (!checked) { need(at, ['Area Code (M49)', 'Area', 'Item Code', 'Item', 'Element Code', 'Element', 'Year', 'Unit', 'Value'], name); checked = true; }
    const year = Number(r[at.Year]);
    const item = Number(r[at['Item Code']]);
    const el = Number(r[at['Element Code']]);
    if (year < FROM || !items.has(item) || !elements.has(el) || (r[at.Value] ?? '') === '') continue;
    const code = r[at['Area Code (M49)']] ?? '';
    const area = m49(code) === '001' ? '' : iso(code);
    if (area === undefined) continue;
    out.push({
      'Domain Code': name, 'Area Code (ISO3)': area, Area: r[at.Area], 'Element Code': el, Element: r[at.Element], 'Item Code': item, Item: r[at.Item],
      'Year Code': year, Year: year, Unit: r[at.Unit], Value: Number(r[at.Value]), Flag: at.Flag === undefined ? '' : r[at.Flag] ?? '',
    });
  }
  check(checked, `${name}: no rows for the wanted items`);
  return out;
}

/** The latest year whose reporters number at least 80% of the year before's (the newest year is usually thin). */
export function pickYear(reporters: Map<number, Set<string>>) {
  const years = [...reporters.keys()].sort((a, b) => b - a);
  for (const [i, y] of years.entries()) {
    const prev = years[i + 1];
    if (prev === undefined || reporters.get(y)!.size >= 0.8 * reporters.get(prev)!.size) return y;
  }
  return years[0];
}

export async function readMatrix(path: string, d: Domain, log: (m: string) => void) {
  const items = new Set(d.items);
  const wanted = hasItem(d);
  const reporters = new Map<number, Set<string>>();
  let checked = false;
  for await (const { at, r } of rows(path, (l) => l.includes('5610'))) {
    if (!checked) {
      need(at, ['Reporter Country Code (M49)', 'Reporter Countries', 'Partner Country Code (M49)', 'Partner Countries', 'Item Code', 'Item', 'Element Code', 'Year', 'Value'], 'TM');
      checked = true;
    }
    const y = Number(r[at.Year]);
    if (Number(r[at['Element Code']]) !== 5610 || y < FROM) continue;
    const s = reporters.get(y) ?? new Set();
    s.add(r[at['Reporter Country Code (M49)']]);
    reporters.set(y, s);
  }
  check(reporters.size, `TM: no import rows since ${FROM}`);
  const year = pickYear(reporters);
  log(`TM latest well-reported year: ${year} (${reporters.get(year)!.size} reporters)`);

  const flows = new Map<number, Map<string, Map<string, number>>>();
  const names = new Map<string, string>();
  const itemNames = new Map<number, string>();
  const units = new Map<number, string>();
  const y = String(year);
  for await (const { at, r } of rows(path, (l) => l.includes(y) && wanted(l))) {
    const item = Number(r[at['Item Code']]);
    if (r[at.Year] !== y || !items.has(item) || Number(r[at['Element Code']]) !== 5610 || (r[at.Value] ?? '') === '') continue;
    const rep = iso(r[at['Reporter Country Code (M49)']]);
    const par = iso(r[at['Partner Country Code (M49)']]);
    const v = Number(r[at.Value]);
    if (!rep || !par || rep === par || !(v >= TM_MIN)) continue;
    let byRep = flows.get(item);
    if (!byRep) flows.set(item, (byRep = new Map()));
    let byPar = byRep.get(rep);
    if (!byPar) byRep.set(rep, (byPar = new Map()));
    byPar.set(par, (byPar.get(par) ?? 0) + v);
    if (!names.has(rep)) names.set(rep, r[at['Reporter Countries']]);
    if (!names.has(par)) names.set(par, r[at['Partner Countries']]);
    if (!itemNames.has(item)) itemNames.set(item, r[at.Item]);
    if (!units.has(item)) units.set(item, (at.Unit === undefined ? '' : r[at.Unit]) || 't');
  }
  const out: Record<string, string | number>[] = [];
  for (const [item, byRep] of flows) {
    for (const [rep, byPar] of byRep) {
      for (const [par, v] of [...byPar].sort((a, b) => b[1] - a[1]).slice(0, TM_TOP)) {
        out.push({
          'Domain Code': 'TM', 'Reporter Country Code (ISO3)': rep, 'Reporter Countries': names.get(rep)!, 'Partner Country Code (ISO3)': par, 'Partner Countries': names.get(par)!,
          'Element Code': 5610, Element: 'Import quantity', 'Item Code': item, Item: itemNames.get(item)!, 'Year Code': year, Year: year, Unit: units.get(item)!, Value: v, Flag: '',
        });
      }
    }
  }
  return { rows: out, year };
}

async function download(ctx: FetchContext, dir: string, file: string) {
  const bases = ctx.env.FAOSTAT_BASE ? [ctx.env.FAOSTAT_BASE] : ['https://bulks-faostat.fao.org/production/', 'https://fenixservices.fao.org/faostat/static/bulkdownloads/'];
  const path = join(dir, file);
  for (const [i, base] of bases.entries()) {
    try {
      const bytes = await saveTo(ctx.http, `${base}${file}`, path, { timeout: 900_000, tries: 2 });
      ctx.log(`${file}: ${(bytes / 1e6).toFixed(0)} MB`);
      return path;
    } catch (e) {
      if (i === bases.length - 1) throw e;
      ctx.log(`${(e as Error).message}; trying ${bases[i + 1]}`);
    }
  }
  throw new Error('unreachable');
}

const source: Source = {
  id: 'faostat',
  name: 'FAOSTAT',
  every: 30 * DAY,
  staleAfter: 400 * DAY,
  enabled: true,
  attribution: 'FAO. FAOSTAT. Food and Agriculture Organization of the United Nations',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const dir = mkdtempSync(join(tmpdir(), 'faostat-'));
    const retrieved = ctx.now.toISOString().slice(0, 10);
    try {
      const files = [];
      let total = 0;
      let newest = 0;
      for (const [name, d] of Object.entries(DOMAINS)) {
        const path = await download(ctx, dir, d.zip);
        const { rows: data, year } = d.matrix ? await readMatrix(path, d, ctx.log) : { rows: await readArea(path, name, d), year: undefined };
        rmSync(path);
        const key = d.matrix ? 'Reporter Country Code (ISO3)' : 'Area Code (ISO3)';
        const countries = new Set(data.map((r) => r[key]).filter(Boolean)).size;
        check(countries >= Number(ctx.env.FAO_MIN_COUNTRIES ?? 60), `${name}: only ${countries} countries`);
        const prev = await ctx.previous(d.save);
        guardShrink(ctx, d.save, data.length, prev, (p) => (JSON.parse(p).data as unknown[]).length);
        const years = data.map((r) => Number(r.Year));
        const seen = [...new Map(data.map((r) => [r['Item Code'], r.Item])).entries()].map(([c, n]) => `${c} ${n}`).join('; ');
        ctx.log(`${name}: ${data.length} rows, ${countries} countries, ${Math.min(...years)}–${Math.max(...years)}; items ${seen}`);
        files.push(json(d.save, { source: `FAOSTAT ${name} — ${d.title}${year ? `, ${year}` : ''} (bulk download, filtered)`, retrieved, data }));
        total += data.length;
        if (name === 'QCL') newest = Math.max(...years);
      }
      return { files, rows: total, dataTo: String(newest) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
export default source;
