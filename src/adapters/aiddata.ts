// AidData Global Chinese Development Finance (aiddata/gcdf_v3.csv, imported). Only records AidData
// recommends for aggregates count (it flags pledges and duplicates "No"). Amounts are commitments in
// constant 2021 dollars: what China agreed to lend or give, not what was paid out.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

/** AidData's sectors grouped for the lending views, by sector name in lower case (version 3.0 writes them in capitals). */
export const SECTOR_GROUPS: Record<string, string> = {
  'energy': 'energy',
  'transport and storage': 'transport',
  'industry, mining, construction': 'industry',
  'banking and financial services': 'banking',
};

export interface Project { title: string; year: number; sector: string; group: string; lender: string; amount: number; status: string; type: string }

export interface Lending {
  byYear: Series;
  bySector: Record<string, Record<string, number>>;
  byClass: Record<string, Record<string, number>>;
  top: Record<string, Project[]>;
  years: number[];
}

export function parseAidData(text: string): Lending {
  const m = matcher('aiddata', 'iso3');
  const out: Lending = { byYear: {}, bySector: {}, byClass: {}, top: {}, years: [] };
  const years = new Set<number>();
  const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };
  for (const r of csvRecords(text)) {
    if (r['Recommended For Aggregates'] !== 'Yes') continue;
    const id = m.match(r['Recipient ISO-3']);
    const y = Number(r['Commitment Year']);
    const amount = num(r['Amount (Constant USD 2021)']);
    if (!id || !y || !amount || amount <= 0) continue;
    years.add(y);
    put(out.byYear, id, y, amount, true);
    const group = SECTOR_GROUPS[r['Sector Name'].toLowerCase()] ?? 'other';
    add((out.bySector[id] ??= {}), group, amount);
    add((out.byClass[id] ??= {}), r['Flow Class'], amount);
    (out.top[id] ??= []).push({ title: r.Title, year: y, sector: r['Sector Name'], group, lender: r['Funding Agencies'], amount, status: r.Status, type: r['Flow Type'] });
  }
  for (const [id, list] of Object.entries(out.top)) out.top[id] = list.sort((a, b) => b.amount - a.amount).slice(0, 25);
  out.years = [...years].sort((a, b) => a - b);
  return out;
}

export const lending = (raw: Raw) => parseAidData(raw.text('aiddata', 'gcdf_v3.csv'));
