// Submarine cables from OpenStreetMap (Overpass API) → cables/overpass.json: the answer to one
// query for underwater communication cables (with their geometry) and cable landing stations
// (telecom=cable_landing_station, mostly mapped as building areas: one centre point each), with
// tags trimmed to the ones the map uses and coordinates rounded to about 100 m. TeleGeography's map data needs a paid
// licence; OSM's is ODbL, so the credit and share-alike notice must go with the data.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

export const QUERY = `[out:json][timeout:600];
(
  way["communication"="line"]["location"~"^(underwater|underwater;underground|submarine)$"];
  way["communication"="line"]["submarine"="yes"];
  way["telecom"="line"]["location"="underwater"];
  way["telecom"="line"]["submarine"="yes"];
  relation["communication"="line"]["location"="underwater"];
);
out geom;
nwr["telecom"="cable_landing_station"];
out center;`;

const TAGS = ['name', 'addr:country', 'operator', 'owner', 'ref', 'communication', 'telecom', 'man_made', 'location', 'submarine', 'start_date', 'capacity', 'website', 'wikidata'];

interface Element {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: ({ lat: number; lon: number } | null)[];
  members?: { type: string; ref: number; role: string; geometry?: ({ lat: number; lon: number } | null)[] }[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const point = (p: { lat: number; lon: number } | null) => (p ? [r3(p.lon), r3(p.lat)] : null);

export const isLanding = (e: { tags?: Record<string, string> }) => e.tags?.telecom === 'cable_landing_station';

/** One element with the kept tags and rounded coordinates ([lon, lat], as in GeoJSON): a landing station as one point, a cable as its line. */
export function trim(e: Element) {
  const tags = Object.fromEntries(TAGS.filter((t) => e.tags?.[t]).map((t) => [t, e.tags![t]]));
  if (isLanding(e)) return { type: e.type, id: e.id, tags, at: point(e.center ?? (e.lat === undefined ? null : { lat: e.lat, lon: e.lon! })) };
  if (e.type === 'way') return { type: e.type, id: e.id, tags, line: (e.geometry ?? []).map(point) };
  return { type: e.type, id: e.id, tags, members: (e.members ?? []).filter((m) => m.type === 'way').map((m) => ({ ref: m.ref, line: (m.geometry ?? []).map(point) })) };
}

const source: Source = {
  id: 'cables',
  name: 'Submarine cables (OpenStreetMap)',
  every: 30 * DAY,
  staleAfter: 120 * DAY,
  enabled: true,
  attribution: '© OpenStreetMap contributors',
  licence: 'ODbL 1.0',
  async fetch(ctx) {
    // overpass-api.de is the main public instance; the second is a mirror for when it is busy.
    const urls = ctx.env.OVERPASS_URL ? [ctx.env.OVERPASS_URL] : ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let answer: { elements?: Element[]; remark?: string } | undefined;
    for (const [i, url] of urls.entries()) {
      try {
        answer = await getJson(ctx.http, url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(QUERY)}`,
          timeout: 660_000,
          tries: 2,
        });
        break;
      } catch (e) {
        if (i === urls.length - 1) throw e;
        ctx.log(`${(e as Error).message}; trying ${urls[i + 1]}`);
      }
    }
    // Overpass reports a query that ran out of time or memory in "remark", with whatever it had so far.
    check(!answer?.remark, `Overpass: ${answer?.remark}`);
    const elements = (answer?.elements ?? []).map(trim);
    const landings = elements.filter(isLanding).length;
    const cables = elements.length - landings;
    check(cables >= 300, `only ${cables} cable ways and relations`);
    check(landings >= 20, `only ${landings} cable landing stations`);
    const prev = await ctx.previous('overpass.json');
    guardShrink(ctx, 'overpass.json', cables, prev, (p) => (JSON.parse(p).elements as Element[]).filter((e) => !isLanding(e)).length, 0.8);
    ctx.log(`${cables} cable ways and relations, ${landings} landing stations`);
    return { files: [json('overpass.json', { query: QUERY, elements })], rows: elements.length };
  },
};
export default source;
