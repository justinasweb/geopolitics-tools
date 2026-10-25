// The basemap every interactive map draws: Natural Earth 1:50m countries (the default, de facto map of the
// territories policy, v5.1.2) and the land boundaries of the areas it marks as disputed, projected to Equal Earth
// at build time (./projection.ts) and simplified for a world map. Written once per build to /geo/basemap.json.
//
// Each country shape carries the internal place id it maps to (codes.csv, source "naturalearth"): Somaliland's shape
// carries Somalia's id and Northern Cyprus's Cyprus's, as sources report them; the Siachen Glacier carries none. The
// file holds no words, so every language shares it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matcher } from '../../adapters/core.ts';
import { equalEarth, fromMap, X_MAX, mapLatOfY } from './projection.ts';

type Pt = [number, number];
type Ring = Pt[];
interface Src { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] }

const read = (f: string): Src => JSON.parse(readFileSync(join(process.cwd(), 'src/data/geo', f), 'utf8'));

/** Simplification tolerance, in Equal Earth units (the world is 5.41 wide): about 1 px on a 10,800 px wide map (zoom 4.4, close to the map's limit). */
const TOLERANCE = 0.0005;

function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let best = -1, far = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > far) { far = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
/** Projects, simplifies and writes a line in map coordinates (see projection.ts). */
function line(pts: Pt[], closed: boolean): Pt[] | null {
  const projected = pts.map(([lon, lat]) => equalEarth(lon, lat));
  const s = simplify(projected, TOLERANCE);
  if (closed && s.length < 4) return null;
  if (!closed && s.length < 2) return null;
  return s.map(([x, y]) => [r4((x / X_MAX) * 180), r4(mapLatOfY(y))]);
}

/** Antarctica is left out, as on the static maps: no source in the site reports it. */
const SKIP = new Set(['ATA']);

export interface Basemap {
  countries: { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { id: string | null; code: string; name?: string }; geometry: { type: 'MultiPolygon'; coordinates: Pt[][][] } }[] };
  disputed: { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { name: string }; geometry: { type: 'MultiLineString'; coordinates: Pt[][] } }[] };
  /** Natural Earth codes and the place each maps to, for tests and the docs. */
  source: string;
}

let cache: Basemap | null = null;
export function basemap(): Basemap {
  if (cache) return cache;
  const m = matcher('naturalearth', 'iso3');
  const admin = read('ne_50m_admin0.json') as Src & { source: string };
  const countries: Basemap['countries']['features'] = [];
  for (const f of admin.features) {
    const code = f.properties.adm0_a3;
    if (SKIP.has(code)) continue;
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    const out = polys.map((p) => p.map((r) => line(r, true)).filter((r): r is Pt[] => r !== null)).filter((p) => p.length);
    if (!out.length) continue;
    const id = m.match(code);
    // A shape that maps to no place (the Siachen Glacier) keeps its Natural Earth name for the tooltip.
    countries.push({ type: 'Feature', properties: id ? { id, code } : { id, code, name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: out } });
  }
  const disputed: Basemap['disputed']['features'] = read('ne_50m_disputed.json').features.map((f) => ({
    type: 'Feature', properties: { name: f.properties.name },
    geometry: { type: 'MultiLineString', coordinates: (f.geometry.coordinates as Pt[][]).map((l) => line(l, false)).filter((l): l is Pt[] => l !== null) },
  }));
  cache = { countries: { type: 'FeatureCollection', features: countries }, disputed: { type: 'FeatureCollection', features: disputed }, source: admin.source };
  return cache;
}

/**
 * Each place's anchor, in Equal Earth units: the centre of its largest shape, where a flow arc starts or ends. A
 * centre is not always on land (a crescent-shaped country); for arcs on a world map that is close enough.
 */
export function anchors(): Record<string, [number, number]> {
  const best = new Map<string, { area: number; at: [number, number] }>();
  for (const f of basemap().countries.features) {
    const id = f.properties.id;
    if (!id) continue;
    for (const poly of f.geometry.coordinates) {
      const r = poly[0].map(([lng, lat]) => fromMap(lng, lat));
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
        a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k;
      }
      if (a && Math.abs(a) > (best.get(id)?.area ?? 0)) best.set(id, { area: Math.abs(a), at: [cx / (3 * a), cy / (3 * a)] });
    }
  }
  return Object.fromEntries([...best].map(([id, b]) => [id, b.at]));
}
