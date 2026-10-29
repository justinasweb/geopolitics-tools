// The topic hubs (/resources, /technology, /climate, /security, /power): TopicHub and TopicHubPage designs. Card
// headlines are the map views' own one-sentence answers and every figure comes from the layer files; these are the
// hubs' own interface words. The intros are AI drafts in src/content/hubs/, shown as drafts until approved.

export const HUB_TEXT = {
  kicker: 'Topic',
  /** The page title (SEO plan: "{Hub}: maps and data"). */
  title: (hub: string) => `${hub}: maps and data`,
  description: (hub: string, views: string[]) => `${hub}: ${views.join(', ')}. Maps and figures by country, each with its source and date.`,
  maps: 'Maps in this topic',
  mapsSub: (n: number) => `${n} map ${n === 1 ? 'view' : 'views'}. Each opens on its main layer; the links on each card go straight to a layer.`,
  layers: 'Main layers',
  /** "Open critical minerals"; a name that starts with an abbreviation keeps its capitals ("Open AI and chips"). */
  open: (name: string) => `Open ${/^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name}`,
  estimated: (period: string) => `${period}, estimated`,
  thumb: (name: string) => `Map: ${name}`,
  tools: 'Tools for this topic',
  countries: 'Countries and rankings for this topic',
  countryPages: 'Country pages',
  /** The stated rule for which countries are listed: there is no traffic data to rank by. */
  countryRule: 'The three dossiers, then the countries ranked first on most of this topic’s maps.',
  firstOn: (maps: string) => `First on ${maps}`,
  topThree: (n: number) => `In the top three on ${n} of this topic’s ${n === 1 ? 'map' : 'maps'}`,
  allCountries: 'All countries',
  rankings: 'Indicator rankings',
  top3: (names: string) => `Top 3: ${names}`,
  allRankings: 'All rankings',
  sources: 'Sources for this topic:',
  howWeMeasure: 'How we measure',
  allSources: 'All sources',
  /** "Lithium, wheat production and 2 more" */
  more: (n: number) => `${n} more`,
};
