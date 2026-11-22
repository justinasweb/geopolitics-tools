// English words for the chokepoints view (/chokepoints) and the chokepoint pages (/chokepoints/{slug}), from IMF
// PortWatch's daily transits (src/lib/chokepoints.ts). Statuses compare the last 7 days with the last 365 (the
// adapter's rule); the words name the comparison, not a cause.
import { wholePercent, type Status } from '../adapters/portwatch.ts';

/** Ships a day: whole from 10, one decimal below ("96", "4.3"), "0" for none. */
export const ships = (n: number) => (n === 0 ? '0' : new Intl.NumberFormat('en', { maximumFractionDigits: n >= 10 ? 0 : 1 }).format(n));
/** Metric tonnes as the pages say them: "1.2 million tonnes", "830,000 tonnes". */
export const tonnes = (t: number) => (t >= 1e6 ? `${new Intl.NumberFormat('en', { maximumFractionDigits: t >= 1e8 ? 0 : 1 }).format(t / 1e6)} million tonnes` : `${new Intl.NumberFormat('en', { maximumSignificantDigits: 3 }).format(t)} tonnes`);
/** A change against the usual level, as the whole percent the status is read from ("12% below", "3% above", "at"). */
export function changeWords(change: number): string {
  const p = wholePercent(change);
  if (p === 0) return 'at';
  return `${Math.abs(p)}% ${p < 0 ? 'below' : 'above'}`;
}
/** The same in a table cell: "−12%", "+3%", "0%". */
export const changeCell = (change: number) => {
  const p = wholePercent(change);
  return p === 0 ? '0%' : `${p < 0 ? '−' : '+'}${Math.abs(p)}%`;
};
/** The years a comparison uses: "2023–2025". */
export const yearsText = (y: [number, number]) => (y[0] === y[1] ? String(y[0]) : `${y[0]}–${y[1]}`);

