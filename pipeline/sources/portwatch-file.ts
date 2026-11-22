// IMF PortWatch chokepoints as downloaded by hand from portwatch.imf.org (import kinds portwatch-points and
// portwatch-daily, D22), one CSV per kind, as the site offers them:
//   "Chokepoints" (PortWatch_chokepoints_database.csv): one row per chokepoint, its id, name, position (lat, lon in
//     degrees; X and Y are Web Mercator metres and are not read), yearly average vessel counts and main industries;
//   "Daily Chokepoints Data" (Daily_Chokepoints_Data.csv): one row per chokepoint and day since 2019, ships counted by
//     vessel type (n_*) and their estimated cargo in metric tonnes (capacity_*).
// Written as the files the switched-off ArcGIS fetcher (portwatch.ts) would write, portwatch/chokepoints.json and
// portwatch/chokepoints_daily.json in { features: [{ attributes }] }, dates as YYYY-MM-DD, so src/adapters/portwatch.ts
// reads them unchanged.
import type { Input } from '../lib/importer.ts';
import { csvRows } from '../lib/csv.ts';
import { type SourceFile, check, guardShrink, json } from '../lib/source.ts';

/** PortWatch lists 28 chokepoints; a file with fewer is not the whole download. */
export const MIN_CHOKEPOINTS = 28;

/** The daily file's kept columns: ships by type and in all, and their estimated cargo (metric tonnes) by type and in all. */
export const DAILY_COLUMNS = ['date', 'portid', 'portname', 'n_container', 'n_dry_bulk', 'n_general_cargo', 'n_roro', 'n_tanker', 'n_cargo', 'n_total',
  'capacity_container', 'capacity_dry_bulk', 'capacity_general_cargo', 'capacity_roro', 'capacity_tanker', 'capacity_cargo', 'capacity'];
export const DAILY_REQUIRED = ['date', 'portid', 'portname', 'n_total'];
/** The chokepoints file's kept columns. */
export const POINT_COLUMNS = ['portid', 'portname', 'fullname', 'lat', 'lon', 'vessel_count_total', 'vessel_count_container', 'vessel_count_dry_bulk',
  'vessel_count_general_cargo', 'vessel_count_roro', 'vessel_count_tanker', 'industry_top1', 'industry_top2', 'industry_top3'];
export const POINT_REQUIRED = ['portid', 'portname', 'lat', 'lon'];

/**
 * Other names PortWatch has used for a kept column, by kept column; columns are matched without regard to case, so
 * the November 2026 file's vessel_count_RoRo is vessel_count_roro. The ArcGIS fields the fetcher asked for are the
 * kept names themselves.
 */
export const PORTWATCH_FROM: Record<string, string[]> = {
  lat: ['latitude'], lon: ['longitude', 'long'], fullname: ['full_name'], portname: ['port_name', 'name'],
  n_total: ['n_all'], capacity: ['capacity_total'],
};

/**
 * Daily rows kept: four years and 40 days back from the file's last day. The place pages chart the last 365 days, each
 * with its usual range (the same day in each of the three years before), so the oldest day they read is four years
 * before the last; the 40 days are slack for the monthly table's first month and a late download.
 */
export const KEEP_YEARS = 4;
export const KEEP_SLACK_DAYS = 40;

/** A day as YYYY-MM-DD from PortWatch's forms: 2019/01/01, 2019-01-01, 2019-01-01 00:00:00, 1/1/2019 12:00:00 AM, epoch milliseconds. */
export function dayOf(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: .*)?$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (/^\d{12,13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  return null;
}

const num = (s: string | undefined) => {
  const t = (s ?? '').trim().replace(/,/g, '');
  return /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t) ? Number(t) : null;
};

/** The file's rows and, for each kept column, where it is: its own name or one of PORTWATCH_FROM's, without regard to case. */
function read(input: Input, columns: string[], required: string[], what: string) {
  check('text' in input, `this kind takes PortWatch's CSV download (${what}), not a workbook`);
  const rows = csvRows(input.text);
  const first = rows.next();
  const head = (first.done ? [] : first.value).map((c) => c.trim().toLowerCase());
  const at = Object.fromEntries(columns.map((c) => [c, [c, ...(PORTWATCH_FROM[c] ?? [])].map((n) => head.indexOf(n.toLowerCase())).find((i) => i >= 0) ?? -1]));
  const missing = required.filter((c) => at[c] < 0);
  check(!missing.length, `missing columns: ${missing.join(', ')}; is this PortWatch's "${what}" download?\nColumns in the file: ${head.join(', ')}`);
  return { rows, at, head };
}

const cutoffOf = (last: string) => {
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - KEEP_YEARS);
  return new Date(d.getTime() - KEEP_SLACK_DAYS * 86_400_000).toISOString().slice(0, 10);
};

/** Counts in a saved daily file, for the shrink check: rows, and the distinct chokepoints. */
const featuresIn = (p: string) => (JSON.parse(p).features as unknown[]).length;

