// World Bank Pink Sheet → pinksheet/monthly-prices.csv: the "Monthly Prices" sheet of the
// workbook, as published (a row of commodity names, a row of units, then one row per month).
// Oil, gas, food, fertiliser and metals prices all come from it. The workbook moves to a new
// address each year, so the link is read from the Commodity Markets page; a copy whose newest
// month is more than 3 months old is refused (the prototype once fetched last year's workbook).
import { getBytes, getText } from '../lib/http.ts';
import { parseCsv, toCsv } from '../lib/csv.ts';
import { readXlsx } from '../lib/xlsx.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

const PAGE = 'https://www.worldbank.org/en/research/commodity-markets';

/** Series the site uses; matched at the start of the sheet's names, which carry footnote stars. */
export const SERIES = [
  'Crude oil, Brent', 'Natural gas, US', 'Natural gas, Europe', 'Liquefied natural gas, Japan',
  'Wheat, US HRW', 'Maize', 'Rice, Thai 5%', 'Soybeans', 'Phosphate rock', 'DAP', 'Potassium chloride',
  'Aluminum', 'Copper', 'Nickel', 'Gold', 'Silver', 'Platinum',
];

const MONTH = /^(\d{4})M(\d\d)$/;

/** The workbook's address on the Commodity Markets page. */
export function findLink(html: string, base = PAGE) {
  const href = html.match(/href="([^"]*CMO-Historical-Data-Monthly\.xlsx)"/i)?.[1];
  return href ? new URL(href.replace(/&amp;/g, '&'), base).href : null;
}

const source: Source = {
  id: 'pinksheet',
  name: 'World Bank Pink Sheet',
  every: 7 * DAY,
  staleAfter: 45 * DAY,
  enabled: true,
  attribution: 'World Bank, Commodity Price Data (The Pink Sheet)',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    let url = ctx.env.PINKSHEET_URL;
    if (!url) {
      url = findLink(await getText(ctx.http, PAGE)) ?? undefined;
      check(url, `no link to CMO-Historical-Data-Monthly.xlsx on ${PAGE}`);
    }
    const wb = await readXlsx(await getBytes(ctx.http, url, { timeout: 180_000 }));
    const sheet = wb.rows('Monthly Prices');
    const h = sheet.findIndex((r) => r.some((c) => c.startsWith('Crude oil')));
    check(h >= 0, 'Monthly Prices: no row of commodity names');
    const names = sheet[h].map((c) => c.trim());
    const missing = SERIES.filter((s) => !names.some((n) => n.startsWith(s)));
    check(!missing.length, `Monthly Prices: series ${missing.join(', ')} missing; the sheet has ${names.filter(Boolean).join(', ')}`);
    const data = sheet.slice(h + 2).filter((r) => MONTH.test(r[0]?.trim() ?? ''));
    check(data.length >= 600, `only ${data.length} months`);
    const width = names.length;
    const fit = (r: string[]) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim());
    const rows = [['month', ...names.slice(1)], ['unit', ...fit(sheet[h + 1]).slice(1)], ...data.map(fit)];

    const [, y, m] = data.at(-1)![0].match(MONTH)!;
    const newest = `${y}-${m}`;
    const age = (ctx.now.getUTCFullYear() - Number(y)) * 12 + ctx.now.getUTCMonth() + 1 - Number(m);
    check(age <= 3, `newest month is ${newest}, more than 3 months old: probably last year's workbook (${url.replace(/\?.*/, '')})`);
    const prev = await ctx.previous('monthly-prices.csv');
    guardShrink(ctx, 'monthly-prices.csv', data.length, prev, (p) => parseCsv(p).length - 2, 0.9);
    ctx.log(`${data.length} months × ${width - 1} series, to ${newest}`);
    return { files: [text('monthly-prices.csv', toCsv(rows), 'text/csv')], rows: data.length * (width - 1), dataTo: newest };
  },
};
export default source;
