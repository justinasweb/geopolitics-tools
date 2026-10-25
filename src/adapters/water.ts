// Water stress (aqueduct/rankings_baseline.csv, rankings_future.csv), dependency on water from
// abroad (aquastat/water_resources.csv) and large dams (gdw/dams.csv); all imported.
// Baseline water stress (bws) is the share of available surface and ground water withdrawn each
// year: category 0 low (under 10%) to 4 extremely high (over 80%); score 0–5.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, matcher, num } from './core.ts';

export interface Stress { score: number | null; cat: number | null; label: string; future: Record<number, { score: number | null; cat: number | null; label: string }> }

/** Aqueduct writes -9999 (and other negatives) for "no data". */
const score = (v: string) => { const n = num(v); return n !== null && n >= 0 ? n : null; };

export function parseAqueduct(baseline: string, future: string): Record<string, Stress> {
  const m = matcher('aqueduct', 'iso3');
  const out: Record<string, Stress> = {};
  for (const r of csvRecords(baseline)) {
    if (r.indicator_name !== 'bws' || r.weight !== 'Tot') continue;
    const id = m.match(r.gid_0);
    if (id) out[id] = { score: score(r.score), cat: score(r.cat), label: r.label, future: {} };
  }
  for (const r of csvRecords(future)) {
    if (r.indicator_name !== 'bws' || r.weight !== 'Tot' || r.scenario !== 'bau') continue;
    const id = m.match(r.gid_0);
    if (id && out[id]) out[id].future[Number(r.year)] = { score: score(r.score), cat: score(r.cat), label: r.label };
  }
  return out;
}

export interface Resources { dependency: number | null; perPerson: number | null; year: number | null }

export function parseAquastat(text: string): Record<string, Resources> {
  const m = matcher('aquastat', 'iso3');
  const out: Record<string, Resources> = {};
  const perYear: Record<string, number> = {};
  for (const r of csvRecords(text)) {
    const id = m.match(r.ISO3);
    if (!id) continue;
    const c = (out[id] ??= { dependency: null, perPerson: null, year: null });
    const y = num(r.Year) ?? 0;
    // Each variable's latest year wins; the file is not always in year order.
    if (r.Variable === 'Dependency ratio' && num(r.Value) !== null && y >= (c.year ?? 0)) { c.dependency = num(r.Value); c.year = y; }
    if (r.Variable === 'Total renewable water resources per capita' && num(r.Value) !== null && y >= (perYear[id] ?? 0)) { c.perPerson = num(r.Value); perYear[id] = y; }
  }
  return out;
}

export interface Dam { id: string; name: string; river: string; basin: string; place: string | null; year: number | null; height: number | null; capacity: number | null; use: string; lon: number | null; lat: number | null; status: string }

export function parseDams(text: string): Dam[] {
  const m = matcher('gdw', 'iso3');
  return csvRecords(text).map((r) => ({
    id: r.GRAND_ID, name: r.DAM_NAME, river: r.RIVER, basin: r.MAIN_BASIN, place: m.match(r.ISO3), year: num(r.YEAR),
    height: num(r.DAM_HGT_M), capacity: num(r.CAP_MCM), use: r.MAIN_USE, lon: num(r.LONG_DD), lat: num(r.LAT_DD), status: r.STATUS || 'Operating',
  }));
}

export const water = (raw: Raw) => ({
  stress: parseAqueduct(raw.text('aqueduct', 'rankings_baseline.csv'), raw.text('aqueduct', 'rankings_future.csv')),
  resources: parseAquastat(raw.text('aquastat', 'water_resources.csv')),
  dams: parseDams(raw.text('gdw', 'dams.csv')),
});