/**
 * The daily download as chokepoints_daily.json: the kept columns of the last four years and 40 days, numbers as numbers
 * (an empty cell is null), sorted by day and chokepoint. Refuses a file without the needed columns, with fewer than 28
 * chokepoints, with rows it cannot date, or with far fewer rows than the last import. `dataTo` is its last day.
 */
export function portwatchDaily(input: Input, _from: string, previous: Record<string, string | null>, allowShrink = false, minChokepoints = MIN_CHOKEPOINTS): { files: SourceFile[]; rows: number; dataTo: string } {
  const { rows, at, head } = read(input, DAILY_COLUMNS, DAILY_REQUIRED, 'Daily Chokepoints Data');
  const ymd = ['year', 'month', 'day'].map((c) => head.indexOf(c));
  const all: Record<string, string | number | null>[] = [];
  let undated = 0;
  for (const r of rows) {
    if (r.every((c) => !c.trim())) continue;
    const id = (r[at.portid] ?? '').trim();
    // The date, else the year, month and day columns beside it.
    const date = dayOf(r[at.date] ?? '') ?? (ymd.every((i) => i >= 0) && ymd.every((i) => num(r[i]) !== null)
      ? `${r[ymd[0]].trim()}-${r[ymd[1]].trim().padStart(2, '0')}-${r[ymd[2]].trim().padStart(2, '0')}` : null);
    if (!id || !date) { undated++; continue; }
    const row: Record<string, string | number | null> = { date, portid: id, portname: (r[at.portname] ?? '').trim() };
    for (const c of DAILY_COLUMNS.slice(3)) row[c] = at[c] >= 0 ? num(r[at[c]]) : null;
    all.push(row);
  }
  check(all.length, 'no daily rows in the file');
  check(undated <= all.length * 0.01, `${undated} rows without a chokepoint or a date we can read; is this the "Daily Chokepoints Data" download?`);
  const ids = new Set(all.map((r) => r.portid));
  check(ids.size >= minChokepoints, `${ids.size} chokepoints in the daily rows; PortWatch lists ${minChokepoints}. Download the whole table, not a filtered view`);
  const dataTo = all.reduce((m, r) => (String(r.date) > m ? String(r.date) : m), '');
  const cutoff = cutoffOf(dataTo);
  const kept = all.filter((r) => String(r.date) >= cutoff)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.portid).localeCompare(String(b.portid), 'en', { numeric: true }));
  check(kept.every((r) => typeof r.n_total === 'number' || r.n_total === null), 'n_total must be a number');
  guardShrink({ allowShrink }, 'chokepoints_daily.json', kept.length, previous['chokepoints_daily.json'] ?? null, featuresIn, 0.8);
  return { files: [json('chokepoints_daily.json', { features: kept.map((attributes) => ({ attributes })) })], rows: kept.length, dataTo };
}

/**
 * The chokepoints download as chokepoints.json: one row per chokepoint with its position in degrees, kept as numbers.
 * Refuses a file without the needed columns, fewer than 28 chokepoints, a chokepoint without an id, a name or a
 * position on the globe (X and Y in metres given as lat and lon would fail here), or far fewer than the last import.
 */
export function portwatchPoints(input: Input, _from: string, previous: Record<string, string | null>, allowShrink = false, minChokepoints = MIN_CHOKEPOINTS): { files: SourceFile[]; rows: number } {
  const { rows, at } = read(input, POINT_COLUMNS, POINT_REQUIRED, 'Chokepoints');
  const out: Record<string, string | number | null>[] = [];
  const numeric = (c: string) => c === 'lat' || c === 'lon' || c.startsWith('vessel_count_');
  for (const r of rows) {
    if (r.every((c) => !c.trim())) continue;
    const row: Record<string, string | number | null> = {};
    for (const c of POINT_COLUMNS) {
      const v = at[c] >= 0 ? (r[at[c]] ?? '').trim() : '';
      row[c] = numeric(c) ? num(v) : v || null;
    }
    const name = row.portname ?? row.portid;
    check(row.portid && row.portname, `a chokepoint without ${row.portid ? 'a name' : 'an id'}${name ? ` (${name})` : ''}`);
    check(typeof row.lat === 'number' && typeof row.lon === 'number' && Math.abs(row.lat) <= 90 && Math.abs(row.lon) <= 180,
      `${name}: no position in degrees (lat ${row.lat ?? 'empty'}, lon ${row.lon ?? 'empty'})`);
    out.push(row);
  }
  check(new Set(out.map((r) => r.portid)).size === out.length, 'a chokepoint id is listed twice');
  check(out.length >= minChokepoints, `${out.length} chokepoints; PortWatch lists ${minChokepoints}. Is this the "Chokepoints" download?`);
  guardShrink({ allowShrink }, 'chokepoints.json', out.length, previous['chokepoints.json'] ?? null, featuresIn, 0.8);
  return { files: [json('chokepoints.json', { features: out.map((attributes) => ({ attributes })) })], rows: out.length };
}
