// English words and sentence templates for the generated pages: countries, indicators, Compare, Sources, the
// 404 page and share images. Templates take figures already formatted by src/lib/format.ts and return plain
// sentences; another language is another file with the same keys, written in that language from the same data,
// not translated from English output (spec, "Ready for more languages").
//
// Plain verbs only (mines, imports, exports, hosts, has), no adjectives that judge ("dominant", "vulnerable"),
// and a figure that is missing leaves its sentence out rather than being guessed.

/** "1st", "2nd", "23rd". */
export function ordinal(n: number): string {
  const r = new Intl.PluralRules('en', { type: 'ordinal' }).select(n);
  return `${n}${({ one: 'st', two: 'nd', few: 'rd', other: 'th' } as Record<string, string>)[r]}`;
}

/** A label inside a sentence: capitalised words lowercased, acronyms (GDP, CO2, AI) and proper names kept. */
const PROPER = new Set(['Chinese', 'UN', 'US', 'EU', 'UK']);
export const lc = (label: string) => label.replace(/\b[A-Z][a-z]+\b/g, (w) => (PROPER.has(w) ? w : w.toLowerCase()));

/** "a, b and c". */
/** Items in a sentence, without a serial comma: "Ethiopia, Sudan and Egypt". */
export const list = (items: string[]) => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
/** At most `max` names, then "and n more": "China, Myanmar, Laos and 3 more". */
export const listUpTo = (items: string[], max: number) => (items.length <= max ? list(items) : `${items.slice(0, max).join(', ')} and ${items.length - max} more`);

/** The possessive of a place name: "Germany's", "the United States'". */
export const possessive = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

/** Names that read with "the" inside a sentence. */
const WITH_THE = /^(United States|United Kingdom|United Arab Emirates|Netherlands|Philippines|Bahamas|Gambia|Maldives|Marshall Islands|Solomon Islands|Comoros|Seychelles|Central African Republic|Dominican Republic|Czech Republic|Democratic Republic|Republic of|Vatican(?! City)|Cayman Islands|Falkland Islands|Faroe Islands|Cook Islands|British Virgin Islands|Northern Mariana Islands|Turks and Caicos Islands|Virgin Islands)/;
/** A place name inside a sentence; `start` capitalises "The" at the start of a sentence. */
export const inSentence = (name: string, start = false) => (WITH_THE.test(name) ? `${start ? 'The' : 'the'} ${name}` : name);

export const MINERAL_TEXT: Record<string, string> = {
  lithium: 'lithium', cobalt: 'cobalt', 'rare-earths': 'rare earths', gallium: 'gallium', graphite: 'natural graphite',
  nickel: 'nickel', palladium: 'palladium', tungsten: 'tungsten',
};
export const mineralName = (id: string, label: string) => MINERAL_TEXT[id] ?? label.toLowerCase();

/** The ten resources of the dependencies table, as a noun inside "of the … it uses". */
export const RESOURCE_TEXT: Record<string, { label: string; noun: string }> = {
  oil: { label: 'Oil', noun: 'oil' }, gas: { label: 'Natural gas', noun: 'gas' }, wheat: { label: 'Wheat', noun: 'wheat' },
  maize: { label: 'Maize', noun: 'maize' }, rice: { label: 'Rice', noun: 'rice' }, soy: { label: 'Soybeans', noun: 'soybeans' },
  potash: { label: 'Potash', noun: 'potash' }, phosphate: { label: 'Phosphate', noun: 'phosphate' },
  arms: { label: 'Arms', noun: 'major arms' }, chips: { label: 'Chips', noun: 'chips' },
};

export const DEP_TEXT = {
  heading: 'Dependencies at a glance',
  tags: { most: 'Imports most', some: 'Imports some', self: 'Roughly self-sufficient', exp: 'Exporter' } as Record<string, string>,
  keyLabel: 'Dependence key',
  columns: ['Resource', 'Dependence', 'Position', 'Main partners'],
  caption: 'Dependence is net imports as a share of use. Arms and chips show supplier concentration only: the main supplier’s share of imports (arms: five-year totals of deliveries).',
  concentrationOnly: 'Supplier concentration only',
  concentrationTitle: 'Supplier concentration only; share of use not measured',
  imports: (share: string, noun: string) => `Imports ${share} of the ${noun} it uses`,
  importsAll: (noun: string) => `Imports all of the ${noun} it uses`,
  exports: (share: string) => `Exports ${share} of what it produces`,
  noUse: (noun: string) => `Uses no ${noun}, by this source`,
  mainSupplier: (name: string, share: string) => `Main supplier: ${name}, ${share} of imports`,
  noImports: (period: string) => `No major arms imports recorded, ${period}`,
  noData: 'No data yet',
  noRow: 'Not reported by this source',
  /** A row's source and year: use and trade dated apart when the partners come from another source or year
   *  (imports, or exports when the partners are buyers). */
  dated: (source: string, year: string, flowSource?: string, flowYear?: string, buyers = false) =>
    (!flowSource || !flowYear || (flowSource === source && flowYear === year) ? `${source}, ${year}` : `${source}, use ${year} · ${flowSource}, ${buyers ? 'exports' : 'imports'} ${flowYear}`),
  /** Deliveries from suppliers that are not a country (SIPRI: non-state actors, NATO, the UN, unknown), in a list. */
  otherSuppliers: 'Other or unknown suppliers',
  /** Flows whose amount is the exporter's report, the importer's quantity being unusable (mirror data). */
  asReported: (flows: string[]) => `${list(flows)} as reported by the exporter`,
  flow: (from: string, to: string) => `${from} → ${to}`,
  /** The grid's tooltip, when the main supplier's figure is the exporter's report. */
  supplierAsReported: 'main supplier as reported by the exporter',
  /** A row with figures but no partners: the trade source names none for it. */
  noPartners: 'No partner data from the source',
  /** The section's shared source line: each row carries its own year. */
  yearsByRow: 'year in each row',
  partners: 'Main partners',
  buyersTag: '(buyers)',
  link: 'Dependencies tool',
  /** The section's finding, from its two most telling rows. */
  find: (c: string, parts: string[]) => `${c} ${parts.join('; it ')}.`,
  /** The imports it names, under one verb: "imports all of the rice it uses and 95% of the gas it uses". */
  findImports: (parts: string[]) => `imports ${list(parts)}`,
  findImportPart: (share: string | null, noun: string) => `${share === null ? 'all' : share} of the ${noun} it uses`,
  findExport: (noun: string) => `exports ${noun}`,
  findSelf: (c: string, nouns: string) => `${c} produces about as much ${nouns} as it uses.`,
  findNone: 'None of this page’s sources reports these resources for this country yet.',
};

