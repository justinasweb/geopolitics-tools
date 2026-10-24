// IMF PortWatch chokepoints (Suez, Hormuz, Malacca, Panama…) → portwatch/, in the ArcGIS query
// format of the prototype's samples ({ features: [{ attributes }] }):
//   chokepoints.json        the chokepoints themselves: position, average vessel counts, main industries
//   chokepoints_daily.json  daily transits by vessel type for the last 400 days, dates as YYYY-MM-DD
// Only the fields the site uses are requested. Switched off with the other IMF sources until the
// IMF allows scheduled downloads.
import { getJson } from '../lib/http.ts';
import { type Source, HOUR, DAY, check, guardShrink, json } from '../lib/source.ts';

const BASE = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
const DAYS = 400;
const PAGE = 2000;
const DAILY_FIELDS = 'date,year,portid,portname,n_total,n_tanker,n_container,n_dry_bulk,n_general_cargo,n_roro';
const POINT_FIELDS = 'portid,portname,lat,lon,vessel_count_total,vessel_count_tanker,vessel_count_container,vessel_count_dry_bulk,vessel_count_general_cargo,vessel_count_roro,industry_top1,industry_top2,industry_top3';

type Attributes = Record<string, unknown>;
type Answer = { features?: { attributes: Attributes }[]; exceededTransferLimit?: boolean; error?: { message?: string } };

/** ArcGIS gives date fields as epoch milliseconds and date-only fields as text; both become YYYY-MM-DD. */
export const day = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'number' ? new Date(v).toISOString().slice(0, 10) : String(v).slice(0, 10));

const source: Source = {
  id: 'portwatch',
  name: 'IMF PortWatch chokepoints',
  every: 20 * HOUR,
  staleAfter: 10 * DAY,
  enabled: 'waits for the IMF to allow scheduled downloads',
  attribution: 'UN Global Platform; IMF PortWatch (portwatch.imf.org)',
  licence: 'IMF terms of use (permission for scheduled downloads requested)',
  async fetch(ctx) {
    const base = ctx.env.PORTWATCH_BASE ?? BASE;
    const query = async (service: string, params: Record<string, string>) => {
      const out: Attributes[] = [];
      for (let offset = 0; ; ) {
        const q = new URLSearchParams({ f: 'json', returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: String(PAGE), ...params });
        const page = await getJson<Answer>(ctx.http, `${base}/${service}/FeatureServer/0/query?${q}`, { timeout: 120_000 });
        // ArcGIS reports errors as HTTP 200 with an "error" object.
        check(!page.error, `PortWatch ${service}: ${page.error?.message}`);
        const got = (page.features ?? []).map((f) => f.attributes);
        out.push(...got);
        offset += got.length;
        if (!page.exceededTransferLimit || !got.length) return out;
        check(offset < 200_000, `PortWatch ${service}: more pages than expected`);
      }
    };

    const points = await query('PortWatch_chokepoints_database', { where: '1=1', outFields: POINT_FIELDS, orderByFields: 'portid' });
    check(points.length >= 10, `only ${points.length} chokepoints`);
    // The server filters on the numeric year (whatever type "date" has); the exact cut-off is applied here.
    const since = new Date(ctx.now.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
    const daily = (await query('Daily_Chokepoints_Data', { where: `year >= ${since.slice(0, 4)}`, outFields: DAILY_FIELDS, orderByFields: 'date' }))
      .map((a) => {
        const row: Attributes = { ...a, date: day(a.date) };
        delete row.year;
        return row;
      })
      .filter((a) => typeof a.date === 'string' && a.date >= since);
    check(daily.length >= 2_000, `only ${daily.length} daily rows in ${DAYS} days`);
    for (const f of ['portid', 'portname', 'n_total']) check(f in daily[0], `daily rows lack "${f}"; the source format changed`);
    const prev = await ctx.previous('chokepoints_daily.json');
    guardShrink(ctx, 'chokepoints_daily.json', daily.length, prev, (p) => (JSON.parse(p).features as unknown[]).length, 0.8);
    const dataTo = daily.map((a) => a.date as string).sort().at(-1);
    ctx.log(`${points.length} chokepoints, ${daily.length} daily rows to ${dataTo}`);
    return {
      files: [json('chokepoints.json', { features: points.map((attributes) => ({ attributes })) }), json('chokepoints_daily.json', { features: daily.map((attributes) => ({ attributes })) })],
      rows: daily.length,
      dataTo,
    };
  },
};
export default source;
