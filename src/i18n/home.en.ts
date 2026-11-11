// The homepage (HomepageOptionC design, spec D19): the hero, the This week strip, Explore by topic, Questions to start
// from, Countries and rankings and the trust strip. The tool row's words are in en.ts (TRAIL_TEXT). Figures come from
// the data; these are the page's own words. Nothing is called popular: there is no traffic data to rank by.

export const HOME_TEXT = {
  /** The <title> (Base adds " | geopolitics.tools") and og:title; og:site_name and the WebSite JSON-LD keep the site name. */
  title: 'Who depends on whom, for what',
  description: 'Who depends on whom, for what: maps and data on resources, trade, security and alliances, each figure with its source and date.',
  headline: 'Who depends on whom, for what.',
  lede: 'Maps and data on resources, trade, security and alliances.',

  search: 'Search a country, commodity or measure',
  try: 'Try',
  /** What a country in the finder is, after its name. */
  kind: { territory: 'Territory' } as Record<string, string>,

  questions: 'Or start with a question',
  rareEarths: {
    q: (name: string) => `Who mines the world’s ${name}?`,
    measure: 'Share of world mine production',
    go: (name: string) => `Open the ${name} map`,
  },
  treasuries: {
    q: 'Who holds US government debt?',
    measure: 'US Treasury securities, by where they are held',
    source: 'US Treasury, TIC',
    month: (m: string) => `end of ${m}`,
    go: (country: string) => `Open the ${country} country page`,
    value: (bn: string) => `$${bn}bn`,
    lead: (country: string, value: string, month: string) => `${country} held the most: ${value} at the end of ${month}.`,
  },
  gas: {
    q: (country: string, supplier: string) => `What share of ${country}’s gas imports comes from ${supplier}?`,
    measure: 'Gas imports by supplier, and imports against use',
    /** Each figure with its own year, source and status: never one tag for the card. */
    lead: (country: string, supplier: string, year: string) => `of ${country}’s gas imports came from ${supplier} in ${year} (UN Comtrade)`,
    others: 'Other suppliers',
    /** The dependence share with its definition beside it, as on the country page's table. */
    net: (country: string, share: string, year: number, preliminary: boolean) => `${country} imported ${share} of the gas it used in ${year} (EIA${preliminary ? ', preliminary' : ''}). Net imports: imports minus exports, as a share of what the country uses.`,
    label: (country: string, supplier: string, share: string, year: string, net: string, useYear: number, preliminary: boolean) =>
      `${supplier} supplied ${share} of ${country}’s gas imports in ${year} (UN Comtrade); ${country} imported ${net} of the gas it used in ${useYear} (EIA${preliminary ? ', preliminary' : ''})`,
    source: 'UN Comtrade; EIA',
    parts: (imports: string, use: number) => [`imports ${imports}`, `use ${use}`],
    go: 'Open in the Dependencies tool',
  },

  week: 'This week',
  weekUpdated: 'updated daily',
  weekMore: 'See this week',
  weekLabel: 'This week in numbers',

  topics: 'Explore by topic',
  /** One plain sentence per hub, in the menu's order. */
  topic: {
    resources: 'What countries mine, burn and grow, and who they buy it from.',
    technology: 'Internet use, computing power, chips and satellites.',
    climate: 'Emissions, water stress and natural disasters.',
    security: 'Conflict, refugees and the arms trade.',
    power: 'Sanctions, Chinese loans and grants, nuclear weapons and the blocs countries belong to.',
  } as Record<string, string>,

  startFrom: 'Questions to start from',

  countries: 'Countries and rankings',
  findCountry: 'Go to a country',
  findPlaceholder: 'Find a country',
  /** The stated rule for the country cards and links, with its year and source. */
  byGdp: (year: number, source: string) => `Largest economies by GDP, ${year} · ${source}`,
  countryPage: 'Country page',
  /** A country card's line when its page has no summary sentence. */
  countryWhat: 'Key figures, money, people, technology and climate',
  /** Before the next six. */
  next: 'Next:',
  compare: 'Compare the United States, China and Russia',
  allCountries: 'See all countries',
  rankings: 'Rankings',
  allRankings: 'See all rankings',

  trustLabel: 'About the data',
  sources: 'official and research sources',
  refreshed: (when: string) => `updated daily, last at ${when}`,
  howWeMeasure: 'how we measure',
};

/** The six questions under "Questions to start from", each a prepared view; one whose page is not live is left out. */
export const QUESTION_TEXT: Record<string, [string, string]> = {
  richer: ['Do richer countries emit more CO2 per person?', 'Explorer · scatter'],
  refugees: ['Who hosts the most refugees and others in need of protection?', 'Refugees'],
  wheat: ['Which countries rely on one supplier for wheat?', 'Dependencies'],
  chokepoints: ['Which chokepoints carry the most oil?', 'Chokepoints'],
  'china-oil': ['Where does China’s crude oil come from?', 'Supply chains · crude oil'],
  overlap: ['Which countries belong to both BRICS and the G20?', 'Bloc overlap'],
  lithium: ['Who mines the world’s lithium?', 'Critical minerals'],
  arms: ['Who exports the most major arms?', 'Arms transfers'],
};
