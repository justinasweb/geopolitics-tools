// SIPRI Arms Transfers Database (sipri/tiv_2015-2025.csv, imported): TIV by supplier and recipient,
// one column per year. SIPRI names countries in its own style. A supplier that is not a country (a non-state actor,
// marked *; a multinational body such as NATO or the UN; "unknown supplier(s)") stays in its recipient's totals as
// OTHER_SUPPLIER, so shares are of everything a country received, but is never shown as a country. Recipients that
// are not countries count for no one.
// TIV measures military capability transferred, in millions; it is not a price.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, matcher, num } from './core.ts';

export interface ArmsPair { year: number; from: string; to: string; tiv: number }

/** The supplier id of deliveries from anyone that is not a country; lists name it "Other or unknown suppliers". */
export const OTHER_SUPPLIER = 'other-or-unknown';
const notCountry = (name: string) => /\*$/.test(name.trim()) || /^unknown (supplier|recipient)\(s\)$/i.test(name.trim());

export function parseSipriTiv(text: string): { years: number[]; pairs: ArmsPair[] } {
  const start = text.search(/^"?Supplier"?,/m);
  if (start < 0) return { years: [], pairs: [] };
  const rows = csvRecords(text.slice(start));
  const years = Object.keys(rows[0] ?? {}).filter((c) => /^\d{4}$/.test(c));
  const m = matcher('sipri', 'name');
  const pairs: ArmsPair[] = [];
  for (const r of rows) {
    if (!r.Supplier || !r.Recipient || notCountry(r.Recipient)) continue;
    const to = m.match(r.Recipient);
    if (!to) continue;
    const from = notCountry(r.Supplier) ? OTHER_SUPPLIER : m.match(r.Supplier) ?? OTHER_SUPPLIER;
    for (const y of years) {
      const v = num(r[y]);
      if (v && v > 0) pairs.push({ year: Number(y), from, to, tiv: v });
    }
  }
  return { years: years.map(Number).sort((a, b) => a - b), pairs };
}

export const arms = (raw: Raw) => parseSipriTiv(raw.text('sipri', 'tiv_2015-2025.csv'));
