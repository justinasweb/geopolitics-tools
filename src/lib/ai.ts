// The extras on the AI computing power view: the known AI supercomputers themselves, from Epoch AI's list
// (../adapters/epoch.ts), for map marks and the table of the largest.
import { ai, type Cluster } from '../adapters/epoch.ts';
import { shared } from './data.ts';

const aiData = shared(ai);

/** Clusters in operation by the end of the view's year, largest first. */
export function clustersAt(year: number): Cluster[] {
  return (aiData()?.clusters ?? []).filter((c) => !c.planned && c.year <= year && c.h100e > 0).sort((a, b) => b.h100e - a.h100e);
}