export const COUNTRY_TEXT = {
  countries: 'Countries',
  kindCountry: 'Country page',
  kindTerritory: 'Territory',
  /** The <title> (the H1 is the name alone). */
  title: (name: string) => `${name}: imports, resources and key figures`,
  /** Closes the meta description when it fits: "Country page with sources: key figures, dependencies and more." */
  descriptionTail: (kind: string, minerals: boolean) => `${kind} with sources: key figures, dependencies${minerals ? ', minerals' : ''} and more.`,
  updated: (d: string) => `Updated ${d}`,
  auto: 'Written automatically from the figures on this page.',
  facts: { population: 'Population', administered: 'Administered by', status: 'Status' },
  supplyChains: 'Its supply chains',
  compare: (other: string) => `Compare with ${other}`,
  allCountries: 'All countries',
  boundaries: 'Boundaries: Natural Earth 1:50m, which shows who controls an area in practice. Borders shown do not imply endorsement.',
  locator: (name: string) => `Locator map: ${name}`,
  keyFigures: 'Key figures',
  rank: (r: string, of: number) => `${r} of ${of}`,
  onThisPage: 'On this page',
  jumpTo: 'Jump to',
  backToTop: 'Back to top',
  /** The minerals section: every mineral where its share of world production is at least `pct`%. */
  mineralsHeading: (pct: number) => `Where it supplies ${pct}% or more of the world`,
  mineralsMenu: 'Minerals',
  mineralsBars: (c: string, year: number) => `${possessive(c)} share of world production, ${year}`,
  /** After a mineral counted as primary production, not mine production (gallium). */
  primary: ' (primary production)',
  mineralsLink: 'Critical minerals map',
  moreHeading: 'More figures',
  moreMenu: 'More figures',
  moreFind: (c: string) => `Shown only where a source covers ${c}.`,
  depsMenu: 'Dependencies',
  allHeading: 'All figures',
  allMenu: 'All figures',
  allFind: (c: string, n: number) => (n === 1 ? `1 measure on this site has a recent figure for ${c}.` : `${n} measures on this site have a recent figure for ${c}.`),
  allColumns: { measure: 'Measure', value: 'Value', year: 'Year', rank: 'Rank', source: 'Source' },
  allLabel: (c: string) => `All figures for ${c}`,
  coverage: 'Coverage notes',
  sourcesHeading: 'Sources for this page',
  pageUpdated: (d: string) => `Page last updated ${d}`,
  howWeMeasure: 'How we measure',
  citation: (name: string, kind: string, url: string, year: number, date: string) => `geopolitics.tools (${year}). ${name}: ${kind.toLowerCase()}. ${url}, updated ${date}.`,
  // Few sources
  fewHeading: 'Few sources cover this place',
  fewBody: (c: string, n: number, total: number) => `${n} of the ${total} sources this site uses ${n === 1 ? 'has' : 'have'} figures for ${c}. The page shows what they report; the others either do not cover it or have no figure for it.`,
  fewCovered: 'With figures',
  fewNot: 'Checked, no figure',
  fewSuggest: 'Know a source that covers it? Write to data@geopolitics.tools.',
};

/** Profile summary sentences, each with its source and year in brackets. */
export const SUMMARY = {
  mines: (c: string, parts: string[], src: string) => `${c} mines ${list(parts)} (${src}).`,
  produces: (c: string, parts: string[], src: string) => `${c} produces ${list(parts)} (${src}).`,
  minePart: (share: string, mineral: string, first: boolean) => (first ? `${share} of the world’s ${mineral}` : `${share} of its ${mineral}`),
  /** After the source and year when a figure is the source's estimate. */
  estimated: 'estimated',
  people: (c: string, pop: string, popSrc: string, gdp: string | null, gdpSrc: string) =>
    gdp ? `${c} has ${pop} people (${popSrc}) and an economy of ${gdp} a year (${gdpSrc}).` : `${c} has ${pop} people (${popSrc}).`,
  imports: (c: string, share: string, noun: string, src: string) => `${c} imports ${share} of the ${noun} it uses (${src}).`,
  importsAll: (c: string, noun: string, src: string) => `${c} imports all of the ${noun} it uses (${src}).`,
  /** Several imports in one sentence, each with its own source: "It imports all of the rice it uses (FAOSTAT, 2024) and
   *  95% of the gas it uses (EIA, 2024)." */
  importsMany: (c: string, parts: string[]) => `${c} imports ${list(parts)}.`,
  importPart: (share: string | null, noun: string, src: string) => `${share === null ? 'all' : share} of the ${noun} it uses (${src})`,
  hosts: (n: string, src: string) => `It hosts ${n} refugees and others in need of protection (${src}).`,
  fled: (n: string, src: string) => `${n} people from it are refugees or others in need of protection abroad (${src}).`,
  none: (c: string) => `Few of this site’s sources report figures for ${c}.`,
};

