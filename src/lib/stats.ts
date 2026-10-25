// Rankings, the default year and coverage, the same way on every page (spec, "Rules the rebuild keeps"):
// compare one common period by default; "latest available" may reach back two years, always labelled with its
// year; rank by the number shown; say how many places reported.
import type { Loaded } from '../data/indicators.ts';
import { place } from './places.ts';

/** Places that are ranked and counted: countries and territories, not former states or Antarctica. */
export const ranked = (id: string) => {
  const k = place(id)?.kind;
  return k === 'country' || k === 'territory';
};

export interface Row { id: string; value: number; year: number; rank: number }

/** How many ranked places have a value in each year, projections excluded. */
export function counts(l: Loaded): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, s] of Object.entries(l.values)) {
    if (!ranked(id)) continue;
    for (const y of Object.keys(s).map(Number)) {
      if (l.indicator.projectedAfter !== undefined && y > l.indicator.projectedAfter) continue;
      out.set(y, (out.get(y) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * The common year pages compare by default: the latest year whose coverage has reached the source's usual level
 * (at least 80% of the best year among the five before it). Later years with fewer reports are preliminary.
 */
export function defaultYear(l: Loaded): number | undefined {
  if (l.indicator.static) return l.years.at(-1);
  const c = counts(l);
  const years = [...c.keys()].sort((a, b) => a - b);
  for (let i = years.length - 1; i >= 0; i--) {
    const y = years[i];
    const before = years.filter((x) => x < y && x >= y - 5).map((x) => c.get(x)!);
    const usual = before.length ? Math.max(...before) : c.get(y)!;
    if (c.get(y)! >= 0.8 * usual) return y;
  }
  return years.at(-1);
}

/** Years after the default year that some places have already reported. */
export const preliminaryYears = (l: Loaded) => {
  const d = defaultYear(l);
  return d === undefined || l.indicator.static ? [] : [...counts(l).keys()].filter((y) => y > d).sort((a, b) => a - b);
};

/** Competition ranking (1, 2, 2, 4) by value, largest first. */
function rankRows(rows: Omit<Row, 'rank'>[]): Row[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  let prev: number | null = null;
  let rank = 0;
  return sorted.map((r, i) => {
    if (r.value !== prev) { rank = i + 1; prev = r.value; }
    return { ...r, rank };
  });
}

/** Every ranked place with a value in `year`; with `fallback`, a missing year falls back up to that many years. */
export function ranking(l: Loaded, year: number, fallback = 0): Row[] {
  const rows: Omit<Row, 'rank'>[] = [];
  for (const [id, s] of Object.entries(l.values)) {
    if (!ranked(id)) continue;
    if (l.indicator.static) {
      const [y, v] = Object.entries(s)[0] ?? [];
      if (v !== undefined) rows.push({ id, value: v, year: Number(y) });
      continue;
    }
    for (let y = year; y >= year - fallback; y--) {
      if (s[y] !== undefined) { rows.push({ id, value: s[y], year: y }); break; }
    }
  }
  return rankRows(rows);
}

/** A place's value at the default year (or up to two years before), with its rank among places reporting that year. */
export function figureFor(l: Loaded, id: string): { value: number; year: number; rank: number; of: number } | null {
  const d = defaultYear(l);
  if (d === undefined) return null;
  const s = l.values[id];
  if (!s) return null;
  const years = l.indicator.static ? Object.keys(s).map(Number) : [d, d - 1, d - 2].filter((y) => s[y] !== undefined);
  const year = years[0];
  if (year === undefined) return null;
  const rows = ranking(l, year);
  const row = rows.find((r) => r.id === id);
  return row ? { value: row.value, year, rank: row.rank, of: rows.length } : null;
}

/** The median of the ranked places' values in a year. */
export function median(l: Loaded, year: number): number | null {
  const v = ranking(l, year).map((r) => r.value).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Ranked places with a value in at least one year: the "N countries and territories" in coverage notes. */
export const placesWithData = (l: Loaded) => Object.keys(l.values).filter(ranked).length;

/** Five class breaks for a choropleth: quantiles, rounded to two significant figures. */
export function breaks(values: number[], n = 5): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return [];
  const round = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(2)));
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(round(v[Math.min(v.length - 1, Math.floor((i * v.length) / n))]));
  return [...new Set(out)];
}

/** Which class (0-based) a value falls in. */
export const classOf = (v: number, b: number[]) => b.filter((x) => v >= x).length;
