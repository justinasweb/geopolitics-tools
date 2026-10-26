// The extras on the AI and chips views: the known AI supercomputers themselves, from Epoch AI's list
// (../adapters/epoch.ts), for map marks and the table of the largest; and the chip trade flows from UN Comtrade.
import { ai, type Cluster } from '../adapters/epoch.ts';
import { chipFlows, comtrade, type Flow } from '../adapters/comtrade.ts';
import { shared } from './data.ts';

const aiData = shared(ai);
const tradeRows = shared(comtrade);

/** The chip layers and the Comtrade commodity each maps. */
export const CHIP_LAYERS: Record<string, 'chips' | 'equipment'> = { chipimports: 'chips', chipmachines: 'equipment' };

/** A chip layer's flows, supplier to buyer, largest first (one year, or every year). */
export const chipFlowsFor = (layer: string, year?: number): Flow[] =>
  chipFlows(tradeRows() ?? [], CHIP_LAYERS[layer]).filter((f) => year === undefined || f.year === year);

/** Clusters in operation by the end of the view's year, largest first. */
export function clustersAt(year: number): Cluster[] {
  return (aiData()?.clusters ?? []).filter((c) => !c.planned && c.year <= year && c.h100e > 0).sort((a, b) => b.h100e - a.h100e);
}
