// Small static maps drawn at build time as SVG: the locator map on country pages and the choropleth on indicator
// pages. They read before any script runs and print well; the interactive MapLibre map is phase 4. Shapes are
// Natural Earth 1:50m (the de facto map of the territories policy), in the Equal Earth projection the designs use,
// simplified for the size they are drawn at.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matcher } from '../adapters/core.ts';
import { equalEarth } from './map/projection.ts';

type Ring = [number, number][];
interface Shape { id: string | null; polys: Ring[][] }

/** Equal Earth with y growing downwards, as SVG wants it. */
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = equalEarth(lon, lat);
  return [x, -y];
}

let shapes: Shape[] | null = null;
function load(): Shape[] {
  const json = JSON.parse(readFileSync(join(process.cwd(), 'src/data/geo/ne_50m_admin0.json'), 'utf8')) as {
    features: { properties: { adm0_a3: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }[];
  };
  const m = matcher('naturalearth', 'iso3');
  return json.features.map((f) => {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    return { id: m.match(f.properties.adm0_a3), polys: polys.map((p) => p.map((r) => r.map(([x, y]) => project(x, y)))) };
  });
}

/** Drops points closer than `tol` to the previous kept one (radial distance), keeping rings closed. */
function thin(r: Ring, tol: number): Ring {
  const out: Ring = [r[0]];
  for (let i = 1; i < r.length - 1; i++) {
    const [px, py] = out[out.length - 1];
    if (Math.hypot(r[i][0] - px, r[i][1] - py) >= tol) out.push(r[i]);
  }
  out.push(r[r.length - 1]);
  return out;
}

interface View { x: number; y: number; w: number; h: number; width: number }

function pathOf(s: Shape, v: View): string {
  const k = v.width / v.w;
  const tol = 1 / k;
  const parts: string[] = [];
  for (const poly of s.polys) {
    for (const ring of poly) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      if (maxX < v.x || minX > v.x + v.w || maxY < v.y || minY > v.y + v.h) continue;
      if ((maxX - minX) * k < 0.8 && (maxY - minY) * k < 0.8) continue;
      const pts = thin(ring, tol);
      if (pts.length < 4) continue;
      // Whole units, relative moves, repeated points dropped: a fraction of the size, the same drawing at this scale.
      let d = '';
      let px = 0, py = 0, n = 0;
      for (const [x, y] of pts) {
        const ix = Math.round((x - v.x) * k), iy = Math.round((y - v.y) * k);
        if (n && ix === px && iy === py) continue;
        d += n ? `l${ix - px} ${iy - py}` : `M${ix} ${iy}`;
        px = ix; py = iy; n++;
      }
      if (n >= 3) parts.push(`${d}z`);
    }
  }
  return parts.join('');
}

export interface MapPath { id: string | null; d: string }

/** The world, cut at 58°S (no Antarctica), `width` units wide. Cached per width. */
const worlds = new Map<number, { paths: MapPath[]; width: number; height: number }>();
export function worldMap(width = 1000) {
  if (!worlds.has(width)) {
    shapes ??= load();
    const [x0] = project(-180, 0);
    const [, yTop] = project(0, 84);
    const [, yBot] = project(0, -58);
    const v: View = { x: x0, y: yTop, w: -2 * x0, h: yBot - yTop, width };
    const paths = shapes.map((s) => ({ id: s.id, d: pathOf(s, v) })).filter((p) => p.d);
    worlds.set(width, { paths, width, height: Math.round((v.h / v.w) * width) });
  }
  return worlds.get(width)!;
}

/**
 * A locator map: the place and its neighbours in a 4:3 frame, zoomed so the place fills about the same share of the
 * frame whatever its size; a small island state is drawn as large as a big country. The frame is set by the largest
 * polygon and the place's other polygons near it (an island chain), so far-off territories do not shrink the main
 * one to a dot. A place still too small to see at the closest zoom gets a ring (`ring`, in the map's units).
 */
export function locatorMap(id: string, width = 400, height = 300) {
  shapes ??= load();
  const own = shapes.filter((s) => s.id === id);
  if (!own.length) return null;
  const boxes: [number, number, number, number, number][] = [];
  for (const s of own) for (const poly of s.polys) {
    const r = poly[0];
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
    boxes.push([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.abs(a)]);
  }
  boxes.sort((p, q) => q[4] - p[4]);
  // Polygons within REACH of the largest (about 4°, Equal Earth units) join the frame: Tonga's islands, not Hawaii.
  const REACH = 0.07;
  let [bx0, bx1, by0, by1] = boxes[0];
  const [l0, l1, t0, t1] = boxes[0];
  for (const [x0, x1, y0, y1] of boxes.slice(1)) {
    if (x1 < l0 - REACH || x0 > l1 + REACH || y1 < t0 - REACH || y0 > t1 + REACH) continue;
    bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x1); by0 = Math.min(by0, y0); by1 = Math.max(by1, y1);
  }
  // The place takes up about 60% of the frame's width or height. The floor (about 2°) stops a speck from filling it
  // with the coarse outline of a few-kilometre island.
  const minSpan = 0.03, pad = 1.7;
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  let w = Math.max(bx1 - bx0, minSpan) * pad;
  let h = Math.max(by1 - by0, minSpan) * pad;
  if (w / h > width / height) h = (w * height) / width; else w = (h * width) / height;
  const v: View = { x: cx - w / 2, y: cy - h / 2, w, h, width };
  const paths = shapes.map((s) => ({ id: s.id, d: pathOf(s, v) })).filter((p) => p.d);
  const shown = (Math.max(bx1 - bx0, by1 - by0) / w) * width;
  const ring = shown < 14 ? { x: width / 2, y: height / 2, r: 14 } : null;
  return { paths, width, height, ring };
}
