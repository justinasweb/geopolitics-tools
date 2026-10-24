// FAOSTAT, from the open bulk downloads (the API now needs an account) → faostat/:
//   crops.csv        production of wheat, maize, rice and soybeans (QCL), since 2000
//   trade.csv        their import and export quantities (TCL), since 2000
//   fertilizers.csv  fertilisers by nutrient (RFN), since 2000
//   matrix.csv       who imports these crops from whom (TM), latest complete year, each importer's
//                    main suppliers (90% of the quantity, at most 10) and one remainder row
// Each bulk file is a zip of a CSV in FAOSTAT's normalized layout, one value per row; the trade
// matrix is about 50 million rows, so the zips are saved to disk and read as a stream. Rows keep
// FAOSTAT's own columns; regional aggregates stay in (the adapters keep them apart from countries).
// FAOSTAT has no fertiliser trade matrix: potash and phosphate flows come from UN Comtrade.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { saveTo } from '../lib/http.ts';
import { parseCsv, toCsv } from '../lib/csv.ts';
import { listFile, openEntry } from '../lib/zip.ts';
import { type Source, type FetchContext, DAY, CheckError, check, guardShrink, text } from '../lib/source.ts';

const FROM = 2000;

/** The four crops, as FAOSTAT names them in production and trade ("Maize (corn)", "Rice, paddy"…). */
export const CROP = /^(wheat|maize( \(corn\))?|rice(, (paddy|milled)( \(rice milled equivalent\))?)?|soya beans|soybeans)$/i;
const CROP_HINT = /Wheat|Maize|Rice|Soya|Soybean/;

export const FILES = {
  crops: 'Production_Crops_Livestock_E_All_Data_(Normalized).zip',
  trade: 'Trade_CropsLivestock_E_All_Data_(Normalized).zip',
  fertilizers: 'Inputs_FertilizersNutrient_E_All_Data_(Normalized).zip',
  matrix: 'Trade_DetailedTradeMatrix_E_All_Data_(Normalized).zip',
};

const AREA = { required: ['Area Code', 'Area', 'Item Code', 'Item', 'Element Code', 'Element', 'Year', 'Unit', 'Value'], optional: ['Area Code (M49)', 'Flag'] };
const PAIR = {
  required: ['Reporter Country Code', 'Reporter Countries', 'Partner Country Code', 'Partner Countries', 'Item Code', 'Item', 'Element', 'Year', 'Unit', 'Value'],
  optional: ['Reporter Country Code (M49)', 'Partner Country Code (M49)'],
};

/** A kept FAOSTAT row stays as text in FAOSTAT's columns; these pick them by name. */
export function columnsOf(header: string[], spec: { required: string[]; optional: string[] }, what: string) {
  const names = [...spec.required, ...spec.optional.filter((c) => header.includes(c))];
  const missing = spec.required.filter((c) => !header.includes(c));
  if (missing.length) throw new CheckError(`${what}: column(s) ${missing.join(', ')} missing; the file has ${header.join(', ')}`);
  const idx = names.map((c) => header.indexOf(c));
  const at = Object.fromEntries(names.map((c, i) => [c, i]));
  return { names, at, pick: (r: string[]) => idx.map((i) => r[i] ?? '') };
}

/** The data CSV inside a bulk zip, line by line. Read as latin1, which keeps every byte, then each kept line is decoded as UTF-8 if it is valid UTF-8. */
async function* lines(path: string): AsyncGenerator<string> {
  const entries = await listFile(path);
  const entry = entries.find((e) => /All_Data.*\.csv$/i.test(e.name)) ?? entries.find((e) => e.name.endsWith('.csv'));
  if (!entry) throw new CheckError(`no CSV in the zip; it has ${entries.map((e) => e.name).join(', ')}`);
  const stream = await openEntry(path, entry);
  stream.setEncoding('latin1');
  yield* createInterface({ input: stream, crlfDelay: Infinity });
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
export const fixEncoding = (line: string) => {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(line)) return line;
  try { return utf8.decode(Buffer.from(line, 'latin1')); } catch { return line; }
};

/** Rows of one bulk file that pass a cheap text test first (most of the 50 million lines fail it) and then the real filter. */
async function scan(path: string, what: string, spec: typeof AREA, hint: RegExp | null, keep: (r: string[], at: Record<string, number>) => boolean) {
  let cols: ReturnType<typeof columnsOf> | undefined;
  const rows: string[][] = [];
  let seen = 0;
  for await (const line of lines(path)) {
    if (!cols) {
      cols = columnsOf(parseCsv(line.replace(/^(\ufeff|\u00ef\u00bb\u00bf)/, ''))[0] ?? [], spec, what);
      continue;
    }
    seen++;
    if (hint && !hint.test(line)) continue;
    const r = cols.pick(parseCsv(fixEncoding(line))[0] ?? []);
    if (keep(r, cols.at)) rows.push(r);
  }
  check(cols, `${what}: empty file`);
  return { header: cols.names, at: cols.at, rows, seen };
}

