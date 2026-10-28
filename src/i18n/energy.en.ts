// English words for the oil and gas views (/oil, /oil/consumption, /oil/trade, /oil/reserves and the same for /gas):
// EIA production, use and reserves, net trade worked out from them, and UN Comtrade's flows. Same rules as
// pages.en.ts: templates take figures already formatted and return plain sentences, plain verbs, no adjectives that
// judge, and a sentence whose figure is missing is left out. Another language is another file with the same keys.
import { list } from './pages.en.ts';

export type EnergyLayer = 'production' | 'consumption' | 'trade' | 'reserves';
export type FuelId = 'oil' | 'gas';

export interface FuelText {
  /** The section's name and the start of a title ("Oil"). */
  pick: string;
  /** Inside a sentence ("oil", "natural gas"). */
  name: string;
  /** What each layer counts, after the title. */
  basis: Record<EnergyLayer, string>;
  /** The flows on the trade map. */
  flows: string;
  /** Inside a sentence about production, when it counts less than the whole fuel ("crude oil"). */
  produced: string;
}

const LAYER = {
  production: { pick: 'Production', title: (f: string) => `${f} production`, figure: 'Production', measure: 'of world production', worldLabel: 'World production, countries reporting', legend: (y: number) => `Share of world production, ${y}` },
  consumption: { pick: 'Consumption', title: (f: string) => `${f} consumption`, figure: 'Consumption', measure: 'of world consumption', worldLabel: 'World consumption, countries reporting', legend: (y: number) => `Share of world consumption, ${y}` },
  trade: { pick: 'Trade', title: (f: string) => `${f} exporters and importers`, figure: 'Net trade', measure: '', worldLabel: 'Net exports of the exporters listed', legend: (y: number, unit = '') => `Output minus use${unit ? `, ${unit}` : ''}, ${y}` },
  reserves: { pick: 'Reserves', title: (f: string) => `${f} reserves`, figure: 'Proved reserves', measure: 'of world proved reserves', worldLabel: 'World proved reserves, countries reporting', legend: (y: number) => `Share of world proved reserves, ${y}` },
};

/** The flow marks' words, without the year (a layer file carries the year apart: src/lib/map/types.ts). */
const MARKS = { flows: 'Largest flows', pipe: 'Pipeline gas', lng: 'LNG' };

