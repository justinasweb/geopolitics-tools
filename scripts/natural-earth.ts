// Writes src/data/geo/ne_50m_disputed.json: the land boundaries of the areas Natural Earth marks as disputed or
// breakaway (Crimea, Western Sahara, Kashmir, Northern Cyprus…), which every map draws dashed (territories policy,
// section 1). Run by hand when the pinned Natural Earth release changes: node scripts/natural-earth.ts
//
// Natural Earth publishes these areas as polygons, whose outlines include coastlines. Only the parts of an outline
// with land on both sides are kept, so a disputed coast is not dashed, only the line between two administrations.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The release the basemap is pinned to (also recorded in ne_50m_admin0.json and docs/maps.md). */
export const NE_RELEASE = 'v5.1.2';
const URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_RELEASE}/geojson/ne_50m_admin_0_breakaway_disputed_areas.geojson`;

type Pt = [number, number];
type Ring = Pt[];
interface Feature { properties: Record<string, string | null>; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }

const polysOf = (g: Feature['geometry']) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][];

function inRing(r: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const land = JSON.parse((await import('node:fs')).readFileSync(join(process.cwd(), 'src/data/geo/ne_50m_admin0.json'), 'utf8')) as { features: Feature[] };
const landPolys = land.features.flatMap((f) => polysOf(f.geometry));
const isLand = (x: number, y: number) => landPolys.some(([outer, ...holes]) => inRing(outer, x, y) && !holes.some((h) => inRing(h, x, y)));

/** Land on both sides of the segment's midpoint, a little way out (0.05°, about 5 km). */
function inland(a: Pt, b: Pt): boolean {
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [nx, ny] = [(-(b[1] - a[1]) / len) * 0.05, ((b[0] - a[0]) / len) * 0.05];
  return isLand(mx + nx, my + ny) && isLand(mx - nx, my - ny);
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`${URL}: HTTP ${res.status}`);
const src = (await res.json()) as { features: Feature[] };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const features = [];
for (const f of src.features) {
  const lines: Pt[][] = [];
  for (const poly of polysOf(f.geometry)) {
    for (const ring of poly) {
      let cur: Pt[] = [];
      for (let i = 1; i < ring.length; i++) {
        if (inland(ring[i - 1], ring[i])) {
          if (!cur.length) cur.push(ring[i - 1]);
          cur.push(ring[i]);
        } else if (cur.length) { lines.push(cur); cur = []; }
      }
      if (cur.length) lines.push(cur);
    }
  }
  // Very short runs are coastline noise (a river mouth, a 1:50m sliver), not a boundary.
  const kept = lines.filter((l) => l.length > 2).map((l) => l.map(([x, y]) => [r3(x), r3(y)]));
  if (!kept.length) continue;
  features.push({
    type: 'Feature',
    properties: { name: f.properties.BRK_NAME ?? f.properties.NAME, kind: f.properties.featurecla },
    geometry: { type: 'MultiLineString', coordinates: kept },
  });
}
const out = {
  type: 'FeatureCollection',
  source: `Natural Earth 1:50m Admin 0 breakaway and disputed areas, ${NE_RELEASE} (public domain); land boundaries only, coordinates rounded to 0.001°`,
  features,
};
writeFileSync(join(process.cwd(), 'src/data/geo/ne_50m_disputed.json'), `${JSON.stringify(out)}\n`);
console.log(`ne_50m_disputed.json: ${features.length} areas, ${features.map((f) => f.properties.name).join(', ')}`);
