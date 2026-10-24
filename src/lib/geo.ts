// Which country a point is in, from Natural Earth's 1:50m country shapes (the default, de facto
// map the territories policy uses; src/data/geo/ne_50m_admin0.json, v5.1.2). Natural Earth's own
// codes are matched to internal ids through codes.csv (source "naturalearth"): Somaliland and
// Northern Cyprus have their own shapes there but their points go to Somalia and Cyprus, and the
// Siachen Glacier to no country. Used where a source gives coordinates but no country (USGS quakes).
import { readFileSync } from 'node:fs';
import { matcher } from '../adapters/core.ts';

type Ring = [number, number][];
interface Shape { id: string | null; code: string; bbox: [number, number, number, number]; polys: Ring[][] }

let shapes: Shape[] | null = null;

function load(): Shape[] {
  const json = JSON.parse(readFileSync(new URL('../data/geo/ne_50m_admin0.json', import.meta.url), 'utf8')) as {
    features: { properties: { adm0_a3: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }[];
  };
  const m = matcher('naturalearth', 'iso3');
  return json.features.map((f) => {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    const xs = polys.flatMap((p) => p[0].map((c) => c[0]));
    const ys = polys.flatMap((p) => p[0].map((c) => c[1]));
    return { id: m.match(f.properties.adm0_a3), code: f.properties.adm0_a3, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], polys };
  });
}

/** Ray casting: whether a point is inside a ring. */
function inRing(r: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The internal id of the country containing the point, or null at sea (or in an area placed in no country). */
export function countryAt(lon: number, lat: number): string | null {
  shapes ??= load();
  for (const s of shapes) {
    const [x0, y0, x1, y1] = s.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    // Inside the outer ring and in none of its holes.
    if (s.polys.some(([outer, ...holes]) => inRing(outer, lon, lat) && !holes.some((h) => inRing(h, lon, lat)))) return s.id;
  }
  return null;
}

/** Distance in km from a point to a segment, on a local flat projection (fine at these distances). */
function segmentKm(x: number, y: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const k = Math.cos((y * Math.PI) / 180);
  const [px, py, ux, uy, vx, vy] = [x * k, y, ax * k, ay, bx * k, by];
  const [dx, dy] = [vx - ux, vy - uy];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ux) * dx + (py - uy) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ux + t * dx), py - (uy + t * dy)) * 111.2;
}

/**
 * The country containing the point, or else the one whose coast is nearest within `maxKm`: for
 * places on the shore, such as cable landing stations, which a 1:50m coastline can leave in the sea.
 */
export function countryNear(lon: number, lat: number, maxKm = 25): string | null {
  const inside = countryAt(lon, lat);
  if (inside) return inside;
  const pad = maxKm / 111.2;
  let best: { id: string | null; d: number } = { id: null, d: maxKm };
  for (const s of shapes!) {
    const [x0, y0, x1, y1] = s.bbox;
    const padX = pad / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    if (lon < x0 - padX || lon > x1 + padX || lat < y0 - pad || lat > y1 + pad) continue;
    for (const poly of s.polys) {
      for (const ring of poly) {
        for (let i = 1; i < ring.length; i++) {
          const d = segmentKm(lon, lat, ring[i - 1], ring[i]);
          if (d < best.d) best = { id: s.id, d };
        }
      }
    }
  }
  return best.id;
}
