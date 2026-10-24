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
    // A year in one request gets HTTP 500 after about 40 s, so ask for 30 days at a time.
    const until = Math.floor(ctx.now.getTime() / 1000);
    const STEP = 30 * 86_400;
    const seen = new Map<string, Event>();
    let type: unknown;
    for (let from = until - 365 * 86_400; from < until; from += STEP) {
      const to = Math.min(from + STEP, until);
      const res = await getJson<Res>(ctx.http, `${base}/v2/outages/events?from=${from}&until=${to}&entityType=country&format=codf`, { timeout: 120_000 });
      check(Array.isArray(res?.data), 'no "data" array; the format changed');
      type ??= res.type;
      // An outage spanning two windows comes back in both.
      for (const e of res.data) seen.set(`${e.location}|${e.start}`, e);
    }
    const data = [...seen.values()].sort((a, b) => (a.start as number) - (b.start as number));
    check(data.every((e) => typeof e.location === 'string' && typeof e.start === 'number'), 'an event lacks location or start');
    const countries = new Set(data.map((e) => e.location)).size;
    ctx.log(`${data.length} events in ${countries} countries over 365 days`);
    check(data.length >= 50, `only ${data.length} outage events in a year`);
    const prev = await ctx.previous('outage_events.json');
    guardShrink(ctx, 'outage_events.json', data.length, prev, (p) => (JSON.parse(p) as Res).data!.length, 0.3);
    const newest = new Date(Math.max(...data.map((e) => e.start as number)) * 1000).toISOString().slice(0, 10);
    // Request metadata (query time and the like) is left out, so an unchanged list saves no new copy.
    return { files: [json('outage_events.json', { type, data })], rows: data.length, dataTo: newest };
  },
};
export default source;
