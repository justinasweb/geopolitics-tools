// Epoch AI (epoch/gpu_clusters.csv, epoch/notable_ai_models.csv; CC BY). Columns are matched
// loosely, since Epoch adds and renames them. Countries come as names or ISO alpha-3 codes; a model
// from labs in two countries counts once for each. Ported from the prototype's src/adapters/ai.js.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The first non-empty value among columns named like any of `names`. */
export function pick(row: Record<string, string>, ...names: string[]): string | null {
  for (const n of names) {
    const k = Object.keys(row).find((key) => squash(key) === squash(n));
    if (k && row[k].trim() !== '') return row[k].trim();
  }
  return null;
}

/** Places in a country cell: one name or code, or several separated by commas or semicolons. */
export function countriesIn(cell: string | null): string[] {
  const c = cell?.trim();
  if (!c) return [];
  const iso3 = matcher('epoch', 'iso3');
  const name = matcher('epoch', 'name');
  const one = (s: string) => (/^[A-Z]{3}$/.test(s) ? iso3.match(s) : name.match(s));
  if (!/[,;]/.test(c)) return [one(c)].filter((id): id is string => !!id);
  // A whole cell first, so a name with a comma in it ("Korea, Republic of") is not split.
  const whole = name.lookup(c);
  if (whole !== undefined) return whole ? [whole] : [];
  return [...new Set(c.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map(one).filter((id): id is string => !!id))];
}

export interface Cluster { name: string; owner: string; place: string; location: string; lat: number | null; lon: number | null; start: string; year: number; h100e: number; mw: number | null; sector: string; planned: boolean }

export function parseGpuClusters(text: string): Cluster[] {
  const out: Cluster[] = [];
  for (const r of csvRecords(text)) {
    const start = (pick(r, 'First Operational Date', 'First operational', 'Operational date') ?? '').slice(0, 7);
    const year = Number(start.slice(0, 4));
    const [place] = countriesIn(pick(r, 'Country', 'Country code'));
    if (!place || !year) continue;
    out.push({
      name: pick(r, 'Name', 'Cluster name') ?? '', owner: pick(r, 'Owner', 'Owners') ?? '', place, location: pick(r, 'Location', 'City') ?? '',
      lat: num(pick(r, 'Latitude')), lon: num(pick(r, 'Longitude')), start, year,
      h100e: num(pick(r, 'H100 equivalents', 'H100e', 'H100 equivalent')) ?? 0, mw: num(pick(r, 'Power Capacity (MW)', 'Power (MW)', 'Power capacity')),
      sector: pick(r, 'Sector') ?? '', planned: /planned|decommission/i.test(pick(r, 'Status') ?? ''),
    });
  }
  return out;
}

/** Notable models by country and publication year. */
export function parseNotableModels(text: string): Series {
  const out: Series = {};
  for (const r of csvRecords(text)) {
    const y = Number((pick(r, 'Publication date', 'Date') ?? '').slice(0, 4));
    if (!y) continue;
    for (const id of countriesIn(pick(r, 'Country (of organization)', 'Country'))) put(out, id, y, 1, true);
  }
  return out;
}

/** Computing power (H100 equivalents) of clusters working by the end of `year`, by country. */
export function computeAt(clusters: Cluster[], year: number): { by: Record<string, number>; total: number } {
  const by: Record<string, number> = {};
  let total = 0;
  for (const c of clusters) {
    if (c.planned || c.year > year) continue;
    by[c.place] = (by[c.place] ?? 0) + c.h100e;
    total += c.h100e;
  }
  return { by, total };
}

export const ai = (raw: Raw) => {
  const clusters = parseGpuClusters(raw.text('epoch', 'gpu_clusters.csv'));
  return { clusters, models: parseNotableModels(raw.text('epoch', 'notable_ai_models.csv')), lastYear: Math.max(0, ...clusters.filter((c) => !c.planned).map((c) => c.year)) };
};
