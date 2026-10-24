// CelesTrak SATCAT → celestrak/satcat.csv: every catalogued object, as published (owner codes
// such as PRC and CIS are mapped by the adapter). Satellites in orbit and launches by site both
// come from this file. CelesTrak asks for no more than one download per update, so daily.
import { getText } from '../lib/http.ts';
import { parseCsv, pickColumns, toCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

export const COLUMNS = ['OBJECT_NAME', 'OBJECT_ID', 'NORAD_CAT_ID', 'OBJECT_TYPE', 'OPS_STATUS_CODE', 'OWNER', 'LAUNCH_DATE', 'LAUNCH_SITE', 'DECAY_DATE', 'PERIOD', 'INCLINATION', 'APOGEE', 'PERIGEE', 'ORBIT_CENTER', 'ORBIT_TYPE'];

const source: Source = {
  id: 'celestrak',
  name: 'CelesTrak SATCAT',
  every: 1 * DAY,
  staleAfter: 10 * DAY,
  enabled: true,
  attribution: 'CelesTrak SATCAT (T.S. Kelso)',
  licence: 'Free reuse with credit (to confirm in the licence table)',
  async fetch(ctx) {
    // celestrak.com is the same service under its older name: a second way in when one is refused.
    const urls = ctx.env.CELESTRAK_URL ? [ctx.env.CELESTRAK_URL] : ['https://celestrak.org/pub/satcat.csv', 'https://celestrak.com/pub/satcat.csv'];
    let body = '';
    for (const [i, url] of urls.entries()) {
      try { body = await getText(ctx.http, url, { timeout: 180_000 }); break; } catch (e) { if (i === urls.length - 1) throw e; ctx.log(`${(e as Error).message}; trying ${urls[i + 1]}`); }
    }
    const rows = pickColumns(parseCsv(body), COLUMNS, 'satcat.csv');
    const data = rows.slice(1);
    check(data.length >= 50_000, `only ${data.length} objects (over 60,000 expected)`);
    const inOrbit = data.filter((r) => r[3] === 'PAY' && r[8] === '' && r[13] === 'EA').length;
    check(inOrbit >= 5_000, `only ${inOrbit} payloads in Earth orbit`);
    const prev = await ctx.previous('satcat.csv');
    guardShrink(ctx, 'satcat.csv', data.length, prev, (p) => parseCsv(p).length - 1, 0.9);
    const newest = data.map((r) => r[6]).filter(Boolean).sort().at(-1);
    ctx.log(`${data.length} objects, ${inOrbit} payloads in Earth orbit, newest launch ${newest}`);
    return { files: [text('satcat.csv', toCsv(rows), 'text/csv')], rows: data.length, dataTo: newest };
  },
};
export default source;
