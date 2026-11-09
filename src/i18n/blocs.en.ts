// English words for the blocs views (/blocs, /blocs/{bloc}): the groupings, what each is in one line, and the page
// and panel words. Same rules as pages.en.ts: templates take figures already formatted and return plain sentences,
// and a sentence whose figure is missing is left out. Bloc names are in map.en.ts (BLOC_TEXT).
import { list } from './pages.en.ts';
import { NON_COUNTRY_MEMBERS, mapNote, membersText, othersText, todaysMembers } from './members.en.ts';

const BLOC_COUNT = 19;

/** What each grouping is, in one plain line: its full name, its kind and when it began. */
export const BLOC_ABOUT: Record<string, string> = {
  brics: 'A grouping of large emerging economies. Brazil, Russia, India and China held the first summit in 2009; South Africa joined in 2011, and six more countries in 2024 and 2025.',
  g7: 'The Group of Seven: a forum of seven large advanced economies, meeting since 1975. The European Union also takes part.',
  g20: 'The Group of Twenty: a forum of major economies, founded in 1999, with leaders’ summits since 2008. The European Union and the African Union are members too; the map shows the 19 countries.',
  eu: 'The European Union: a political and economic union of 27 countries, founded in 1993 on the communities set up in the 1950s.',
  nato: 'The North Atlantic Treaty Organization: a military alliance founded in 1949, whose members commit to defend each other.',
  opec: 'The Organization of the Petroleum Exporting Countries: oil producers that coordinate their output, founded in 1960.',
  'opec-plus': 'OPEC’s members and ten other oil producers that have coordinated their output since 2016.',
  asean: 'The Association of Southeast Asian Nations: a regional organisation founded in 1967.',
  sco: 'The Shanghai Cooperation Organisation: a security and economic organisation founded in 2001.',
  oecd: 'The Organisation for Economic Co-operation and Development: an organisation of mostly high-income countries, founded in 1961.',
  apec: 'Asia-Pacific Economic Cooperation: a forum of 21 Pacific Rim economies, founded in 1989. Hong Kong and Taiwan take part as economies.',
  rcep: 'The Regional Comprehensive Economic Partnership: a trade agreement among 15 Asia-Pacific countries, in force since 2022.',
  'unsc-p5': 'The five permanent members of the UN Security Council, each able to veto its resolutions.',
  quad: 'The Quadrilateral Security Dialogue: a security partnership of four countries, begun in 2007 and revived in 2017.',
  aukus: 'A security partnership of Australia, the United Kingdom and the United States, announced in 2021.',
  usmca: 'The United States–Mexico–Canada Agreement: a trade agreement in force since 2020.',
  csto: 'The Collective Security Treaty Organization: a military alliance of former Soviet states, based on a 1992 treaty.',
  eaeu: 'The Eurasian Economic Union: an economic union of former Soviet states, in force since 2015.',
  cis: 'The Commonwealth of Independent States: an organisation of former Soviet states, founded in 1991.',
};

/** Groupings whose first years belong to a predecessor under another name: what they began as, what they became and
 *  when, and the founders' names as they were then (the map draws today's borders). */
export const BEGAN_AS: Record<string, { as: string; became: string; year: number; names?: Record<string, string> }> = {
  eu: { as: 'the European Economic Community', became: 'the European Union', year: 1993, names: { DEU: 'West Germany' } },
  sco: { as: 'the Shanghai Five', became: 'the Shanghai Cooperation Organisation', year: 2001 },
  csto: { as: 'the Collective Security Treaty', became: 'the Collective Security Treaty Organization', year: 2002 },
  brics: { as: 'BRIC', became: 'BRICS', year: 2011 },
  g7: { as: 'a summit of six countries', became: 'the G7', year: 1976, names: { DEU: 'West Germany' } },
};

/** A grouping's name inside a sentence, with "the" where English uses it. */
const THE = new Set(['g7', 'g20', 'eu', 'oecd', 'sco', 'unsc-p5', 'quad', 'csto', 'eaeu', 'cis']);
export const blocIn = (id: string, name: string) => (THE.has(id) ? `the ${id === 'unsc-p5' ? 'UN Security Council’s permanent members' : name}` : name);

/** Names in a list of groupings, where the full name has a comma. */
export const BLOC_SHORT: Record<string, string> = { 'unsc-p5': 'UN Security Council (permanent)' };

/** Notes on single memberships, by bloc: where the table's yes or no needs a line. */
export const MEMBER_NOTES: Record<string, Record<string, string>> = {
  csto: { ARM: 'Armenia froze its participation in 2024 but has not left.' },
  brics: { SAU: 'Listed by BRICS as a member; Saudi Arabia has not confirmed it.' },
};

