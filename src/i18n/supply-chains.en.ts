// The Supply chains tool's words (SupplyChainPage and SankeyFlow designs). The page templates and the browser
// script (src/scripts/supply-chains.ts) both read these, so this file imports nothing that needs Node.

export type ChainKind = 'trade' | 'arms' | 'refugees';

/** Each flow's short unit (labels, headers; its name is FLOW_TEXT's, in en.ts), the noun its sentences use, what its amount is called and its unit in full. */
export const CHAIN_TEXT: Record<string, { short: string; noun: string; kind: ChainKind; amount: string; unit: string }> = {
  oil: { short: 'kb/d', noun: 'crude oil', kind: 'trade', amount: 'Volume', unit: 'thousand barrels a day' },
  gas: { short: 'bn m³', noun: 'gas', kind: 'trade', amount: 'Volume', unit: 'billion cubic metres' },
  wheat: { short: 'Mt', noun: 'wheat', kind: 'trade', amount: 'Volume', unit: 'million tonnes' },
  maize: { short: 'Mt', noun: 'maize', kind: 'trade', amount: 'Volume', unit: 'million tonnes' },
  rice: { short: 'Mt', noun: 'rice', kind: 'trade', amount: 'Volume', unit: 'million tonnes' },
  soy: { short: 'Mt', noun: 'soybeans', kind: 'trade', amount: 'Volume', unit: 'million tonnes' },
  potash: { short: 'Mt', noun: 'potash', kind: 'trade', amount: 'Volume', unit: 'million tonnes of product' },
  phosphate: { short: 'Mt', noun: 'phosphate', kind: 'trade', amount: 'Volume', unit: 'million tonnes of product' },
  arms: { short: 'TIV m', noun: 'major arms', kind: 'arms', amount: 'TIV', unit: 'million trend-indicator values (TIV)' },
  chips: { short: 'US$ bn', noun: 'integrated circuits', kind: 'trade', amount: 'Value', unit: 'billion US dollars' },
  refugees: { short: 'people', noun: 'refugees', kind: 'refugees', amount: 'People', unit: 'people' },
};

/** The two sides of a flow, the words for a focused country's totals, and how the flows were cut, by kind. */
export const SIDES: Record<ChainKind, { from: string; to: string; froms: string; tos: string; ins: string; outs: string; inShare: string; outShare: string }> = {
  trade: { from: 'Supplier', to: 'Buyer', froms: 'Suppliers', tos: 'Buyers', ins: 'Imports', outs: 'Exports', inShare: 'Suppliers, share of imports', outShare: 'Buyers, share of exports' },
  arms: { from: 'Supplier', to: 'Recipient', froms: 'Suppliers', tos: 'Recipients', ins: 'Received', outs: 'Delivered', inShare: 'Suppliers, share of deliveries received', outShare: 'Recipients, share of deliveries' },
  refugees: { from: 'Country of origin', to: 'Host country', froms: 'Countries of origin', tos: 'Host countries', ins: 'Hosted from other countries', outs: 'From here, in other countries', inShare: 'Countries of origin, share of those hosted', outShare: 'Host countries, share of those abroad' },
};

/** What each source's flows cover, under the diagram. */
export const COVERAGE: Record<string, string> = {
  faostat: 'FAOSTAT’s detailed trade matrix, as importers report it, cut to each importer’s main suppliers, so the totals are of the flows shown, not of all trade.',
  comtrade: 'UN Comtrade, as importers report it: the main flows only, so the totals are of the flows shown, not of all trade. Potash and phosphate are in tonnes of product, not of nutrient.',
  sipri: 'SIPRI five-year totals of major arms delivered, in trend-indicator values (TIV): a measure of military capability, not of price.',
  unhcr: 'Refugees, asylum seekers and others in need of international protection, by country of origin and country of asylum, as UNHCR counts them. Smaller pairs are not listed.',
};