export const CHOKEPOINTS_TEXT = {
  section: 'Chokepoints',
  title: 'Shipping chokepoints',
  sub: 'ships a day against the same week in earlier years',
  description: (n: number, last: string) => `Daily ship traffic through ${n} shipping chokepoints to ${last}, against each one’s usual level: Suez, Hormuz, Malacca, Panama and more. Source: IMF PortWatch.`,
  source: 'IMF PortWatch',
  /** "daily transits to 15 Nov 2026", "imported 22 Nov 2026". */
  dataTo: (date: string) => `daily transits to ${date}`,
  imported: (date: string) => `imported ${date}`,
  weekTo: (date: string) => `week to ${date}`,
  days30: (date: string) => `30 days to ${date}`,
  daily: (from: string, to: string) => `${from} – ${to}, daily`,
  estimated: 'estimated cargo',
  /** The view's summary line: how many are below their usual level, and which is furthest below. */
  lede: (date: string, below: number, all: number, years: string, furthest: { name: string; change: string } | null) =>
    below === 0
      ? `In the week to ${date}, none of the ${all} chokepoints had 10% or more fewer ships than in the same week in ${years}.`
      : `In the week to ${date}, ${below} of the ${all} chokepoints had 10% or more fewer ships than in the same week in ${years}${furthest ? `; the furthest below was ${furthest.name}, ${furthest.change} its level then` : ''}.`,
  ledeNone: (date: string, all: number) => `In the week to ${date}, none of the ${all} chokepoints had counts for the same week in at least two of the three years before, so none can be compared.`,
  usualNote: 'Usual: the same week in each of the three years before (the median of their averages); no status where fewer than two of those years have counts.',
  status: {
    disrupted: '30% or more below usual',
    below: '10% to 30% below usual',
    normal: 'Near usual',
    above: '15% or more above usual',
    unknown: 'No recent data',
  } as Record<Status, string>,
  /** Short words for the table. */
  statusShort: { disrupted: '30%+ below', below: '10–30% below', normal: 'Near usual', above: '15%+ above', unknown: 'No data' } as Record<Status, string>,
  legend: 'Ships a day, last 7 days against the same week in the three years before',
  noShading: 'Countries are not shaded on this map',
  mark: 'Shipping chokepoint',
  mapLabel: (n: number, below: number) => `Map of ${n} shipping chokepoints, ${below} with 10% or more fewer ships in the last 7 days than in the same week in the three years before. The same figures are in the table below.`,
  tip: (name: string, status: string, avg: string, date: string) => `${name}: ${status}, ${avg} ships a day in the week to ${date}`,
  counts: 'Chokepoints by traffic',
  furthest: 'Furthest below usual',
  noneBelow: 'None is 10% or more below usual.',
  tableTitle: 'All chokepoints',
  tableLabel: 'Shipping chokepoints, ships a day',
  caption: (n: number) => `${n} chokepoints, sorted by the last 7 days against the same week in the three years before. Ships a day of every type, counted crossing in either direction: the average of the last 7 days, and the usual level (the median of the same week’s averages in those years).`,
  colName: 'Chokepoint',
  colStatus: 'Status',
  colAvg: 'Last 7 days',
  colBase: 'Usual',
  colChange: 'Against usual',
  colLast: 'Data to',
  summary: 'Summary',
  related: 'Related',
  caveat: 'PortWatch counts ships from the position signals they send (AIS). A ship with its signal off is not counted.',

  // The chokepoint pages.
  placeTitle: (name: string) => `${name}: traffic and trade`,
  placeDescription: (name: string, line: string) => `${name}: ${line.charAt(0).toLowerCase()}${line.slice(1)} Daily ships, vessel mix and estimated cargo (IMF PortWatch).`,
  /** The status line: "Traffic was 12% below its usual level in the week to 31 Oct 2026." */
  statusLine: (change: string, date: string, years: string) => (change === 'at' ? `Traffic in the week to ${date} was at its usual level, compared with the same week in ${years}.` : `Traffic in the week to ${date} was ${change} usual, compared with the same week in ${years}.`),
  noRecent: (date: string) => `No ships were counted in the last 7 days to ${date}.`,
  noUsual: (date: string, avg: string) => `${avg} ships a day crossed in the week to ${date}; fewer than two of the three years before have counts for that week, so there is no usual level to compare with.`,
  kfWeek: 'Last 7 days',
  kfWeekMeta: (date: string) => `ships a day, average · week to ${date}`,
  kfUsual: 'Same week, earlier years',
  kfUsualMeta: (years: string) => `ships a day · median of ${years}`,
  kfUsualNone: 'fewer than two earlier years with counts',
  kfTankers: 'Tankers',
  kfTankersMeta: (date: string) => `of ships · week to ${date}`,
  where: 'Where it is',
  locLabel: (name: string) => `Map of the area around ${name}, its position marked`,
  locKey: 'PortWatch’s point for the chokepoint',
  chart: 'Ships per day, last 12 months',
  chartLabel: (name: string, from: string, to: string) => `Ships through ${name} each day from ${from} to ${to}, with the usual range. The monthly figures are in the table below.`,
  chartLine: (name: string) => `Ships through ${name} per day`,
  chartBand: 'Usual range: same day in the three years before, lowest to highest',
  chartGaps: 'No band where one of those years has no count.',
  mix: 'Vessel mix, last 30 days',
  mixLabel: (parts: string) => `Vessel mix over the last 30 days: ${parts}`,
  cargo: 'Ships and estimated cargo, last 7 days',
  cargoLabel: 'Estimated cargo, IMF PortWatch (from ship signals, not official statistics)',
  cargoCaption: 'Daily averages by vessel type. Cargo is PortWatch’s estimate in metric tonnes, from each ship’s size and signals.',
  colType: 'Vessel type',
  colShips: 'Ships a day',
  colCargo: 'Estimated cargo a day',
  all: 'All ships',
  months: 'Transits by month',
  monthsCaption: 'Ships of all types counted crossing in either direction. Against usual: the month’s ships a day against the same days in the three years before (the median of their averages); – where fewer than two of those years have counts.',
  colMonth: 'Month',
  colTransits: 'Transits',
  colPerDay: 'Per day',
  colAgainst: 'Against usual',
  colCargoMonth: 'Estimated cargo',
  partMonth: (month: string, to: string) => `${month} (to ${to})`,
  types: { n_tanker: 'Tankers', n_container: 'Container ships', n_dry_bulk: 'Bulk carriers', n_general_cargo: 'General cargo', n_roro: 'Ro-ro (vehicles)' } as Record<string, string>,
  other: 'Other',
  industries: 'Main industries of the trade through it (PortWatch)',
  others: 'Other chokepoints',
  allPoints: (n: number) => `All ${n} chokepoints`,
  mapView: 'Map view',
  oilTrade: 'Oil trade', gasTrade: 'Gas trade', oilChain: 'Oil supply chain', chain: 'Supply chain',
  chokepoint: 'Chokepoint',
  caveatSource: (source: string, date: string) => `${source}, seen ${date}`,
};
