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
  caveat: 'Publicly known incidents that EuRepoC coded from public reports. Many operations are never disclosed or attributed, so countries that report more show more. Counts compare documented incidents, not how often a country is targeted.',
  attribution: 'Attributions are as EuRepoC records them, each with who made it: a government, IT-security firms, the media or the actors themselves. An incident can have several, and all are shown. Groups EuRepoC codes as state-affiliated count for their state; other non-state groups are shown by their kind.',
  // The panel: incidents affecting the country, by who they were attributed to.
  affecting: (year: number) => `Attributions, ${year}`,
  affectingCaption: 'Incidents affecting the country that started in the year, by who they were attributed to and who attributed them. An incident attributed to two states counts for each.',
  toState: (state: string) => `Attributed to ${state}`,
  toGroup: (g: Group) => `Attributed to ${GROUP_TEXT[g]}`,
  other: 'Attributed, with no state or group named',
  none: 'Not attributed',
  /** "by IT-security firms or researchers (6) and the affected country’s government (5)". */
  by: (parts: [Basis, number][]) => `by ${list(parts.map(([b, n]) => `${BASIS_TEXT[b]} (${n})`))}`,
  affiliated: (n: number, all: boolean) => (all ? 'all to state-affiliated groups' : `${n} to state-affiliated groups`),
  more: (n: number) => `and ${n} more`,
  // The panel: incidents attributed to the country, by the country affected.
  attributedTo: (state: string, year: number) => `Incidents attributed to ${state}, ${year}`,
  attributedCaption: 'By the country affected; an incident affecting several countries counts for each. Includes groups EuRepoC codes as state-affiliated.',
  // Arcs and the table under the map.
  arcs: 'Incidents attributed to a state, to the country affected',
  arcTip: (state: string, to: string, n: string, year: number, by: string) => `${to}: ${n} ${n === '1' ? 'incident' : 'incidents'} attributed to ${state}, ${year}, ${by}`,
  pairs: 'Attributions to states',
  pairsCaption: (n: number, year: number) => `The ${n} state and country pairs with the most incidents that started in ${year}: incidents affecting the country that EuRepoC records as attributed to the state, and who attributed them. Includes groups EuRepoC codes as state-affiliated.`,
  state: 'Attributed to', country: 'Country affected', incidents: 'Incidents',
  /** The summary: the year's incidents by attribution. */
  split: (s: { state: string; group: string; none: string }) => `Of these, ${s.state} were attributed to a state or a state-affiliated group, ${s.group} only to non-state groups, and ${s.none} were not attributed.`,
  // The country page's block under More figures.
  block: 'Cyber incidents',
  blockCaption: (name: string, from: number, to: number) => `publicly known incidents affecting ${name}, ${from}–${to}`,
  blockNone: (name: string, from: number, to: number) => `No publicly known incidents affecting ${name} in EuRepoC’s dataset, ${from}–${to}.`,
  blockNote: 'Counts compare documented incidents, not how often a country is targeted.',
  blockLink: 'Who they were attributed to',
};
