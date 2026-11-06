// English words for the cyber incidents view (src/lib/cyber.ts): who incidents were attributed to and by whom, in the
// panel, the arcs and the table. Same rules as pages.en.ts, plus this view's own: an attribution is always said as
// "attributed to {state} by {who}", never as fact ("attacked", "hacked by", "attacker"); every attribution EuRepoC
// records is shown; non-state groups are named by their kind, not their country; no ranking words.
import type { Basis, Group, Version } from '../adapters/eurepoc.ts';
import { formatDate } from '../lib/format.ts';
import { list } from './pages.en.ts';

/** Who made an attribution, to follow "by". */
export const BASIS_TEXT: Record<Basis, string> = {
  government: 'the affected country’s government',
  receiver: 'the affected organisation',
  security: 'IT-security firms or researchers',
  self: 'the actor itself',
  media: 'media reports',
  thirdparty: 'another government or third party',
  eu: 'an EU body',
  io: 'an international organisation',
  contested: 'sources EuRepoC codes as contested',
  unstated: 'a source EuRepoC does not name',
};

export const GROUP_TEXT: Record<Group, string> = {
  hacktivist: 'hacktivists', criminal: 'criminal groups', terrorist: 'terrorist groups', private: 'private firms or hackers for hire',
  ethnic: 'ethnic groups', religious: 'religious groups', individual: 'individual hackers', other: 'other non-state groups',
};

export const CYBER_TEXT = {
  /** The credit, with the dataset version EuRepoC published. */
  credit: (v: Version | null) => `EuRepoC Global Dataset of Cyber Incidents${v ? ` ${v.version} (${formatDate(v.published)})` : ''}, CC BY-NC 4.0`,
  caveat: 'Publicly known incidents that EuRepoC coded from public reports. Many operations are never disclosed or attributed. Differences in public reporting and attribution affect the counts. Counts compare documented incidents, not how often a country is targeted.',
  attribution: 'Attributions are as EuRepoC records them, each with who made it: a government, IT-security firms, the media, or a claim by the actor itself. An incident can have several, and all are shown. Groups EuRepoC codes as state-affiliated have their own rows, apart from the state it links them to, and are not in the state arcs or the pairs table; other non-state groups are shown by their kind.',
  /** The method note: incidents without a start date cannot be placed in a year. */
  method: (all: string, undated: string) => `EuRepoC’s file has ${all} incidents; ${undated} have no start date, so they are left off the map.`,
  // The panel: incidents affecting the country, by who they were attributed to.
  affecting: (year: number) => `Attributions, ${year}`,
  affectingCaption: 'Incidents affecting the country that started in the year, by who they were attributed to and who attributed them. An incident with several attributions counts in each row.',
  toState: (state: string) => `Attributed to ${state}`,
  toAffiliated: (state: string) => `State-affiliated groups (EuRepoC links them to ${state})`,
  /** A state named for its own country (Serbia → Serbia). */
  ownState: (name: string) => `${name} (own state)`,
  toGroup: (g: Group) => `Attributed to ${GROUP_TEXT[g]}`,
  other: 'Attributed, with no state or group named',
  none: 'Not attributed',
  /** "by IT-security firms or researchers (6) and the affected country’s government (5)"; a claim by the actor (a
   *  group or a state agency) is said as one, never as an attribution: "claimed by the actor itself (11)". */
  by: (parts: [Basis, number][]) => {
    const others = parts.filter(([b]) => b !== 'self');
    const claimed = parts.find(([b]) => b === 'self');
    return [others.length ? `by ${list(others.map(([b, n]) => `${BASIS_TEXT[b]} (${n})`))}` : '', claimed ? `claimed by the actor itself (${claimed[1]})` : ''].filter(Boolean).join('; ');
  },
  more: (n: number) => `and ${n} more`,
  // The panel: incidents attributed to the country, by the country affected.
  attributedTo: (state: string, year: number) => `Incidents attributed to ${state}, ${year}`,
  attributedCaption: 'By the country affected; an incident affecting several countries counts for each. Groups EuRepoC links to the state are counted apart.',
  affiliatedTo: (state: string, year: number) => `Incidents attributed to groups EuRepoC links to ${state}, ${year}`,
  affiliatedCaption: 'Groups EuRepoC codes as state-affiliated: non-state groups whose link to the state is suggested. By the country affected.',
  // Arcs and the table under the map.
  arcs: 'Incidents attributed to a state, to the country affected',
  arcTip: (state: string, to: string, n: string, year: number, by: string) => `${to}: ${n} ${n === '1' ? 'incident' : 'incidents'} attributed to ${state}, ${year} (${by})`,
  pairs: 'Attributions to states',
  pairsCaption: (n: number, year: number) => `${n === 1 ? 'The state and country pair' : `The ${n} state and country pairs`} with the most incidents that started in ${year}: incidents affecting the country that EuRepoC records as attributed to the state, and who attributed them. Groups EuRepoC codes as state-affiliated, and a state’s incidents in its own country, are left out.`,
  state: 'Attributed to', country: 'Country affected', incidents: 'Incidents',
  /** The summary: the year's incidents by attribution. */
  split: (s: { state: number; affiliated: number; group: number; none: number }, f: (n: number) => string) =>
    `Of these, ${f(s.state)} ${s.state === 1 ? 'was' : 'were'} attributed to a state, ${f(s.affiliated)} only to groups EuRepoC links to a state, ${f(s.group)} only to other non-state groups, and ${f(s.none)} ${s.none === 1 ? 'was' : 'were'} not attributed.`,
  // The country page's block under More figures.
  block: 'Cyber incidents',
  blockCaption: (name: string, from: number, to: number) => `publicly known incidents affecting ${name}, ${from}–${to}`,
  blockNone: (name: string, from: number, to: number) => `No publicly known incidents affecting ${name} in EuRepoC’s dataset, ${from}–${to}.`,
  blockNote: 'Counts compare documented incidents, not how often a country is targeted.',
  blockLink: 'Who they were attributed to',
};
