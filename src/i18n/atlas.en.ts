// The Atlas (/atlas): every map layer on one full-screen map (Atlas and AtlasPhone designs). Layer names, units,
// sources and every figure come from the layer files; these are the Atlas's own interface words.

export const ATLAS_TEXT = {
  title: 'Atlas',
  crumb: 'Tools',
  description: (layers: number) => `Every map layer on one full-screen map: ${layers} layers on resources, technology, climate, security and power, each with its source and year.`,
  layers: 'Layers',
  search: 'Search layers',
  searchPlaceholder: 'Search layers, e.g. wheat',
  clearSearch: 'Clear search',
  oneLayer: 'One shaded layer, plus any overlays.',
  /** A topic's summary line: how many rows and overlays it lists. */
  count: (n: number, o = 0) => `${n} ${n === 1 ? 'layer' : 'layers'}${o ? `, ${o} ${o === 1 ? 'overlay' : 'overlays'}` : ''}`,
  overlays: 'Overlays',
  /** The overlays, each drawn from the live map view that draws it (src/lib/atlas.ts). */
  overlay: {
    flows: { label: 'Trade flows', desc: 'Largest flows, exporter to importer', pick: 'Flow' },
    launches: { label: 'Launch sites', desc: 'Orbital launches by site, in the year shown' },
    alerts: { label: 'Disaster alerts', desc: (period: string) => `Orange and red alerts, ${period.toLowerCase()}` },
    bloc: { label: 'Bloc outline', desc: 'Members’ borders drawn in ink', pick: 'Grouping' },
  },
  legend: 'Legend',
  hide: 'Hide',
  show: 'Show',
  removeOverlay: (name: string) => `Turn off ${name}`,
  /** Under an overlay whose marks are from another year than the map's: {drawn} the overlay's, {map} the map's. */
  drawnFor: 'Drawn for {drawn}, the nearest year with these marks; the map shows {map}.',
  /** On a topic that holds the shown layer. */
  on: (n: number) => `${n} on`,
  /** Under the search box, filled in by the script: {n} rows match the query {q}. */
  found: { none: 'No layer matches “{q}”', one: '1 layer matches “{q}”', many: '{n} layers match “{q}”' },
  /** The select under a row with several layers ("Mineral", "Grouping"). */
  variant: 'Layer',
  /** The current layer in the bar: "Critical minerals: Lithium", or the name alone when it says the family ("Oil production"). */
  current: (family: string, name: string) => (name.toLowerCase().includes(family.toLowerCase()) ? name : `${family}: ${name}`),
  /** A year span in the layer list. */
  span: (from: string, to: string) => (from === to ? from : `${from}–${to}`),
  /** The bar: the layer, and the selected country after it. */
  withCountry: (layer: string, country: string) => `${layer} · ${country}`,
  nav: 'Site',
  /** The bar's menu of every map view (the main menu's topics and Tools). */
  mapViews: 'Map views',
  loading: (layer: string) => `Loading ${layer}…`,
  loadingNote: (country: string | null) => `${country ? `${country} stays selected. ` : ''}The old layer stays faded until the new one arrives.`,
  /** The panel with no country selected. */
  pickHint: 'Select a country on the map to see its figures here.',
  top: (year: string) => `Largest, ${year}`,
  seeFull: (layer: string) => `See full page: ${layer}`,
  previous: 'On the layer you had before',
  /** No figure for the selected country: what grey means, in the layer's own words for it (lower-cased by the script). */
  greyMeans: (none: string) => `Grey on this map means ${none}, not zero.`,
  otherLayers: (country: string) => `${country} on other layers`,
  year: {
    years: 'Year', months: 'Month', days: 'Period',
    kept: 'Year kept from your last layer.',
    latest: (got: string, want: string) => `${got} is the latest year in this source; you were on ${want}.`,
    earliest: (got: string, want: string) => `${got} is the earliest year in this source; you were on ${want}.`,
    nearest: (got: string, want: string) => `${got} is the nearest year in this source; you were on ${want}.`,
  },
  share: {
    button: 'Share', title: 'Share this view', copy: 'Copy',
    note: 'The link opens this exact map: layer, year, overlays and country.', on: 'Or share on', close: 'Close',
  },
  hint: {
    title: 'Pick a layer',
    body: (rows: number, topics: number) => `${rows} layers in ${topics} topics. The map opens on lithium; add overlays such as trade flows or a bloc outline on top.`,
    phone: (rows: number, topics: number) => `${rows} layers in ${topics} topics. The map opens on lithium.`,
    ok: 'Got it',
  },
  phone: {
    back: 'Back to the home page', layers: 'Layers', close: 'Close layers', showLegend: 'Show legend',
    overlay: 'Overlay, one at a time on phone', none: 'None', shaded: 'Shaded layer',
  },
};