export const BLOCK_TEXT = {
  refugees: 'Refugees',
  hosted: (year: number) => `refugees and others in need of protection hosted, ${year}`,
  fledFrom: (year: number) => `from it, abroad, ${year}`,
  lastReported: (value: string, year: number) => `Last reported: ${value} (${year})`,
  refugeesLink: 'Refugees map',
  disasters: 'Disasters',
  alerts: (parts: string[]) => (parts.length ? `orange and red GDACS alerts in the past year: ${list(parts)}` : 'orange and red GDACS alerts in the past year'),
  noAlerts: 'No orange or red GDACS alert named it in the past year.',
  kinds: { EQ: ['earthquake', 'earthquakes'], TC: ['tropical cyclone', 'tropical cyclones'], FL: ['flood', 'floods'], DR: ['drought', 'droughts'], WF: ['wildfire', 'wildfires'], VO: ['volcanic eruption', 'volcanic eruptions'] } as Record<string, [string, string]>,
  disastersLink: 'Disasters map',
  pastYear: (from: string, to: string) => `${from} – ${to}`,
  emissions: 'Emissions',
  co2pc: (year: number, rank: string, of: number) => `CO2 per person, ${year}, ${rank} of ${of}`,
  emissionsLink: 'Emissions map',
  sanctions: 'Sanctions',
  listings: (parts: string[]) => `listings on the US, EU and UK lists name it as country of address or nationality${parts.length ? `: ${list(parts)}` : ''}`,
  listPart: (list: string, n: string) => `${list} ${n}`,
  noListings: 'No listing on the US, EU or UK lists names it as country of address or nationality.',
  sanctionsNote: 'Counts measure how many people, companies, ships and aircraft a list names, not how severe the measures are.',
  sanctionsLink: 'Sanctions map',
  lending: 'Chinese lending',
  lent: (from: number, to: number) => `committed by Chinese state lenders, ${from}–${to}`,
  lendingLink: 'Chinese lending map',
  arms: 'Arms',
  armsImp: (period: string) => `arms imports, ${period}, TIV millions`,
  armsLink: 'Arms transfers map',
};

/** Dossier sections beyond the profile's. */
export const DOSSIER_TEXT = {
  money: 'Money and reserves',
  moneyMenu: 'Money',
  moneyFind: (c: string, gdp: string, year: number) => `${possessive(c)} economy produced ${gdp} in ${year}.`,
  gdpChart: (c: string) => `${possessive(c)} GDP, current US$`,
  growth: 'Growth', inflation: 'Inflation', unemployment: 'Unemployment', fdi: 'Foreign investment in', trade: 'Trade, share of GDP',
  reserves: 'Reserves', reservesSplit: (fx: string, gold: string) => `Foreign currency and other reserves ${fx}; gold ${gold}`,
  fx: 'Foreign currency and other', gold: 'Gold',
  treasuries: 'US Treasury securities held',
  treasuriesNote: (month: string, prev: string | null) => (prev ? `${month}; ${prev} a year earlier` : month),
  people: 'People', peopleMenu: 'People',
  peopleFind: (c: string, pop: string, year: number) => `${c} had ${pop} people in ${year}.`,
  peopleLink: 'Population map',
  popChart: (c: string) => `${possessive(c)} population`,
  popProjection: 'UN projection, medium variant',
  popRange: 'Range between the UN low- and high-fertility scenarios',
  pyramid: (c: string) => `${possessive(c)} population by age`,
  men: 'Men', women: 'Women',
  pyramidBar: (group: string, sex: string, millions: string) => `${group}, ${sex.toLowerCase()}: ${millions} million`,
  pyramidLabel: (c: string, year: number) => `${possessive(c)} population by age in ${year}, men on the left and women on the right, in millions`,
  pyramidCaption: (lastEstimate: number) => `Millions of people in each five-year age group, men left and women right. Years after ${lastEstimate} are UN projections (medium variant).`,
  aged65: 'Aged 65 and over',
  /** The 65-and-over share's caption: a year after the UN's last estimate year is its medium-variant projection. */
  aged65Caption: (year: number, lastEstimate: number, source: string) => `${year}${year > lastEstimate ? ', Projection, medium variant' : ''} · ${source}`,
  tech: 'Technology and space', techMenu: 'Technology',
  techFind: (c: string, n: string, year: number) => `Satellites owned in ${c} numbered ${n} at the end of ${year}.`,
  satellites: 'Satellites in orbit', launches: 'Orbital launches', compute: 'Share of AI computing power', models: 'Notable AI models',
  links: 'Sanctions, lending and trade', linksMenu: 'Sanctions and lending',
  climate: 'Climate and hazards', climateMenu: 'Climate',
  climateFind: (c: string, co2: string, year: number) => `${c} emitted ${co2} of CO2 in ${year}.`,
  co2: 'CO2 emissions', co2pc: 'CO2 per person', co2cum: 'CO2 since 1750', waterstress: 'Water stress',
  co2Chart: (c: string) => `${possessive(c)} CO2 emissions, million tonnes`,
  projection: 'Projection',
};