export const CHAINS_TEXT = {
  crumb: 'Tools',
  title: 'Supply chains',
  sub: 'supply chain',
  indexLede: (n: number) => `Who supplies whom, flow by flow: ${n} ${n === 1 ? 'flow' : 'flows'} from supplier to buyer, each for the latest year its source reports.`,
  indexDescription: (n: number) => `Supply chains for ${n} ${n === 1 ? 'flow' : 'flows'}, from crude oil and grain to arms and refugees: who supplies whom, in a diagram and a table, with sources.`,
  description: (label: string, period: string, credit: string) => `${label} supply chain, ${period}: suppliers to buyers in a diagram and a table, with concentration and the largest flows, from ${credit}.`,
  largest: (from: string, to: string, v: string) => `Largest flow: ${from} → ${to}, ${v}`,

  // Ledes, written from the figures
  lede: {
    trade: (names: string, noun: string, period: string, credit: string) => `In the ${credit} flows for ${period}, ${names} ship the most ${noun}.`,
    arms: (names: string, _noun: string, period: string) => `In SIPRI’s totals for ${period}, ${names} delivered the most major arms.`,
    refugees: (names: string, _noun: string, period: string) => `In UNHCR’s figures for ${period}, the most refugees and others in need of protection came from ${names}.`,
  } as Record<ChainKind, (names: string, noun: string, period: string, credit: string) => string>,
  and: 'and',

  // Controls
  flow: 'Flow',
  year: 'Year',
  latestYear: (period: string) => `${period}, latest available`,
  latestPeriod: (period: string) => `${period}, latest five years available`,
  focus: 'Focus a country',
  focusHint: 'Type a country',
  focused: (name: string) => `Focused on <b>${name}</b>: only its flows are drawn`,
  clear: 'Clear focus',
  notFound: (q: string) => `No country in these flows matches "${q}".`,
  nowFocused: (name: string) => `Showing the flows of ${name}.`,
  cleared: 'Showing all flows.',

  // Diagram
  diagramLabel: (label: string, period: string, unit: string, focus?: string) => `${label} supply chain, ${period}${focus ? `, flows of ${focus}` : ', largest suppliers to largest buyers'}, in ${unit}`,
  bandTitle: (from: string, to: string, v: string) => `${from} to ${to}: ${v}`,
  others: 'Others',
  caption: (froms: number, tos: number) => `Band width is the amount. Bands are coloured by where they start and named at both ends; hover a band for its value. Outside the ${froms} largest on the left and the ${tos} largest on the right, flows are grouped as Others; the table lists every one.`,
  readout: 'Hover a band for its value.',
  showDiagram: 'Show diagram',
  hideDiagram: 'Hide diagram',

  // Panel
  world: 'All flows shown',
  total: 'Total of the flows shown',
  concentration: 'Concentration',
  conc: { low: 'Unconcentrated', moderate: 'Moderately concentrated', high: 'Highly concentrated' } as Record<string, string>,
  concWorld: (n: number, share: string, noun: string, hhi: string) => `The ${n} largest suppliers ship ${share} of the ${noun} in these flows. Herfindahl index ${hhi} on supplier shares; 1,000 to 1,800 counts as moderately and above 1,800 as highly concentrated.`,
  concFocus: (top: string, share: string, name: string, hhi: string) => `${top} supplies ${share} of what ${name} imports in these flows. Herfindahl index ${hhi} on supplier shares; 1,000 to 1,800 counts as moderately and above 1,800 as highly concentrated.`,
  how: 'How we measure',
  topFroms: (froms: string, unit: string) => `Top ${froms.toLowerCase()}, ${unit}`,
  topTos: (tos: string, unit: string) => `Top ${tos.toLowerCase()}, ${unit}`,
  countryPage: (name: string) => `${name} country page`,

  // Phone list
  topFlows: (n: number, unit: string) => `Top ${n} flows, ${unit}`,

  // Table and download
  tableTitle: 'The same flows as a table',
  tableLabel: (label: string) => `${label} flows`,
  tableCaption: (unit: string, period: string, n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'flow' : 'flows'}, ${unit}, ${period}.`,
  download: 'Download CSV',
  noDownload: (credit: string) => `${credit}’s terms do not allow its figures to be passed on, so they are shown here without a download.`,
  csvAmount: (amount: string, unit: string) => `${amount} (${unit})`,
  csvPeriod: 'period',
};
