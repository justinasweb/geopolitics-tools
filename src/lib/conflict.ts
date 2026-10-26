// The conflict view (/conflict), from UCDP's event data (../adapters/ucdp.ts), worked out once: the months the slider
// steps through (numbered year × 12 + month − 1, so they run on without gaps), each month's events and deaths by
// kind of violence, and deaths by country and by conflict over the 12 months to each month. The page template, the
// layer file and the share image all read this.
import { ged, type ConflictEvent, type Violence } from '../adapters/ucdp.ts';
import { shared } from './data.ts';

const events = shared(ged);

/** Class edges for deaths over 12 months: 25 is UCDP's threshold for an armed conflict, 1,000 for a war. */
export const DEATH_EDGES = [25, 1000, 10_000, 50_000];
export const VIOLENCE: Violence[] = [1, 2, 3];

export const monthNumber = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
export const monthCode = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;

export interface CountryRow {
  id: string;
  /** Deaths over the 12 months to the month (UCDP's best estimates). */
  deaths: number;
  civilians: number;
  events: number;
  /** Deaths in the month itself. */
  month: number;
}
export interface ConflictRow { id: number; name: string; deaths: number; places: string[]; type: Violence }

export interface ConflictMonth {
  n: number;
  code: string;
  /** From a Candidate release: preliminary. */
  preliminary: boolean;
  events: ConflictEvent[];
  deaths: Record<Violence, number>;
  /** Over the 12 months to this one; fewer when the data start later. */
  deaths12: number;
  civilians12: number;
  months12: number;
  rows: CountryRow[];
  conflicts: ConflictRow[];
}

export interface ConflictPage {
  months: ConflictMonth[];
  /** The latest month. */
  month: number;
  byMonth: Record<number, ConflictMonth>;
  /** Events whose country UCDP gives but the place table does not match (none expected). */
  unplaced: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function build(all: ConflictEvent[]): ConflictPage | null {
  if (!all.length) return null;
  const first = monthNumber(all[0].month);
  const last = monthNumber(all.at(-1)!.month);
  const inMonth = new Map<number, ConflictEvent[]>();
  for (const e of all) {
    const n = monthNumber(e.month);
    inMonth.set(n, [...(inMonth.get(n) ?? []), e]);
  }
  const months: ConflictMonth[] = [];
  for (let n = first; n <= last; n++) {
    const evs = inMonth.get(n) ?? [];
    const window: ConflictEvent[] = [];
    for (let k = Math.max(first, n - 11); k <= n; k++) window.push(...(inMonth.get(k) ?? []));
    const byPlace = new Map<string, CountryRow>();
    for (const e of window) {
      if (!e.place) continue;
      const r = byPlace.get(e.place) ?? { id: e.place, deaths: 0, civilians: 0, events: 0, month: 0 };
      r.deaths += e.deaths;
      r.civilians += e.civilians;
      r.events += 1;
      if (monthNumber(e.month) === n) r.month += e.deaths;
      byPlace.set(e.place, r);
    }
    const byConflict = new Map<number, ConflictRow>();
    for (const e of window) {
      const k = e.conflictId || -e.id;
      const c = byConflict.get(k) ?? { id: k, name: e.conflict, deaths: 0, places: [], type: e.type };
      c.deaths += e.deaths;
      if (e.place && !c.places.includes(e.place)) c.places.push(e.place);
      byConflict.set(k, c);
    }
    months.push({
      n, code: monthCode(n), preliminary: evs.some((e) => e.candidate), events: evs,
      deaths: { 1: sum(evs.filter((e) => e.type === 1).map((e) => e.deaths)), 2: sum(evs.filter((e) => e.type === 2).map((e) => e.deaths)), 3: sum(evs.filter((e) => e.type === 3).map((e) => e.deaths)) },
      deaths12: sum(window.map((e) => e.deaths)), civilians12: sum(window.map((e) => e.civilians)), months12: Math.min(12, n - first + 1),
      rows: [...byPlace.values()].filter((r) => r.deaths > 0).sort((a, b) => b.deaths - a.deaths || a.id.localeCompare(b.id)),
      conflicts: [...byConflict.values()].filter((c) => c.deaths > 0).sort((a, b) => b.deaths - a.deaths),
    });
  }
  return { months, month: last, byMonth: Object.fromEntries(months.map((m) => [m.n, m])), unplaced: all.filter((e) => !e.place).length };
}

let cache: ConflictPage | null | undefined;
export function conflictPage(): ConflictPage | null {
  if (cache === undefined) cache = build(events() ?? []);
  return cache;
}

/** The colour class of a country's deaths over 12 months, 1–5. */
export const deathClass = (v: number) => 1 + DEATH_EDGES.filter((e) => v >= e).length;

/** Events within a cell of `deg` degrees in a month, added up, largest first: the map's marks. */
export function cells(evs: ConflictEvent[], type: Violence, deg = 1): { lat: number; lon: number; deaths: number; events: number; conflict: string }[] {
  const by = new Map<string, { w: number; lat: number; lon: number; deaths: number; events: number; byConflict: Map<string, number> }>();
  for (const e of evs) {
    if (e.type !== type) continue;
    const k = `${Math.floor(e.lat / deg)},${Math.floor(e.lon / deg)}`;
    const c = by.get(k) ?? { w: 0, lat: 0, lon: 0, deaths: 0, events: 0, byConflict: new Map() };
    // The mark sits at the middle of the cell's events, weighted by deaths.
    const w = e.deaths + 1;
    c.w += w;
    c.lat += e.lat * w;
    c.lon += e.lon * w;
    c.deaths += e.deaths;
    c.events += 1;
    c.byConflict.set(e.conflict, (c.byConflict.get(e.conflict) ?? 0) + e.deaths + 0.001);
    by.set(k, c);
  }
  return [...by.values()].map((c) => ({ lat: c.lat / c.w, lon: c.lon / c.w, deaths: c.deaths, events: c.events, conflict: [...c.byConflict].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.deaths - a.deaths);
}