/** The measures a bloc's share of the world is given on. */
export const MEASURE_TEXT: Record<string, string> = {
  population: 'Population', gdp: 'GDP', milusd: 'Military spending', co2: 'CO2 emissions',
  wheatprod: 'Wheat production', maizeprod: 'Maize production', riceprod: 'Rice production', soyprod: 'Soybean production',
};

export const BLOCS_TEXT = {
  section: 'Blocs',
  hub: 'Power and alliances',
  pickerLabel: 'Grouping',
  all: 'All groupings',
  allTitle: 'Blocs and alliances',
  allSub: 'how many each country belongs to',
  sub: (id: string, n: number) => membersText(id, n),
  title: (bloc: string) => bloc,
  // The answer under the title.
  lede: (id: string, bloc: string, n: number, pop: string | null, gdp: string | null, year: number | null) => (NON_COUNTRY_MEMBERS[id]
    ? `${bloc} members: ${membersText(id, n)}.${pop && gdp ? ` Together, ${todaysMembers(bloc)} had ${pop} of the world’s people and ${gdp} of its GDP in ${year}.` : ''}`
    : `${bloc} has ${n} members${pop && gdp ? `; together, ${todaysMembers(bloc)} had ${pop} of the world’s people and ${gdp} of its GDP in ${year}` : ''}.`),
  allLede: (n: number, top: string[], k: number) => `${n} countries and territories belong to at least one of these ${BLOC_COUNT} groupings; ${list(top)} belong to the most, ${k} each.`,
  description: (bloc: string) => `${bloc}: its members on a map, their combined share of the world’s people, GDP, military spending and production, and the other groupings they belong to.`,
  allDescription: `Nineteen groupings and alliances on one map: how many each country belongs to, and each grouping’s members and share of the world.`,
  checked: (date: string) => `Members as of ${date}`,
  // The map.
  legendMember: 'Member',
  member: 'Member',
  notMember: 'Not a member',
  memberOf: (n: number) => `${n} grouping${n === 1 ? '' : 's'}`,
  countLegend: 'Groupings each country belongs to, of 19',
  countTicks: ['1', '2–3', '4–5', '6–7', '8+'],
  none: 'In none of them',
  mapLabel: (bloc: string, names: string) => `World map: members of ${bloc}: ${names}. The same list is in the table below.`,
  allMapLabel: (top: string) => `World map: how many of 19 groupings each country belongs to. ${top}. The same figures are in the table below.`,
  // The panel.
  membership: 'Membership',
  groupings: 'Groupings',
  ranking: 'Most groupings',
  weightPop: (share: string) => `${share} of the members’ people`,
  weightPopLabel: 'Share of members’ people',
  allBlocLine: (id: string, bloc: string, n: number) => (NON_COUNTRY_MEMBERS[id] ? `${bloc} members: ${membersText(id, n)}.` : `${bloc} has ${n} members.`),
  overlapLine: (otherId: string, other: string, k: number, n: number, bloc: string) => {
    const noun = NON_COUNTRY_MEMBERS[otherId] ? ['member countries', 'member country'] : ['members', 'member'];
    return k ? `${k} of the ${n} ${other} ${noun[0]} ${k === 1 ? 'is' : 'are'} also in ${bloc}.` : `No ${other} ${noun[1]} is in ${bloc}.`;
  },
  /** The panel's count: "Members", or "Member countries" with what else belongs. */
  countLabel: (id: string) => (NON_COUNTRY_MEMBERS[id] ? 'Member countries' : 'Members'),
  countMore: (id: string, year?: number) => othersText(id, year),
  mapNote,
  sharesLabel: 'Share of the world',
  sharesCaption: (id: string) => `Combined share of today’s ${NON_COUNTRY_MEMBERS[id] ? 'member countries' : 'members'}, latest year with figures`,
  mineralsLabel: 'Share of world mine production',
  mineralsCaption: 'Minerals where members mine at least 1%, USGS',
  have: (id: string, k: number, n: number) => `${k} of ${n} ${NON_COUNTRY_MEMBERS[id] ? 'member countries' : 'members'} have a figure`,
  overlapsLabel: 'Members shared with other groupings',
  sharedNote: (names: string[]) => list(names),
  shareRow: (year: number) => `${year}`,
  otherBlocs: 'Its other groupings',
  itsBlocs: 'Its groupings',
  weightLabel: 'Its share of the grouping',
  weightCaption: 'Of the members’ combined total',
  history: 'Membership history',
  historyNote: (bloc: string) => `Who joined and left ${bloc}, year by year`,
  // The tables.
  summary: 'Summary',
  members: 'Members',
  membersCaption: (id: string, bloc: string, date: string) => (NON_COUNTRY_MEMBERS[id]
    ? `Every member country of ${bloc}, most populous first, as of ${date}. Also members: ${othersText(id).replace(/^(plus|with) /, '')}.`
    : `Every member of ${bloc}, most populous first, as of ${date}.`),
  /** Under the table of every grouping: the groupings whose count is of countries only. */
  allTableNote: (rows: { bloc: string; text: string }[]) => `${rows.map((r) => `${r.bloc}: ${r.text}.`).join(' ')} The counts and shares are of countries only.`,
  allTable: 'Every grouping',
  allCaption: (date: string) => `Members and combined share of the world’s people and GDP, as of ${date}.`,
  countryTable: 'Every country in at least one grouping',
  countryCaption: 'How many of the 19 groupings each country belongs to, and which.',
  country: 'Country',
  bloc: 'Grouping',
  nMembers: 'Members',
  which: 'Which',
  population: 'Population',
  gdp: 'GDP',
  shareOfBloc: 'Share of the grouping',
  ofWorld: 'Share of the world',
  related: 'Related',
  countryPage: 'Country page',
  allLink: 'All groupings on one map',
  sameView: 'Another grouping',
  notes: 'Notes',
  source: 'Membership: the groupings’ own member lists',
  shareSources: 'World Bank; Global Carbon Budget; FAOSTAT; USGS',
  summaryShares: (bloc: string, parts: string[]) => `${todaysMembers(bloc, { start: true })} account for ${list(parts)}.`,
  /** The share image's caption under the bloc's bars. */
  imageCaption: (id: string, bloc: string, n: number) => (NON_COUNTRY_MEMBERS[id]
    ? `${membersText(id, n)}. Shares of the world: ${todaysMembers(bloc, { count: n })}`
    : `Shares of the world: ${todaysMembers(bloc, { count: n })}`),
  sharePart: (share: string, what: string, year: number) => `${share} of the world’s ${what} (${year})`,
  summaryMinerals: (parts: string[]) => `Together they mine ${list(parts)}.`,
  mineralPart: (share: string, mineral: string) => `${share} of the world’s ${mineral}`,
  summaryOverlap: (parts: string[]) => `Of its members, ${list(parts)}.`,
  overlapPart: (n: number, other: string, first: boolean) => `${n} ${first ? `${n === 1 ? 'is' : 'are'} also in` : 'in'} ${other}`,
  allSummary: (n: number) => `The ${n} groupings range from defence alliances to trade agreements and forums; membership means different things in each.`,
  scope: 'Membership is as each grouping lists it. A grouping’s share of the world adds up its members’ figures, against the sum for every country with a figure.',
};

