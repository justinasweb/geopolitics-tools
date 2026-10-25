// English words for the map engine and the map view pages: controls, legend, tooltip, panel, phone map, the bloc
// names, and the sentence templates of the critical minerals view. Same rules as pages.en.ts: templates take
// figures already formatted and return plain sentences, plain verbs, no adjectives that judge, and a sentence whose
// figure is missing is left out. Another language is another file with the same keys.
import { possessive } from './pages.en.ts';

/** Bloc names: the short form people use. */
export const BLOC_TEXT: Record<string, string> = {
  brics: 'BRICS', g7: 'G7', g20: 'G20', eu: 'European Union', nato: 'NATO', opec: 'OPEC', 'opec-plus': 'OPEC+',
  asean: 'ASEAN', sco: 'SCO', oecd: 'OECD', apec: 'APEC', rcep: 'RCEP', 'unsc-p5': 'UN Security Council, permanent members',
  quad: 'Quad', aukus: 'AUKUS', usmca: 'USMCA', csto: 'CSTO', eaeu: 'Eurasian Economic Union', cis: 'CIS',
};

/** Interface words shared by every map, sent to the browser with each layer file. */
export const MAP_TEXT = {
  outline: 'Outline a bloc',
  noBloc: 'No bloc',
  removeBloc: (bloc: string) => `Remove the ${bloc} outline`,
  members: (n: number) => `${n} members`,
  zoom: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: 'Reset view',
  showMap: 'Show map',
  closeMap: 'Close map',
  closeFilters: 'Close filters',
  filters: 'Filters',
  reset2: 'Reset',
  showResults: 'Show results',
  loading: 'Loading the map…',
  failed: 'The map could not load.',
  retry: 'Try again',
  seeTable: 'See the table',
  clickHint: 'Click for details',
  tapHint: 'Tap for details',
  close: 'Back to the world',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  inTable: 'Show in the table',
  world: 'World',
  /** Read by screen readers when the map takes focus. */
  keys: 'Map. Arrow keys move the map, plus and minus zoom, N and P step through the countries with data, Enter opens the one shown, Escape clears the selection.',
  withheldBy: 'Withheld by source',
  howBorders: 'How we treat borders',
  panel: 'Map details',
  borders: 'Borders show de facto control, as drawn by Natural Earth; disputed lines are dashed. Boundaries do not imply endorsement.',
  disputed: 'Disputed boundary',
  note: 'Note',
  rank: (rank: number, of: number) => `${rank} of ${of} listed`,
  selected: (name: string) => `${name} selected`,
  cleared: 'Selection cleared, world overview shown',
  yearShown: (year: number) => `Showing ${year}`,
  movedYear: (want: number, got: number) => `${want} is not in this source; showing ${got}, the nearest year it has.`,
};

/** "is", or "are" after a plural name ("rare earths"). */
const are = (name: string) => (/s$/.test(name) ? 'are' : 'is');