export const COMPARE_TEXT = {
  title: (a: string, b: string) => `${a} and ${b} compared`,
  kicker: 'Compare',
  lede: (a: string, b: string) => `${a} and ${b} side by side on the same measures, each figure with its source and year.`,
  description: (a: string, b: string) => `${a} and ${b} side by side: economy, people, military spending, emissions, minerals and more, with sources.`,
  /** A row's source and year: one year when both figures share it, else each country's own ("United States: 2024; China: 2023 · World Bank"). */
  sourceYear: (credit: string, years: { name: string; year: number }[]) => (new Set(years.map((y) => y.year)).size === 1
    ? `${credit}, ${years[0].year}`
    : `${years.map((y) => `${y.name}: ${y.year}`).join('; ')} · ${credit}`),
  keyHeading: 'Key figures',
  measure: 'Measure',
  higher: 'Higher',
  higherNote: '“Higher” marks the larger value in each row. It is not a judgement.',
  source: 'Source and year',
  overTime: 'Over time',
  sameScale: 'Both on the same scale.',
  minerals: 'Share of world production',
  mineralsFind: (year: number) => `Share of world mine production (primary production for gallium) in ${year}, for minerals where either has at least 1%.`,
  /** The mineral pairs' "–": USGS names the largest producers only, so a country it does not list is not a zero. */
  notListed: 'Not listed by USGS',
  notListedNote: '– Not listed by USGS. USGS names the largest producers of each mineral, so a country it does not list has no published share, which is not the same as zero.',
  others: 'Other comparisons',
  change: 'Change',
  /** The first and second country's colour, named on their chips (tokens cmp-first and cmp-second). */
  colours: { first: 'blue', second: 'orange' } as Record<string, string>,
  /** "Not compared, no data for Mali: satellites, launches (source: CelesTrak); for either: AI computing power (source: Epoch AI)." */
  notCompared: (groups: { name: string | null; items: string[]; sources: string[] }[]) =>
    `Not compared, ${groups.map((g, i) => `${i ? 'for' : 'no data for'} ${g.name ?? 'either'}: ${g.items.join(', ')} (${g.sources.length > 1 ? 'sources' : 'source'}: ${g.sources.join(', ')})`).join('; ')}.`,
  /** Each measure as it reads inside the "Not compared" line. */
  nouns: {
    gdp: 'GDP', population: 'population', gdppc: 'GDP per person', growth: 'economic growth', inflation: 'inflation',
    reserves: 'reserves', milpct: 'military spending as a share of GDP', milusd: 'military spending', armsexp: 'arms exports',
    armsimp: 'arms imports', co2: 'CO2 emissions', co2pc: 'CO2 per person', satellites: 'satellites', launches: 'launches',
    aicompute: 'AI computing power', lex: 'life expectancy', median: 'median age',
  } as Record<string, string>,
  // The page for any two countries (/compare?a=germany&b=france, D21).
  anyTitle: 'Compare two countries',
  anyLede: 'Pick any two countries or territories to see them side by side on the same measures, each figure with its source and year.',
  anyDescription: 'Any two countries side by side: economy, people, military spending, emissions, minerals and more, with sources.',
  pickAny: 'Pick any two countries',
  first: 'First country',
  second: 'Second country',
  compareWith: 'Compare with…',
  go: 'Compare',
  readyMade: 'Ready-made comparisons',
  loading: 'Loading the figures…',
  failed: 'The figures could not be loaded. Check your connection and try again.',
  unknown: (slug: string) => `There is no country page called “${slug}”. Pick a country from the list.`,
  same: 'Pick two different countries.',
  pickTwo: 'Pick two countries to compare them.',
  shown: (a: string, b: string) => `Showing ${a} and ${b}.`,
};

export const INDICATOR_PAGE = {
  indexTitle: 'Indicators',
  indexLede: (n: number) => `${n} country measures from official and research sources, each with a ranked table, a map, its trend and how it is measured.`,
  indexDescription: 'Every country measure on geopolitics.tools by topic, with its source and latest year.',
  latest: 'Latest year',
  countries: 'Countries',
  measureCol: 'Measure',
  sourceCol: 'Source',
  noYear: 'One value per country',
  pending: 'Waiting for the source',
  notInSnapshot: 'Not in this data release',
  definition: 'Definition.',
  methodology: 'How we measure',
  ranked: 'All countries, ranked',
  yearShown: 'Year shown',
  forAll: (y: number) => `${y} for all`,
  latestAvailable: 'Latest available',
  find: 'Find a country',
  rank: 'Rank', country: 'Country', year: 'Year',
  captionCommon: (y: number) => `Every row is ${y}, so countries are compared on the same year.`,
  captionLatest: (n: number, y: number) => `${n} rows use a year before ${y}; rankings in this view mix years.`,
  tableLabel: (label: string) => `Countries ranked by ${lc(label)}`,
  showAll: (n: number) => `Show all ${n}`,
  coverage: (n: number, of: number, y: number) => `${n} of ${of} countries and territories reported for ${y}.`,
  coverageRest: 'The rest have no figure for that year yet; “Latest available” includes their most recent year, up to two years earlier.',
  coverageStatic: (n: number) => `${n} countries and territories have a figure.`,
  preliminary: (years: string) => `Some countries have already reported ${years}; it stays preliminary until most have.`,
  mapTitle: (unit: string, y: number) => `${unit}, ${y}`,
  notReported: (y: number) => `Not reported for ${y}`,
  mapLabel: (label: string, y: number) => `Map: ${lc(label)} by country, ${y}`,
  overTime: 'Over time',
  trendFind: (lo: string, hi: string, from: number, to: number) => `The median country’s value ranged from ${lo} to ${hi} between ${from} and ${to}.`,
  trendCaption: (y: number) => `The median of reporting countries and the five highest in ${y}. Dashed: median.`,
  median: 'Median',
  caveats: 'Caveats',
  related: 'Related',
  relatedIndicator: 'Indicator',
  download: 'Download',
  downloadCsv: 'Download CSV, all years',
  downloadNote: (licence: string, credit: string) => `Licence: ${licence}. Credit: ${credit}. Columns: country, ISO3, year, value, status, source, retrieved.`,
  shownOnly: 'Shown on the site, not available for download: the source’s terms do not allow it, or have not yet been confirmed.',
  answer: (top: string, verb: string, value: string, year: number) => `In ${year}, ${top} ${verb}: ${value}.`,
  answerStatic: (top: string, verb: string, value: string) => `${top} ${verb}: ${value}.`,
  shareText: (label: string) => `Countries by ${lc(label)}`,
  description: (label: string, year: number | undefined, source: string) => `Countries ranked by ${lc(label)}${year ? ` in ${year}` : ''}, with a map, the trend and how it is measured. Source: ${source}.`,
  projections: (after: number) => `Years after ${after} are projections.`,
  estimates: (n: number, after: number) => `For ${n} ${n === 1 ? 'country' : 'countries'}, actual figures end earlier; their years up to ${after} are estimates, tagged in the table and dashed in the chart.`,
};

