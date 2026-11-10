// Compare's shared model (D21): what the build knows about every measure (Meta), the few figures, series and
// mineral shares Compare needs from one country (CountryData, one small JSON file per country page), and what two
// countries make together: the key-figure rows both have a figure for, what could not be compared, the charts both
// have a series for and the mineral pairs. The three static pairs (src/lib/compare.ts, at build time) and /compare
// in the browser (src/scripts/compare.ts) both use it, so the two cannot drift. No Node imports.
import type { Format } from '../../data/indicators.ts';

/** The key-figure rows, in order. */
export const MEASURES = ['gdp', 'population', 'gdppc', 'growth', 'inflation', 'reserves', 'milpct', 'milusd', 'armsexp', 'armsimp', 'co2', 'co2pc', 'satellites', 'launches', 'aicompute', 'lex', 'median'];
/** The measures drawn over time, both countries on one scale. */
export const CHARTS = ['gdp', 'milpct'];
/** Series start here. */
export const SERIES_FROM = 2000;
/** A chart needs at least this many shared years after the first. */
export const MIN_SPAN = 2;
/** A mineral is paired when either country has at least this share of world production. */
export const MINERAL_MIN = 0.01;

/** The first and second country: each keeps its colour, marker and line style everywhere (tokens cmp-first, cmp-second). */
export type Side = 'first' | 'second';
export const SIDES: Side[] = ['first', 'second'];
/** Square for the first, triangle for the second, drawn in a 12×12 box. */
export const MARK: Record<Side, string> = { first: '<rect x="2" y="2" width="8" height="8"/>', second: '<path d="M6 1.5 10.8 10H1.2z"/>' };

/** One country's figures, as the build writes them to /compare/data/{slug}.json. */
export interface CountryData {
  id: string;
  slug: string;
  name: string;
  /** Its country page. */
  href?: string;
  /** Latest figure of each measure: [value, year], and its tag when it has one, as on the country page. */
  f: Record<string, Fig>;
  /** Yearly series of the chart measures from SERIES_FROM: [first year, values]. */
  s: Record<string, [number, (number | null)[]]>;
  /** Share of world production, by mineral (any share above zero). */
  m: Record<string, number>;
}

export interface MeasureMeta {
  id: string;
  label: string;
  /** As it reads inside the "Not compared" line. */
  noun: string;
  unit: string;
  format: Format;
  href?: string;
  /** The short credit on a row ("World Bank"), and the source's full name on a chart's source line. */
  credit: string;
  source: string;
}
export interface MineralMeta { id: string; name: string; year: number; estimated: boolean; primary: boolean }
export interface Pair { a: string; b: string; path: string; title: string }

export interface Meta {
  /** The measures with data in this snapshot, in MEASURES order. */
  measures: MeasureMeta[];
  minerals: MineralMeta[];
  mineralSource: string;
  /** The static pairs (indexed pages with share images), by country slug. */
  pairs: Pair[];
  /** Where the country files are: /compare/data/. */
  base: string;
}

/** The static page for a pair, either way round. */
export const staticPair = (pairs: Pair[], a: string, b: string) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

/** The pair in an address: ?a=germany&b=france. */
export function parsePair(q: URLSearchParams): { a: string; b: string } {
  const clean = (v: string | null) => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return { a: clean(q.get('a')), b: clean(q.get('b')) };
}
export const pairQuery = (a: string, b: string) => `a=${encodeURIComponent(a)}${b ? `&b=${encodeURIComponent(b)}` : ''}`;
/** Where a pair is shown: its static page, or `page` (/compare) with the pair in the query. */
export const pairHref = (pairs: Pair[], page: string, a: string, b: string) => staticPair(pairs, a, b)?.path ?? `${page}?${pairQuery(a, b)}`;

/** A figure: value, year and, when it has one, its tag (Estimate, Projection, Preliminary). */
export type Fig = [number, number] | [number, number, 'estimate' | 'projection' | 'preliminary'];

export interface Row {
  m: MeasureMeta;
  f: [Fig, Fig];
  /** The side with the larger value, or -1 when they are equal. */
  higher: -1 | 0 | 1;
}
/** Measures one or both countries have no figure for: `lacks` is the side without one, or null for both. */
export interface Gap { m: MeasureMeta; lacks: 0 | 1 | null }

/** The rows both countries have a figure for, and the rest. */
export function compareRows(meta: Meta, c: [CountryData, CountryData]): { rows: Row[]; gaps: Gap[] } {
  const rows: Row[] = [];
  const gaps: Gap[] = [];
  for (const m of meta.measures) {
    const [x, y] = c.map((d) => d.f[m.id]);
    if (x && y) rows.push({ m, f: [x, y], higher: x[0] === y[0] ? -1 : x[0] > y[0] ? 0 : 1 });
    else gaps.push({ m, lacks: x ? 1 : y ? 0 : null });
  }
  return { rows, gaps };
}

/** The "Not compared" groups: the first country's gaps, the second's, then measures neither has, each with its sources. */
export function gapGroups(gaps: Gap[], c: [CountryData, CountryData]): { name: string | null; items: string[]; sources: string[] }[] {
  return ([0, 1, null] as const).map((lacks) => {
    const ms = gaps.filter((g) => g.lacks === lacks).map((g) => g.m);
    return { name: lacks === null ? null : c[lacks].name, items: ms.map((m) => m.noun), sources: [...new Set(ms.map((m) => m.credit))] };
  }).filter((g) => g.items.length);
}

export interface Chart { m: MeasureMeta; years: number[]; values: [(number | null)[], (number | null)[]] }

/** A chart for each chart measure both countries have a series for, over the years both cover. */
export function compareCharts(meta: Meta, c: [CountryData, CountryData]): Chart[] {
  const out: Chart[] = [];
  for (const id of CHARTS) {
    const m = meta.measures.find((x) => x.id === id);
    const s = c.map((d) => d.s[id]);
    if (!m || !s[0] || !s[1]) continue;
    const ends = s.map(([from, v]) => [from, from + v.length - 1]);
    const from = Math.max(ends[0][0], ends[1][0]);
    const to = Math.min(ends[0][1], ends[1][1]);
    if (to - from < MIN_SPAN) continue;
    const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const values = s.map(([f, v]) => years.map((yr) => v[yr - f] ?? null)) as Chart['values'];
    if (values.some((v) => v.every((x) => x === null))) continue;
    out.push({ m, years, values });
  }
  return out;
}

export interface MineralPair { m: MineralMeta; vals: [number | null, number | null] }

/** Minerals where either has at least MINERAL_MIN of world production, largest first; the other's share however small. */
export function comparePairs(meta: Meta, c: [CountryData, CountryData]): MineralPair[] {
  return meta.minerals
    .filter((m) => c.some((d) => (d.m[m.id] ?? 0) >= MINERAL_MIN))
    .map((m): MineralPair => ({ m, vals: [c[0].m[m.id] ?? null, c[1].m[m.id] ?? null] }))
    .sort((x, y) => Math.max(...y.vals.map((v) => v ?? 0)) - Math.max(...x.vals.map((v) => v ?? 0)));
}
