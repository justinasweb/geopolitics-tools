// English words for the food and fertiliser views (/food/{commodity}, /use, /trade): FAOSTAT production, use and
// trade of wheat, maize, rice, soybeans, potash and phosphate. Same rules as pages.en.ts: templates take figures
// already formatted and return plain sentences, plain verbs, no adjectives that judge, and a sentence whose figure is
// missing is left out. Another language is another file with the same keys.
import { list } from './pages.en.ts';

export interface CommodityText {
  /** The picker's word and the start of a title ("Wheat"). */
  pick: string;
  /** Inside a sentence ("wheat", "potash"). */
  name: string;
  /** What the tonnes count, after the title ("milled equivalent", "tonnes of K2O"). */
  basis: string;
}

type Layer = 'production' | 'use' | 'trade';

const num = (v: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(v);

const LAYER = {
  production: { pick: 'Production', title: (c: string) => `${c} production`, figure: 'Production', worldLabel: 'World production', measure: 'of world production', legend: (y: number) => `Share of world production, ${y}` },
  use: { pick: 'Use', title: (c: string) => `${c} use`, figure: 'Use', worldLabel: 'World use, countries reporting', measure: 'of world use', legend: (y: number) => `Share of world use, ${y}` },
  trade: { pick: 'Trade', title: (c: string) => `${c} trade`, figure: 'Net trade', worldLabel: 'World exports, countries reporting', measure: '', legend: (y: number) => `Exports minus imports, million tonnes, ${y}` },
};

export const FOOD_TEXT = {
  section: 'Food and fertiliser',
  hub: 'Resources',
  commodityLabel: 'Commodity',
  layerLabel: 'Measure',
  sub: 'by country',
  layer: LAYER,
  commodities: {
    wheat: { pick: 'Wheat', name: 'wheat', basis: 'tonnes' },
    maize: { pick: 'Maize', name: 'maize', basis: 'tonnes' },
    rice: { pick: 'Rice', name: 'rice', basis: 'tonnes of milled rice' },
    soy: { pick: 'Soybeans', name: 'soybeans', basis: 'tonnes' },
    potash: { pick: 'Potash', name: 'potash fertiliser', basis: 'tonnes of K2O' },
    phosphate: { pick: 'Phosphate', name: 'phosphate fertiliser', basis: 'tonnes of P2O5' },
  } as Record<string, CommodityText>,
  description: (layer: Layer, name: string, year: number) => ({
    production: `Who produces ${name}: production by country, ${year}, with each country’s share of the world, on a map and in a table. Source: FAOSTAT.`,
    use: `Who uses ${name}: use by country, ${year}, worked out from production and trade, on a map and in a table. Source: FAOSTAT.`,
    trade: `Who exports and imports ${name}: net trade by country, ${year}, and the largest flows, on a map and in tables. Source: FAOSTAT.`,
  })[layer],
  /** The answer under the title. */
  lede: {
    production: (top: string, share: string, name: string, year: number, top3: string | null) => `${top} produced ${share} of the world’s ${name} in ${year}${top3 ? `; the top three countries produced ${top3}` : ''}.`,
    use: (top: string, share: string, name: string, year: number, top3: string | null) => `${top} used ${share} of the world’s ${name} in ${year}${top3 ? `; the top three countries used ${top3}` : ''}.`,
  },
  tradeLede: (top: string, exp: string, imp: string, impV: string, name: string, year: number) =>
    `${top} was the largest net exporter of ${name} in ${year}, selling ${exp} more than it bought; ${imp} was the largest net importer, buying ${impV} more than it sold.`,
  net: (v: string, exports: boolean) => `${v} net ${exports ? 'exports' : 'imports'}`,
  tick: (lo: number, hi: number | null) => (hi === null ? `${num(lo)} Mt+` : `${num(lo)}–${num(hi)} Mt`),
  balanced: (e: number) => `±${num(e)} Mt`,
  shareTicks: ['under 1%', '1–5%', '5–10%', '10–25%', '25%+'],
  ends: ['Net exporter', 'Net importer'] as [string, string],
  none: 'No figure',
  notYet: 'Not yet reported',
  notYetLegend: 'Not yet reported',
  lastFigure: (year: number, value: string) => `${year}: ${value}`,
  notListed: (year: number) => `No figure for ${year}`,
  // The summary.
  total: {
    production: (v: string, name: string, y: number, ch: string | null, own: boolean) => `The world produced ${v} of ${name} in ${y}${ch ? `, ${ch}` : ''}${own ? '' : ', counting the countries that report'}.`,
    use: (v: string, name: string, y: number, ch: string | null) => `The countries that report used ${v} of ${name} in ${y}${ch ? `, ${ch}` : ''}.`,
    trade: (v: string, name: string, y: number, ch: string | null) => `Countries reported exporting ${v} of ${name} in ${y}${ch ? `, ${ch}` : ''}.`,
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
  /** The caveats under the summary, by commodity and layer. */
  caveats: (c: string, layer: Layer, flowYear: number | null): string[] => {
    const out: string[] = [];
    const fert = c === 'potash' || c === 'phosphate';
    if (fert) out.push('Fertilisers are counted in tonnes of nutrient: potassium oxide (K2O) for potash, phosphorus pentoxide (P2O5) for phosphate. Most fertiliser figures are FAOSTAT’s own estimates, marked e in the table.');
    if (c === 'rice') out.push('Rice is counted as milled rice: FAOSTAT’s paddy production times 0.67, and trade in milled equivalent.');
    if (layer === 'use' && !fert) out.push('Use is production plus imports minus exports. It covers food, animal feed, industrial uses, seed and waste, and leaves out changes in stocks; FAOSTAT’s food balance sheets, which split these, come two years or more later.');
    if (layer === 'use' && fert) out.push('Use is FAOSTAT’s agricultural use: what farmers apply, as countries report it.');
    if (layer === 'trade') out.push(`Net trade is exports minus imports, as each country reports them to FAOSTAT; one country’s exports and its partners’ imports often differ.${flowYear ? ` Flows on the map are the largest in ${flowYear}, as importers report them.` : ''}`);
    if (layer === 'trade' && fert) out.push('FAOSTAT does not publish who trades fertilisers with whom, so this map has no flows.');
    return out;
  },
  caveat: (c: string, layer: Layer) => FOOD_TEXT.caveats(c, layer, null).join(' '),
  // The world panel.
  highest: 'Highest',
  netExporters: 'Largest net exporters',
  netImporters: 'Largest net importers',
  flowsLabel: (year: number) => `Largest flows, ${year}`,
  flowsCaption: (n: number, year: number) => `The ${n} largest flows in ${year}, exporter to importer, as importers report them.`,
  flowTip: (from: string, to: string, v: string, year: number) => `${from} → ${to}: ${v} (${year})`,
  from: 'From',
  to: 'To',
  amount: 'Amount',
  // The country panel.
  balanceBlock: (year: number) => `Balance, ${year}`,
  balanceCaption: 'Use is production plus imports minus exports',
  balanceCaptionFert: 'Tonnes of nutrient; use is what FAOSTAT reports as agricultural use',
  production: 'Production',
  imports: 'Imports',
  exports: 'Exports',
  use: 'Use',
  selfSufficiency: 'Production as a share of use',
  suppliers: (year: number) => `Main suppliers, ${year}`,
  buyers: (year: number) => `Main buyers, ${year}`,
  partnersCaption: 'Importer-reported flows; share of the flows listed',
  ofListed: (share: string) => `${share} of those listed`,
  morePartners: (n: number) => `and ${n} more`,
  otherBlock: (measure: string) => `${measure} of the other commodities`,
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
    use: (b: string, share: string, name: string, y: number) => `${b} members used ${share} of the world’s ${name} in ${y}.`,
    trade: (b: string, v: string, exports: boolean, name: string, y: number) => `${b} members together were net ${exports ? 'exporters' : 'importers'} of ${v} of ${name} in ${y}.`,
  },
  blocNone: (b: string, y: number) => `No ${b} member has a figure for ${y}.`,
  // The tables.
  summary: 'Summary',
  all: 'All countries',
  tableLabel: (title: string) => `${title}, every country`,
  caption: (layer: Layer, basis: string, y: number, prev: number | null) => ({
    production: `Production in million tonnes (Mt) or tonnes (t), ${basis === 'tonnes' ? 'as FAOSTAT reports it' : `as ${basis}`}, for every country with a figure for ${y}${prev ? `, with ${prev} for comparison` : ''}.`,
    use: `Use, worked out as production plus imports minus exports, in million tonnes (Mt) or tonnes (t)${basis === 'tonnes' ? '' : `, as ${basis}`}, for every country with a figure for ${y}.`,
    trade: `Exports, imports and net trade in million tonnes (Mt) or tonnes (t)${basis === 'tonnes' ? '' : `, as ${basis}`}, for every country with a figure for ${y}${prev ? `, with ${prev}’s net trade for comparison` : ''}.`,
  })[layer],
  fertUseCaption: (basis: string, y: number) => `Agricultural use in million tonnes (Mt) or tonnes (t), as ${basis}, for every country with a figure for ${y}.`,
  country: 'Country',
  change: 'Change',
  netCol: 'Net',
  worldRow: 'World',
  totalRow: 'Total, reporting countries',
  related: 'Related',
  sameCommodity: 'Same commodity, another measure',
  sameMeasure: 'Same measure, another commodity',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  indicatorPage: 'Ranked table and trend',
  notes: 'Notes',
  estNote: 'e: FAOSTAT’s own estimate or imputation.',
  estTitle: 'FAOSTAT estimate',
  mapLabel: (title: string, year: number, top: string) => `World map: ${title.toLowerCase()} by country, ${year}. ${top}. The same figures are in the table below.`,
  sourceCrops: 'FAOSTAT (FAO)',
  sourceFertilisers: 'FAOSTAT (FAO), fertilisers by nutrient',
  citation: (domains: string, years: string, url: string, accessed: string) =>
    `FAO. FAOSTAT: ${domains}, ${years}. Licence: CC BY 4.0. Accessed ${accessed}. Retrieved via ${url}.`,
  domainsCrops: 'Crops and livestock products; Trade (crops and livestock products); Detailed trade matrix',
  domainsFertilisers: 'Fertilizers by Nutrient',
  ogCaption: (title: string, year: number) => `${title}, ${year}`,
};

const RUSSIA = 'Russia’s customs service stopped publishing detailed trade figures in 2022, so FAOSTAT’s trade figures for Russia since then may be estimates or incomplete.';

/** Notes on single places, by page id (commodity-layer): where a figure surprises or the source says less than it seems. */
export const FOOD_NOTES: Record<string, Record<string, string>> = {
  'wheat-trade': { RUS: RUSSIA },
  'wheat-use': { RUS: RUSSIA },
  'maize-trade': { RUS: RUSSIA },
  'potash-trade': { RUS: RUSSIA, BLR: 'FAOSTAT estimates Belarus’s potash trade. Its exports fell in 2022, when Lithuania stopped Belarusian potash passing through its port of Klaipėda.' },
  'phosphate-trade': { RUS: RUSSIA, MAR: 'FAOSTAT’s 2024 export figure for Morocco is more than twice its 2023 figure and above Morocco’s own reported production that year; it may be revised.' },
};
