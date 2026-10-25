// The blocs views (/blocs, /blocs/{bloc}), worked out once per page from the membership table (./blocs.ts) and the
// indicator registry: each bloc's members, its combined share of the world on measures that add up (people, GDP,
// military spending, CO2, the four crops) and of each mineral's mine production, and the blocs it shares members
// with. /blocs maps how many of the groupings each country belongs to. The page template, the map layer files and
// the share images all read this.
import { BLOC_ORDER, blocs } from './blocs.ts';
import { indicator } from './data.ts';
import { defaultYear, ranking } from './stats.ts';
import { listed, mineralPages } from './minerals.ts';
import { place } from './places.ts';

/** Measures that add up across countries, so a bloc's members have a share of the world. */
export const SHARE_MEASURES = ['population', 'gdp', 'milusd', 'co2', 'wheatprod', 'maizeprod', 'riceprod', 'soyprod'];
/** Membership counts' class edges on /blocs: 1, 2–3, 4–5, 6–7, 8+. */
export const COUNT_EDGES = [2, 4, 6, 8];
export const countClass = (n: number) => 1 + COUNT_EDGES.filter((e) => n >= e).length;

export interface BlocShare {
  /** Registry measure id, or "mineral:{id}". */
  id: string;
  share: number;
  year: number;
  /** Members with a figure, of all members. */
  have: number;
  of: number;
}

export interface BlocPage {
  id: string;
  members: string[];
  /** Members, most populous first. */
  byPopulation: string[];
  shares: BlocShare[];
  /** Minerals where the members mine at least 1% of the world, largest share first. */
  minerals: BlocShare[];
  /** Other blocs with members in common: [bloc, shared members], most shared first. */
  overlaps: { id: string; shared: string[] }[];
}

const nameOf = (id: string) => place(id)?.name ?? id;

/** A measure's latest usual year, every country's figure (a year back where the latest is missing), and the world sum. */
const measureCache = new Map<string, { year: number; by: Map<string, number>; world: number } | null>();
function measure(id: string) {
  if (measureCache.has(id)) return measureCache.get(id)!;
  const l = indicator(id);
  const year = l ? defaultYear(l) : undefined;
  let out = null;
  if (l && year !== undefined) {
    const rows = ranking(l, year, 1);
    out = { year, by: new Map(rows.map((r) => [r.id, r.value])), world: rows.reduce((s, r) => s + r.value, 0) };
  }
  measureCache.set(id, out);
  return out;
}

/** The members' combined share of the world on a measure that adds up, or null without data. */
export function shareOn(id: string, members: string[]): BlocShare | null {
  const m = measure(id);
  if (!m || !m.world) return null;
  const have = members.filter((x) => m.by.has(x));
  if (!have.length) return null;
  return { id, share: have.reduce((s, x) => s + m.by.get(x)!, 0) / m.world, year: m.year, have: have.length, of: members.length };
}

/** A member's own share of the bloc's total on a measure (its weight inside the bloc). */
export function weightIn(id: string, place: string, members: string[]): number | null {
  const m = measure(id);
  const v = m?.by.get(place);
  if (!m || v === undefined) return null;
  const total = members.reduce((s, x) => s + (m.by.get(x) ?? 0), 0);
  return total ? v / total : null;
}
export const measureYear = (id: string) => measure(id)?.year ?? null;
export const valueOf = (id: string, place: string) => measure(id)?.by.get(place) ?? null;

function buildPage(id: string, members: string[], all: Map<string, string[]>): BlocPage {
  const pop = measure('population');
  const byPopulation = [...members].sort((a, b) => (pop?.by.get(b) ?? -1) - (pop?.by.get(a) ?? -1) || nameOf(a).localeCompare(nameOf(b)));
  const shares = SHARE_MEASURES.map((m) => shareOn(m, members)).filter((s): s is BlocShare => s !== null);
  const minerals = mineralPages().map((p): BlocShare | null => {
    const l = listed(p.latest).filter((x) => x.place && members.includes(x.place));
    if (!l.length) return null;
    return { id: `mineral:${p.id}`, share: l.reduce((s, x) => s + (x.share ?? 0), 0), year: p.latest.year, have: l.length, of: members.length };
  }).filter((s): s is BlocShare => s !== null && s.share >= 0.01).sort((a, b) => b.share - a.share);
  const overlaps = [...all].filter(([b]) => b !== id).map(([b, m]) => ({ id: b, shared: m.filter((x) => members.includes(x)) }))
    .filter((o) => o.shared.length).sort((a, b) => b.shared.length - a.shared.length || BLOC_ORDER.indexOf(a.id) - BLOC_ORDER.indexOf(b.id));
  return { id, members, byPopulation, shares, minerals, overlaps };
}

let cache: BlocPage[] | null = null;
/** Every bloc's page, in BLOC_ORDER. */
export function blocPages(): BlocPage[] {
  if (cache) return cache;
  const all = blocs();
  cache = [...all].map(([id, m]) => buildPage(id, m, all));
  return cache;
}
export const blocPage = (id: string) => blocPages().find((p) => p.id === id);

/** The blocs a place belongs to, in BLOC_ORDER. */
export function blocsOf(id: string): string[] {
  return [...blocs()].filter(([, m]) => m.includes(id)).map(([b]) => b);
}

/** Every place in at least one bloc, with its count, most first. */
export function membershipCounts(): { id: string; n: number }[] {
  const c = new Map<string, number>();
  for (const m of blocs().values()) for (const x of m) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || nameOf(a.id).localeCompare(nameOf(b.id)));
}
