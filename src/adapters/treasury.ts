// US Treasury TIC, major foreign holders of US Treasury securities, in US$ billions:
//   treasury/slt_table5.txt          Table 5, the last 13 months, tab-separated, months as 2026-08
//   treasury-history/mfh_history.csv year-end holdings (imported), one column per year
// TIC lists financial centres (Cayman Islands, Belgium) as well as countries; they are kept, as
// holdings are recorded where the securities are held, not by who owns them. Totals and
// sub-totals are left out. Ported from the prototype's src/adapters/finance.js.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

export interface Holder { label: string; place: string | null; values: (number | null)[] }

const TOTALS = /^(All Other|Grand Total|Of which|T-Bonds|For\. Official|Treasury Bills|Total)/i;

/** Table 5: months newest first, as YYYY-MM. */
export function parseTicTable5(text: string): { months: string[]; holders: Holder[] } {
  const m = matcher('treasury', 'name');
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l) => /^Country\t/.test(l));
  if (head < 0) return { months: [], holders: [] };
  const months = lines[head].split('\t').slice(1).map((c) => c.trim()).filter((c) => /^\d{4}-\d\d$/.test(c));
  const holders: Holder[] = [];
  for (const l of lines.slice(head + 1)) {
    const cells = l.split('\t').map((c) => c.trim());
    if (!cells[0] || TOTALS.test(cells[0])) continue;
    const values = cells.slice(1, 1 + months.length).map((v) => (v === '' ? null : num(v)));
    if (values.length !== months.length) continue;
    holders.push({ label: cells[0], place: m.match(cells[0]), values });
  }
  return { months, holders };
}

/** Year-end holdings by place and year. */
export function parseTicHistory(text: string): Series {
  const m = matcher('treasury-history', 'name');
  const out: Series = {};
  for (const r of csvRecords(text)) {
    if (!r.Country || TOTALS.test(r.Country)) continue;
    const id = m.match(r.Country);
    if (!id) continue;
    for (const [k, v] of Object.entries(r)) if (/^\d{4}$/.test(k)) put(out, id, Number(k), num(v));
  }
  return out;
}

export const treasuryHolders = (raw: Raw) => parseTicTable5(raw.text('treasury', 'slt_table5.txt'));
export const treasuryHistory = (raw: Raw) => parseTicHistory(raw.text('treasury-history', 'mfh_history.csv'));
