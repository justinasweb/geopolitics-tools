// GDACS disaster alerts → gdacs/events.json, a GeoJSON FeatureCollection in the API's own format.
// Orange and red alerts for 365 days, green ones for 30 days only: there are over 1,000 green
// alerts a month, and the prototype took minutes to page through 90 days of them.
import { getJson } from '../lib/http.ts';
import { type Source, HOUR, DAY, check, guardShrink, json } from '../lib/source.ts';

const TYPES = 'EQ;TC;FL;VO;DR;WF';
const PAGE = 100;
const DROP = ['htmldescription', 'icon', 'iconoverall', 'polygonlabel'];

type Feature = { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> & { eventtype: string; eventid: number; alertlevel: string; fromdate: string; todate?: string } };
type Collection = { type?: string; features?: Feature[] };

const day = (d: Date) => d.toISOString().slice(0, 10);

const source: Source = {
  id: 'gdacs',
  name: 'GDACS disaster alerts',
  every: 1 * HOUR,
  staleAfter: 3 * DAY,
  keepDays: 14,
  enabled: true,
  attribution: 'GDACS, Global Disaster Alert and Coordination System (European Commission and United Nations)',
  licence: 'Free reuse with credit (to confirm in the licence table)',
  async fetch(ctx) {
    const base = ctx.env.GDACS_BASE ?? 'https://www.gdacs.org';
    const seen = new Map<string, Feature>();
    const query = async (levels: string, days: number) => {
      const from = day(new Date(ctx.now.getTime() - days * 86_400_000));
      for (let page = 1; page <= 200; page++) {
        const url = `${base}/gdacsapi/api/events/geteventlist/SEARCH?eventlist=${TYPES}&fromDate=${from}&toDate=${day(ctx.now)}&alertlevel=${levels}&pagesize=${PAGE}&pagenumber=${page}`;
        let res: Collection;
        try {
          res = await getJson<Collection>(ctx.http, url, { timeout: 90_000 });
        } catch (e) {
          // The API answers 404 for a page past the end (and for a search with no events).
          if (/HTTP 404/.test((e as Error).message)) break;
          throw e;
        }
        check(Array.isArray(res?.features), `${levels} page ${page}: no "features" array; the format changed`);
        let added = 0;
        for (const f of res.features) {
          const p = f.properties;
          check(p && p.eventtype && p.eventid !== undefined && p.alertlevel && p.fromdate, `${levels}: a feature lacks eventtype, eventid, alertlevel or fromdate`);
          const k = `${p.eventtype}-${p.eventid}`;
          if (seen.has(k)) continue;
          for (const d of DROP) delete p[d];
          seen.set(k, f);
          added++;
        }
        // Stop at the last page, or if the API ignores paging and repeats itself.
        if (res.features.length < PAGE || added === 0) break;
      }
    };
    await query('orange;red', 365);
    const strong = seen.size;
    await query('green', 30);
    const features = [...seen.values()];
    ctx.log(`${strong} orange and red alerts in 365 days, ${features.length - strong} green in 30 days`);
    check(strong >= 10, `only ${strong} orange and red alerts in a year`);
    const prev = await ctx.previous('events.json');
    guardShrink(ctx, 'events.json', features.length, prev, (p) => (JSON.parse(p) as Collection).features!.length, 0.3);
    const dates = features.map((f) => String(f.properties.todate ?? f.properties.fromdate).slice(0, 10)).sort();
    return { files: [json('events.json', { type: 'FeatureCollection', features })], rows: features.length, dataTo: dates.at(-1) };
  },
};
export default source;