/** For each importer and crop, the suppliers that make up 90% of the quantity (at most 10), then one remainder row. */
export function mainSuppliers(header: string[], rows: string[][]) {
  const at = Object.fromEntries(header.map((c, i) => [c, i]));
  const groups = new Map<string, string[][]>();
  for (const r of rows) {
    const k = `${r[at['Reporter Country Code']]}\u0001${r[at['Item Code']]}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: string[][] = [];
  for (const g of groups.values()) {
    const sorted = g.map((r) => [r, Number(r[at.Value]) || 0] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    let sum = 0;
    let n = 0;
    for (const [r, v] of sorted) {
      if (n >= 10 || (n > 0 && sum >= total * 0.9)) break;
      out.push(r);
      sum += v;
      n++;
    }
    const rest = total - sum;
    if (rest > 0) {
      const other = [...sorted[0][0]];
      for (const c of ['Partner Country Code', 'Partner Country Code (M49)']) if (at[c] !== undefined) other[at[c]] = '';
      other[at['Partner Countries']] = `Other partners (${sorted.length - n})`;
      other[at.Value] = String(Math.round(rest * 1000) / 1000);
      out.push(other);
    }
  }
  return out;
}

/** The latest year that most importers have reported: the last year often has only a few. */
export function latestComplete(rows: string[][], yearAt: number, reporterAt: number) {
  const reporters = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = reporters.get(r[yearAt]) ?? new Set();
    s.add(r[reporterAt]);
    reporters.set(r[yearAt], s);
  }
  const most = Math.max(...[...reporters.values()].map((s) => s.size));
  return [...reporters.entries()].filter(([, s]) => s.size >= most * 0.8).map(([y]) => y).sort().at(-1);
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
  attribution: 'FAO, FAOSTAT',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const dir = mkdtempSync(join(tmpdir(), 'faostat-'));
    try {
      const since = (r: string[], at: Record<string, number>) => Number(r[at.Year]) >= FROM;
      const run = async (name: keyof typeof FILES, spec: typeof AREA, hint: RegExp | null, keep: (r: string[], at: Record<string, number>) => boolean) => {
        const path = await download(ctx, dir, FILES[name]);
        const out = await scan(path, FILES[name], spec, hint, keep);
        rmSync(path);
        ctx.log(`${name}: ${out.seen} rows read, ${out.rows.length} kept`);
        return out;
      };

      const crops = await run('crops', AREA, CROP_HINT, (r, at) => CROP.test(r[at.Item]) && r[at.Element] === 'Production' && since(r, at));
      check(crops.rows.length >= 3_000, `crops: only ${crops.rows.length} rows`);
      const trade = await run('trade', AREA, CROP_HINT, (r, at) => CROP.test(r[at.Item]) && /^(Import|Export) quantity$/.test(r[at.Element]) && since(r, at));
      check(trade.rows.length >= 3_000, `trade: only ${trade.rows.length} rows`);
      const fert = await run('fertilizers', AREA, null, since);
      check(fert.rows.length >= 2_000, `fertilizers: only ${fert.rows.length} rows`);
      // Only the last few years of the matrix are held: the latest complete one is among them.
      const recent = ctx.now.getUTCFullYear() - 5;
      const tm = await run('matrix', PAIR, CROP_HINT, (r, at) => CROP.test(r[at.Item]) && r[at.Element] === 'Import quantity' && Number(r[at.Year]) >= recent);
      const year = latestComplete(tm.rows, tm.at.Year, tm.at['Reporter Country Code']);
      check(year, 'matrix: no import rows');
      const flows = mainSuppliers(tm.header, tm.rows.filter((r) => r[tm.at.Year] === year));
      check(flows.length >= 1_000, `matrix: only ${flows.length} main flows in ${year}`);

      const prev = await ctx.previous('crops.csv');
      guardShrink(ctx, 'crops.csv', crops.rows.length, prev, (p) => parseCsv(p).length - 1, 0.8);
      const newest = crops.rows.map((r) => r[crops.at.Year]).sort().at(-1);
      ctx.log(`crops to ${newest}; trade matrix ${year}: ${flows.length} main flows`);
      return {
        files: [
          text('crops.csv', toCsv([crops.header, ...crops.rows]), 'text/csv'),
          text('trade.csv', toCsv([trade.header, ...trade.rows]), 'text/csv'),
          text('fertilizers.csv', toCsv([fert.header, ...fert.rows]), 'text/csv'),
          text('matrix.csv', toCsv([tm.header, ...flows]), 'text/csv'),
        ],
        rows: crops.rows.length + trade.rows.length + fert.rows.length + flows.length,
        dataTo: newest,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
export default source;
