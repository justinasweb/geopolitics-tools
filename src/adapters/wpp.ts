// UN World Population Prospects 2024 (wpp/total_population.csv, demographic_indicators.csv,
// population_by_age.csv, imported). WPP counts in thousands; these are people. Years after
// lastEstimate are projections.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

export const WPP_LAST_ESTIMATE = 2023;

export interface AgeGroup { group: string; start: number; male: number; female: number }

export interface Demography {
  lastEstimate: number;
  /** Total population by variant (Medium, Low, High). */
  total: Record<string, Series>;
  tfr: Series;
  lex: Series;
  median: Series;
  /** Net migration, people a year. */
  migration: Series;
  ages: Record<string, Record<number, AgeGroup[]>>;
}

const k = (v: string) => (num(v) === null ? null : num(v)! * 1000);

export function parseWpp(files: { totals: string; indicators: string; ages: string }, lastEstimate = WPP_LAST_ESTIMATE): Demography {
  const m = matcher('wpp', 'iso3');
  const out: Demography = { lastEstimate, total: {}, tfr: {}, lex: {}, median: {}, migration: {}, ages: {} };
  for (const r of csvRecords(files.totals)) {
    const id = m.match(r.ISO3_code);
    if (id) put((out.total[r.Variant] ??= {}), id, Number(r.Time), k(r.PopTotal));
  }
  for (const r of csvRecords(files.indicators)) {
    const id = m.match(r.ISO3_code);
    if (!id) continue;
    const y = Number(r.Time);
    put(out.tfr, id, y, num(r.TFR));
    put(out.lex, id, y, num(r.LEx));
    put(out.median, id, y, num(r.MedianAgePop));
    put(out.migration, id, y, k(r.NetMigrations));
  }
  for (const r of csvRecords(files.ages)) {
    const id = m.match(r.ISO3_code);
    if (!id) continue;
    ((out.ages[id] ??= {})[Number(r.Time)] ??= []).push({ group: r.AgeGrp, start: Number(r.AgeGrpStart), male: k(r.PopMale) ?? 0, female: k(r.PopFemale) ?? 0 });
  }
  for (const byYear of Object.values(out.ages)) for (const list of Object.values(byYear)) list.sort((a, b) => a.start - b.start);
  return out;
}

export const demography = (raw: Raw) => parseWpp({ totals: raw.text('wpp', 'total_population.csv'), indicators: raw.text('wpp', 'demographic_indicators.csv'), ages: raw.text('wpp', 'population_by_age.csv') });

/** Shares of a year's population: under 15, 15–64, 65 and over, and people 65+ per 100 aged 15–64. */
export function ageShares(groups: AgeGroup[] | undefined) {
  if (!groups?.length) return null;
  const sum = (f: (g: AgeGroup) => boolean) => groups.filter(f).reduce((t, g) => t + g.male + g.female, 0);
  const all = sum(() => true);
  const young = sum((g) => g.start < 15);
  const old = sum((g) => g.start >= 65);
  const working = all - young - old;
  return { young: young / all, working: working / all, old: old / all, oldPer100: (old / working) * 100 };
}
