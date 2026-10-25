// Large dams for the water stress view, from Global Dam Watch (../adapters/water.ts): the largest by
// reservoir capacity, for map marks and a table.
import { water, type Dam } from '../adapters/water.ts';
import { shared } from './data.ts';

const waterData = shared(water);

/** Dams with a position, largest reservoir first; `min` is the smallest capacity kept, in million m³. */
export function largeDams(min = 0): Dam[] {
  return (waterData()?.dams ?? []).filter((d) => d.lon !== null && d.lat !== null && (d.capacity ?? 0) >= min).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
}