export const ENERGY_TEXT = {
  hub: 'Resources',
  fuelLabel: 'Fuel',
  layerLabel: 'Measure',
  sub: 'by country',
  layer: LAYER,
  fuels: {
    oil: {
      pick: 'Oil', name: 'oil',
      basis: { production: 'crude oil', consumption: 'all oil products', trade: 'output minus use', reserves: 'crude oil' },
      flows: 'crude oil', produced: 'crude oil',
    },
    gas: {
      pick: 'Natural gas', name: 'natural gas',
      basis: { production: 'dry gas', consumption: '', trade: 'output minus use', reserves: '' },
      flows: 'natural gas', produced: 'natural gas',
    },
  } as Record<FuelId, FuelText>,
  description: (layer: EnergyLayer, name: string, year: number) => ({
    production: `Who produces ${name}: production by country, ${year}, with each country’s share of the world, on a map and in a table. Source: U.S. Energy Information Administration.`,
    consumption: `Who uses ${name}: consumption by country, ${year}, with each country’s share of the world, on a map and in a table. Source: U.S. Energy Information Administration.`,
    trade: `Who exports and imports ${name}: output minus use by country, ${year}, and the largest flows between countries, on a map and in tables. Sources: EIA and UN Comtrade.`,
    reserves: `Where the world’s proved ${name} reserves are: reserves by country, ${year}, and how many years of current output they hold. Source: U.S. Energy Information Administration.`,
  })[layer],
  lede: {
    production: (top: string, share: string, name: string, year: number, top3: string | null) => `${top} produced ${share} of the world’s ${name} in ${year}${top3 ? `; the top three countries produced ${top3}` : ''}.`,
    consumption: (top: string, share: string, name: string, year: number, top3: string | null) => `${top} used ${share} of the world’s ${name} in ${year}${top3 ? `; the top three countries used ${top3}` : ''}.`,
    reserves: (top: string, share: string, name: string, year: number, top3: string | null) => `${top} held ${share} of the world’s proved ${name} reserves in ${year}${top3 ? `; the top three countries held ${top3}` : ''}.`,
  },
  tradeLede: (top: string, exp: string, imp: string, impV: string, name: string, year: number) =>
    `${top} was the largest net exporter of ${name} in ${year}, producing ${exp} more than it used; ${imp} was the largest net importer, using ${impV} more than it produced.`,
  net: (v: string, exports: boolean) => `${v} net ${exports ? 'exports' : 'imports'}`,
  shareTicks: ['under 1%', '1–5%', '5–10%', '10–25%', '25%+'],
  ends: ['Net exporter', 'Net importer'] as [string, string],
  balanced: (v: string) => `±${v}`,
  tick: (lo: string, hi: string | null) => (hi === null ? `${lo}+` : `${lo}–${hi}`),
  none: 'No figure',
  notYet: 'Not yet reported',
  notYetLegend: 'Not yet reported',
  lastFigure: (year: number, value: string) => `${year}: ${value}`,
  notListed: (year: number) => `No figure for ${year}`,
  // The summary.
  total: {
    production: (v: string, name: string, y: number, ch: string | null) => `The countries that report produced ${v} of ${name} in ${y}${ch ? `, ${ch}` : ''}.`,
    consumption: (v: string, name: string, y: number, ch: string | null) => `The countries that report used ${v} of ${name} in ${y}${ch ? `, ${ch}` : ''}.`,
    trade: (v: string, name: string, y: number, ch: string | null) => `Net exporters produced ${v} of ${name} more than they used in ${y}${ch ? `, ${ch}` : ''}.`,
    reserves: (v: string, name: string, y: number, ch: string | null) => `The countries that report held ${v} of proved ${name} reserves in ${y}${ch ? `, ${ch}` : ''}.`,
  },
  changeIn: (pct: string, more: boolean, prev: number) => `${pct} ${more ? 'more' : 'less'} than in ${prev}`,
  change2: (pct: string, more: boolean, prev: number, value: string) => `${pct} ${more ? 'more' : 'less'} than ${prev} (${value})`,
  sameAs: (prev: number) => `Same as ${prev}`,
  top: (parts: string[], together: string | null) => `${list(parts)}${together ? `; together, ${together} of the world total` : ''}.`,
  topPart: (name: string, value: string, share: string | null) => `${name} ${value}${share ? ` (${share})` : ''}`,
  exporters: (parts: string[]) => `The largest net exporters: ${list(parts)}.`,
  importers: (parts: string[]) => `The largest net importers: ${list(parts)}.`,
  coverage: (n: number, y: number) => `${n} countries and territories have a figure for ${y}.`,
  notYetSentence: (n: number, y: number) => `${n} more reported a figure for one of the two years before but not yet for ${y}; they are hatched on the map.`,
  caveats: (fuel: FuelId, layer: EnergyLayer, flowYear: number | null): string[] => {
    const out: string[] = [];
    if (fuel === 'oil' && layer === 'production') out.push('Production is crude oil including lease condensate. Natural gas liquids and biofuels are left out here, but counted in net trade.');
    if (fuel === 'oil' && layer === 'consumption') out.push('Consumption covers all petroleum products, including those made from natural gas liquids.');
    if (fuel === 'oil' && layer === 'trade') out.push('Net trade is total oil output (crude, natural gas liquids and other liquids) minus oil use, as EIA estimates them; it is not a customs figure. Crude alone would show the United States as a large importer, though it is a net exporter of oil overall.');
    if (fuel === 'gas' && layer === 'trade') out.push('Net trade is dry gas production minus consumption, as EIA estimates them; changes in storage are left out.');
    if (layer === 'reserves') out.push('Proved reserves are what can be recovered with reasonable certainty at today’s prices and technology. They are revised often and some countries report the same figure for years; they are not all the oil or gas in the ground.');
    if (layer === 'trade' && flowYear) {
      out.push(fuel === 'oil'
        ? `Flows on the map are the largest crude oil flows in ${flowYear}, as importers report them to UN Comtrade (HS 2709), turned from tonnes into barrels a day at about 7.33 barrels a tonne.`
        : `Flows on the map are the largest gas flows in ${flowYear}, as importers report them to UN Comtrade: pipeline gas (HS 271121, solid lines) at about 0.75 million tonnes per billion cubic metres, and LNG (HS 271111, dashed lines) at about 1,360 cubic metres of gas per tonne.`);
    }
    out.push('The latest year is preliminary: EIA revises it as countries report.');
    return out;
  },
  // The world panel.
  highest: 'Highest',
  netExporters: 'Largest net exporters',
  netImporters: 'Largest net importers',
  marks: MARKS,
  flowsLabel: (year: number) => `${MARKS.flows}, ${year}`,
  pipeLabel: (year: number) => `${MARKS.pipe}, ${year}`,
  lngLabel: (year: number) => `${MARKS.lng}, ${year}`,
  flowsCaption: (n: number, year: number, what: string) => `The ${n} largest flows of ${what} in ${year}, exporter to importer, as importers report them to UN Comtrade.`,
  flowTip: (from: string, to: string, v: string, year: number, kind?: string) => `${from} → ${to}: ${v}${kind ? `, ${kind}` : ''} (${year})`,
  kind: { pipe: 'pipeline', lng: 'LNG' },
  from: 'From',
  to: 'To',
  amount: 'Amount',
  route: 'Route',
  // The country panel.
  balanceBlock: (year: number) => `Balance, ${year}`,
  balanceCaption: 'EIA estimates; net trade is output minus use',
  production: 'Production',
  liquids: 'All oil output, with gas liquids',
  consumption: 'Consumption',
  netTrade: 'Net trade',
  reserves: 'Proved reserves',
  reserveYears: 'Years of current output',
  years: (n: string) => `${n} years`,
  suppliers: (year: number) => `Main suppliers, ${year}`,
  buyers: (year: number) => `Main buyers, ${year}`,
  partnersCaption: 'Importer-reported flows (UN Comtrade); share of the flows listed',
  ofListed: (share: string) => `${share} of those listed`,
  morePartners: (n: number) => `and ${n} more`,
  otherBlock: (fuel: string) => `${fuel}`,
  otherCaption: 'Latest year shown on each map',
  rankNote: (rank: number, of: number, year: number) => `${year}, ${rank} of ${of}`,
  rank: 'Rank',
  rankOf: 'of {of}',
  status: 'Status',
  trend: (label: string) => `${label}, {from}–{to}`,
  trendCaption: '{first} in {from}; {last} in {to}.',
  ranking: 'Ranking, {year}',
  share: 'Share of world',
  // Bloc lines.
  bloc: {
    production: (b: string, share: string, name: string, y: number) => `${b} members produced ${share} of the world’s ${name} in ${y}.`,
    consumption: (b: string, share: string, name: string, y: number) => `${b} members used ${share} of the world’s ${name} in ${y}.`,
    reserves: (b: string, share: string, name: string, y: number) => `${b} members held ${share} of the world’s proved ${name} reserves in ${y}.`,
    trade: (b: string, v: string, exports: boolean, name: string, y: number) => `${b} members together were net ${exports ? 'exporters' : 'importers'} of ${v} of ${name} in ${y}.`,
  },
  blocNone: (b: string, y: number) => `No ${b} member has a figure for ${y}.`,
  // The tables.
  summary: 'Summary',
  all: 'All countries',
  tableLabel: (title: string) => `${title}, every country`,
  caption: (layer: EnergyLayer, unit: string, y: number, prev: number | null) => ({
    production: `Production in ${unit}, for every country with a figure for ${y}${prev ? `, with ${prev} for comparison` : ''}.`,
    consumption: `Consumption in ${unit}, for every country with a figure for ${y}${prev ? `, with ${prev} for comparison` : ''}.`,
    trade: `Output, use and net trade in ${unit}, for every country with all three for ${y}${prev ? `, with ${prev}’s net trade for comparison` : ''}.`,
    reserves: `Proved reserves in ${unit}, for every country with a figure for ${y}, and how many years of ${y}’s production they hold.`,
  })[layer],
  /** The trade legend's unit. */
  tradeUnit: { oil: 'million barrels a day', gas: 'billion cubic metres' } as Record<FuelId, string>,
  units: { oil: 'thousand barrels a day (k b/d) or million barrels a day (m b/d)', oilReserves: 'billion barrels', gas: 'billion cubic metres a year (bcm)', gasReserves: 'trillion cubic metres (tcm)' },
  country: 'Country',
  change: 'Change',
  netCol: 'Net',
  output: 'Output',
  use: 'Use',
  totalRow: 'Total, reporting countries',
  related: 'Related',
  sameFuel: 'Same fuel, another measure',
  otherFuel: 'Same measure, the other fuel',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  indicatorPage: 'Ranked table and trend',
  pricesTitle: 'Oil prices',
  pricesCaption: (from: string, to: string) => `Brent and WTI spot prices, US dollars a barrel, monthly averages, ${from} to ${to}.`,
  pricesLede: (brent: string, wti: string, month: string) => `In ${month} Brent averaged ${brent} a barrel and WTI ${wti}.`,
  brent: 'Brent',
  wti: 'WTI',
  month: 'Month',
  mapLabel: (title: string, year: number, top: string) => `World map: ${title.toLowerCase()} by country, ${year}. ${top}. The same figures are in the table below.`,
  source: 'U.S. Energy Information Administration (EIA), International Energy Data',
  sourcePrices: 'U.S. Energy Information Administration (EIA), spot prices',
  sourceFlows: (fuel: FuelId) => (fuel === 'oil' ? 'UN Comtrade, imports by partner (HS 2709)' : 'UN Comtrade, imports by partner (HS 271111, 271121)'),
};
