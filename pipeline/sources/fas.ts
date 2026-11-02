// FAS nuclear warhead estimates, as Our World in Data publishes them (OWID's charts credit the Federation of American
// Scientists), saved as OWID's grapher CSVs (Entity, Code, Year, then the figures), kept whole since both are small:
//
// - fas/nuclear-warhead-stockpiles.csv: each state's estimated stockpile, every year since 1945. The map's series.
// - fas/nuclear-warhead-inventories.csv: the latest estimate split by status (deployed, reserve, retired). The first
//   live check (2 Nov 2026) found this export holds the latest year only, so it cannot carry the series.
//
// Each file's header, years and coverage are logged before the checks run, so a run shows what OWID sent even when a
// check refuses it. FAS publishes about twice a year, so a monthly check is enough. FAS's own table can also be
// imported by hand as kind `fas-forces` (./imported.ts); it replaces the split from OWID when it is newer.
import { getText } from '../lib/http.ts';
import { parseCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

export const SERIES_FILE = 'nuclear-warhead-stockpiles.csv';
export const STATUS_FILE = 'nuclear-warhead-inventories.csv';
const csvUrl = (chart: string) => `https://ourworldindata.org/grapher/${chart}.csv?v=1&csvType=full&useColumnShortNames=true`;
export const SERIES_URL = csvUrl('nuclear-warhead-stockpiles');
export const STATUS_URL = csvUrl('nuclear-warhead-inventories');
/** The nine states FAS counts; each file must have a figure for each. */
export const NINE = ['USA', 'RUS', 'GBR', 'FRA', 'CHN', 'IND', 'PAK', 'ISR', 'PRK'];

export interface Described { head: string[]; rows: number; years: number[]; first: number; last: number; inLast: string[] }

/** What a grapher CSV holds: its columns, rows, the years with a figure above zero, and which states have one in the last. */
export function describe(body: string): Described {
  const [head = [], ...rows] = parseCsv(body);
  const data = rows.filter((r) => r.length >= 4);
  const has = (r: string[]) => r.slice(3).some((v) => Number(v) > 0);
  const years = [...new Set(data.filter(has).map((r) => Number(r[2])).filter(Number.isFinite))].sort((a, b) => a - b);
  const last = years.at(-1) ?? NaN;
  const inLast = [...new Set(data.filter((r) => has(r) && Number(r[2]) === last).map((r) => r[1]))];
  return { head, rows: data.length, years, first: years[0] ?? NaN, last, inLast };
}

const say = (d: Described) => `columns ${d.head.join(', ')}; ${d.rows} rows; figures in ${d.years.length} years (${d.first}–${d.last}); in ${d.last}: ${d.inLast.join(' ')}`;

function checkGrapher(name: string, d: Described) {
  const lower = d.head.map((h) => h.trim().toLowerCase());
  check(lower[0] === 'entity' && lower[1] === 'code' && lower[2] === 'year', `${name}: expected Entity, Code, Year first; got ${d.head.slice(0, 3).join(', ')}`);
  const missing = NINE.filter((c) => !d.inLast.includes(c));
  check(!missing.length, `${name}: no ${d.last} figures for ${missing.join(', ')}`);
}

/** The series: OWID's stockpile chart, from 1945 to a recent year, all nine states. */
export function checkSeries(body: string, now: Date): Described {
  const d = describe(body);
  checkGrapher(SERIES_FILE, d);
  check(d.head.slice(3).some((h) => /stockpile|warhead|inventor|nuclear/i.test(h)), `${SERIES_FILE}: no warhead column among ${d.head.slice(3).join(', ')}`);
  check(d.first <= 1946, `${SERIES_FILE}: the series starts in ${d.first}, not 1945 (${say(d)})`);
  check(d.last >= now.getUTCFullYear() - 2, `${SERIES_FILE}: newest year is ${d.last}; the file looks stale`);
  return d;
}

/** The split: OWID's inventories chart, with status columns and all nine states in its latest year. */
export function checkStatus(body: string, now: Date): Described {
  const d = describe(body);
  checkGrapher(STATUS_FILE, d);
  check(d.head.slice(3).some((h) => /deployed|reserve|retired/i.test(h)), `${STATUS_FILE}: no status columns (deployed, reserve, retired) among ${d.head.slice(3).join(', ')}`);
  check(d.last >= now.getUTCFullYear() - 2, `${STATUS_FILE}: newest year is ${d.last}; the file looks stale`);
  return d;
}

const source: Source = {
  id: 'fas',
  name: 'FAS Status of World Nuclear Forces',
  every: 30 * DAY,
  staleAfter: 400 * DAY,
  enabled: true,
  attribution: 'Federation of American Scientists, Status of World Nuclear Forces, via Our World in Data',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const series = await getText(ctx.http, ctx.env.FAS_SERIES_URL ?? SERIES_URL, { timeout: 60_000 });
    const status = await getText(ctx.http, ctx.env.FAS_STATUS_URL ?? STATUS_URL, { timeout: 60_000 });
    ctx.log(`${SERIES_FILE}: ${say(describe(series))}`);
    ctx.log(`${STATUS_FILE}: ${say(describe(status))}`);
    const s = checkSeries(series, ctx.now);
    checkStatus(status, ctx.now);
    guardShrink(ctx, SERIES_FILE, s.rows, await ctx.previous(SERIES_FILE), (p) => parseCsv(p).length - 1);
    return { files: [text(SERIES_FILE, series, 'text/csv'), text(STATUS_FILE, status, 'text/csv')], rows: s.rows, dataTo: String(s.last) };
  },
};
export default source;
