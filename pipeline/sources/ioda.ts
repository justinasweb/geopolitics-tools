// IODA (Georgia Tech) internet outage events → ioda/outage_events.json, country-level events over
// 365 days in the API's own { data: [...] } format. Outages per country and year, and the outages layer.
import { getJson } from '../lib/http.ts';
import { type Source, HOUR, DAY, check, guardShrink, json } from '../lib/source.ts';

type Event = Record<string, unknown> & { location?: string; start?: number; duration?: number };
type Res = { data?: Event[] } & Record<string, unknown>;

const source: Source = {
  id: 'ioda',
  name: 'IODA internet outages',
  every: 1 * HOUR,
  staleAfter: 3 * DAY,
  keepDays: 14,
  enabled: true,
  attribution: 'IODA, Internet Outage Detection and Analysis (Georgia Tech)',
  licence: 'Free reuse with credit (to confirm in the licence table)',
  async fetch(ctx) {
    const base = ctx.env.IODA_BASE ?? 'https://api.ioda.inetintel.cc.gatech.edu';
    const prev = await ctx.previous('outage_events.json');
    const saved = prev ? (JSON.parse(prev) as Res).data : undefined;
    // A year in one request gets HTTP 500 after about 40 s, so ask for 30 days at a time. Most runs ask only for the
    // last 30 days and keep the older events from the saved copy; the first run of the UTC day (or one with no saved
    // copy) asks for the whole year again, so late changes to older events still arrive.
    const until = Math.floor(ctx.now.getTime() / 1000);
    const yearAgo = until - 365 * 86_400;
    const STEP = 30 * 86_400;
    const full = !Array.isArray(saved) || ctx.now.getUTCHours() === 0;
    const start = full ? yearAgo : until - STEP;
    const key = (e: Event) => `${e.location}|${e.start}`;
    const seen = new Map<string, Event>();
    if (!full) for (const e of saved!) if ((e.start as number) + ((e.duration as number) || 0) >= yearAgo && (e.start as number) < start) seen.set(key(e), e);
    let type: unknown;
    for (let from = start; from < until; from += STEP) {
      const to = Math.min(from + STEP, until);
      const res = await getJson<Res>(ctx.http, `${base}/v2/outages/events?from=${from}&until=${to}&entityType=country&format=codf`, { timeout: 120_000 });
      check(Array.isArray(res?.data), 'no "data" array; the format changed');
      type ??= res.type;
      // An outage spanning two windows comes back in both; the fresh copy replaces a saved one.
      for (const e of res.data) seen.set(key(e), e);
    }
    const data = [...seen.values()].sort((a, b) => (a.start as number) - (b.start as number) || String(a.location).localeCompare(String(b.location)));
    check(data.every((e) => typeof e.location === 'string' && typeof e.start === 'number'), 'an event lacks location or start');
    const countries = new Set(data.map((e) => e.location)).size;
    ctx.log(`${data.length} events in ${countries} countries over 365 days (${full ? 'whole year' : 'last 30 days'} asked)`);
    check(data.length >= 50, `only ${data.length} outage events in a year`);
    guardShrink(ctx, 'outage_events.json', data.length, prev, (p) => (JSON.parse(p) as Res).data!.length, 0.3);
    const newest = new Date(Math.max(...data.map((e) => e.start as number)) * 1000).toISOString().slice(0, 10);
    // Request metadata (query time and the like) is left out, so an unchanged list saves no new copy.
    return { files: [json('outage_events.json', { type, data })], rows: data.length, dataTo: newest };
  },
};
export default source;
