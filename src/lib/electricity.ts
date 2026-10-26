// The extras on the electricity views, from Ember (../adapters/ember.ts): each country's power mix in seven groups,
// and the world mix, Ember's own World figure where the snapshot has it, else the countries listed added up.
import { ember, GROUPS, partOf, type Group, type Measure, type Mix } from '../adapters/ember.ts';
import { shared } from './data.ts';

const powerData = shared(ember);

/** The share each layer maps, by registry measure. */
export const MEASURE_OF: Record<string, Measure> = {
  lowcarbon: 'lowcarbon', windsolar: 'windsolar', coalpower: 'coal', gaspower: 'gas', nuclearpower: 'nuclear',
};

export const mixOf = (id: string, year: number): Mix | null => powerData()?.mix[id]?.[year] ?? null;

/** The world's mix in a year; `own` when it is Ember's World figure, not a sum of the countries listed. */
export function worldMix(year: number): { mix: Mix; own: boolean } | null {
  const d = powerData();
  if (!d) return null;
  if (d.world[year]?.total) return { mix: d.world[year], own: true };
  const sum: Mix = { total: 0, groups: Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<Group, number>, series: {} };
  for (const years of Object.values(d.mix)) {
    const m = years[year];
    if (!m) continue;
    sum.total += m.total;
    for (const g of GROUPS) sum.groups[g] += m.groups[g];
    for (const [s, v] of Object.entries(m.series)) sum.series[s] = (sum.series[s] ?? 0) + v;
  }
  return sum.total ? { mix: sum, own: false } : null;
}

/** The world's share for a layer, or null. */
export function worldShare(indicator: string, year: number): { value: number; own: boolean } | null {
  const w = worldMix(year);
  const m = MEASURE_OF[indicator];
  return w && m ? { value: partOf(w.mix, m), own: w.own } : null;
}

/** A mix's seven groups, largest first, with their shares; groups that generated nothing are left out. */
export const groupsOf = (m: Mix) => GROUPS.map((g) => ({ group: g, twh: m.groups[g], share: m.total ? m.groups[g] / m.total : 0 }))
  .filter((x) => x.twh > 0).sort((a, b) => b.twh - a.twh);