/** Each indicator's answer verb ("had the largest economy") and caveats. Indicators without one use the default. */
export const ANSWER: Record<string, { verb: string; caveats?: string[] }> = {
  gdp: { verb: 'had the largest economy', caveats: ['GDP in current US$ moves with exchange rates as well as output.', 'Compare economies over time with economic growth, which removes price changes.'] },
  gdppc: { verb: 'had the highest GDP per person', caveats: ['GDP per person is an average; it says nothing about how income is shared.'] },
  growth: { verb: 'had the fastest economic growth' },
  inflation: { verb: 'had the highest inflation' },
  unemployment: { verb: 'had the highest unemployment rate', caveats: ['The ILO models many countries’ figures where surveys are missing.'] },
  reserves: { verb: 'held the largest reserves' },
  trade: { verb: 'had the largest trade relative to GDP', caveats: ['Small economies that re-export goods can trade more than their GDP.'] },
  fdi: { verb: 'received the most foreign direct investment', caveats: ['Net inflows can be negative when investors withdraw more than they put in.'] },
  remittances: { verb: 'received the most remittances relative to GDP' },
  population: { verb: 'had the largest population' },
  popun: { verb: 'had the largest population' },
  tfr: { verb: 'had the most births per woman' },
  median: { verb: 'had the highest median age' },
  lex: { verb: 'had the highest life expectancy' },
  refout: { verb: 'was the origin of the most refugees', caveats: ['Palestinian refugees under UNRWA’s mandate are not in UNHCR’s figures.'] },
  refin: { verb: 'hosted the most refugees', caveats: ['Counts refugees, asylum seekers and other people in need of international protection, as UNHCR reports them.'] },
  refinpc: { verb: 'hosted the most refugees for its population', caveats: ['Divides UNHCR’s count by World Bank population.'] },
  idps: { verb: 'had the most people displaced inside the country' },
  wheatprod: { verb: 'produced the most wheat' }, wheatimp: { verb: 'imported the most wheat' },
  maizeprod: { verb: 'produced the most maize' }, maizeimp: { verb: 'imported the most maize' },
  riceprod: { verb: 'produced the most rice', caveats: ['Paddy rice is converted to milled rice at 67%.'] }, riceimp: { verb: 'imported the most rice' },
  soyprod: { verb: 'produced the most soybeans' }, soyimp: { verb: 'imported the most soybeans' },
  fertpotash: { verb: 'used the most potash fertiliser' }, fertphosphate: { verb: 'used the most phosphate fertiliser' },
  co2: { verb: 'emitted the most CO2', caveats: ['Fossil fuels and cement only; land use and other greenhouse gases are not included.'] },
  co2pc: { verb: 'emitted the most CO2 per person' },
  co2cum: { verb: 'has emitted the most CO2 since 1750' },
  co2trade: { verb: 'had the largest net CO2 imports through trade, relative to emissions inside its borders', caveats: ['Consumption-based figures end earlier than the others and cover fewer countries.'] },
  waterstress: { verb: 'had the highest water stress', caveats: ['A country score averages basins that can differ a great deal.'] },
  waterdep: { verb: 'got the largest share of its water from abroad' },
  milpct: { verb: 'spent the largest share of its GDP on its military', caveats: ['Figures for countries at war, or with large off-budget spending, are SIPRI estimates and carry the most uncertainty.', 'A rising share can mean more spending or a smaller economy.'] },
  milusd: { verb: 'spent the most on its military' },
  armsimp: { verb: 'imported the most major arms', caveats: ['SIPRI’s trend-indicator value measures the military capability delivered, not the price paid.', 'Deliveries are lumpy; compare five-year totals, as SIPRI does.'] },
  armsexp: { verb: 'exported the most major arms', caveats: ['SIPRI’s trend-indicator value measures the military capability delivered, not the price paid.'] },
  satellites: { verb: 'owned the most satellites in orbit', caveats: ['Counts payloads in orbit by owner, working or not.'] },
  launches: { verb: 'made the most orbital launches', caveats: ['Launches count for the state of the launch site.'] },
  power: { verb: 'generated the most electricity', caveats: ['Generation inside the country, before trade in electricity and losses in the grid.'] },
  lowcarbon: { verb: 'had the highest low-carbon share of electricity', caveats: ['Low-carbon counts nuclear, hydro, wind, solar, bioenergy and other renewables. A small system can reach a high share with one large dam.'] },
  coalpower: { verb: 'had the highest share of electricity from coal' },
  windsolar: { verb: 'had the highest share of electricity from wind and solar' },
  aicompute: { verb: 'had the largest share of AI computing power', caveats: ['Counts known GPU clusters in operation; many private clusters are not public.'] },
  netuser: { verb: 'had the largest share of people using the internet', caveats: ['People who used the internet in the last three months, from national surveys and statistics that ITU gathers; how well countries measure it varies.'] },
  ictexp: { verb: 'exported the most ICT services', caveats: ['ICT services are telecom, computer and information services sold to buyers abroad, from balance-of-payments data. They don’t include goods such as phones or chips.'] },
  ictshare: { verb: 'had the largest share of ICT in its service exports', caveats: ['ICT services are telecom, computer and information services sold to buyers abroad, from balance-of-payments data. They don’t include goods such as phones or chips.'] },
  sanctions: { verb: 'was named in the most sanctions listings', caveats: ['Counts measure how many targets a list names, not how severe the measures are.'] },
  chinaloans: { verb: 'received the most Chinese loans and grants', caveats: ['Commitments, not disbursements: what was agreed, not what was paid out.'] },
};
export const DEFAULT_VERB = 'had the highest value';

