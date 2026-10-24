// Internet infrastructure: submarine cables (cables/overpass.json, OpenStreetMap through Overpass)
// and outages (ioda/outage_events.json). OSM maps a cable as one or more ways, often split, so the
// ways are joined by relation, else by name; a landing is a cable landing station within 10 km of
// a cable's line, else a line end on land, and its country is the Natural Earth shape it is in
// (or, for a station a coarse coastline leaves at sea, the nearest within 25 km), unless the station's
// OSM address names its country: islands too small for the 1:50m map, such as Matsu, need that.
// OSM has no capacity for most cables: `tbps` is read from the capacity tag where there is one.
// Ported from the prototype's src/adapters/digital.js, whose cable file was already joined.
import { countryAt, countryNear } from '../lib/geo.ts';
import { type Raw, matcher } from './core.ts';

type Point = [number, number];
export interface OsmElement { type: string; id: number; tags?: Record<string, string>; at?: Point | null; line?: (Point | null)[]; members?: { ref: number; line: (Point | null)[] }[] }

export interface Landing { name: string; place: string | null; lon: number; lat: number }
export interface Cable { id: string; name: string; operator: string; rfs: number | null; tbps: number | null; landings: Landing[]; lines: Point[][]; osm: string[] }

/** Distance in km between two points (haversine). */
export function km([x0, y0]: Point, [x1, y1]: Point): number {
  const r = Math.PI / 180;
  const a = Math.sin(((y1 - y0) * r) / 2) ** 2 + Math.cos(y0 * r) * Math.cos(y1 * r) * Math.sin(((x1 - x0) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const LANDING_KM = 10;
const lineOf = (pts: (Point | null)[] | undefined) => (pts ?? []).filter((p): p is Point => !!p);

/** "40 Tbps", "40Tbit/s", "40" (taken as Tbps) → 40; anything else → null. */
export function tbpsOf(v: string | undefined): number | null {
  const m = /^\s*([\d.]+)\s*(t|tb|tbps|tbit\/s)?\s*$/i.exec(v ?? '');
  return m ? Number(m[1]) : null;
}

export function parseCables(json: { elements?: OsmElement[] }): Cable[] {
  const els = json.elements ?? [];
  const iso2 = matcher('cables', 'iso2');
  const stations = els.filter((e) => e.tags?.telecom === 'cable_landing_station' && e.at) as (OsmElement & { at: Point })[];
  const inRelation = new Set(els.flatMap((e) => (e.members ?? []).map((m) => m.ref)));
  const groups = new Map<string, { name: string; tags: Record<string, string>; lines: Point[][]; osm: string[] }>();
  for (const e of els) {
    if (e.tags?.telecom === 'cable_landing_station') continue;
    if (e.type === 'way' && inRelation.has(e.id)) continue;
    const lines = e.type === 'relation' ? (e.members ?? []).map((m) => lineOf(m.line)) : [lineOf(e.line)];
    const name = e.tags?.name ?? '';
    // Unnamed ways stay apart; named ones with the same name are one cable.
    const key = e.type === 'relation' ? `r${e.id}` : name ? `n:${name}` : `w${e.id}`;
    const g = groups.get(key) ?? { name, tags: {}, lines: [], osm: [] };
    g.tags = { ...e.tags, ...g.tags };
    g.lines.push(...lines.filter((l) => l.length > 1));
    g.osm.push(`${e.type}/${e.id}`);
    groups.set(key, g);
  }
  const cables: Cable[] = [];
  for (const [key, g] of groups) {
    if (!g.lines.length) continue;
    const pts = g.lines.flat();
    const landings: Landing[] = [];
    // A box around the line, about 10 km wider, rules most stations out before measuring.
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of pts) [x0, x1, y0, y1] = [Math.min(x0, x - 0.3), Math.max(x1, x + 0.3), Math.min(y0, y - 0.1), Math.max(y1, y + 0.1)];
    for (const s of stations) {
      if (s.at[0] < x0 || s.at[0] > x1 || s.at[1] < y0 || s.at[1] > y1) continue;
      if (pts.some((p) => km(p, s.at) <= LANDING_KM)) landings.push({ name: s.tags?.name ?? '', place: (s.tags?.['addr:country'] && iso2.match(s.tags['addr:country'])) || countryNear(...s.at), lon: s.at[0], lat: s.at[1] });
    }
    // Line ends on land with no station near them land too.
    for (const l of g.lines) {
      for (const end of [l[0], l.at(-1)!]) {
        if (landings.some((x) => km([x.lon, x.lat], end) <= LANDING_KM)) continue;
        const place = countryAt(...end);
        if (place) landings.push({ name: '', place, lon: end[0], lat: end[1] });
      }
    }
    cables.push({
      id: key, name: g.name, operator: g.tags.operator ?? g.tags.owner ?? '', rfs: Number(/^(\d{4})/.exec(g.tags.start_date ?? '')?.[1]) || null,
      tbps: tbpsOf(g.tags.capacity), landings, lines: g.lines, osm: g.osm,
    });
  }
  return cables.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Cables landing in each place. */
export function cablesByPlace(cables: Cable[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cables) for (const id of new Set(c.landings.map((l) => l.place).filter((p): p is string => !!p))) (out[id] ??= []).push(c.id);
  return out;
}

export type Box = [number, number, number, number];
const insideBox = ([w, s, e, n]: Box) => ([x, y]: Point) => x >= w && x <= e && y >= s && y <= n;

/** Points every ~0.5° along a segment, both ends included; none for the jump where a route crosses the antimeridian. */
function samples(p0: Point, p1: Point): Point[] {
  if (Math.abs(p1[0] - p0[0]) > 180) return [];
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])) / 0.5));
  return Array.from({ length: steps + 1 }, (_, t) => [p0[0] + ((p1[0] - p0[0]) * t) / steps, p0[1] + ((p1[1] - p0[1]) * t) / steps] as Point);
}

