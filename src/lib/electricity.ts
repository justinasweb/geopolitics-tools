// The extras on the electricity views, from Ember (../adapters/ember.ts): each country's power mix in seven groups,
// and the world mix, Ember's own World figure where the snapshot has it, else the countries listed added up.
import { ember, GROUPS, partOf, type Group, type Measure, type Mix } from '../adapters/ember.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { POWER_TEXT } from '../i18n/electricity.en.ts';
import { inSentence, possessive } from '../i18n/pages.en.ts';
import { shared } from './data.ts';
import { formatShare } from './format.ts';
import { place } from './places.ts';

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

/** A grid operator's own report for a country and year, where Ember's figures leave out most of a kind of plant
 *  (src/data/operator-reports.csv): the operator, the plants, its total and their generation, and where it says so. */
export interface OperatorReport { place: string; year: number; operator: string; plants: string; total: number; plantsGwh: number; title: string; url: string; checked: string }

let reports: OperatorReport[] | null = null;
export function operatorReports(): OperatorReport[] {
  if (reports) return reports;
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data/operator-reports.csv'), 'utf8'));
  return (reports = rows.filter((r) => r.some((c) => c.trim())).map((r) => {
    const x = Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()]));
    const out = { place: x.place, year: Number(x.year), operator: x.operator, plants: x.plants, total: Number(x.generated_gwh), plantsGwh: Number(x.plants_gwh), title: x.title, url: x.url, checked: x.checked };
    if (!place(out.place) || !out.year || !(out.total > 0) || !(out.plantsGwh >= 0) || !/^https:\/\//.test(out.url) || !/^\d{4}-\d{2}-\d{2}$/.test(out.checked)) {
      throw new Error(`operator-reports.csv: ${x.place} ${x.year} needs a place, year, both figures, an https link and a checked date`);
    }
    return out;
  }));
}

/** Above this share of fossil plants other than coal and gas in Ember's own mix, Ember has caught up: no note. */
export const OPERATOR_NOTE_UNTIL = 0.05;

/** The note beside a country's electricity figures for a year, when its grid operator reports far more of a kind of
 *  plant than Ember does (Costa Rica, 2024: 10.6% thermal against Ember's 0.1% other fossil); null otherwise, and
 *  null once Ember's own other-fossil share is above OPERATOR_NOTE_UNTIL. */
export function operatorNote(id: string, year: number): string | null {
  const r = operatorReports().find((x) => x.place === id && x.year === year);
  return r ? noteFrom(r, mixOf(id, year), place(id)!.name) : null;
}

/** The note from an operator's report and Ember's mix for the same country and year (operatorNote). */
export function noteFrom(r: OperatorReport, m: Mix | null, name: string): string | null {
  if (!m || !m.total) return null;
  const ember = (m.series['Other fossil'] ?? 0) / m.total;
  if (ember > OPERATOR_NOTE_UNTIL) return null;
  // The operator's own share, to one decimal as it reports it (10.59% → 10.6%).
  const theirs = `${((100 * r.plantsGwh) / r.total).toFixed(1)}%`;
  return POWER_TEXT.operatorNote(possessive(inSentence(name, true)), r.operator, theirs, r.year, r.plants, ember < 0.01 ? 'almost none' : formatShare(ember));
}
