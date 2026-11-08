// English words for site search (the header, homepage and Atlas box): the groups, the line under each result, the
// empty and no-match states, and the other names a reader might type. Names of the pages themselves come from the
// words their pages use (NAV_TEXT, BLOC_TEXT, INDICATOR_TEXT, the layer files).

export const SEARCH_TEXT = {
  label: 'Search',
  placeholder: 'Search countries, maps, measures, places and blocs',
  button: 'Search',
  close: 'Close search',
  results: 'Search results',
  try: 'Try',
  loading: 'Loading search…',
  failed: 'Search could not load. Try again, or browse the countries and topics.',
  /** The result groups, in the order they are shown when two match equally well. */
  groups: {
    countries: 'Countries', maps: 'Maps', measures: 'Measures', places: 'Places', blocs: 'Blocs', tools: 'Tools', pages: 'Topics and pages',
  } as Record<string, string>,
  /** "6 of 26" in a group's heading, when it shows only the best matches. */
  some: (shown: number | string, all: number | string) => `${shown} of ${all}`,
  /** For screen readers, after each keystroke. */
  count: (n: number | string) => (n === 1 ? '1 result' : `${n.toLocaleString('en')} results`),
  didYouMean: (name: string) => `Showing results for ${name}.`,
  /** Several words that matched nothing together, and the ones searched instead. */
  partial: (q: string, name: string) => `No match for “${q}”. Showing results for ${name}.`,
  none: (q: string) => `Nothing matches “${q}”.`,
  noneHelp: 'Check the spelling, or try a country, a commodity such as wheat, a measure or a bloc.',
  /** A map that is not on the site yet: "Chokepoints aren’t on the site yet." */
  notYet: (what: string) => `${what} aren’t on the site yet.`,
  /** Other names for the maps not on the site yet. */
  notYetNames: { chokepoints: ['chokepoint', 'strait', 'shipping lanes', 'Hormuz', 'Suez', 'Malacca', 'Bosporus', 'Bab el-Mandeb', 'Gibraltar', 'Dover', 'Panama Canal', 'Cape of Good Hope'], ports: ['port', 'harbour', 'harbor', 'shipping'] } as Record<string, string[]>,

  /** The line under each result. */
  dossier: 'Full dossier',
  profile: 'Country profile',
  territory: 'Territory',
  former: 'Former state',
  compare: 'Compare',
  ranking: 'Indicator ranking',
  river: 'Disputed river',
  history: 'Alliance history',
  bloc: 'Grouping',
  member: (country: string) => `${country} is a member`,
  topic: 'Topic',
  explorerView: (view: string) => `Explorer: ${view}`,
  flow: 'Supply chain',
  page: 'Page',
  countriesPage: 'Every country and territory',
  indicatorsPage: 'Every measure, ranked',
  sourcesPage: 'Every source, its licence and refresh',
};

/**
 * Other words for a page, by route key or by "view:<family>" for every page of a map family; matched like its name.
 * Country names in other forms (Burma, Turkey, Ivory Coast) come from the territory table's name codes instead
 * (src/data/places/codes.csv), so the two never disagree.
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  'view:emissions': ['carbon', 'greenhouse gases', 'climate change'],
  'view:food': ['agriculture', 'crops'],
  'view:food:soy-production': ['soy', 'soya'],
  'view:food:soy-use': ['soy', 'soya'],
  'view:food:soy-trade': ['soy', 'soya'],
  'view:food:maize-production': ['corn'],
  'view:food:maize-use': ['corn'],
  'view:food:maize-trade': ['corn'],
  'view:food:potash-production': ['fertiliser', 'fertilizer'],
  'view:food:phosphate-production': ['fertiliser', 'fertilizer'],
  'view:oil': ['petroleum', 'crude'],
  'view:gas': ['lng', 'pipelines'],
  'view:ai': ['semiconductors', 'artificial intelligence'],
  'view:ai:chipimports': ['semiconductors'],
  'view:arms': ['weapons'],
  'view:refugees': ['migration', 'asylum'],
  'view:conflict': ['war', 'fighting'],
  'view:space': ['rockets'],
  'view:internet': ['cyber'],
  'view:nuclear': ['atomic weapons', 'nukes'],
  'view:minerals:rare-earths': ['ree'],
  'view:chinese-lending': ['belt and road', 'bri', 'debt'],
  'view:disasters': ['hazards', 'gdacs'],
  'indicator:milpct': ['defence', 'defense'],
  'indicator:milusd': ['defence', 'defense'],
  'tool:supply-chains:soy': ['soy', 'soya'],
  'tool:supply-chains:maize': ['corn'],
  'tool:supply-chains:chips': ['semiconductors'],
  'tool:dependencies': ['reliance', 'imports'],
  'tool:explorer': ['compare', 'table', 'chart'],
};
