// The topic hubs (/resources, /technology, /climate, /security, /power): TopicHub and TopicHubPage designs. Card
// headlines are the map views' own one-sentence answers and every figure comes from the layer files; these are the
// hubs' own interface words. The intros are AI drafts in src/content/hubs/, shown as drafts until approved.

/** A name inside a sentence: lower-cased, unless it starts with a proper adjective or an abbreviation (Chinese, CO2,
 *  US, AI), which keep their capitals. */
export const inLine = (s: string) => (/^(Chinese|European|American|British|Russian|[A-Z]{2,}|[A-Z]\d)/.test(s) || !/^[A-Z][a-z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export const HUB_TEXT = {
  kicker: 'Topic',
  /** The page title (SEO plan: "{Hub}: maps and data"). */
  title: (hub: string) => `${hub}: maps and data`,
  description: (hub: string, views: string[]) => `${hub}: ${views.join(', ')}. Maps and figures by country, each with its source and date.`,
  maps: 'Maps in this topic',
  mapsSub: (n: number) => `${n} map ${n === 1 ? 'view' : 'views'}. Each opens on its main layer; the links on each card go straight to a layer.`,
  layers: 'Main layers',
  /** "Open critical minerals", "Open AI and chips", "Open Chinese lending". */
  open: (name: string) => `Open ${inLine(name)}`,
  estimated: (period: string) => `${period}, estimated`,
  thumb: (name: string) => `Map: ${name}`,
  tools: 'Tools for this topic',
  countries: 'Countries and rankings for this topic',
  countryPages: 'Country pages',
  /** The stated rule for which countries are listed: there is no traffic data to rank by. */
  countryRule: 'The three dossiers, then the countries ranked first on most of this topic’s maps of world shares, volumes and counts.',
  firstOn: (maps: string) => `First on ${maps}`,
  topThree: (n: number) => `In the top three on ${n} of this topic’s maps`,
  allCountries: 'All countries',
  rankings: 'Indicator rankings',
  top3: (names: string) => `Top 3: ${names}`,
  /** A ranking's name: its label, and for a share or a rate what it is of ("CO2 imported in goods, % of own emissions"). */
  ranking: (label: string, rate?: string) => (rate ? `${label}, ${rate}` : label),
  /** A ranking's line starts with the year it ranks, so a one-year ranking reads apart from a card's total over years. */
  inYear: (year: number, top: string) => `${year} · ${top}`,
  /** Several places share the first figure, as the page shows it: they are named together, not in a made-up order. */
  tiedFirst: (value: string, names: string) => `Tied first at ${value}: ${names}`,
  allRankings: 'All rankings',
  sources: 'Sources for this topic:',
  howWeMeasure: 'How we measure',
  allSources: 'All sources',
  /** "Lithium, wheat production and 2 more" */
  more: (n: number) => `${n} more`,
};
