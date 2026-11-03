// Cyber incidents from EuRepoC (../adapters/eurepoc.ts), counted for the map view (/internet/cyber-operations), its
// panel and the country pages. An incident counts once for each country it affected, in the year it started.
//
// Attributions are kept as EuRepoC records them, all of them: an incident attributed to two states counts for both,
// and each state's count says who attributed it (government, IT-security firms, the actor itself…). An incident
// attributed only to non-state groups counts for their kind (hacktivists, criminals), never for a state; one with no
// attribution is "Not attributed". The words for all of this are in src/i18n/cyber.en.ts.
import { type Basis, type Cyber, type Group, type Incident, eurepoc } from '../adapters/eurepoc.ts';
import { type Series, put } from '../adapters/core.ts';
import { shared } from './data.ts';

export const cyberData = shared(eurepoc);

/** What an incident counts as, for one row of a breakdown: a state (place id), a kind of non-state group, an
 *  attribution naming neither, or no attribution. */
export type Who = { state: string } | { group: Group } | { other: true } | { none: true };

/** The rows an incident counts in: each state it was attributed to; failing that each kind of group; failing that
 *  "other" when it was attributed at all, else "none". With who attributed each, and whether the state attribution
 *  was only to state-affiliated groups. */
export function whoOf(inc: Incident): { who: Who; bases: Set<Basis>; affiliatedOnly?: boolean }[] {
  const states = new Map<string, { bases: Set<Basis>; direct: boolean }>();
  const groups = new Map<Group, Set<Basis>>();
  const other = new Set<Basis>();
  for (const a of inc.attributions) {
    if (a.kind === 'none') continue;
    if (a.states.length) {
      for (const s of a.states) {
        const x = states.get(s) ?? { bases: new Set<Basis>(), direct: false };
        x.bases.add(a.basis);
        x.direct ||= a.kind === 'state';
        states.set(s, x);
      }
    } else if (a.group) groups.set(a.group, (groups.get(a.group) ?? new Set<Basis>()).add(a.basis));
    else other.add(a.basis);
  }
  if (states.size) return [...states].map(([state, x]) => ({ who: { state }, bases: x.bases, affiliatedOnly: !x.direct }));
  if (groups.size) return [...groups].map(([group, bases]) => ({ who: { group }, bases }));
  if (other.size) return [{ who: { other: true }, bases: other }];
  return [{ who: { none: true }, bases: new Set() }];
}

/** A row of a breakdown: how many incidents, who attributed them (an incident with several attributions counts once
 *  for each who), and how many were attributed to state-affiliated groups only. */
export interface Tally { who: Who; n: number; by: Partial<Record<Basis, number>>; affiliated: number }

const keyOf = (w: Who) => ('state' in w ? `s:${w.state}` : 'group' in w ? `g:${w.group}` : 'other' in w ? 'other' : 'none');

function tally(items: { who: Who; bases: Set<Basis>; affiliatedOnly?: boolean }[]): Tally[] {
  const out = new Map<string, Tally>();
  for (const x of items) {
    const k = keyOf(x.who);
    const t = out.get(k) ?? { who: x.who, n: 0, by: {}, affiliated: 0 };
    t.n++;
    if (x.affiliatedOnly) t.affiliated++;
    for (const b of x.bases) t.by[b] = (t.by[b] ?? 0) + 1;
    out.set(k, t);
  }
  // States first, largest first; then groups; then other; "Not attributed" last.
  const rank = (w: Who) => ('state' in w ? 0 : 'group' in w ? 1 : 'other' in w ? 2 : 3);
  return [...out.values()].sort((a, b) => rank(a.who) - rank(b.who) || b.n - a.n);
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

/** The year's incidents by attribution, for the summary: to states, only to non-state groups, other, none. */
export function yearSplit(c: Cyber, year: number): { state: number; group: number; other: number; none: number } {
  const out = { state: 0, group: 0, other: 0, none: 0 };
  for (const i of inYear(c, year)) {
    const w = whoOf(i)[0].who;
    out['state' in w ? 'state' : 'group' in w ? 'group' : 'other' in w ? 'other' : 'none']++;
  }
  return out;
}

/** Incidents affecting a country in the year, by who they were attributed to. */
export const affecting = (c: Cyber, id: string, year: number): Tally[] =>
  tally(inYear(c, year).filter((i) => i.receivers.includes(id)).flatMap(whoOf));

/** Incidents attributed to a state in the year, by the country they affected (one incident counts for each). */
export function attributedTo(c: Cyber, id: string, year: number): Tally[] {
  const items = inYear(c, year).flatMap((i) => {
    const mine = whoOf(i).find((x) => 'state' in x.who && x.who.state === id);
    return mine ? i.receivers.map((r) => ({ ...mine, who: { state: r } })) : [];
  });
  return tally(items);
}

export interface Pair { from: string; to: string; n: number; by: Partial<Record<Basis, number>> }

/** State → affected country pairs in the year, largest first: each incident counts once for each pair it makes. */
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

/** Incidents affecting a country from a year on, for the country page. */
export const since = (c: Cyber, id: string, from: number) => c.incidents.filter((i) => i.year !== null && i.year >= from && i.receivers.includes(id)).length;

/** Who attributed them, most first: [basis, incidents]. */
export const basesOf = (by: Partial<Record<Basis, number>>) => (Object.entries(by) as [Basis, number][]).sort((a, b) => b[1] - a[1]);
