// Cyber incidents from EuRepoC (../adapters/eurepoc.ts), counted for the map view (/internet/cyber-operations), its
// panel and the country pages. An incident counts once for each country it affected, in the year it started.
//
// Attributions are kept as EuRepoC records them, all of them: an incident attributed to two states counts for both,
// and each row says who attributed it (government, IT-security firms, a claim by the group…). A state and the
// state-affiliated groups EuRepoC links to it are separate rows; only attributions to a state itself make the
// state → country pairs (arcs and the pairs table). An incident attributed to neither counts for the kinds of
// non-state group it was attributed to (hacktivists, criminals), never for a country; one with no attribution is
// "Not attributed". The words for all of this are in src/i18n/cyber.en.ts.
import { type Basis, type Cyber, type Group, type Incident, eurepoc } from '../adapters/eurepoc.ts';
import { type Series, put } from '../adapters/core.ts';
import { shared } from './data.ts';

export const cyberData = shared(eurepoc);

/** What an incident counts as, for one row of a breakdown: a state (place id), groups EuRepoC links to a state, a kind
 *  of non-state group, an attribution naming none of these, or no attribution. */
export type Who = { state: string } | { affiliated: string } | { group: Group } | { other: true } | { none: true };

export interface Counted { who: Who; bases: Set<Basis> }

/** The rows an incident counts in: each state and each state's affiliated groups it was attributed to; failing those,
 *  each kind of group; failing that "other" when it was attributed at all, else "none". With who attributed each. */
export function whoOf(inc: Incident): Counted[] {
  const states = new Map<string, Set<Basis>>();
  const affiliated = new Map<string, Set<Basis>>();
  const groups = new Map<Group, Set<Basis>>();
  const other = new Set<Basis>();
  const add = <K>(m: Map<K, Set<Basis>>, k: K, b: Basis) => m.set(k, (m.get(k) ?? new Set<Basis>()).add(b));
  for (const a of inc.attributions) {
    if (a.kind === 'none') continue;
    if (a.states.length) for (const s of a.states) add(a.kind === 'state' ? states : affiliated, s, a.basis);
    else if (a.group) add(groups, a.group, a.basis);
    else other.add(a.basis);
  }
  if (states.size || affiliated.size) {
    return [...[...states].map(([state, bases]) => ({ who: { state }, bases })), ...[...affiliated].map(([s, bases]) => ({ who: { affiliated: s }, bases }))];
  }
  if (groups.size) return [...groups].map(([group, bases]) => ({ who: { group }, bases }));
  if (other.size) return [{ who: { other: true }, bases: other }];
  return [{ who: { none: true }, bases: new Set() }];
}

/** A row of a breakdown: how many incidents, and who attributed them (an incident with several attributions counts
 *  once for each who). */
export interface Tally { who: Who; n: number; by: Partial<Record<Basis, number>> }

/** The place a row is about, for state and state-affiliated rows. */
export const placeOf = (w: Who) => ('state' in w ? w.state : 'affiliated' in w ? w.affiliated : null);
const keyOf = (w: Who) => ('state' in w ? `s:${w.state}` : 'affiliated' in w ? `a:${w.affiliated}` : 'group' in w ? `g:${w.group}` : 'other' in w ? 'other' : 'none');
const order = (w: Who) => ('state' in w ? 0 : 'affiliated' in w ? 1 : 'group' in w ? 2 : 'other' in w ? 3 : 4);

function tally(items: Counted[]): Tally[] {
  const out = new Map<string, Tally>();
  for (const x of items) {
    const k = keyOf(x.who);
    const t = out.get(k) ?? { who: x.who, n: 0, by: {} };
    t.n++;
    for (const b of x.bases) t.by[b] = (t.by[b] ?? 0) + 1;
    out.set(k, t);
  }
  // States first, then state-affiliated groups, each largest first; then groups; then other; "Not attributed" last.
  return [...out.values()].sort((a, b) => order(a.who) - order(b.who) || b.n - a.n);
}

