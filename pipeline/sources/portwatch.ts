// IMF PortWatch daily chokepoint transits (Suez, Hormuz, Malacca, Panama…) → portwatch/chokepoints.json:
// the ArcGIS feature service's rows (attributes only) for the last 400 days, ordered by date. Switched
// off with the other IMF sources until the IMF allows scheduled downloads.
import { getJson } from '../lib/http.ts';
import { type Source, HOUR, DAY, check, guardShrink, json } from '../lib/source.ts';

const SERVICE = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
const DAYS = 400;
const PAGE = 2000;

type Answer = { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } };

const source: Source = {
  id: 'portwatch',
  name: 'IMF PortWatch chokepoints',
  every: 20 * HOUR,
  staleAfter: 10 * DAY,
  enabled: 'waits for the IMF to allow scheduled downloads',
  attribution: 'IMF PortWatch (UN Global Platform, University of Oxford)',
  licence: 'IMF terms of use (permission for scheduled downloads requested)',
  async fetch(ctx) {
    const url = ctx.env.PORTWATCH_URL ?? SERVICE;
    const from = new Date(ctx.now.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const q = new URLSearchParams({
        where: `date >= timestamp '${from} 00:00:00'`,
        outFields: '*',
        orderByFields: 'date,portid',
        resultOffset: String(offset),
        resultRecordCount: String(PAGE),
        f: 'json',
      });
      const page = await getJson<Answer>(ctx.http, `${url}?${q}`, { timeout: 120_000 });
      // ArcGIS reports errors as HTTP 200 with an "error" object.
      check(!page.error, `PortWatch: ${page.error?.message}`);
      const got = (page.features ?? []).map((f) => {
        const rest = { ...f.attributes };
        delete rest.ObjectId;
        return rest;
      });
      rows.push(...got);
      if (!page.exceededTransferLimit || !got.length) break;
      check(offset < 100 * PAGE, 'PortWatch: more pages than expected');
    }
    check(rows.length >= 2_000, `only ${rows.length} daily rows`);
    for (const f of ['date', 'portid', 'portname', 'n_total']) check(f in rows[0], `field "${f}" is missing; the source format changed`);
    const prev = await ctx.previous('chokepoints.json');
    guardShrink(ctx, 'chokepoints.json', rows.length, prev, (p) => (JSON.parse(p) as unknown[]).length, 0.8);
    const newest = rows.map((r) => String(r.date ?? '')).sort().at(-1);
    const dataTo = newest && /^\d+$/.test(newest) ? new Date(Number(newest)).toISOString().slice(0, 10) : newest?.slice(0, 10);
    ctx.log(`${rows.length} daily rows to ${dataTo}`);
    return { files: [json('chokepoints.json', rows)], rows: rows.length, dataTo };
  },
};
export default source;
