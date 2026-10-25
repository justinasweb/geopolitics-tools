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
  caption: (unit: string, est: boolean, world: string) => `${unit} of mine production, as USGS reports it.${est ? ' e: USGS estimate.' : ''}${world ? ` ${world}` : ''}`,
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
  total: (world: string, unit: string, mineral: string, year: number, change: string | null, estimated: boolean) =>
    `The world mined about ${world} ${unit} of ${mineral} in ${year}${change ? `, ${change}` : ''}${estimated ? ', according to USGS estimates' : ', according to USGS'}.`,
  changeIn: (pct: string, more: boolean, prev: number) => `${pct} ${more ? 'more' : 'less'} than in ${prev}`,
  top: (parts: string[], together: string | null) => `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}${together ? `; together they mined ${together}` : ''}.`,
  topPart: (name: string, value: string, unit: string, share: string, first: boolean) => `${name} ${first ? 'mined ' : ''}${value} ${unit} (${share})`,
  follow: (names: string[], shares: string[]) => `${names.join(' and ')} follow${names.length === 1 ? 's' : ''} with ${shares.join(' and ')}.`,
  withheldSentence: (names: string, mineral: string, many: boolean) => `${names} also mine${many ? '' : 's'} ${mineral}, but USGS withholds the figure${many ? 's' : ''} to protect company data, so ${many ? 'they are' : 'it is'} not in the world total.`,
  scope: (mineral: string) => `These figures say where ${mineral} is mined; refining and trade are not covered here.`,
  bloc: (bloc: string, share: string, mineral: string, year: number) => `${bloc} members mined ${share} of the world’s ${mineral} in ${year}.`,
  blocNone: (bloc: string, mineral: string, year: number) => `No ${bloc} member is listed as mining ${mineral} in ${year}.`,
  blocWithheld: (names: string) => `Not counted: ${names}, withheld by source.`,
  citation: (edition: number, mineral: string, years: string, url: string, version: string) =>
    `U.S. Geological Survey (${edition}). Mineral Commodity Summaries ${edition}: ${mineral}, world mine production, ${years}. Retrieved via ${url}, data version ${version}.`,
  shareOf: (name: string, mineral: string) => `${possessive(name)} share of world ${mineral} mine production`,
};