/** Whether any part of a cable's route is inside the box. */
export function inZone(c: Pick<Cable, 'lines'>, box: Box): boolean {
  const inside = insideBox(box);
  return c.lines.some((l) => l.some(inside) || l.slice(1).some((p, i) => samples(l[i], p).some(inside)));
}

/**
 * What a cut in the box does to each landing of one cable: the share of the cable's other landings
 * it can no longer reach. A cable is treated as a chain along its points, so a cut separates the
 * landings on either side; a landing inside the box loses everything.
 */
export function cutLosses(c: Pick<Cable, 'lines' | 'landings'>, box: Box): { place: string | null; lost: number }[] {
  const inside = insideBox(box);
  const pts = c.lines.flat();
  const cut = pts.slice(1).map((p, k) => samples(pts[k], p).some(inside));
  // Each landing sits at its nearest point on the route.
  const pos = c.landings.map((l) => pts.reduce((best, p, i) => (km(p, [l.lon, l.lat]) < km(pts[best], [l.lon, l.lat]) ? i : best), 0));
  return c.landings.map((l, i) => {
    if (c.landings.length < 2) return { place: l.place, lost: 0 };
    if (inside([l.lon, l.lat])) return { place: l.place, lost: 1 };
    let lost = 0;
    for (let j = 0; j < c.landings.length; j++) {
      if (j === i) continue;
      const [a, b] = [Math.min(pos[i], pos[j]), Math.max(pos[i], pos[j])];
      if (inside([c.landings[j].lon, c.landings[j].lat]) || cut.slice(a, b).some(Boolean)) lost++;
    }
    return { place: l.place, lost: lost / (c.landings.length - 1) };
  });
}

export interface Outage { place: string; start: string; hours: number; score: number }

/** IODA country-level outage events, newest first. IODA reports when an outage happened, not why. */
export function parseIoda(json: { data?: { location?: string; start?: number; duration?: number; score?: number }[] }): Outage[] {
  const m = matcher('ioda', 'iso2');
  const out: Outage[] = [];
  for (const e of json.data ?? []) {
    const [kind, code] = String(e.location ?? '').split('/');
    if (kind !== 'country' || !code) continue;
    const place = m.match(code);
    if (place) out.push({ place, start: new Date(Number(e.start) * 1000).toISOString(), hours: Number(e.duration) / 3600, score: Number(e.score) || 0 });
  }
  return out.sort((a, b) => b.start.localeCompare(a.start));
}

export const cables = (raw: Raw) => parseCables(raw.json('cables', 'overpass.json'));
export const outages = (raw: Raw) => parseIoda(raw.json('ioda', 'outage_events.json'));
