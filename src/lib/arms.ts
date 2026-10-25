// Arms transfers (SIPRI, ../adapters/sipri.ts) as five-year totals, the way SIPRI compares them: deliveries are lumpy,
// so every figure on the arms views is the sum over the five years ending in a year. Only these derived totals are
// shown, never the yearly rows, as SIPRI's terms ask.
import { arms, type ArmsPair } from '../adapters/sipri.ts';
import { sumPairs, type Pair } from '../data/flows.ts';
import { shared } from './data.ts';

export const SPAN = 5;

/** "2021–2025" for the period ending in 2025. */
export const armsPeriod = (end: number) => `${end - SPAN + 1}–${end}`;

/** The years that end a full five-year period inside the data. */
export function periodEnds(years: number[]): number[] {
  if (!years.length) return [];
  const first = Math.min(...years) + SPAN - 1;
  return years.filter((y) => y >= first).sort((a, b) => a - b);
}

/** Supplier → recipient totals over the period ending in a year, largest first. */
export function windowPairs(pairs: ArmsPair[], end: number): Pair[] {
  return sumPairs(pairs.filter((p) => p.year > end - SPAN && p.year <= end), (p) => p.tiv);
}

/** Each place's exports (side 'from') or imports ('to') over the period. */
export function totalsBy(pairs: Pair[], side: 'from' | 'to'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pairs) out[p[side]] = (out[p[side]] ?? 0) + p.amount;
  return out;
}

// European countries for the supplier groups: Europe other than Russia (a group of its own) and Türkiye.
const EUROPE = new Set([
  'ALB', 'AND', 'AUT', 'BEL', 'BGR', 'BIH', 'BLR', 'CHE', 'CYP', 'CZE', 'DEU', 'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GBR', 'GRC',
  'HRV', 'HUN', 'IRL', 'ISL', 'ITA', 'LIE', 'LTU', 'LUX', 'LVA', 'MCO', 'MDA', 'MKD', 'MLT', 'MNE', 'NLD', 'NOR', 'POL', 'PRT',
  'ROU', 'SMR', 'SRB', 'SVK', 'SVN', 'SWE', 'UKR', 'XKX',
]);
export const SUPPLIER_GROUPS = ['USA', 'CHN', 'RUS', 'europe', 'other'] as const;
export type SupplierGroup = (typeof SUPPLIER_GROUPS)[number];
export const groupOf = (id: string): SupplierGroup => (id === 'USA' || id === 'CHN' || id === 'RUS' ? id : EUROPE.has(id) ? 'europe' : 'other');

/** An importer's suppliers by group over the period: amount and share of its imports, in the fixed order. */
export function supplierMix(pairs: Pair[], id: string): { group: SupplierGroup; amount: number; share: number }[] {
  const by: Partial<Record<SupplierGroup, number>> = {};
  let total = 0;
  for (const p of pairs) {
    if (p.to !== id) continue;
    const g = groupOf(p.from);
    by[g] = (by[g] ?? 0) + p.amount;
    total += p.amount;
  }
  if (!total) return [];
  return SUPPLIER_GROUPS.filter((g) => by[g]).map((g) => ({ group: g, amount: by[g]!, share: by[g]! / total }));
}

const armsData = shared(arms);

/** The five-year periods the data covers, each with its supplier → recipient totals. */
export function armsPeriods(): { end: number; pairs: Pair[] }[] {
  const a = armsData();
  if (!a) return [];
  return periodEnds(a.years).map((end) => ({ end, pairs: windowPairs(a.pairs, end) }));
}
