// Ember yearly electricity generation (ember/electricity_generation_yearly.json and, when fetched,
// electricity_generation_world.json, from pipeline/sources/ember.ts; the prototype's sample has the same name and
// format). Ember names countries by ISO3 code. Generation is in terawatt-hours; shares are worked out here from the
// nine series, as fractions, so they always add up.
//
// The nine series are folded into seven groups for the mix (spec: "power mix in seven groups"): gas and the
// small "other fossil" (mostly oil) together, bioenergy with other renewables. The gas layer maps gas alone.
import { type Raw, type Series, matcher, num, put } from './core.ts';

type Row = Record<string, string | number | boolean | null>;
interface File { data?: Row[] }

export const GROUPS = ['coal', 'gas', 'nuclear', 'hydro', 'wind', 'solar', 'other'] as const;
export type Group = (typeof GROUPS)[number];
export const GROUP_OF: Record<string, Group> = {
  Coal: 'coal', Gas: 'gas', 'Other fossil': 'gas', Nuclear: 'nuclear', Hydro: 'hydro', Wind: 'wind', Solar: 'solar', Bioenergy: 'other', 'Other renewables': 'other',
};
const LOW_CARBON = new Set(['Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other renewables']);

/** One place's (or the world's) generation in a year, in TWh. */
export interface Mix { total: number; groups: Record<Group, number>; series: Record<string, number> }

export interface Power {
  /** By place and year. */
  mix: Record<string, Record<number, Mix>>;
  /** Ember's own World figure by year, when the snapshot has it. */
  world: Record<number, Mix>;
}

const empty = (): Mix => ({ total: 0, groups: Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<Group, number>, series: {} });

function add(into: Record<number, Mix>, r: Row) {
  const s = String(r.series);
  const g = GROUP_OF[s];
  const v = num(r.generation_twh);
  const y = Number(r.date);
  if (!g || v === null || !Number.isFinite(y)) return;
  const m = (into[y] ??= empty());
  m.total += v;
  m.groups[g] += v;
  m.series[s] = (m.series[s] ?? 0) + v;
}

export function parseEmber(countries: File, world?: File): Power {
  const m = matcher('ember', 'iso3');
  const mix: Power['mix'] = {};
  for (const r of countries.data ?? []) {
    if (r.is_aggregate_entity === true || r.is_aggregate_series === true) continue;
    const id = m.match(String(r.entity_code ?? r.entity ?? ''));
    if (id) add((mix[id] ??= {}), r);
  }
  const w: Power['world'] = {};
  for (const r of world?.data ?? []) if (r.is_aggregate_series !== true) add(w, r);
  return { mix, world: w };
}

export function ember(raw: Raw): Power {
  const f = 'electricity_generation_yearly.json';
  if (!raw.has('ember', f)) throw new Error('ember/ is not in the snapshot');
  const w = 'electricity_generation_world.json';
  return parseEmber(raw.json<File>('ember', f), raw.has('ember', w) ? raw.json<File>('ember', w) : undefined);
}

/** A share of generation (0–1) or the total, by place and year. Places that generated nothing are left out. */
export type Measure = 'total' | 'lowcarbon' | 'windsolar' | 'coal' | 'gas' | 'nuclear';
export function partOf(m: Mix, measure: Measure): number {
  if (measure === 'total') return m.total;
  const s = (names: string[]) => names.reduce((a, n) => a + (m.series[n] ?? 0), 0);
  const twh = measure === 'lowcarbon' ? s([...LOW_CARBON]) : measure === 'windsolar' ? s(['Wind', 'Solar']) : measure === 'coal' ? s(['Coal']) : measure === 'gas' ? s(['Gas']) : s(['Nuclear']);
  return twh / m.total;
}

export function powerSeries(p: Power, measure: Measure): Series {
  const out: Series = {};
  for (const [id, years] of Object.entries(p.mix)) for (const [y, m] of Object.entries(years)) if (m.total > 0) put(out, id, Number(y), partOf(m, measure));
  return out;
}