export const SOURCES_PAGE = {
  title: 'Sources',
  kicker: 'About the site',
  lede: (n: number) => `The ${n} sources behind every figure: what each feeds, its licence, how often we check it and when it last changed.`,
  description: 'Every data source used on geopolitics.tools, with licence, update schedule, last refresh and corrections.',
  downloadsLine: 'Downloads are on each page, where the source allows it.',
  columns: { source: 'Source', feeds: 'Feeds', licence: 'Licence', download: 'Download', every: 'We check', last: 'Last refresh', status: 'Status' },
  yes: 'Yes', shownOnly: 'Shown only', toConfirm: 'To confirm', permissionAsked: 'Permission asked',
  status: { live: 'Live', delayed: 'Delayed', key: 'Key pending', manual: 'Manual import', soon: 'Wave 2' } as Record<string, string>,
  statusWhy: {
    live: 'Fetched on schedule', delayed: 'Past its update window', key: 'Waiting for an access key or permission; the views it feeds stay hidden',
    manual: 'Imported by hand on release', soon: 'Not live yet',
  } as Record<string, string>,
  every: (hours: number) => (hours <= 1 ? 'Hourly' : hours < 24 ? `Every ${hours} hours` : hours === 24 ? 'Daily' : hours % 24 === 0 && hours / 24 === 7 ? 'Weekly' : `Every ${Math.round(hours / 24)} days`),
  onRelease: (release: string) => `On release (${release})`,
  byHand: (every: string) => `By hand, ${every}`,
  never: 'Not yet',
  tableLabel: 'Data sources',
  corrections: 'Corrections',
  correctionsLede: 'Every correction to a published figure, newest first. Correction notices on pages link here.',
  correctionsCols: ['Date', 'Page', 'What changed'],
  noCorrections: 'No corrections yet.',
  report: 'Report a correction: data@geopolitics.tools',
  measures: 'All sources',
  caption: 'Generated from the source registry on each build. Download: “Yes” means pages that use the source offer a CSV; “Shown only” means the figures are on the site but the licence does not allow a download, or has not yet been confirmed.',
  licencesHeading: 'Licences and credit',
  licencesBody: [
    'Free to access does not always mean free to republish. Each source has a record of what we may show, offer for download and derive, and the credit it needs; that credit travels with every chart and CSV.',
    'Where a source does not allow redistribution, or its terms have not yet been confirmed, its pages show the figures without a download and say so.',
  ],
  lateHeading: 'When a source is late or fails',
  lateBody: [
    'If a fetch fails its checks (format, completeness, units, unusually large changes) the last good version stays on the site. A source past its update window shows as Delayed here.',
    'A few sources need an access key or written permission before we fetch them. Until it arrives the source shows as Key pending, and the measures it feeds are listed but have no page yet.',
  ],
};

export const NOT_FOUND = {
  title: 'This page is not on the map',
  lede: 'There is no page at this address. It may have moved, or the link may be mistyped.',
  dym: 'Did you mean',
  home: 'Home page',
  countries: 'Countries',
  indicators: 'Indicators',
  description: 'There is no page at this address.',
};

export const OG_TEXT = {
  countryKicker: 'Country page',
  indicatorKicker: 'Indicator',
  compareKicker: 'Compare',
  pageKicker: 'geopolitics.tools',
  source: (s: string) => `Source: ${s}`,
  /** The source as it closes the card's alt text. */
  altSource: (s: string) => `source: ${s}`,
  /** og:image:alt and twitter:image:alt when a page names no share card. */
  altFallback: (title: string) => `Share card: ${title}`,
};

export const SAMPLE_BANNER = 'Sample data build: every figure on this page is illustrative, from the prototype’s sample files, not real data.';
export const DRAFT_BANNER = 'Draft, waiting for the editor’s approval. This text was drafted with AI from the spec and the source records, and is not final.';

