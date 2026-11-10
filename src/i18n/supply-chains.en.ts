// The Supply chains tool's words (SupplyChainPage and SankeyFlow designs). The page templates and the browser
// script (src/scripts/supply-chains.ts) both read these, so this file imports nothing that needs Node.

import { DEP_TEXT } from './pages.en.ts';

export type ChainKind = 'trade' | 'arms' | 'refugees';

/** Each flow's short unit (labels, headers; its name is FLOW_TEXT's, in en.ts), the noun its sentences use, what its amount is called and its unit in full. */
export const CHAIN_TEXT: Record<string, { short: string; noun: string; kind: ChainKind; amount: string; unit: string }> = {
  oil: { short: 'kb/d', noun: 'crude oil', kind: 'trade', amount: 'Volume', unit: 'thousand barrels a day' },
  gas: { short: 'bcm', noun: 'gas', kind: 'trade', amount: 'Volume', unit: 'billion cubic metres (bcm)' },
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
  trade: { from: 'Supplier', to: 'Buyer', froms: 'Suppliers', tos: 'Buyers', ins: 'Imports in the flows shown', outs: 'Exports in the flows shown', inShare: 'Suppliers, share of imports', outShare: 'Buyers, share of exports' },
  arms: { from: 'Supplier', to: 'Recipient', froms: 'Suppliers', tos: 'Recipients', ins: 'Received in the flows shown', outs: 'Delivered in the flows shown', inShare: 'Suppliers, share of deliveries received', outShare: 'Recipients, share of deliveries' },
  refugees: { from: 'Country of origin', to: 'Host country', froms: 'Countries of origin', tos: 'Host countries', ins: 'Hosted in the pairs shown', outs: 'Abroad in the pairs shown', inShare: 'Countries of origin, share of those hosted', outShare: 'Host countries, share of those abroad' },
};

/** What the diagram's and the panel's totals are of, and the source's full figures beside them, by kind. */
export const TOTALS: Record<ChainKind, { shown: string; allFrom: string; allTo: string }> = {
  trade: { shown: 'in the flows shown', allFrom: 'All exports', allTo: 'All imports' },
  arms: { shown: 'in the flows shown', allFrom: 'All deliveries', allTo: 'All received' },
  refugees: { shown: 'in the pairs shown', allFrom: 'All abroad', allTo: 'All hosted' },
};

/** A page's title, the line beside it and its title on its own: "Wheat supply chain", but refugees are not a supply chain
 *  ("Refugees by origin and host country"). */
export function chainTitle(key: string, label: string): { title: string; sub: string; full: string } {
  // People hosted at the end of the year, not yearly movements: not "flows".
  if (key === 'refugees') return { title: 'Refugees by origin and host country', sub: '', full: 'Refugees by origin and host country' };
  return { title: label, sub: 'supply chain', full: `${label} supply chain` };
}

/** What each source's flows cover, under the diagram; UN Comtrade's names the flows that are the exporter's report. */
export const COVERAGE: Record<string, (mirror: string[]) => string> = {
  faostat: () => 'FAOSTAT’s detailed trade matrix, as importers report it, cut to each importer’s main suppliers, so the totals are of the flows shown, not of all trade.',
  comtrade: (mirror) => `UN Comtrade, ${DEP_TEXT.asImporters('it', mirror)}: the main flows only, so the totals are of the flows shown, not of all trade. Potash and phosphate are in tonnes of product, not of nutrient.`,
  sipri: () => 'SIPRI five-year totals of major arms delivered, in trend-indicator values (TIV): a measure of military capability, not of price.',
  unhcr: () => 'Refugees, asylum seekers and others in need of international protection, by country of origin and country of asylum, as UNHCR counts them. Smaller pairs are not listed.',
};