/** Lowercase measure names inside a sentence. */
export const MEASURE_IN: Record<string, string> = {
  population: 'people', gdp: 'GDP', milusd: 'military spending', co2: 'CO2 emissions',
  wheatprod: 'wheat', maizeprod: 'maize', riceprod: 'rice', soyprod: 'soybeans',
};


/** Changes that are not joins or exits, by grouping and year: hand-written, from the groupings' own histories. */
export const HISTORY_EVENTS: Record<string, Record<number, string>> = {
  nato: {
    1955: 'West Germany joined. Countries are drawn on today’s borders, so it appears as Germany.',
    1966: 'France left NATO’s integrated military command; it stayed a member of the alliance.',
    1990: 'Germany reunified, and the former East Germany became part of NATO with it.',
    2009: 'France returned to the integrated military command.',
  },
  eu: {
    1958: 'The European Economic Community began. The European Union was founded on it in 1993.',
    1973: 'Denmark, Ireland and the United Kingdom joined.',
    1990: 'Germany reunified, and the former East Germany became part of the community with it.',
    1993: 'The Maastricht Treaty came into force, founding the European Union.',
    2016: 'The United Kingdom voted to leave in a referendum.',
    2020: 'The United Kingdom left on 31 January.',
  },
  g7: {
    1975: 'France, West Germany, Italy, Japan, the United Kingdom and the United States held the first summit.',
    1998: 'With Russia, the group met as the G8.',
    2014: 'The other members suspended their participation in the G8 in March 2014, and the group met as the G7 again.',
  },
  g20: {
    1999: 'Finance ministers and central bank governors first met as the G20.',
    2008: 'Leaders held the first G20 summit.',
    2023: 'The African Union became a member; it is not a country, so it is not on the map.',
  },
  brics: {
    2009: 'Brazil, Russia, India and China held the first summit.',
    2011: 'South Africa joined, invited in December 2010.',
    2024: 'Egypt, Ethiopia, Iran, Saudi Arabia and the United Arab Emirates joined. Saudi Arabia is listed by BRICS as a member; it has not confirmed it.',
    2025: 'Indonesia joined.',
  },
  sco: {
    1996: 'China, Kazakhstan, Kyrgyzstan, Russia and Tajikistan first met as the Shanghai Five.',
    2001: 'The Shanghai Cooperation Organisation was founded, with Uzbekistan joining.',
  },
  asean: { 2025: 'Timor-Leste was admitted.' },
  opec: {
    2016: 'Indonesia rejoined in January and suspended its membership again in November.',
    2024: 'Angola left.',
    2026: 'The United Arab Emirates left OPEC and OPEC+ on 1 May 2026, as it announced on 28 April 2026.',
  },
  csto: {
    1992: 'The Collective Security Treaty was signed.',
    1999: 'Azerbaijan, Georgia and Uzbekistan did not renew the treaty.',
    2002: 'The treaty’s members founded the Collective Security Treaty Organization.',
    2012: 'Uzbekistan suspended its membership.',
    2024: 'Armenia froze its participation; it has not left.',
  },
  quad: {
    2008: 'Australia withdrew, and the four countries stopped meeting.',
    2017: 'The four countries revived the dialogue.',
  },
  oecd: { 1961: 'The OECD replaced the Organisation for European Economic Co-operation.' },
};

