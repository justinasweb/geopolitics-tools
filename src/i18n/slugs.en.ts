// English slugs: the readable parts of every URL. Another language is another file with the same keys, under its
// own prefix (/de/laender/deutschland); the route registry (src/lib/routes.ts) builds every path from these and
// the place table's slugs, so a translation adds rows, not routes. Country slugs are in src/data/places/places.csv.

/** Section names: the first part of a path. */
export const SECTION_SLUGS = {
  countries: 'countries', compare: 'compare', indicators: 'indicators', downloads: 'downloads',
  about: 'about', methodology: 'methodology', sources: 'sources', privacy: 'privacy', minerals: 'minerals',
  emissions: 'emissions', refugees: 'refugees', disasters: 'disasters', food: 'food',
} as const;

/** Map view layers after their section (/emissions/per-person), by registry id; the first layer of a section is the section itself (''). */
export const VIEW_SLUGS: Record<string, string> = {
  co2: '', co2pc: 'per-person', co2cum: 'since-1750', co2trade: 'imported',
  refout: '', refin: 'hosted', refinpc: 'per-person', idps: 'displaced',
};

/** Disaster kinds after /disasters; every kind together is the section itself. */
export const DISASTER_SLUGS: Record<string, string> = {
  all: '', EQ: 'earthquakes', TC: 'cyclones', FL: 'floods', DR: 'droughts', WF: 'wildfires', VO: 'volcanoes',
};

/** Food and fertiliser: the commodity after /food, then the measure; production is the commodity's own address. */
export const FOOD_SLUGS: Record<string, string> = { wheat: 'wheat', maize: 'maize', rice: 'rice', soy: 'soybeans', potash: 'potash', phosphate: 'phosphate' };
export const FOOD_LAYER_SLUGS: Record<string, string> = { production: '', use: 'use', trade: 'trade' };

/** Joins two country slugs on a Compare page: /compare/united-states-vs-china. */
export const COMPARE_JOIN = '-vs-';

/** Indicator pages, by registry id: plain names that name the exact measure (site map, "Indicator slugs"). */
export const INDICATOR_SLUGS: Record<string, string> = {
  gdp: 'gdp', gdppc: 'gdp-per-person', growth: 'economic-growth', inflation: 'inflation',
  debt: 'government-debt', deficit: 'government-budget-balance', currentaccount: 'current-account-balance',
  unemployment: 'unemployment', reserves: 'reserves-including-gold', trade: 'trade-share-of-gdp',
  fdi: 'foreign-direct-investment', remittances: 'remittances-share-of-gdp',
  population: 'population', popun: 'population-un-projections', tfr: 'births-per-woman', median: 'median-age',
  lex: 'life-expectancy', refout: 'refugees-from', refin: 'refugees-hosted', refinpc: 'refugees-hosted-per-1000-people',
  idps: 'internally-displaced-people',
  oilprod: 'crude-oil-production', oiluse: 'oil-consumption', gasprod: 'natural-gas-production', gasuse: 'natural-gas-consumption',
  power: 'electricity-generated', lowcarbon: 'low-carbon-electricity-share', coalpower: 'coal-electricity-share',
  windsolar: 'wind-and-solar-electricity-share',
  wheatprod: 'wheat-production', wheatimp: 'wheat-imports', maizeprod: 'maize-production', maizeimp: 'maize-imports',
  riceprod: 'rice-production', riceimp: 'rice-imports', soyprod: 'soybean-production', soyimp: 'soybean-imports',
  fertpotash: 'potash-fertiliser-use', fertphosphate: 'phosphate-fertiliser-use',
  co2: 'co2-emissions', co2pc: 'co2-emissions-per-person', co2cum: 'co2-emissions-since-1750', co2trade: 'co2-imported-in-goods',
  waterstress: 'water-stress', waterdep: 'water-from-abroad',
  milpct: 'military-spending-share-of-gdp', milusd: 'military-spending-usd', conflictdeaths: 'conflict-deaths',
  armsimp: 'arms-imports', armsexp: 'arms-exports', hunger: 'people-in-food-crisis', hungershare: 'share-in-food-crisis',
  satellites: 'satellites-in-orbit', launches: 'orbital-launches', aicompute: 'ai-computing-power-share',
  sanctions: 'sanctions-listings', chinaloans: 'chinese-loans-and-grants',
};

