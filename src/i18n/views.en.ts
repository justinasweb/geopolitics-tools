// English words for the map views drawn from the indicator registry (src/data/views.ts): emissions and refugees.
// Same rules as pages.en.ts: templates take figures already formatted and return plain sentences, plain verbs, no
// adjectives that judge, and a sentence whose figure is missing is left out. Another language is another file with
// the same keys.

export interface LayerText {
  /** The layer's name in the picker ("Per person"). */
  pick: string;
  /** The page title and h1 ("CO2 emissions per person"). */
  title: string;
  /** Under the title, after it ("by country"). */
  sub: string;
  /** After a value in the tooltip ("11,903 Mt" + "of CO2"); may be empty. */
  measure: string;
  /** The panel's label for a country's figure. */
  figureLabel: string;
  /** The legend title. */
  legend: (year: number) => string;
  /** The panel's key figure label, when the layer has a world figure. */
  worldLabel?: string;
  /** The one-sentence answer under the title: `top` starts a sentence ("The United States"), `topIn` sits inside one. */
  lede: (p: { top: string; topIn: string; value: string; share?: string; top3?: string; world?: string; year: number; up?: number; down?: number; of?: number }) => string;
  /** The first summary sentence, on the world figure. */
  total?: (value: string, year: number, change: string | null) => string;
  /** A bloc's line in the panel, for layers that add up. */
  bloc?: (bloc: string, share: string, year: number) => string;
  /** The diverging scale's two ends. */
  ends?: [string, string];
  /** The caveat in the panel. */
  caveat: string;
  /** The page's meta description. */
  description: (year: number) => string;
}

export interface FamilyText {
  section: string;
  pickerLabel: string;
  layers: Record<string, LayerText>;
}

const fossil = 'from fossil fuels and cement';

