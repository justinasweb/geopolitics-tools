// English text for the indicator registry and flows. Another language is another file with the
// same keys; a test checks that every indicator and flow has its text.

export interface IndicatorText { label: string; short?: string; unit: string; note?: string }

export const GROUP_TEXT: Record<string, string> = {
  economy: 'Economy', people: 'People', energy: 'Energy', food: 'Food', climate: 'Climate and water',
  security: 'Security', tech: 'Technology and space', influence: 'Influence',
};

export const INDICATOR_TEXT: Record<string, IndicatorText> = {
  gdp: { label: 'GDP', unit: 'US$' },
  gdppc: { label: 'GDP per person', unit: 'US$' },
  growth: { label: 'Economic growth', unit: '%', note: 'Real GDP, change on the year before.' },
  inflation: { label: 'Inflation', unit: '%', note: 'Consumer prices, average for the year.' },
  debt: { label: 'Government debt', short: 'Debt', unit: '% of GDP' },
  deficit: { label: 'Government budget balance', short: 'Budget balance', unit: '% of GDP', note: 'Net lending or borrowing; negative is a deficit.' },
  currentaccount: { label: 'Current account balance', short: 'Current account', unit: '% of GDP' },
  unemployment: { label: 'Unemployment', unit: '%', note: 'Share of the labour force, ILO modelled estimate.' },
  reserves: { label: 'Reserves, including gold', short: 'Reserves', unit: 'US$' },
  trade: { label: 'Trade', unit: '% of GDP', note: 'Exports plus imports of goods and services.' },
  fdi: { label: 'Foreign investment in', unit: 'US$', note: 'Foreign direct investment, net inflows.' },
  remittances: { label: 'Remittances received', short: 'Remittances', unit: '% of GDP' },
  population: { label: 'Population', unit: 'people' },
  popun: { label: 'Population with UN projections', short: 'Population (UN)', unit: 'people' },
  tfr: { label: 'Births per woman', unit: 'children' },
  median: { label: 'Median age', unit: 'years' },
  lex: { label: 'Life expectancy', unit: 'years' },
  refout: { label: 'Refugees from the country', short: 'Refugees from', unit: 'people', note: 'Refugees, asylum seekers and others in need of protection abroad.' },
  refin: { label: 'Refugees hosted', unit: 'people' },
  refinpc: { label: 'Refugees hosted per 1,000 people', short: 'Refugees per 1,000', unit: 'per 1,000' },
  idps: { label: 'People displaced inside the country', short: 'Internally displaced', unit: 'people' },
  oilprod: { label: 'Crude oil production', short: 'Oil output', unit: 'kb/d' },
  oiluse: { label: 'Oil consumption', short: 'Oil use', unit: 'kb/d' },
  gasprod: { label: 'Natural gas production', short: 'Gas output', unit: 'bcm' },
  gasuse: { label: 'Natural gas consumption', short: 'Gas use', unit: 'bcm' },
  power: { label: 'Electricity generated', short: 'Electricity', unit: 'TWh' },
  lowcarbon: { label: 'Low-carbon electricity', unit: 'share', note: 'Nuclear, hydro, wind, solar, bioenergy and other renewables.' },
  coalpower: { label: 'Electricity from coal', unit: 'share' },
  windsolar: { label: 'Electricity from wind and solar', unit: 'share' },
  wheatprod: { label: 'Wheat production', unit: 'Mt' },
  wheatimp: { label: 'Wheat imports', unit: 'Mt' },
  maizeprod: { label: 'Maize production', unit: 'Mt' },
  maizeimp: { label: 'Maize imports', unit: 'Mt' },
  riceprod: { label: 'Rice production', unit: 'Mt', note: 'Milled equivalent.' },
  riceimp: { label: 'Rice imports', unit: 'Mt', note: 'Milled equivalent.' },
  soyprod: { label: 'Soybean production', unit: 'Mt' },
  soyimp: { label: 'Soybean imports', unit: 'Mt' },
  fertpotash: { label: 'Potash fertiliser use', short: 'Potash use', unit: 'Mt K2O', note: 'Agricultural use, tonnes of nutrient.' },
  fertphosphate: { label: 'Phosphate fertiliser use', short: 'Phosphate use', unit: 'Mt P2O5', note: 'Agricultural use, tonnes of nutrient.' },
  co2: { label: 'CO2 emissions', unit: 'Mt' },
  co2pc: { label: 'CO2 per person', unit: 't' },
  co2cum: { label: 'CO2 emitted since 1750', short: 'CO2 since 1750', unit: 'Mt' },
  co2trade: { label: 'CO2 imported in goods', unit: '% of own', note: 'Emissions caused by what a country buys, against those inside its borders.' },
  waterstress: { label: 'Water stress', unit: 'score 0–5', note: '0 low, 5 extremely high: over 80% of available water withdrawn.' },
  waterdep: { label: 'Water from abroad', unit: '% of renewable water' },
  milpct: { label: 'Military spending, share of GDP', short: 'Military, % GDP', unit: '% of GDP' },
  milusd: { label: 'Military spending', unit: 'US$' },
  conflictdeaths: { label: 'Deaths in organised violence', short: 'Conflict deaths', unit: 'deaths', note: 'Best estimate of deaths in state-based, non-state and one-sided violence. The latest year is preliminary.' },
  armsimp: { label: 'Arms imports', unit: 'TIV m', note: 'SIPRI trend-indicator value: military capability delivered, not price.' },
  armsexp: { label: 'Arms exports', unit: 'TIV m' },
  hunger: { label: 'People in food crisis or worse', short: 'Food crisis (IPC 3+)', unit: 'people' },
  hungershare: { label: 'Share in food crisis or worse', short: 'Food crisis share', unit: 'share' },
  satellites: { label: 'Satellites in orbit', unit: 'satellites' },
  launches: { label: 'Orbital launches', unit: 'launches' },
  aicompute: { label: 'Share of AI computing power', short: 'AI compute share', unit: 'share' },
  sanctions: { label: 'Sanctions listings (US, EU, UK)', short: 'Sanctions listings', unit: 'listings' },
  chinaloans: { label: 'Chinese loans and grants received', short: 'Chinese lending', unit: 'US$ (2021)', note: 'Commitments: what China agreed to lend or give, not what was paid out.' },
};

