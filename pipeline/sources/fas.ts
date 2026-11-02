// FAS nuclear warhead estimates since 1945, as Our World in Data publishes them (its "Estimated nuclear warhead
// inventories" chart, which credits the Federation of American Scientists) → fas/nuclear-warhead-inventories.csv,
// saved as OWID's grapher CSV: Entity, Code, Year and the figures. It is small, so it is kept whole.
// FAS publishes about twice a year, so a monthly check is enough. FAS's current split (deployed, reserve, retired)
// is only on FAS's own page; it is imported by hand as kind `fas-forces` (./imported.ts).
import { getText } from '../lib/http.ts';
import { parseCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

const FILE = 'nuclear-warhead-inventories.csv';
export const FAS_URL = 'https://ourworldindata.org/grapher/nuclear-warhead-inventories.csv?v=1&csvType=full&useColumnShortNames=true';
/** The nine states FAS counts; the file must have a figure for each. */
export const NINE = ['USA', 'RUS', 'GBR', 'FRA', 'CHN', 'IND', 'PAK', 'ISR', 'PRK'];

/** Throws unless the text is OWID's grapher CSV of FAS's estimates; returns its rows and newest year. */
export function checkFas(body: string, now: Date): { rows: number; dataTo: number } {
  const [head, ...rows] = parseCsv(body);
  const lower = (head ?? []).map((h) => h.trim().toLowerCase());
  check(lower[0] === 'entity' && lower[1] === 'code' && lower[2] === 'year', `expected Entity, Code, Year first; got ${(head ?? []).slice(0, 3).join(', ')}`);
  check(lower.slice(3).some((h) => /warhead|inventor|stockpile|deployed|retired|reserve|nuclear/.test(h)), `no warhead column among ${head.slice(3).join(', ')}`);
  const data = rows.filter((r) => r.length >= 4);
  const has = (r: string[]) => r.slice(3).some((v) => Number(v) > 0);
  const codes = new Set(data.filter(has).map((r) => r[1]));
  const missing = NINE.filter((c) => !codes.has(c));
  check(!missing.length, `no figures for ${missing.join(', ')}`);
  const years = data.filter(has).map((r) => Number(r[2]));
  check(Math.min(...years) <= 1946, `the series starts in ${Math.min(...years)}, not 1945`);
  const dataTo = Math.max(...years);
  check(dataTo >= now.getUTCFullYear() - 2, `newest year is ${dataTo}; the file looks stale`);
  return { rows: data.length, dataTo };
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
    const url = ctx.env.FAS_URL ?? FAS_URL;
    const body = await getText(ctx.http, url, { timeout: 60_000 });
    const { rows, dataTo } = checkFas(body, ctx.now);
    const prev = await ctx.previous(FILE);
    guardShrink(ctx, FILE, rows, prev, (p) => parseCsv(p).length - 1);
    ctx.log(`${rows} rows, to ${dataTo}`);
    return { files: [text(FILE, body, 'text/csv')], rows, dataTo: String(dataTo) };
  },
};
export default source;
