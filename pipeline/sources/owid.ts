// Our World in Data CO2 data (Global Carbon Budget) → owid/owid-co2-data.csv, trimmed to the
// columns the site uses, from 1990 (about 1 MB instead of 14 MB).
// Trap kept from the prototype: the World row has no ISO code, and nor does Kosovo; aggregates
// (continents, income groups) also have none. All rows are kept; the adapter sorts them out.
import { getText } from '../lib/http.ts';
import { parseCsv, pickColumns, toCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

export const COLUMNS = [
  'country', 'year', 'iso_code', 'population', 'gdp',
  'co2', 'co2_per_capita', 'cumulative_co2', 'share_global_co2', 'share_global_cumulative_co2',
  'consumption_co2', 'consumption_co2_per_capita', 'trade_co2', 'trade_co2_share',
  'coal_co2', 'oil_co2', 'gas_co2', 'cement_co2', 'flaring_co2', 'other_industry_co2',
];
const FROM = 1990;
const FILE = 'owid-co2-data.csv';

const source: Source = {
  id: 'owid',
  name: 'Our World in Data CO2',
  every: 30 * DAY,
  staleAfter: 400 * DAY,
  enabled: true,
  attribution: 'Global Carbon Budget, via Our World in Data',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const url = ctx.env.OWID_URL ?? 'https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv';
    const all = parseCsv(await getText(ctx.http, url, { timeout: 180_000 }));
    const picked = pickColumns(all, COLUMNS, FILE);
    const rows = [picked[0], ...picked.slice(1).filter((r) => Number(r[1]) >= FROM)];
    const data = rows.slice(1);
    const isos = new Set(data.filter((r) => /^[A-Z]{3}$/.test(r[2])).map((r) => r[2]));
    check(isos.size >= 180, `only ${isos.size} countries with an ISO code`);
    check(data.some((r) => r[0] === 'World' && r[5] !== ''), 'no World row with CO2 values');
    const dataTo = Math.max(...data.filter((r) => r[5] !== '').map((r) => Number(r[1])));
    check(dataTo >= ctx.now.getUTCFullYear() - 3, `newest year with CO2 values is ${dataTo}; the file looks stale`);
    const prev = await ctx.previous(FILE);
    guardShrink(ctx, FILE, data.length, prev, (p) => parseCsv(p).length - 1);
    ctx.log(`${data.length} rows, ${isos.size} countries, ${FROM}–${dataTo}`);
    return { files: [text(FILE, toCsv(rows), 'text/csv')], rows: data.length, dataTo: String(dataTo) };
  },
};
export default source;
