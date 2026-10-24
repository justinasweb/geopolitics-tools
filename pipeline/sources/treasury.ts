// US Treasury TIC → treasury/slt_table5.txt: major foreign holders of US Treasury securities,
// last 13 months, tab-separated, saved as published.
// Trap kept from the prototype: the old mfh.txt still answers but stopped at January 2023; since
// the 2023 reform the table is Table 5. A table whose newest month is over six months old is refused.
import { getText } from '../lib/http.ts';
import { type Source, DAY, check, text } from '../lib/source.ts';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Newest month named in the table's header lines, as YYYY-MM. */
export function newestMonth(table: string): string | null {
  const head = table.split(/\r?\n/).slice(0, 30).join('\n');
  const found: string[] = [];
  for (const m of head.matchAll(/\b(20\d\d)-(0[1-9]|1[0-2])\b/g)) found.push(`${m[1]}-${m[2]}`);
  for (const m of head.matchAll(/\b([A-Za-z]{3})[a-z]*\.?\s+(20\d\d)\b/g)) {
    const i = MONTHS.indexOf(m[1].toLowerCase());
    if (i >= 0) found.push(`${m[2]}-${String(i + 1).padStart(2, '0')}`);
  }
  return found.sort().at(-1) ?? null;
}

const source: Source = {
  id: 'treasury',
  name: 'US Treasury TIC',
  every: 7 * DAY,
  staleAfter: 45 * DAY,
  enabled: true,
  attribution: 'U.S. Department of the Treasury, Treasury International Capital (TIC) System',
  licence: 'Public domain (US government work)',
  async fetch(ctx) {
    const url = ctx.env.TIC_URL ?? 'https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table5.txt';
    const table = await getText(ctx.http, url);
    check(/Japan/.test(table) && /China/.test(table), 'no rows for Japan and China; not the holders table');
    const newest = newestMonth(table);
    check(newest, `no month found in the header; it starts: ${table.slice(0, 300).replace(/\s+/g, ' ')}`);
    const [y, m] = newest.split('-').map(Number);
    const age = (ctx.now.getUTCFullYear() - y) * 12 + (ctx.now.getUTCMonth() + 1 - m);
    check(age <= 6, `newest month is ${newest}, ${age} months ago; refusing a stale table`);
    const rows = table.split(/\r?\n/).filter((l) => l.split('\t').length > 3).length;
    ctx.log(`Table 5 to ${newest}, ${rows} table lines`);
    return { files: [text('slt_table5.txt', table)], rows, dataTo: newest };
  },
};
export default source;