export const FLOW_TEXT: Record<string, { label: string; verbs: [string, string] }> = {
  oil: { label: 'Crude oil', verbs: ['Suppliers', 'Buyers'] },
  gas: { label: 'Natural gas', verbs: ['Suppliers', 'Buyers'] },
  wheat: { label: 'Wheat', verbs: ['Suppliers', 'Buyers'] },
  maize: { label: 'Maize', verbs: ['Suppliers', 'Buyers'] },
  rice: { label: 'Rice', verbs: ['Suppliers', 'Buyers'] },
  soy: { label: 'Soybeans', verbs: ['Suppliers', 'Buyers'] },
  potash: { label: 'Potash', verbs: ['Suppliers', 'Buyers'] },
  phosphate: { label: 'Phosphate fertiliser', verbs: ['Suppliers', 'Buyers'] },
  arms: { label: 'Major arms', verbs: ['Suppliers', 'Buyers'] },
  chips: { label: 'Chips', verbs: ['Suppliers', 'Buyers'] },
  refugees: { label: 'Refugees', verbs: ['From', 'Hosted in'] },
};

// Main menu, header and footer (src/data/nav.ts). Hub names match the hub pages exactly.
export const NAV_TEXT = {
  hubs: {
    resources: 'Resources', technology: 'Technology', climate: 'Climate and hazards',
    security: 'Security and people', power: 'Power and alliances',
  } as Record<string, string>,
  views: {
    minerals: ['Critical minerals', 'Lithium, rare earths, gallium, nickel…'],
    oil: ['Oil', 'Production, use, trade, reserves'],
    gas: ['Natural gas', 'Pipelines and LNG'],
    electricity: ['Electricity', 'Power mix by source'],
    food: ['Food and fertiliser', 'Wheat, maize, rice, soybeans, potash, phosphate'],
    internet: ['Internet', 'Cables and outages'],
    ai: ['AI and chips', 'Compute, models, chips'],
    space: ['Space', 'Satellites and launches'],
    emissions: ['Emissions', 'Total, per person, since 1750, imported'],
    water: ['Water and dams', 'Stress today and in 2050'],
    rivers: ['Disputed rivers', 'Nile, Indus, Mekong and more'],
    disasters: ['Disasters', 'Earthquakes, cyclones, floods…'],
    chokepoints: ['Chokepoints', 'Suez, Hormuz, Malacca…'],
    ports: ['Ports', '60 tracked ports'],
    conflict: ['Conflict', 'Events and fatalities'],
    refugees: ['Refugees', 'Fled from, hosted, displaced'],
    'food-crises': ['Food crises', 'Who faces acute hunger'],
    arms: ['Arms transfers', 'Exporters and importers'],
    sanctions: ['Sanctions', 'US, EU and UK lists'],
    'chinese-lending': ['Chinese lending', 'By sector'],
    blocs: ['Blocs', '19 groupings'],
    'alliance-history': ['Alliance history', 'How blocs grew'],
  } as Record<string, [string, string]>,
  top: { countries: 'Countries', indicators: 'Indicators', 'this-week': 'This week' } as Record<string, string>,
  tools: {
    atlas: ['Atlas', 'Every map layer on one full-screen map'],
    explorer: ['Explorer', 'Compare any measures in a table, over time or as a scatter'],
    dependencies: ['Dependencies', 'Who relies on whom, for what'],
    'supply-chains': ['Supply chains', 'Follow one flow from producers to users'],
    'blocs-overlap': ['Bloc overlap', 'Shared members and bridge countries between blocs'],
  } as Record<string, [string, string]>,
  footer: { about: 'About', methodology: 'Methodology', sources: 'Sources', privacy: 'Privacy' } as Record<string, string>,
};