/** The critical minerals views (/minerals/{mineral}). */
export const MINERALS_VIEW = {
  section: 'Critical minerals',
  hub: 'Resources',
  sub: 'mine production',
  mineral: 'Mineral',
  /** The page title when there is a finding. */
  title: (mineral: string) => `${mineral}: who mines it`,
  lede: (top: string, share: string, mineral: string, top3?: string) =>
    `${top} mines ${share} of the world’s ${mineral}${top3 ? `; the top three countries mine ${top3}` : ''}.`,
  description: (mineral: string, year: number) => `Who mines ${mineral}: world mine production by country in ${year}, with shares, concentration and the figures by year, from USGS.`,
  figures: (year: number, estimated: boolean) => `${year} figures${estimated ? ', estimated' : ''}`,
  years: (years: number[], estimated: number[]) => {
    const w = years.map((y) => (estimated.includes(y) ? `${y} (estimated)` : String(y)));
    return w.length > 2 ? `${w[0]}–${w.at(-1)}` : w.join(' and ');
  },
  worldLabel: 'World mine production',
  change: (pct: string, more: boolean, prev: number, prevValue: string) => `${pct} ${more ? 'more' : 'less'} than ${prev} (${prevValue})`,
  sameAs: (prev: number) => `Same as ${prev}`,
  concentration: 'Concentration',
  conc: { low: 'Unconcentrated', moderate: 'Moderately concentrated', high: 'Highly concentrated' } as Record<string, string>,
  concNote: (hhi: string) => `Herfindahl index ${hhi} on country shares; 1,000 to 1,800 counts as moderately and above 1,800 as highly concentrated (2023 US merger guidelines).`,
  howMeasured: 'How we measure',
  producers: 'Producers, share of world total',
  producersLabel: (mineral: string, year: number) => `Producers by share of world ${mineral} mine production, ${year}`,
  other: 'Other countries',
  withheld: 'Withheld',
  withheldBy: 'Withheld by source',
  withheldWhy: (mineral: string) => `USGS does not publish this country’s ${mineral} output, to protect company data. It is not in the world total.`,
  notListed: (year: number) => `No production listed for ${year}`,
  notListedLegend: 'No production listed',
  legendTitle: (year: number) => `Share of world mine production, ${year}`,
  ticks: ['under 1%', '1–5%', '5–10%', '10–25%', '25%+'],
  measure: 'of world mine production',
  shareLabel: 'Share of world mine production',
  prevYear: (year: number, value: string, share: string) => `${year}: ${value} (${share})`,
  caveat: 'USGS reports where minerals are mined, not who refines or buys them; refining is often more concentrated.',
  mapLabel: (mineral: string, year: number, top: string) => `World map: share of world ${mineral} mine production, ${year}. ${top}. The same figures are in the table below.`,
  summary: 'Summary',
  all: 'All producers',
  tableLabel: (mineral: string) => `${mineral} mine production by country`,
  caption: (unit: string, basis: string | null, est: boolean, world: string, revisions: string | null) =>
    `${unit}${basis ? ` (${basis})` : ''} of mine production, as USGS reports it.${est ? ' e: USGS estimate.' : ''}${world ? ` ${world}` : ''}${revisions ? ` USGS notes: ${revisions}` : ''}`,
  notes: 'Notes from USGS',
  noteYear: (year: number, note: string) => `${year}: ${note}`,
  estTitle: 'USGS estimate',
  worldRow: 'World',
  worldExcludes: (names: string, parts: string) => `World totals exclude ${names}: ${parts}.`,
  country: 'Country',
  share: 'Share',
  change2: 'Change',
  related: 'Related',
  sameView: 'Same view, another mineral',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  unitWord: (kg: boolean) => (kg ? 'Kilograms' : 'Tonnes'),
  /** The summary paragraph. Parts are already formatted. */
  total: (world: string, unit: string, mineral: string, basis: string | null, year: number, change: string | null, estimated: boolean) =>
    `The world mined about ${world} ${unit} of ${mineral}${basis ? ` (${basis})` : ''} in ${year}${change ? `, ${change}` : ''}${estimated ? ', according to USGS estimates' : ', according to USGS'}.`,
  changeIn: (pct: string, more: boolean, prev: number) => `${pct} ${more ? 'more' : 'less'} than in ${prev}`,
  top: (parts: string[], together: string | null) => `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}${together ? `; together they mined ${together}` : ''}.`,
  topPart: (name: string, value: string, unit: string, share: string, first: boolean) => `${name} ${first ? 'mined ' : ''}${value} ${unit} (${share})`,
  follow: (names: string[], shares: string[]) => `${names.join(' and ')} follow${names.length === 1 ? 's' : ''} with ${shares.join(' and ')}.`,
  withheldSentence: (names: string, mineral: string, many: boolean) => `${names} also mine${many ? '' : 's'} ${mineral}, but USGS withholds the figure${many ? 's' : ''} to protect company data, so ${many ? 'they are' : 'it is'} not in the world total.`,
  scope: (mineral: string) => `These figures say where ${mineral} ${are(mineral)} mined; refining and trade are not covered here.`,
  bloc: (bloc: string, share: string, mineral: string, year: number) => `${bloc} members mined ${share} of the world’s ${mineral} in ${year}.`,
  blocNone: (bloc: string, mineral: string, year: number) => `No ${bloc} member is listed as mining ${mineral} in ${year}.`,
  blocWithheld: (names: string) => `Not counted: ${names}, withheld by source.`,
  citation: (edition: number, mineral: string, years: string, url: string, version: string) =>
    `U.S. Geological Survey (${edition}). Mineral Commodity Summaries ${edition}: ${mineral}, world mine production, ${years}. Retrieved via ${url}, data version ${version}.`,
  shareOf: (name: string, mineral: string) => `${possessive(name)} share of world ${mineral} mine production`,
};

/**
 * The minerals view for a mineral USGS counts as primary production rather than mine production: gallium, which is
 * recovered from bauxite and zinc processing, not mined on its own. Only the words that say "mine" change.
 */
