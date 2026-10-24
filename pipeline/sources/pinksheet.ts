// World Bank Pink Sheet → pinksheet/cmo_{food,metals,gas}_prices.json: monthly prices from 2010 for
// the series the site uses, read from the "Monthly Prices" sheet of the workbook and written in the
// prototype's sample format { source, columns: {code: label}, data: [{ period: "2024M03", code: value }] }
// (the World Bank publishes these series only as Excel). Columns are found by their header text,
// so a moved column is fine and a renamed one stops the fetch. The workbook moves to a new address
// each year, so the link is read from the Commodity Markets page; a copy whose newest month is more
// than 3 months old is refused (the prototype once fetched last year's workbook).
import { getBytes, getText } from '../lib/http.ts';
import { readXlsx } from '../lib/xlsx.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

const PAGE = 'https://www.worldbank.org/en/research/commodity-markets';
const FROM = 2010;

/** file → [title, { code: [label, header text] }], as in the prototype. */
export const FILES: Record<string, [string, Record<string, [string, string]>]> = {
  'cmo_food_prices.json': ['World Bank Commodity Price Data (The Pink Sheet), monthly prices, $/mt', {
    WHEAT_US_HRW: ['Wheat, US HRW', 'Wheat, US HRW'],
    MAIZE: ['Maize', 'Maize'],
    RICE_05: ['Rice, Thai 5%', 'Rice, Thai 5%'],
    SOYBEANS: ['Soybeans', 'Soybeans'],
    POTASH: ['Potassium chloride', 'Potassium chloride'],
    DAP: ['DAP', 'DAP'],
    PHOSROCK: ['Phosphate rock', 'Phosphate rock'],
  }],
  'cmo_metals_prices.json': ['World Bank Commodity Price Data (The Pink Sheet), monthly prices', {
    COPPER: ['Copper ($/mt)', 'Copper'],
    ALUMINUM: ['Aluminum ($/mt)', 'Aluminum'],
    NICKEL: ['Nickel ($/mt)', 'Nickel'],
    GOLD: ['Gold ($/troy oz)', 'Gold'],
    SILVER: ['Silver ($/troy oz)', 'Silver'],
    PLATINUM: ['Platinum ($/troy oz)', 'Platinum'],
  }],
  'cmo_gas_prices.json': ['World Bank Commodity Price Data (The Pink Sheet), monthly prices, $/mmbtu', {
    NGAS_US: ['Natural gas, US (Henry Hub)', 'Natural gas, US'],
    NGAS_EUR: ['Natural gas, Europe (TTF)', 'Natural gas, Europe'],
    NGAS_JP: ['Liquefied natural gas, Japan', 'Liquefied natural gas, Japan'],
  }],
};

/** Header text without footnote stars and odd spaces: "Potassium chloride **" → "Potassium chloride". */
export const norm = (s: string) => s.replace(/\*/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

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
    const sheet = (await readXlsx(await getBytes(ctx.http, url, { timeout: 180_000 }))).rows('Monthly Prices');
    const head = sheet.find((r) => r.map(norm).includes('Maize'))?.map(norm);
    check(head, 'Monthly Prices: no header row with "Maize"');
    const months = sheet.filter((r) => MONTH.test(r[0]?.trim() ?? '') && Number(r[0].slice(0, 4)) >= FROM);
    check(months.length >= 100, `Monthly Prices: only ${months.length} months since ${FROM}`);
    const last = months.at(-1)![0].trim();
    const [, y, m] = last.match(MONTH)!;
    const age = (ctx.now.getUTCFullYear() - Number(y)) * 12 + ctx.now.getUTCMonth() + 1 - Number(m);
    check(age <= 3, `newest month is ${y}-${m}, more than 3 months old: probably last year's workbook (${url.replace(/\?.*/, '')})`);

    const files = [];
    let values = 0;
    for (const [file, [title, cols]] of Object.entries(FILES)) {
      const at = Object.entries(cols).map(([code, [, match]]) => {
        const i = head.indexOf(match);
        check(i >= 0, `column "${match}" not found in the Monthly Prices sheet; it may have been renamed (the sheet has ${head.filter(Boolean).join(', ')})`);
        return [code, i] as const;
      });
      const data = months.map((r) => {
        const row: Record<string, string | number | null> = { period: r[0].trim() };
        for (const [code, i] of at) {
          const v = Number(r[i]);
          row[code] = r[i] !== undefined && r[i] !== '' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
          if (row[code] !== null) values++;
        }
        return row;
      });
      const prev = await ctx.previous(file);
      guardShrink(ctx, file, data.length, prev, (p) => (JSON.parse(p).data as unknown[]).length, 0.9);
      files.push(json(file, { source: title, columns: Object.fromEntries(Object.entries(cols).map(([c, [label]]) => [c, label])), data }));
    }
    ctx.log(`${months.length} months from ${months[0][0]} to ${last}, ${values} values in ${files.length} files`);
    return { files, rows: values, dataTo: `${y}-${m}` };
  },
};
export default source;