export const UI_TEXT = {
  home: 'geopolitics.tools home',
  mainNav: 'Main',
  menu: 'Menu',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  search: 'Search',
  searchPlaceholder: 'Search countries, minerals, places',
  tools: 'Tools',
  breadcrumb: 'Breadcrumb',
  onThisPage: 'On this page',
  footerTagline: 'Data from official and research sources, updated daily.',
  footerNav: 'About the site',
  follow: 'Follow geopolitics.tools',
  footerBase: (year: number) => `© ${year} geopolitics.tools · Each dataset keeps its source's licence · No cookies: our analytics are cookieless, so there is no consent banner.`,
  copied: 'Copied',
  copiedLive: 'Copied to clipboard',
  copyFailed: 'Select and copy',
  copyFailedLive: 'Copy failed',
};

export const STATUS_TEXT = {
  estimate: 'Estimate', projection: 'Projection', preliminary: 'Preliminary', notyet: 'Not yet reported', sample: 'Sample',
  sampleTitle: 'Illustrative figure, not real data',
};

export const SOURCE_TEXT = {
  source: 'Source:', updated: 'Updated', cite: 'Copy citation', withheld: 'Withheld', noData: 'No data',
  share: 'Share', copyLink: 'Copy link', shareOn: (p: string) => `Share on ${p}`,
  since: (prev: string) => `since ${prev}`,
};

export const YEAR_TEXT = { year: 'Year', play: 'Play years', pause: 'Pause', estimate: 'estimate' };

export const LEGEND_TEXT = { withheld: 'Withheld by source' };
export const PANEL_TEXT = { close: 'Close panel', grab: 'Expand or collapse' };
