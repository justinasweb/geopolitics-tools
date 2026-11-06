// The IMF World Economic Outlook database as the IMF publishes it each April and October, downloaded by
// hand (import kind imf-weo): the "By Countries" table, tab-delimited (the .xls that is really text) or
// the Excel workbook's Countries sheet. One row per country and subject, a column per year, and the
// row's own "Estimates Start After" year. Written as the files the switched-off API fetcher
// (imf-weo.ts) would write, imf-weo/<indicator>.json, plus release.json: the release and each row's
// last actual year, so the site's projection label follows the file.
import type { Input } from '../lib/importer.ts';
import { csvRows } from '../lib/csv.ts';
import { type SourceFile, check, guardShrink, json } from '../lib/source.ts';
import { matcher } from '../../src/adapters/core.ts';

/** The three the site shows from the WEO; growth, inflation and unemployment come from the World Bank. */
export const WEO_FILE_INDICATORS = ['GGXWDG_NGDP', 'GGXCNL_NGDP', 'BCA_NGDPD'];

export const WEO_COLUMNS = ['ISO', 'WEO Subject Code', 'Estimates Start After'];

export interface WeoRelease {
  /** "October 2026". */
  release: string;
  /** The last actual year most rows have: later years are labelled as projections. */
  lastActual: number;
  /** Each row's own last actual year, by indicator and IMF country code. */
  byCountry: Record<string, Record<string, number>>;
}

const MONTHS: Record<string, string> = { apr: 'April', oct: 'October' };

/** The release, from the table's own footer line, else from the IMF's file name (WEOOct2026all.xlsx). */
function releaseOf(rows: string[][], from: string): string | undefined {
  for (const r of rows.slice(-5)) {
    const m = r.join(' ').match(/World Economic Outlook Database,\s*(April|October)\s+(\d{4})/i);
    if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  }
  const f = from.match(/WEO[ _-]?(Apr|Oct)[a-z]*[ _-]?(\d{4})/i);
  return f ? `${MONTHS[f[1].toLowerCase()]} ${f[2]}` : undefined;
}

/** "1,234.567" → 1234.567; "n/a", "--" and blanks are no value. */
const value = (s: string) => {
  const t = (s ?? '').trim().replace(/,/g, '');
  return /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t) ? Number(t) : null;
};

type Values = Record<string, Record<string, number>>;
const count = (v: Values) => Object.values(v).reduce((s, y) => s + Object.keys(y).length, 0);

/**
 * The table as imf-weo/<indicator>.json and release.json. Only rows whose ISO code is a country the site
 * knows are kept (the IMF's country groups are in another table, but a merged file is refused row by row).
 * `previous` holds the last imported copy of each file, for the shrink check.
 */
export function weoFiles(input: Input, from: string, previous: Record<string, string | null>, allowShrink = false): { files: SourceFile[]; rows: number } {
  const rows = 'text' in input ? [...csvRows(input.text, input.text.split('\n', 1)[0].includes('\t') ? '\t' : ',')] : input.rows;
  const head = (rows[0] ?? []).map((c) => c.trim());
  const missing = WEO_COLUMNS.filter((c) => !head.includes(c));
  check(!missing.length, `missing columns: ${missing.join(', ')}; is this the WEO "By Countries" table?\nColumns in the file: ${head.join(', ')}`);
  const at = (c: string) => head.indexOf(c);
  const years = head.map((h, i) => [h, i] as const).filter(([h]) => /^\d{4}$/.test(h));
  check(years.length >= 10, `only ${years.length} year columns; is this the WEO "By Countries" table?`);
  const release = releaseOf(rows, from);
  check(release, `can't tell which WEO release this is: the file has no "World Economic Outlook Database, October 2026" line; keep the IMF's file name (WEOOct2026all.xlsx)`);

  const m = matcher('imf-weo', 'iso3');
  const values: Record<string, Values> = Object.fromEntries(WEO_FILE_INDICATORS.map((c) => [c, {}]));
  const byCountry: WeoRelease['byCountry'] = Object.fromEntries(WEO_FILE_INDICATORS.map((c) => [c, {}]));
  const lastYears = new Map<number, number>();
  for (const r of rows.slice(1)) {
    const code = (r[at('WEO Subject Code')] ?? '').trim();
    const iso = (r[at('ISO')] ?? '').trim();
    if (!values[code] || !/^[A-Z]{3}$/.test(iso) || !m.match(iso)) continue;
    const ys: Record<string, number> = {};
    for (const [y, i] of years) {
      const v = value(r[i]);
      if (v !== null) ys[y] = v;
    }
    if (!Object.keys(ys).length) continue;
    values[code][iso] = ys;
    const last = value(r[at('Estimates Start After')]);
    if (last !== null && last > 1900) {
      byCountry[code][iso] = last;
      lastYears.set(last, (lastYears.get(last) ?? 0) + 1);
    }
  }

  const files: SourceFile[] = [];
  let total = 0;
  for (const code of WEO_FILE_INDICATORS) {
    const n = count(values[code]);
    check(Object.keys(values[code]).length >= 100, `${code}: only ${Object.keys(values[code]).length} countries; is this the "By Countries" table?`);
    guardShrink({ allowShrink }, code, n, previous[`${code}.json`] ?? null, (p) => count((JSON.parse(p) as { values: Record<string, Values> }).values[code] ?? {}));
    files.push(json(`${code}.json`, { values: { [code]: values[code] } }));
    total += n;
  }
  check(lastYears.size, 'no "Estimates Start After" years in the file');
  const lastActual = [...lastYears].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  files.push(json('release.json', { release, lastActual, byCountry } satisfies WeoRelease));
  return { files, rows: total };
}
