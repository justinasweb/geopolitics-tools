// The Equal Earth projection the designs use, and the trick that lets MapLibre draw it. MapLibre only draws Web
// Mercator (or a globe), but the site uses no tiles: country shapes ship as one file. So every coordinate is
// projected to Equal Earth first and then written as the longitude and latitude that Web Mercator would put at that
// spot. MapLibre then draws an exact, flat Equal Earth map (07-platform-test.md, finding 2).
//
// Used at build time (basemap, layer files) and in the browser (overlays given in real longitude and latitude), so
// it imports nothing.

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;

/** Equal Earth, in units where the world is about 5.41 wide and 2.63 high; y grows northwards. */
export function equalEarth(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180;
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

/** Half the width of the world in Equal Earth units (x at 180° on the equator). */
export const X_MAX = equalEarth(180, 0)[0];

/**
 * A real longitude and latitude, as the Web Mercator longitude and latitude that MapLibre must be given to draw it
 * where Equal Earth puts it. The scale is the same on both axes, so the map is not stretched.
 */
export function toMap(lon: number, lat: number): [number, number] {
  const [x, y] = equalEarth(lon, lat);
  return [(x / X_MAX) * 180, (2 * Math.atan(Math.exp((Math.PI * y) / X_MAX)) - Math.PI / 2) * (180 / Math.PI)];
}

/** The inverse of the latitude step of toMap, for tests and for placing things by projected position. */
export const mapLatOfY = (y: number) => (2 * Math.atan(Math.exp((Math.PI * y) / X_MAX)) - Math.PI / 2) * (180 / Math.PI);

/** The map's extent: the whole world from 180°W to 180°E, cut at 58°S (no Antarctica) and 84°N. */
export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-180, mapLatOfY(equalEarth(0, -58)[1])],
  [180, mapLatOfY(equalEarth(0, 84)[1])],
];

/** Map coordinates back to Equal Earth units: the inverse of the second step of toMap. */
export function fromMap(lng: number, lat: number): [number, number] {
  return [(lng / 180) * X_MAX, (X_MAX / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
}

/** Points along a curved arc between two real places, already in map coordinates (for flow overlays). */
export function arc(from: [number, number], to: [number, number], bend = 0.18, steps = 32): [number, number][] {
  return arcXY(equalEarth(...from), equalEarth(...to), bend, steps);
}

/** The same, between two points in Equal Earth units (a place's anchor, from the basemap). */
export function arcXY([ax, ay]: [number, number], [bx, by]: [number, number], bend = 0.18, steps = 32): [number, number][] {
  // A quadratic curve, bent to the left of the direction of travel, so a flow and its reverse never overlap.
  const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
  const [dx, dy] = [bx - ax, by - ay];
  const [cx, cy] = [mx - dy * bend, my + dx * bend];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx;
    const y = u * u * ay + 2 * u * t * cy + t * t * by;
    out.push([(x / X_MAX) * 180, mapLatOfY(y)]);
  }
  return out;
}
