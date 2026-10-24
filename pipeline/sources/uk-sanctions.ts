// UK Sanctions List (FCDO, CSV export) → uk-sanctions/sanctions.csv. Since OFSI's Consolidated
// List closed on 28 January 2026 this is the one UK list. The export repeats a designation once
// per name and address; it is trimmed to the columns the site counts (designation, type, regime,
// dates, countries) and duplicate rows are dropped. The report date line above the header changes
// daily and is left out, so an unchanged list saves no new copy.
import { getText } from '../lib/http.ts';
import { parseCsv, toCsv } from '../lib/csv.ts';
import { type Source, DAY, CheckError, check, guardShrink, text } from '../lib/source.ts';
import { isoDate } from './eu-sanctions.ts';

/** Kept columns, matched without regard to case, spaces or punctuation; the first three must be there. */
export const COLUMNS = [
  'Unique ID', 'Designation Type', 'Regime Name', 'Last Updated', 'Date Designated', 'Sanctions Imposed',
  'Designation source', 'Name type', 'Name 6', 'Nationality(/ies)', 'Address Country', 'Country of birth',
];
const REQUIRED = 3;

const key = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, '');

const source: Source = {
  id: 'uk-sanctions',
  name: 'UK Sanctions List',
  every: 1 * DAY,
  staleAfter: 10 * DAY,
  enabled: true,
  attribution: 'UK Foreign, Commonwealth & Development Office, UK Sanctions List',
  licence: 'Open Government Licence v3.0',
  async fetch(ctx) {
    const url = ctx.env.UK_SANCTIONS_URL ?? 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv';
    const all = parseCsv(await getText(ctx.http, url, { timeout: 180_000 }));
    const h = all.findIndex((r) => r.some((c) => key(c) === 'uniqueid'));
    if (h < 0) throw new CheckError(`UK sanctions CSV: no header with "Unique ID"; it starts ${all.slice(0, 2).map((r) => r.slice(0, 8).join(', ')).join(' / ')}`);
    const header = all[h].map(key);
    const idx = COLUMNS.map((c) => header.indexOf(key(c)));
    const missing = COLUMNS.slice(0, REQUIRED).filter((_, i) => idx[i] < 0);
    check(!missing.length, `UK sanctions CSV: column(s) ${missing.join(', ')} missing; the file has ${all[h].slice(0, 40).join(', ')}`);
    const kept = idx.map((i, n) => [i, n] as const).filter(([i]) => i >= 0);
    const dated = new Set(['lastupdated', 'datedesignated'].map((k) => COLUMNS.findIndex((c) => key(c) === k)));

    const seen = new Set<string>();
    const rows = [kept.map(([, n]) => COLUMNS[n])];
    let newest = '';
    for (const r of all.slice(h + 1)) {
      if (!r[idx[0]]) continue;
      const out = kept.map(([i, n]) => {
        const v = (r[i] ?? '').trim();
        return dated.has(n) && v ? isoDate(v) : v;
      });
      const updated = idx[3] >= 0 ? out[kept.findIndex(([, n]) => n === 3)] : '';
      if (updated > newest) newest = updated;
      const k = out.join('\u0001');
      if (!seen.has(k)) { seen.add(k); rows.push(out); }
    }
    const designations = new Set(rows.slice(1).map((r) => r[0])).size;
    ctx.log(`${all.length - h - 1} export rows → ${rows.length - 1} after trimming, ${designations} designations, kept ${rows[0].join(', ')}`);
    check(designations >= 2_000, `only ${designations} designations`);
    const prev = await ctx.previous('sanctions.csv');
    guardShrink(ctx, 'sanctions.csv', designations, prev, (p) => new Set(parseCsv(p).slice(1).map((r) => r[0])).size, 0.8);
    return { files: [text('sanctions.csv', toCsv(rows), 'text/csv')], rows: designations, dataTo: newest || undefined };
  },
};
export default source;
