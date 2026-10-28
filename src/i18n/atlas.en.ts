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
  /** Under an overlay drawn from another year than the map's. */
  overlayYear: (year: string) => `Shown for ${year}`,
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
  loading: 'Loading the layer…',
  failed: 'The layer could not be loaded.',
  nav: 'Site',
};