/** Short source names for brackets and key figures: "(World Bank, 2024)". */
export const SOURCE_SHORT: Record<string, string> = {
  worldbank: 'World Bank', 'imf-weo': 'IMF WEO', owid: 'Global Carbon Budget', faostat: 'FAOSTAT', 'usgs-minerals': 'USGS',
  unhcr: 'UNHCR', sipri: 'SIPRI', wpp: 'UN WPP 2024', celestrak: 'CelesTrak', epoch: 'Epoch AI', csl: 'US CSL',
  'eu-sanctions': 'EU sanctions list', 'uk-sanctions': 'UK Sanctions List', aiddata: 'AidData, Global Chinese Development Finance Dataset 3.0', aqueduct: 'WRI Aqueduct',
  aquastat: 'FAO AQUASTAT', gdacs: 'GDACS', 'usgs-quakes': 'USGS', treasury: 'US Treasury TIC', 'treasury-history': 'US Treasury TIC',
  eia: 'EIA', comtrade: 'UN Comtrade', ember: 'Ember', ucdp: 'UCDP', ipc: 'IPC', pinksheet: 'World Bank Pink Sheet',
};

/** Shorter still, for meta descriptions, where the source line's full name would run past 170 characters. */
export const SOURCE_BRIEF: Record<string, string> = { aiddata: 'AidData' };

/** Where an indicator's figures come from, when the publisher is not the original source. */
/** WRI Aqueduct's credit after its name, as its terms ask: the access date, its site and its licence (links in
 *  src/lib/source-links.ts). */
export const AQUEDUCT_CREDIT = (d: string) => `accessed on ${d}, aqueduct.wri.org (CC BY 4.0)`;

export const SOURCE_NOTE: Record<string, string> = {
  milpct: 'World Bank, from SIPRI data', milusd: 'World Bank, from SIPRI data',
  unemployment: 'World Bank, from ILO modelled estimates', refinpc: 'UNHCR; World Bank population',
  gdppc: 'World Bank', sanctions: 'US CSL; EU sanctions list; UK Sanctions List',
  entitylist: 'US Consolidated Screening List (Entity List)',
  outages: 'IODA (Georgia Tech)',
  // The view's credit adds the dataset version (src/lib/views.ts creditOf).
  cyber: 'EuRepoC Global Dataset of Cyber Incidents, CC BY-NC 4.0',
  // The original publisher as the World Bank's series metadata names it, then the World Bank and its licence.
  netuser: 'ITU World Telecommunication/ICT Indicators Database, via World Bank, CC BY 4.0',
  ictexp: 'IMF Balance of Payments Statistics, via World Bank, CC BY 4.0',
  ictshare: 'IMF Balance of Payments Statistics, via World Bank, CC BY 4.0',
  sanctionsus: 'US CSL (SDN list)', sanctionseu: 'EU sanctions list', sanctionsuk: 'UK Sanctions List',
};

export const COUNTRIES_INDEX = {
  title: 'Countries',
  lede: (n: number, t: number) => `${n} country and territory pages${t ? `, ${t} of them territories` : ''}, each built from the figures our sources publish for it.`,
  description: 'Every country and territory on geopolitics.tools: key figures with world rank, dependencies, minerals, sanctions and more, with sources.',
  compare: 'Compare',
  az: 'All countries and territories',
  find: 'Find a country',
  territory: 'Territory',
  fewSources: 'Few sources',
  jump: 'Jump to letter',
};