const inYear = (c: Cyber, year: number) => c.incidents.filter((i) => i.year === year);

/** Incidents affecting each country, by the year they started: the map's measure. */
export function cyberSeries(c: Cyber): Series {
  const out: Series = {};
  for (const i of c.incidents) if (i.year !== null) for (const r of i.receivers) put(out, r, i.year, 1, true);
  return out;
}

/** Every incident that started in the year, whatever it affected (some affected only regions or unknown places). */
export const yearTotal = (c: Cyber, year: number) => inYear(c, year).length;

/** Incidents in the file, and those without a start date, which no year (and so no map) can show. */
export const undated = (c: Cyber) => ({ all: c.incidents.length, undated: c.incidents.filter((i) => i.year === null).length });

/** The year's incidents by attribution, for the summary: to a state; else to state-affiliated groups; else only to
 *  non-state groups; else other; else none. */
export function yearSplit(c: Cyber, year: number): { state: number; affiliated: number; group: number; other: number; none: number } {
  const out = { state: 0, affiliated: 0, group: 0, other: 0, none: 0 };
  for (const i of inYear(c, year)) {
    const ws = whoOf(i).map((x) => x.who);
    const w = ws.find((x) => 'state' in x) ?? ws[0];
    out['state' in w ? 'state' : 'affiliated' in w ? 'affiliated' : 'group' in w ? 'group' : 'other' in w ? 'other' : 'none']++;
  }
  return out;
}

/** Incidents affecting a country in the year, by who they were attributed to. */
export const affecting = (c: Cyber, id: string, year: number): Tally[] =>
  tally(inYear(c, year).filter((i) => i.receivers.includes(id)).flatMap(whoOf));

/** Incidents attributed to a state (or, with `affiliated`, to groups EuRepoC links to it) in the year, by the country
 *  affected (one incident counts for each). The rows' `who` is the country affected. */
export function attributedTo(c: Cyber, id: string, year: number, affiliated = false): Tally[] {
  const items = inYear(c, year).flatMap((i) => {
    const mine = whoOf(i).find((x) => (affiliated ? 'affiliated' in x.who && x.who.affiliated === id : 'state' in x.who && x.who.state === id));
    return mine ? i.receivers.map((r) => ({ ...mine, who: { state: r } })) : [];
  });
  return tally(items);
}

export interface Pair { from: string; to: string; n: number; by: Partial<Record<Basis, number>> }

/** State → affected country pairs in the year, largest first: attributions to a state itself only (not to
 *  state-affiliated groups), each incident once for each pair it makes. A state's own country is included; the arcs
 *  and the pairs table leave it out (`ownState`). */
export function pairs(c: Cyber, year: number): Pair[] {
  const out = new Map<string, Pair>();
  for (const i of inYear(c, year)) {
    for (const x of whoOf(i)) {
      if (!('state' in x.who)) continue;
      for (const to of i.receivers) {
        const k = `${x.who.state}>${to}`;
        const p = out.get(k) ?? { from: x.who.state, to, n: 0, by: {} };
        p.n++;
        for (const b of x.bases) p.by[b] = (p.by[b] ?? 0) + 1;
        out.set(k, p);
      }
    }
  }
  return [...out.values()].sort((a, b) => b.n - a.n || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** A pair whose state is the country affected (Serbia → Serbia): an operation at home. */
export const ownState = (p: { from: string; to: string }) => p.from === p.to;

/** Incidents affecting a country from a year on, for the country page. */
export const since = (c: Cyber, id: string, from: number) => c.incidents.filter((i) => i.year !== null && i.year >= from && i.receivers.includes(id)).length;

/** Who attributed them, most first: [basis, incidents]. */
export const basesOf = (by: Partial<Record<Basis, number>>) => (Object.entries(by) as [Basis, number][]).sort((a, b) => b[1] - a[1]);
