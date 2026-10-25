// English words for the blocs views (/blocs, /blocs/{bloc}): the groupings, what each is in one line, and the page
// and panel words. Same rules as pages.en.ts: templates take figures already formatted and return plain sentences,
// and a sentence whose figure is missing is left out. Bloc names are in map.en.ts (BLOC_TEXT).
import { list } from './pages.en.ts';

const BLOC_COUNT = 19;

/** What each grouping is, in one plain line: its full name, its kind and when it began. */
export const BLOC_ABOUT: Record<string, string> = {
  brics: 'A grouping of large emerging economies. Brazil, Russia, India and China held the first summit in 2009; South Africa joined in 2010, and five more countries in 2024 and 2025.',
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

/** A grouping's name inside a sentence, with "the" where English uses it. */
const THE = new Set(['g7', 'g20', 'eu', 'oecd', 'sco', 'unsc-p5', 'quad', 'csto', 'eaeu', 'cis']);
export const blocIn = (id: string, name: string) => (THE.has(id) ? `the ${id === 'unsc-p5' ? 'UN Security Council’s permanent members' : name}` : name);

/** Names in a list of groupings, where the full name has a comma. */
export const BLOC_SHORT: Record<string, string> = { 'unsc-p5': 'UN Security Council (permanent)' };

/** Notes on single memberships, by bloc: where the table's yes or no needs a line. */
export const MEMBER_NOTES: Record<string, Record<string, string>> = {
  csto: { ARM: 'Armenia froze its participation in 2024 but has not left.' },
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
  sub: (n: number) => `${n} members`,
  title: (bloc: string) => bloc,
  // The answer under the title.
  lede: (bloc: string, n: number, pop: string | null, gdp: string | null, year: number | null) =>
    `${bloc} has ${n} members${pop && gdp ? `, with ${pop} of the world’s people and ${gdp} of its GDP in ${year}` : ''}.`,
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
  allBlocLine: (bloc: string, n: number) => `${bloc} has ${n} members.`,
  overlapLine: (other: string, k: number, n: number, bloc: string) => (k ? `${k} of the ${n} ${other} members are also in ${bloc}.` : `No ${other} member is in ${bloc}.`),
  sharesLabel: 'Share of the world',
  sharesCaption: 'Members’ combined share, latest year with figures',
  mineralsLabel: 'Share of world mine production',
  mineralsCaption: 'Minerals where members mine at least 1%, USGS',
  have: (k: number, n: number) => `${k} of ${n} members have a figure`,
  overlapsLabel: 'Members shared with other groupings',
  sharedNote: (names: string[]) => list(names),
  shareRow: (year: number) => `${year}`,
  otherBlocs: 'Its other groupings',
  itsBlocs: 'Its groupings',
  weightLabel: 'Its share of the grouping',
  weightCaption: 'Of the members’ combined total',
  history: 'Membership history',
  // The tables.
  summary: 'Summary',
  members: 'Members',
  membersCaption: (bloc: string, date: string) => `Every member of ${bloc}, most populous first, as of ${date}.`,
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
  dossier: 'Full dossier',
  allLink: 'All groupings on one map',
  sameView: 'Another grouping',
  notes: 'Notes',
  source: 'Membership: the groupings’ own member lists',
  shareSources: 'World Bank; Global Carbon Budget; FAOSTAT; USGS',
  summaryShares: (bloc: string, parts: string[]) => `${bloc}’s members account for ${list(parts)}.`,
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