export const HISTORY_TEXT = {
  section: 'Alliance history',
  pickerLabel: 'Grouping',
  title: (bloc: string) => `${bloc}: membership history`,
  sub: (from: number, to: number) => `${from}–${to}`,
  /** How the grouping began, with its first members, then its members in the last year. A grouping that began under
   *  another name says so (BEGAN_AS); a count with members that are not countries says so (membersText). */
  lede: (o: { id: string; bloc: string; first: number; n0: number; founders: string[]; became: string[]; n: number; last: number; changes: number }) => {
    const b = BEGAN_AS[o.id];
    const start = b
      ? `${o.bloc} began in ${o.first} as ${b.as} (${o.founders.join(', ')}) and became ${b.became} in ${b.year}${o.became.length ? `, when ${list(o.became)} joined` : ''}.`
      : `${o.bloc} began in ${o.first} with ${membersText(o.id, o.n0, o.first)}.`;
    return `${start} In ${o.last} it had ${membersText(o.id, o.n, o.last)}; membership changed in ${o.changes} year${o.changes === 1 ? '' : 's'}.`;
  },
  description: (bloc: string, from: number) => `${bloc} membership year by year since ${from}: who joined, who left, on a map with a timeline.`,
  status: { joined: 'Joined that year', member: 'Member', left: 'Left that year', former: 'Former member' } as Record<string, string>,
  notMember: 'Not a member',
  legend: (y: number) => `Membership, ${y}`,
  since: (span: string) => `Member ${span}`,
  membership: 'Membership',
  spans: 'Membership years',
  members: 'Members',
  joined: 'Joined',
  left: 'Left',
  note: 'Note',
  changesIn: (y: number) => `Changes in ${y}`,
  noChange: 'No one joined or left.',
  timeline: 'Timeline',
  timelineCaption: (bloc: string) => `Every year in which a country joined or left ${bloc}, with notes on other changes.`,
  everTable: 'Every country that has been a member',
  everCaption: 'Years of membership; a dash after a year means it is still a member.',
  year: 'Year',
  country: 'Country',
  count: 'Members',
  mapLabel: (bloc: string, y: number, n: number) => `World map: members of ${bloc} in ${y}, ${n} countries. The timeline below lists every change.`,
  /** The share image's caption: the period, and the count in the last year when it is not countries alone. */
  imageCaption: (id: string, from: number, to: number, n: number) => (NON_COUNTRY_MEMBERS[id] ? `${from}–${to}. In ${to}: ${membersText(id, n, to)}` : `${from}–${to}`),
  caveat: 'Countries are drawn on today’s borders. Years are those of accession or exit as the grouping records them; a year is not the exact date.',
  source: 'The groupings’ own member lists and histories',
  blocLine: (other: string, k: number, n: number, bloc: string, y: number) => (k ? `${k} of ${todaysMembers(other, { count: n })} were in ${bloc} in ${y}.` : `None of ${todaysMembers(other)} were in ${bloc} in ${y}.`),
  today: 'Members today',
  history: 'Membership history',
};
