// GDACS disaster alerts → gdacs/events.json, a GeoJSON FeatureCollection in the API's own format.
// Orange and red alerts for 365 days, green ones for 30 days only: there are over 1,000 green
// alerts a month, and the prototype took minutes to page through 90 days of them. Most runs ask only for the
// last 3 days of green alerts and keep the rest of the month from the saved copy; the first run of the UTC day (or
// one with no saved copy) pages through all 30 days again. Orange and red alerts fit on one page, so they are always
// asked for in full.
import { getJson } from '../lib/http.ts';
import { type Source, HOUR, DAY, check, guardShrink, json } from '../lib/source.ts';

const TYPES = 'EQ;TC;FL;VO;DR;WF';
const PAGE = 100;
const DROP = ['htmldescription', 'icon', 'iconoverall', 'polygonlabel'];
/** 0 in tests, so the pauses below take no time. */
export const PAUSE_SCALE = process.env.VITEST ? 0 : 1;

type Feature = { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> & { eventtype: string; eventid: number; alertlevel: string; fromdate: string; todate?: string } };
type Collection = { type?: string; features?: Feature[] };

const day = (d: Date) => d.toISOString().slice(0, 10);
const keyOf = (f: Feature) => `${f.properties.eventtype}-${f.properties.eventid}`;
const lastDay = (f: Feature) => String(f.properties.todate ?? f.properties.fromdate).slice(0, 10);

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
    const prev = await ctx.previous('events.json');
    const saved = prev ? (JSON.parse(prev) as Collection).features : undefined;
    const full = !Array.isArray(saved) || ctx.now.getUTCHours() === 0;
    const seen = new Map<string, Feature>();
    const query = async (levels: string, days: number) => {
      const from = day(new Date(ctx.now.getTime() - days * 86_400_000));
      for (let page = 1; page <= 200; page++) {
        const url = `${base}/gdacsapi/api/events/geteventlist/SEARCH?eventlist=${TYPES}&fromDate=${from}&toDate=${day(ctx.now)}&alertlevel=${levels}&pagesize=${PAGE}&pagenumber=${page}`;
        let res: Collection | null = null;
        for (let attempt = 1; !res; attempt++) {
          try {
            res = await getJson<Collection>(ctx.http, url, { timeout: 90_000 });
          } catch (e) {
            const msg = (e as Error).message;
            // The API answers 404 for a page past the end (and for a search with no events).
            if (/HTTP 404/.test(msg)) return;
            // When busy it answers HTTP 400 "Timeout expired… connection from the pool"; that passes.
            if (attempt < 4 && /Timeout expired|connection from the pool/i.test(msg)) {
              ctx.log(`${levels} page ${page}: GDACS busy, waiting ${attempt * 15} s`);
              await new Promise((r) => setTimeout(r, attempt * 15_000 * PAUSE_SCALE));
              continue;
            }
            throw e;
          }
        }
        check(Array.isArray(res?.features), `${levels} page ${page}: no "features" array; the format changed`);
        let added = 0;
        for (const f of res.features) {
          const p = f.properties;
          check(p && p.eventtype && p.eventid !== undefined && p.alertlevel && p.fromdate, `${levels}: a feature lacks eventtype, eventid, alertlevel or fromdate`);
          const k = keyOf(f);
          if (seen.has(k)) continue;
          for (const d of DROP) delete p[d];
          seen.set(k, f);
          added++;
        }
        // Stop at the last page, or if the API ignores paging and repeats itself.
        if (res.features.length < PAGE || added === 0) break;
        // A short pause between pages: the service shares a small connection pool.
        await new Promise((r) => setTimeout(r, 1000 * PAUSE_SCALE));
      }
    };
    await query('orange;red', 365);
    const strong = seen.size;
    await query('green', full ? 30 : 3);
    // Saved green alerts from earlier in the month that the short query did not ask for again.
    if (!full) {
      const monthAgo = day(new Date(ctx.now.getTime() - 30 * 86_400_000));
      for (const f of saved!) if (f.properties.alertlevel === 'Green' && lastDay(f) >= monthAgo && !seen.has(keyOf(f))) seen.set(keyOf(f), f);
    }
    // Same order whichever way the list was put together, so an unchanged list saves no new copy.
    const features = [...seen.values()].sort((a, b) => String(a.properties.fromdate).localeCompare(String(b.properties.fromdate)) || keyOf(a).localeCompare(keyOf(b)));
    ctx.log(`${strong} orange and red alerts in 365 days, ${features.length - strong} green in 30 days (${full ? 'all 30 days' : 'last 3 days'} asked)`);
    check(strong >= 10, `only ${strong} orange and red alerts in a year`);
    guardShrink(ctx, 'events.json', features.length, prev, (p) => (JSON.parse(p) as Collection).features!.length, 0.3);
    const dates = features.map((f) => String(f.properties.todate ?? f.properties.fromdate).slice(0, 10)).sort();
    return { files: [json('events.json', { type: 'FeatureCollection', features })], rows: features.length, dataTo: dates.at(-1) };
  },
};
export default source;
