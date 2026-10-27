// The Dependencies tool's words (DependenciesPage and DependencyGrid designs). The page template and the browser
// script (src/scripts/dependencies.ts) both read these, so this file imports nothing that needs Node.

export const DEPS_TEXT = {
  title: 'Dependencies',
  crumb: 'Tools',
  lede: 'Import reliance and supplier concentration',
  definition: 'Import reliance is net imports as a share of what a country uses. Supplier concentration is the main supplier’s share of those imports.',
  how: 'How this is measured',
  description: (n: number) => `${n} countries against ten commodities: how much of the oil, gas, grain, fertiliser, arms and chips each one uses comes from imports, and how much of that from one supplier.`,
  loading: 'Loading the figures…',
  failed: 'The figures did not load. Check your connection and reload the page.',

  // Single points of failure
  spofTitle: 'Single points of failure',
  spofRule: 'Countries that import at least half of what they use, with at least half of those imports from one supplier.',
  spofItem: (share: string, noun: string, supplier: string, top: string) => `Imports ${share} of the ${noun} it uses; ${supplier} supplies ${top} of those imports.`,
  spofCount: (n: number, shown: number) => (n > shown ? `${n} found in this table; ${shown} with the largest share from one supplier shown.` : `${n} found in this table.`),
  spofNone: 'None in this table.',
  showAll: (n: number) => `Show all ${n}`,
  showFewer: 'Show fewer',

  // Controls
  bloc: 'Filter to a bloc',
  allCountries: 'All countries',
  sort: 'Sort by',
  commodity: 'Commodity',
  country: 'Country',
  find: 'Find a country',
  download: 'Download CSV',
  show: 'Show',
  byCountry: 'By country',
  byCommodity: 'By commodity',
  found: (name: string) => `${name} is highlighted.`,
  notFound: (q: string) => `No country matches "${q}".`,
  noRows: 'No country in this selection has these figures.',

  // Legend and grid
  legendTitle: 'Import reliance: net imports as a share of what the country uses',
  bands: ['Imports 75% or more', 'Imports 50–75%', 'Imports 15–50%', 'Roughly self-sufficient (±15%)', 'Exports 15–50% of output', 'Exports over 50% of output'],
  concentration: 'Supplier concentration only',
  legendNote: 'Under each value: the main supplier and its share of imports (ISO code, e.g. RUS 48%). Arms and chips show supplier concentration only.',
  tableLabel: 'Import reliance by country and commodity',
  caption: (years: string, sortedBy: string, asc: boolean) => `Latest year each country reports (${years}). Sorted by ${sortedBy}${asc ? ', lowest first' : ''}.`,
  exports: 'Exports',
  ofOutput: (share: string) => `${share} of output`,
  netExporter: 'net exporter',
  topSupplier: 'top supplier',
  noData: 'no data yet',
  noRow: 'not reported',
  noUse: 'not used',
  noImports: 'no imports',
  year: (y: string) => `Year: ${y}`,
  countryPage: (name: string) => `${name} country page`,
  rankLabel: (label: string) => `Countries ranked by ${label}`,

  // Download
  csvReliance: (label: string) => `${label} net imports (share of use)`,
  csvExports: (label: string) => `${label} net exports (share of output)`,
  csvYear: (label: string) => `${label} year`,
  csvTop: (label: string) => `${label} main supplier`,
  csvTopShare: (label: string) => `${label} main supplier share of imports`,
  csvTopOf: (label: string, credit: string) => `the main ${label} supplier (${credit})`,
  csvLeftOut: (parts: string) => `The download leaves out ${parts}: their sources do not allow them to be passed on.`,
};
