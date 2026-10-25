// Overlays drawn over a layer: flow arcs, lines (pipelines, cables) and points (quakes, chokepoints), built from the
// snapshot at build time, in map coordinates. Phase 4 shows them on the hidden /dev/map page to test the engine; the
// views that use them (supply chains, energy, the Atlas) choose their own in later phases.
import type { Overlay } from './types.ts';
import { arcXY, toMap } from './projection.ts';
import { anchors } from './basemap.ts';
import { shared } from '../data.ts';
import { loadFlows } from '../../data/flows.ts';
import { gem } from '../../adapters/gem.ts';
import { cables } from '../../adapters/digital.ts';
import { hazards } from '../../adapters/hazards.ts';
import { chokepoints } from '../../adapters/portwatch.ts';
import { formatValue } from '../format.ts';
import { place } from '../places.ts';

const nameOf = (id: string) => place(id)?.name ?? id;
const line = (pts: number[][]) => pts.map(([lon, lat]) => toMap(lon, lat));
const refugees = shared((raw) => loadFlows(raw, 'refugees'));
const gemData = shared(gem);
const cableData = shared(cables);
const hazardData = shared(hazards);
const chokeData = shared(chokepoints);

/** The largest flows of a kind as arcs from supplier to buyer, widths by amount. */
export function flowArcs(id: string, label: string, top = 15): Overlay | null {
  const f = id === 'refugees' ? refugees() : null;
  if (!f) return null;
  const at = anchors();
  const items = [...f.pairs].filter((p) => at[p.from] && at[p.to]).sort((a, b) => b.amount - a.amount).slice(0, top)
    .map((p) => ({ p: arcXY(at[p.from], at[p.to]), w: p.amount, tip: `${nameOf(p.from)} → ${nameOf(p.to)}: ${formatValue(p.amount, f.format)} (${f.period})` }));
  return { id, kind: 'arcs', label, items };
}

/** Every overlay kind once, for the demo page. Missing sources are left out. */
export function demoOverlays(): Overlay[] {
  const out: (Overlay | null)[] = [flowArcs('refugees', 'Refugees by country of origin and asylum, largest flows')];
  const g = gemData();
  if (g) {
    out.push({
      id: 'pipelines', kind: 'lines', label: 'Gas pipelines in operation (sample)', dashed: true,
      items: g.pipelines.filter((p) => p.fuel === 'gas' && /operating/i.test(p.status)).slice(0, 80).map((p) => ({ p: p.coords.map(line), tip: p.name })),
    });
  }
  const c = cableData();
  if (c) out.push({ id: 'cables', kind: 'lines', label: 'Submarine cables (sample)', items: c.slice(0, 80).map((x) => ({ p: x.lines.map(line), tip: x.name })) });
  const h = hazardData();
  if (h) {
    out.push({
      id: 'quakes', kind: 'points', label: 'Earthquakes, magnitude 5 and over', symbol: 'dot',
      items: h.filter((q) => q.kind === 'EQ' && (q.mag ?? 0) >= 5).map((q) => ({ at: toMap(q.lon, q.lat), r: Math.max(3, (q.mag! - 4) * 3), tip: `${q.name} (${q.from})` })),
    });
  }
  const k = chokeData();
  if (k) out.push({ id: 'chokepoints', kind: 'points', label: 'Shipping chokepoints', symbol: 'diamond', items: k.map((x) => ({ at: toMap(x.lon, x.lat), tip: x.name })) });
  return out.filter((o): o is Overlay => o !== null && o.items.length > 0);
}