export const CHAINS_TEXT = {
  crumb: 'Tools',
  title: 'Supply chains',
  indexLede: (n: number) => `Trade and arms deliveries between countries, and refugees by country of origin and host country: ${n} ${n === 1 ? 'flow' : 'flows'}, each for the latest year its source reports.`,
  indexDescription: (n: number) => `Supply chains for ${n} ${n === 1 ? 'flow' : 'flows'}: trade and arms deliveries between countries, and refugees from origin to host country, in diagrams and tables, with sources.`,
  description: (full: string, period: string, froms: string, tos: string, credit: string, pairs = false) => `${full}, ${period}: ${froms.toLowerCase()} to ${tos.toLowerCase()} in a diagram and a table, with the largest ${pairs ? 'pairs' : 'flows'}, from ${credit}.`,
  /** `reportedTo`: UN Comtrade's flows are those reported to it, not all trade, and the ranking says so. */
  largest: (from: string, to: string, v: string, reportedTo?: string) => `Largest flow${reportedTo ? ` reported to ${reportedTo}` : ''}: ${from} → ${to}, ${v}`,

  // Ledes, written from the figures
  lede: {
    trade: (names: string, noun: string, period: string, credit: string, reported = false) => `In the ${reported ? `flows reported to ${credit}` : `${credit} flows`} for ${period}, ${names} ship the most ${noun}.`,
    arms: (names: string, _noun: string, period: string) => `In SIPRI’s totals for ${period}, ${names} delivered the most major arms.`,
    refugees: (names: string, _noun: string, period: string) => `In UNHCR’s figures for ${period}, the most refugees and others in need of protection came from ${names}.`,
  } as Record<ChainKind, (names: string, noun: string, period: string, credit: string, reported?: boolean) => string>,
  and: 'and',

  // Controls
  flow: 'Flow',
  year: 'Year',
  latestYear: (period: string) => `${period}, latest available`,
  latestReported: (period: string) => `${period}, ${DEP_TEXT.mostReported}`,
  /** FAOSTAT's trade matrix lags its production and trade totals (2023 against 2024): the label says which it is. */
  latestMatrix: (period: string) => `Trade between countries: ${period}, the latest FAOSTAT has published`,
  latestPeriod: (period: string) => `${period}, latest five years available`,
  focus: 'Focus a country',
  focusHint: 'Type a country',
  focused: (name: string) => `Focused on <b>${name}</b>: only its flows are drawn`,
  clear: 'Clear focus',
  notFound: (q: string) => `No country in these flows matches "${q}".`,
  nowFocused: (name: string) => `Showing the flows of ${name}.`,
  cleared: 'Showing all flows.',

  // Diagram
  diagramLabel: (full: string, period: string, froms: string, tos: string, unit: string, focus?: string) => `${full}, ${period}${focus ? `, flows of ${focus}` : `, largest ${froms.toLowerCase()} to largest ${tos.toLowerCase()}`}, in ${unit}`,
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
  /** `shown`: what the totals are of ("in the flows shown"), when the page also gives the full figures. */
  topFroms: (froms: string, unit: string, reportedTo?: string, shown?: string) => (reportedTo ? `Largest ${froms.toLowerCase()} in the flows reported to ${reportedTo}, ${unit}` : `Top ${froms.toLowerCase()}${shown ? ` ${shown}` : ''}, ${unit}`),
  topTos: (tos: string, unit: string, reportedTo?: string, shown?: string) => (reportedTo ? `Largest ${tos.toLowerCase()} in the flows reported to ${reportedTo}, ${unit}` : `Top ${tos.toLowerCase()}${shown ? ` ${shown}` : ''}, ${unit}`),
  /** A total of the flows shown beside the source's full figure: "12.0 of 17.7". */
  ofFull: (shown: string, full: string) => `${shown} of ${full}`,
  /** The diagram's side labels when it gives full figures: "Suppliers in the flows shown". */
  axisFull: (side: string, shown: string) => `${side} ${shown}`,
  /** Under a diagram whose labels carry full figures in brackets. */
  fullCaption: {
    trade: (credit: string) => `Beside each country: its total in the flows shown, then in brackets all its exports or imports that year, from ${credit}’s trade figures.`,
    arms: (credit: string) => `Beside each country: its total in the flows shown, then in brackets all it delivered or received, from ${credit}.`,
    refugees: (credit: string) => `Beside each country: its total in the pairs shown, then in brackets everyone from it abroad, or everyone it hosts, as ${credit} counts them.`,
  } as Record<ChainKind, (credit: string) => string>,
  /** A focused place's full figure under its total of the flows shown: "All imports, 2023: 17.7 Mt". */
  fullStat: (label: string, period: string, v: string) => `${label}, ${period}: ${v}`,
  countryPage: (name: string) => `${name} country page`,

  // Phone list
  topFlows: (n: number, unit: string, reportedTo?: string) => `Top ${n} flows${reportedTo ? ` reported to ${reportedTo}` : ''}, ${unit}`,

  // Links to the other flows, below the table
  otherChains: 'Other supply chains',

  // Table and download
  tableTitle: 'The same flows as a table',
  tableLabel: (label: string) => `${label} flows`,
  tableCaption: (unit: string, period: string, n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'flow' : 'flows'}, ${unit}, ${period}.`,
  download: 'Download CSV',
  noDownload: (credit: string) => `${credit}’s terms do not allow its figures to be passed on, so they are shown here without a download.`,
  csvAmount: (amount: string, unit: string) => `${amount}, ${unit}`,
  csvPeriod: 'period',
};