export const VIEW_TEXT: Record<string, FamilyText> = {
  emissions: {
    section: 'Emissions',
    pickerLabel: 'Measure',
    layers: {
      co2: {
        pick: 'Total', title: 'CO2 emissions', sub: 'by country', measure: 'of CO2', figureLabel: 'CO2 emissions',
        legend: (y) => `CO2 emissions, million tonnes, ${y}`, worldLabel: 'World CO2 emissions',
        lede: ({ top, share, top3, year }) => `${top} emitted ${share} of the world’s CO2 ${fossil} in ${year}${top3 ? `; the top three countries emitted ${top3}` : ''}.`,
        total: (v, y, ch) => `The world emitted ${v} of CO2 ${fossil} in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${b} members emitted ${s} of the world’s CO2 in ${y}.`,
        caveat: 'CO2 from fossil fuels and cement inside each country’s borders. Land use, other greenhouse gases, and international flights and shipping (in the world total only) are not given to any country.',
        description: (y) => `CO2 emissions from fossil fuels and cement by country, 1990–${y}: each country’s total and share of the world, on a map and in a table. Source: Global Carbon Budget.`,
      },
      co2pc: {
        pick: 'Per person', title: 'CO2 emissions per person', sub: 'by country', measure: 'per person', figureLabel: 'CO2 per person',
        legend: (y) => `Tonnes of CO2 per person, ${y}`, worldLabel: 'World average',
        lede: ({ topIn, value, world, year }) => `In ${year}, ${topIn} emitted the most CO2 per person: ${value}${world ? `, against ${world} for the world as a whole` : ''}.`,
        total: (v, y, ch) => `The world as a whole emitted ${v} of CO2 per person in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: 'A country’s CO2 from fossil fuels and cement divided by its population: an average, not what any one person emits.',
        description: (y) => `CO2 emissions per person by country, 1990–${y}, on a map and in a table. Source: Global Carbon Budget.`,
      },
      co2cum: {
        pick: 'Since 1750', title: 'CO2 emitted since 1750', sub: 'by country', measure: 'since 1750', figureLabel: 'CO2 since 1750',
        legend: (y) => `CO2 emitted 1750–${y}, million tonnes`, worldLabel: 'World, since 1750',
        lede: ({ topIn, share, top3, year }) => `Between 1750 and ${year}, ${topIn} emitted ${share} of the world’s CO2 ${fossil}${top3 ? `; the top three countries ${top3}` : ''}.`,
        total: (v, y) => `From 1750 to ${y}, the world emitted ${v} of CO2 ${fossil}.`,
        bloc: (b, s, y) => `${b} members emitted ${s} of the world’s CO2 between 1750 and ${y}.`,
        caveat: 'Each country’s emissions inside its present borders, added up from 1750. Emissions of former states are given to the countries that now cover them.',
        description: (y) => `CO2 emitted since 1750 by country, up to ${y}: each country’s total and share of the world, on a map and in a table. Source: Global Carbon Budget.`,
      },
      co2trade: {
        pick: 'Imported in goods', title: 'CO2 imported in goods', sub: 'by country', measure: 'against own emissions', figureLabel: 'CO2 in trade, against own emissions',
        legend: (y) => `CO2 caused by what a country consumes, against what it emits at home, ${y}`,
        ends: ['Consumes more than it emits', 'Emits more than it consumes'],
        lede: ({ up, down, year }) => `In ${year}, what ${up} countries consumed caused more CO2 than they emitted at home, because their imports carried more emissions than their exports; in ${down} countries it was the other way round.`,
        caveat: 'Emissions caused by what a country consumes, including in imported goods, against those inside its borders. Consumption-based figures end earlier than the others and cover fewer countries.',
        description: (y) => `CO2 in traded goods by country, ${y}: how much more or less CO2 each country’s consumption causes than it emits at home. Source: Global Carbon Budget.`,
      },
    },
  },
  refugees: {
    section: 'Refugees',
    pickerLabel: 'Measure',
    layers: {
      refout: {
        pick: 'Fled from', title: 'Refugees by country of origin', sub: 'where people fled from', measure: 'from here', figureLabel: 'Refugees from the country',
        legend: (y) => `Refugees and others in need of protection, by origin, ${y}`, worldLabel: 'Total, all origins reported',
        lede: ({ top, value, share, top3, year }) => `${top} was the origin of ${value} refugees and others in need of international protection in ${year}, ${share} of all UNHCR counted${top3 ? `; the top three countries of origin ${top3}` : ''}.`,
        total: (v, y, ch) => `UNHCR counted ${v} refugees, asylum seekers and others in need of international protection in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${s} came from ${b} members in ${y}.`,
        caveat: 'Refugees, asylum seekers and others in need of international protection, by country of origin, as UNHCR counts them. Palestinian refugees under UNRWA’s mandate are not included.',
        description: (y) => `Refugees by country of origin, 2015–${y}: how many people fled each country, on a map and in a table. Source: UNHCR.`,
      },
      refin: {
        pick: 'Hosted', title: 'Refugees hosted', sub: 'by host country', measure: 'hosted', figureLabel: 'Refugees hosted',
        legend: (y) => `Refugees and others in need of protection hosted, ${y}`, worldLabel: 'Total, all hosts reported',
        lede: ({ top, value, share, top3, year }) => `${top} hosted ${value} refugees and others in need of international protection in ${year}, ${share} of all UNHCR counted${top3 ? `; the top three host countries ${top3}` : ''}.`,
        total: (v, y, ch) => `UNHCR counted ${v} refugees, asylum seekers and others in need of international protection in host countries in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${b} members hosted ${s} of them in ${y}.`,
        caveat: 'Refugees, asylum seekers and others in need of international protection living in each country, as UNHCR counts them. Palestinian refugees under UNRWA’s mandate are not included.',
        description: (y) => `Refugees hosted by country, 2015–${y}, on a map and in a table. Source: UNHCR.`,
      },
      refinpc: {
        pick: 'Per 1,000 residents', title: 'Refugees hosted per 1,000 residents', sub: 'by host country', measure: 'per 1,000 residents', figureLabel: 'Refugees hosted per 1,000 residents',
        legend: (y) => `Refugees hosted per 1,000 residents, ${y}`,
        lede: ({ topIn, value, year }) => `In ${year}, ${topIn} hosted the most refugees for its population: ${value} per 1,000 residents.`,
        caveat: 'UNHCR’s count of refugees and others in need of protection divided by the World Bank’s population figure.',
        description: (y) => `Refugees hosted per 1,000 residents by country, 2015–${y}, on a map and in a table. Sources: UNHCR, World Bank.`,
      },
      idps: {
        pick: 'Displaced at home', title: 'People displaced inside their country', sub: 'by country', measure: 'displaced', figureLabel: 'Internally displaced',
        legend: (y) => `People displaced inside their country, ${y}`, worldLabel: 'Total, all countries reported',
        lede: ({ top, value, share, year }) => `${top} had ${value} people displaced inside the country in ${year}, ${share} of those UNHCR counted.`,
        total: (v, y, ch) => `UNHCR counted ${v} people displaced inside their own country in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${s} of them were in ${b} members in ${y}.`,
        caveat: 'UNHCR counts the internally displaced people it protects or assists, so fewer countries report than for refugees, and its totals are lower than counts that cover every country.',
        description: (y) => `People displaced inside their own country, 2015–${y}, on a map and in a table. Source: UNHCR.`,
      },
    },
  },
};

/** Words every registry map view shares. */
export const VIEWS_TEXT = {
  summary: 'Summary',
  all: 'All countries',
  tableLabel: (title: string) => `${title}, every country`,
  caption: (y: number, prev: number | null) => `Every country and territory with a figure for ${y}${prev ? `, with ${prev} for comparison` : ''}.`,
  country: 'Country',
  share: 'Share of world',
  change: 'Change',
  worldRow: 'World',
  totalRow: 'Total, reporting countries',
  related: 'Related',
  sameView: 'Same view, another measure',
  indicatorPage: 'Ranked table and trend',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  highest: 'Highest',
  importers: 'Consume more than they emit',
  exporters: 'Emit more than they consume',
  coverage: (n: number, y: number) => `${n} countries and territories have a figure for ${y}.`,
  changeIn: (pct: string, more: boolean, prev: number) => `${pct} ${more ? 'more' : 'less'} than in ${prev}`,
  change2: (pct: string, more: boolean, prev: number, value: string) => `${pct} ${more ? 'more' : 'less'} than ${prev} (${value})`,
  sameAs: (prev: number) => `Same as ${prev}`,
  top: (parts: string[], together: string | null) => `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}${together ? `; together, ${together} of the world total` : ''}.`,
  topPart: (name: string, value: string, share: string | null) => `${name} ${value}${share ? ` (${share})` : ''}`,
  topNoShare: (parts: string[]) => `The highest: ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
  divTop: (names: string[], values: string[]) => `The largest differences: ${names.map((n, i) => `${n} ${values[i]}`).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
  blocNone: (bloc: string, year: number) => `No ${bloc} member has a figure for ${year}.`,
  blocCount: (bloc: string, k: number, n: number, year: number) => `${k} of the ${n} ${bloc} members have a figure for ${year}.`,
  notListed: (year: number) => `No figure for ${year}`,
  noData: 'No data',
  rank: (rank: number, of: number) => `${rank} of ${of}`,
  prevYear: (year: number, value: string) => `${year}: ${value}`,
  ofWorld: (share: string) => `${share} of world`,
  ofTotal: (share: string) => `${share} of the total`,
};