/** One- or two-sentence definitions for indicator pages, in the source's terms. */
export const DEFINITION: Record<string, string> = {
  gdp: 'Gross domestic product: the value of all goods and services produced in a year, in current US dollars at market exchange rates.',
  gdppc: 'GDP divided by population, in current US dollars.',
  growth: 'The yearly change in GDP at constant prices, so price rises are taken out.',
  inflation: 'The yearly change in consumer prices, as an average over the year.',
  debt: 'Gross debt of general government as a share of GDP.',
  deficit: 'General government net lending or borrowing as a share of GDP; a negative figure is a deficit.',
  currentaccount: 'Trade in goods and services plus income and transfers with the rest of the world, as a share of GDP.',
  unemployment: 'People without work who are looking for it, as a share of the labour force (ILO modelled estimates).',
  reserves: 'Foreign currency, gold, IMF reserve position and special drawing rights held by the central bank, in current US dollars.',
  trade: 'Exports plus imports of goods and services, as a share of GDP.',
  fdi: 'Net inflows of foreign direct investment: new investment by foreign owners minus what they withdraw, in current US dollars.',
  remittances: 'Money sent home by people working abroad, and compensation of workers, as a share of GDP.',
  population: 'Everyone living in the country, whatever their legal status or citizenship, at mid-year.',
  popun: 'Population at 1 July, from the UN World Population Prospects 2024, with the UN medium-variant projection after 2023.',
  tfr: 'The number of children a woman would have if she lived through her childbearing years at this year’s birth rates.',
  median: 'The age that divides the population into two halves of equal size.',
  lex: 'How long a newborn would live on average if this year’s death rates held throughout their life.',
  refout: 'Refugees, asylum seekers and other people in need of international protection who come from the country, by UNHCR’s count.',
  refin: 'Refugees, asylum seekers and other people in need of international protection living in the country, by UNHCR’s count.',
  refinpc: 'Refugees and others in need of international protection hosted, per 1,000 residents.',
  idps: 'People forced to leave their homes who remain inside their own country, as reported by UNHCR.',
  oilprod: 'Crude oil, including lease condensate, produced per day.',
  oiluse: 'Petroleum and other liquids consumed per day.',
  gasprod: 'Dry natural gas produced, in billion cubic metres.',
  gasuse: 'Dry natural gas consumed, in billion cubic metres.',
  power: 'Electricity generated in the year, in terawatt-hours.',
  lowcarbon: 'The share of electricity from nuclear, hydro, wind, solar, bioenergy and other renewables.',
  coalpower: 'The share of electricity generated from coal.',
  windsolar: 'The share of electricity generated from wind and solar.',
  wheatprod: 'Wheat harvested in the year, in million tonnes.',
  wheatimp: 'Wheat imported in the year, in million tonnes.',
  maizeprod: 'Maize harvested in the year, in million tonnes.',
  maizeimp: 'Maize imported in the year, in million tonnes.',
  riceprod: 'Rice harvested in the year, in million tonnes of milled rice.',
  riceimp: 'Rice imported in the year, in million tonnes of milled rice.',
  soyprod: 'Soybeans harvested in the year, in million tonnes.',
  soyimp: 'Soybeans imported in the year, in million tonnes.',
  fertpotash: 'Potash fertiliser used in agriculture, in million tonnes of potassium oxide (K2O).',
  fertphosphate: 'Phosphate fertiliser used in agriculture, in million tonnes of phosphorus pentoxide (P2O5).',
  co2: 'Carbon dioxide from fossil fuels and cement production inside the country, in million tonnes.',
  co2pc: 'CO2 from fossil fuels and cement divided by population, in tonnes per person.',
  co2cum: 'All CO2 from fossil fuels and cement emitted inside the country since 1750, in million tonnes.',
  co2trade: 'Emissions embodied in imports minus those embodied in exports, as a share of emissions inside the country. Negative means more is exported than imported.',
  waterstress: 'How much of the available surface and ground water is withdrawn each year, as a score from 0 (low) to 5 (extremely high).',
  waterdep: 'The share of a country’s renewable water that flows in from other countries.',
  milpct: 'Military expenditure as a share of GDP, using SIPRI’s definition: spending on armed forces, defence ministries, paramilitary forces and military space activities.',
  milusd: 'Military expenditure in current US dollars, using SIPRI’s definition.',
  conflictdeaths: 'Deaths in state-based conflict, non-state conflict and one-sided violence against civilians, UCDP best estimate.',
  armsimp: 'Deliveries of major conventional weapons received, in SIPRI trend-indicator values (millions).',
  armsexp: 'Deliveries of major conventional weapons supplied, in SIPRI trend-indicator values (millions).',
  hunger: 'People in IPC Phase 3 (crisis) or worse in the latest analysis.',
  hungershare: 'The share of the analysed population in IPC Phase 3 (crisis) or worse.',
  satellites: 'Payloads in orbit at the end of the year, counted by owning country, whether working or not.',
  launches: 'Orbital launches in the year that put at least one satellite in orbit, counted for the country of the launch site.',
  aicompute: 'The country’s share of the computing power of known AI supercomputers in operation, in H100-equivalents.',
  netuser: 'Share of the population who used the internet in the last three months, from any place and on any device: computer, phone, games machine or TV.',
  ictexp: 'Exports of telecom, computer and information services, in current US dollars, as each country reports them in its balance of payments.',
  ictshare: 'ICT service exports as a share of all the country’s service exports, from its balance of payments.',
  sanctions: 'Listings on the US Consolidated Screening List, the EU financial sanctions list and the UK Sanctions List that give the country as an address or nationality.',
  chinaloans: 'Loans and grants committed by Chinese government and state-owned lenders, in constant 2021 US dollars.',
};

/** Related measures for an indicator page, besides those in its group. */
export const RELATED: Record<string, string[]> = {
  milpct: ['milusd', 'armsimp', 'armsexp'], milusd: ['milpct', 'armsexp'], gdp: ['gdppc', 'growth', 'population'],
  co2: ['co2pc', 'co2cum', 'co2trade'], co2pc: ['co2', 'co2cum'], refin: ['refinpc', 'refout', 'idps'], population: ['popun', 'tfr', 'median'],
};

export const LONGREAD_TEXT = {
  home: 'Home',
  changed: (d: string) => `Last changed ${d}`,
  read: (min: number) => `${min} minute read`,
  kept: 'This page is written in Markdown and kept in the site’s repository.',
};

/** What a source feeds beyond the indicator registry, for the Sources page. */
export const SOURCE_FEEDS: Record<string, string[]> = {
  gdacs: ['Disasters'], 'usgs-quakes': ['Earthquakes'], ioda: ['Internet outages'], portwatch: ['Ports and chokepoints'],
  celestrak: ['Space'], csl: ['Sanctions'], 'eu-sanctions': ['Sanctions'], 'uk-sanctions': ['Sanctions'], pinksheet: ['Commodity prices'],
  treasury: ['US Treasury holdings'], 'treasury-history': ['US Treasury holdings'], epoch: ['AI models'], cables: ['Submarine cables'],
  faostat: ['Dependencies at a glance', 'Food trade'], sipri: ['Arms transfers'], gem: ['Power plants and pipelines'], gdw: ['Dams'],
  aiddata: ['Chinese lending'], 'usgs-minerals': ['Critical minerals'], comtrade: ['Oil, gas, fertiliser and chip trade'], peeringdb: ['Internet exchange points'],
  eia: ['Oil and gas'], ember: ['Electricity'], ucdp: ['Conflict'], ipc: ['Food crises'],
  fas: ['Nuclear weapons'], unoda: ['Nuclear treaties'], eurepoc: ['Cyber incidents'],
};
