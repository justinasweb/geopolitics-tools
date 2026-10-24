// USGS earthquake catalogue (FDSN event service) → usgs-quakes/earthquakes.json, GeoJSON as the
// API returns it, magnitude 5.5 and up over 365 days, properties trimmed to what the site shows.
// The country is not in the feed; the adapter adds it from the coordinates.
import { getJson } from '../lib/http.ts';
import { type Source, HOUR, DAY, check, guardShrink, json } from '../lib/source.ts';

const KEEP = ['mag', 'place', 'time', 'updated', 'url', 'alert', 'tsunami', 'sig', 'status', 'type', 'title', 'magType'];
type Collection = { type: string; metadata?: Record<string, unknown>; features?: { type: string; id: string; geometry: unknown; properties: Record<string, unknown> }[] };

const source: Source = {
  id: 'usgs-quakes',
  name: 'USGS earthquakes',
  every: 1 * HOUR,
  staleAfter: 3 * DAY,
  keepDays: 14,
  enabled: true,
  attribution: 'U.S. Geological Survey, Earthquake Hazards Program',
  licence: 'Public domain (US government work)',
  async fetch(ctx) {
    const base = ctx.env.USGS_EQ_BASE ?? 'https://earthquake.usgs.gov';
    const from = new Date(ctx.now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
    const res = await getJson<Collection>(ctx.http, `${base}/fdsnws/event/1/query?format=geojson&starttime=${from}&minmagnitude=5.5&orderby=time&limit=20000`, { timeout: 120_000 });
    check(Array.isArray(res?.features), 'no "features" array; the format changed');
    const features = res.features.filter((f) => f.properties?.type === 'earthquake').map((f) => ({
      type: f.type,
      id: f.id,
      geometry: f.geometry,
      properties: Object.fromEntries(KEEP.filter((k) => k in f.properties).map((k) => [k, f.properties[k]])),
    }));
    check(features.length >= 200, `only ${features.length} earthquakes of magnitude 5.5+ in a year (usually 400–600)`);
    check(features.every((f) => typeof f.properties.mag === 'number' && typeof f.properties.time === 'number'), 'a feature lacks mag or time');
    const prev = await ctx.previous('earthquakes.json');
    guardShrink(ctx, 'earthquakes.json', features.length, prev, (p) => (JSON.parse(p) as Collection).features!.length);
    const newest = new Date(Math.max(...features.map((f) => f.properties.time as number))).toISOString().slice(0, 10);
    ctx.log(`${features.length} earthquakes M5.5+ since ${from}`);
    // metadata.generated changes on every request, so it is left out: an unchanged catalogue then saves no new copy.
    const metadata = { title: res.metadata?.title, api: res.metadata?.api, count: features.length };
    return { files: [json('earthquakes.json', { type: 'FeatureCollection', metadata, features })], rows: features.length, dataTo: newest };
  },
};
export default source;
