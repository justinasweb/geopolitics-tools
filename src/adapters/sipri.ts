// SIPRI Arms Transfers Database (sipri/tiv_2015-2025.csv, imported): TIV by supplier and recipient,
// one column per year. SIPRI names countries in its own style; non-state actors (marked *) and
// multinational bodies (NATO, African Union, UN) match nothing and are reported as unmatched.
// TIV measures military capability transferred, in millions; it is not a price.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, matcher, num } from './core.ts';

export interface ArmsPair { year: number; from: string; to: string; tiv: number }

export function parseSipriTiv(text: string): { years: number[]; pairs: ArmsPair[] } {
  const start = text.search(/^"?Supplier"?,/m);
  if (start < 0) return { years: [], pairs: [] };
  const rows = csvRecords(text.slice(start));
  const years = Object.keys(rows[0] ?? {}).filter((c) => /^\d{4}$/.test(c));
  const m = matcher('sipri', 'name');
  const pairs: ArmsPair[] = [];
  for (const r of rows) {
    if (!r.Supplier || !r.Recipient || /\*$/.test(r.Supplier.trim()) || /\*$/.test(r.Recipient.trim())) continue;
    const from = m.match(r.Supplier);
    const to = m.match(r.Recipient);
    if (!from || !to) continue;
    for (const y of years) {
      const v = num(r[y]);
      if (v && v > 0) pairs.push({ year: Number(y), from, to, tiv: v });
    }
  }
  return { years: years.map(Number).sort((a, b) => a - b), pairs };
}

export const arms = (raw: Raw) => parseSipriTiv(raw.text('sipri', 'tiv_2015-2025.csv'));