const V = MINERALS_VIEW;
export const PRIMARY_VIEW: typeof MINERALS_VIEW = {
  ...V,
  sub: 'primary production',
  title: (mineral: string) => `${mineral}: who produces it`,
  lede: (top: string, share: string, mineral: string, top3?: string) =>
    `${top} produces ${share} of the world’s primary ${mineral}${top3 ? `; the top three countries produce ${top3}` : ''}.`,
  description: (mineral: string, year: number) => `Who produces ${mineral}: world primary production by country in ${year}, with shares, concentration and the figures by year, from USGS.`,
  worldLabel: 'World primary production',
  producersLabel: (mineral: string, year: number) => `Producers by share of world primary ${mineral} production, ${year}`,
  legendTitle: (year: number) => `Share of world primary production, ${year}`,
  measure: 'of world primary production',
  shareLabel: 'Share of world primary production',
  caveat: 'USGS counts primary (low-purity) output, recovered mostly from bauxite and zinc processing; refining to high purity and trade are not covered.',
  mapLabel: (mineral: string, year: number, top: string) => `World map: share of world primary ${mineral} production, ${year}. ${top}. The same figures are in the table below.`,
  tableLabel: (mineral: string) => `${mineral} primary production by country`,
  caption: (unit: string, basis: string | null, est: boolean, world: string, revisions: string | null) =>
    V.caption(unit, basis, est, world, revisions).replace(' of mine production,', ' of primary production,'),
  total: (world: string, unit: string, mineral: string, basis: string | null, year: number, change: string | null, estimated: boolean) =>
    V.total(world, unit, `primary ${mineral}`, basis, year, change, estimated).replace('The world mined', 'The world produced'),
  topPart: (name: string, value: string, unit: string, share: string, first: boolean) => `${name} ${first ? 'produced ' : ''}${value} ${unit} (${share})`,
  top: (parts: string[], together: string | null) => V.top(parts, null).replace(/\.$/, together ? `; together they produced ${together}.` : '.'),
  withheldSentence: (names: string, mineral: string, many: boolean) => `${names} also produce${many ? '' : 's'} ${mineral}, but USGS withholds the figure${many ? 's' : ''} to protect company data, so ${many ? 'they are' : 'it is'} not in the world total.`,
  scope: (mineral: string) => `These figures say where primary ${mineral} ${are(mineral)} produced; refining to high purity and trade are not covered here.`,
  bloc: (bloc: string, share: string, mineral: string, year: number) => `${bloc} members produced ${share} of the world’s primary ${mineral} in ${year}.`,
  blocNone: (bloc: string, mineral: string, year: number) => `No ${bloc} member is listed as producing primary ${mineral} in ${year}.`,
  citation: (edition: number, mineral: string, years: string, url: string, version: string) =>
    V.citation(edition, mineral, years, url, version).replace('world mine production', 'world primary production'),
  shareOf: (name: string, mineral: string) => `${possessive(name)} share of world primary ${mineral} production`,
};

/** The words of a mineral's view, by what USGS measures for it. */
/** Words in a selected place's panel on any map view (src/scripts/map/panel.ts). */
export const PANEL_TEXT = {
  rank: 'Rank',
  rankListed: 'Rank among producers listed',
  rankOf: 'of {of}',
  status: 'Status',
  production: (measure: 'mine' | 'primary') => (measure === 'primary' ? 'Primary production' : 'Mine production'),
  shareTrend: (measure: 'mine' | 'primary') => `Share of world ${measure === 'primary' ? 'primary' : 'mine'} production, {from}–{to}`,
  trendCaption: '{first} in {from}; {last} in {to}.',
  producers: 'Producers listed, {year}',
  ranking: 'Ranking, {year}',
  otherMinerals: 'Its share of other minerals',
  otherMineralsCaption: 'Share of world production, latest year USGS lists',
  rankNote: (rank: number, of: number) => `${rank} of ${of} listed`,
  otherMeasures: 'On the other measures',
  otherMeasuresCaption: 'Latest year shown on each map',
  share: 'Share',
  figureTrend: (label: string) => `${label}, {from}–{to}`,
  fledTo: (year: string) => `Main countries of asylum, ${year}`,
  cameFrom: (year: string) => `Main countries of origin, ${year}`,
  partnersCaption: 'Refugees and others in need of international protection, as UNHCR counts them',
  ofTotal: (share: string) => `${share} of the total`,
  morePartners: (n: number) => `and ${n} more`,
};

export const mineralText = (measure: 'mine' | 'primary') => (measure === 'primary' ? PRIMARY_VIEW : MINERALS_VIEW);
