// Small static maps drawn at build time as SVG: the locator map on country pages and the choropleth on indicator
// pages. They read before any script runs and print well; the interactive MapLibre map is phase 4. Shapes are
// Natural Earth 1:50m (the de facto map of the territories policy), in the Equal Earth projection the designs use,
// simplified for the size they are drawn at.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matcher } from '../adapters/core.ts';

type Ring = [number, number][];
interface Shape { id: string | null; polys: Ring[][] }

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;

/** Equal Earth, in units where the world is about 5.41 wide and 2.63 high. */
export function project(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180;
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
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
  const tol = 0.7 / k;
  const parts: string[] = [];
  for (const poly of s.polys) {
    for (const ring of poly) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      if (maxX < v.x || minX > v.x + v.w || maxY < v.y || minY > v.y + v.h) continue;
      if ((maxX - minX) * k < 0.8 && (maxY - minY) * k < 0.8) continue;
      const pts = thin(ring, tol);
      if (pts.length < 4) continue;
      parts.push(`M${pts.map(([x, y]) => `${((x - v.x) * k).toFixed(1)} ${((y - v.y) * k).toFixed(1)}`).join('L')}Z`);
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
 * A locator map: the place and its neighbours, cropped around its largest polygon to a 4:3 frame. Places too small
 * to see at that scale get a ring (`ring`, in the map's units) so they can be found.
 */
export function locatorMap(id: string, width = 400, height = 300) {
  shapes ??= load();
  const own = shapes.filter((s) => s.id === id);
  if (!own.length) return null;
  // The largest ring decides the frame, so far-off islands do not shrink the main territory to a dot.
  let best: Ring | null = null;
  let bestArea = -1;
  for (const s of own) for (const poly of s.polys) {
    const r = poly[0];
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = r; }
  }
  const xs = best!.map((p) => p[0]), ys = best!.map((p) => p[1]);
  const [bx0, bx1, by0, by1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const minSpan = 0.18;
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  let w = Math.max(bx1 - bx0, minSpan) * 2.2;
  let h = Math.max(by1 - by0, minSpan) * 2.2;
  if (w / h > width / height) h = (w * height) / width; else w = (h * width) / height;
  const v: View = { x: cx - w / 2, y: cy - h / 2, w, h, width };
  const paths = shapes.map((s) => ({ id: s.id, d: pathOf(s, v) })).filter((p) => p.d);
  const shown = (Math.max(bx1 - bx0, by1 - by0) / w) * width;
  const ring = shown < 14 ? { x: width / 2, y: height / 2, r: 14 } : null;
  return { paths, width, height, ring };
}
