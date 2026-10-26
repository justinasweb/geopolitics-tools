// The food and fertiliser views (/food/{commodity}, /food/{commodity}/use, /food/{commodity}/trade), worked out once
// per page from the FAOSTAT adapter: the years the slider offers, every year's ranked countries and world figure,
// the colour classes (fixed across years so the slider compares like with like), the places that have not reported
// the latest year yet, and the largest flows. The page template, the map layer files and the share images read this.
import { food, type Balance, type Crop, type Flow, type Nutrient } from '../adapters/faostat.ts';
import { comtrade, fertiliserFlows } from '../adapters/comtrade.ts';
import type { Series } from '../adapters/core.ts';
import { FOOD_TEXT, type CommodityText } from '../i18n/food.en.ts';
import { inSentence } from '../i18n/pages.en.ts';
import { shared } from './data.ts';
import { formatValue } from './format.ts';
import { place } from './places.ts';
import { SHARE_BINS, shareClass, shareText } from './minerals.ts';

export const COMMODITIES = ['wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate'] as const;
export type Commodity = (typeof COMMODITIES)[number];
export const FOOD_LAYERS = ['production', 'use', 'trade'] as const;
export type FoodLayer = (typeof FOOD_LAYERS)[number];
/** The first year the views offer: the year the fetcher starts from. */
export const FIRST_YEAR = 2015;
/** Flows drawn on a trade map and listed under it. */
export const TOP_FLOWS = 20;

const foodData = shared(food);
/** Fertiliser flows come from UN Comtrade (FAOSTAT has no fertiliser trade matrix), in tonnes of product. */
const fertFlows = shared((raw) => {
  const rows = comtrade(raw);
  return { potash: fertiliserFlows(rows, 'potash'), phosphate: fertiliserFlows(rows, 'phosphate') };
});
export const MT = { kind: 'mt' } as const;
export const mt = (v: number) => formatValue(v, MT);
/** Million tonnes, short for bars: "8.9 Mt", "0.99 Mt", "0.004 Mt". */
export const mtShort = (v: number) => (Math.abs(v) >= 1 ? mt(v) : `${new Intl.NumberFormat('en', { maximumSignificantDigits: 2 }).format(v)} Mt`);
/** Net trade with its direction in words: "47.6 Mt net exports". */
export const netText = (v: number) => FOOD_TEXT.net(mt(Math.abs(v)), v >= 0);

export interface FoodRow { id: string; value: number }
export interface FoodYear {
  year: number;
  /** Places with a figure, largest first (trade: from the largest net exporter to the largest net importer). */
  rows: FoodRow[];
  /** World production (FAOSTAT's own world row where it has one), world use, or world exports (sum of countries). */
  world: number | null;
  worldOwn: boolean;
  /** Latest year only: places with a figure in one of the two years before but none yet. */
  notYet: { id: string; year: number; value: number }[];
}

export interface FoodPage {
  /** "wheat-production": the route's page id and the layer file's suffix. */
  id: string;
  commodity: Commodity;
  layer: FoodLayer;
  /** A crop (FAOSTAT production and trade) or a fertiliser nutrient (FAOSTAT fertilisers by nutrient). */
  crop: boolean;
  text: CommodityText;
  balance: Balance;
  years: number[];
  year: number;
  byYear: Record<number, FoodYear>;
  /** Trade: the diverging scale's edges in million tonnes (six); the others use the minerals' share classes. */
  edges: number[];
  ticks: string[];
  /** The largest flows in the latest year, exporter → importer, as importers report them: FAOSTAT's trade matrix for
   * crops, UN Comtrade for fertilisers (in tonnes of product, unlike the nutrient tonnes of the rest of the page). */
  flows: Flow[];
  flowYear: number | null;
}

const nameOf = (id: string) => place(id)?.name ?? id;
const yearsIn = (s: Series) => [...new Set(Object.values(s).flatMap((y) => Object.keys(y).map(Number)))];

/** The series a layer maps: production, use, or net exports (exports − imports, where both are known). */
function seriesFor(b: Balance, layer: FoodLayer): Series {
  if (layer !== 'trade') return b[layer];
  const out: Series = {};
  for (const id of new Set([...Object.keys(b.imports), ...Object.keys(b.exports)])) {
    // FAOSTAT leaves out years with no exports, so a missing export figure beside an import figure is none.
    for (const y of yearsIn({ [id]: { ...b.imports[id], ...b.exports[id] } })) {
      const i = b.imports[id]?.[y];
      const e = b.exports[id]?.[y];
      if (i === undefined && e === undefined) continue;
      (out[id] ??= {})[y] = (e ?? 0) - (i ?? 0);
    }
  }
  return out;
}

/** Rounds up to 1, 2 or 5 times a power of ten: the trade scale's edges read as plain numbers. */
export function nice(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= v * 0.999)!;
}

/** Three edges for the size of net trade, from the default year: about the median, the 80th and 95th percentile. */
function tradeEdges(rows: FoodRow[]): number[] {
  const a = rows.map((r) => Math.abs(r.value)).filter((v) => v > 0).sort((x, y) => x - y);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))] ?? 1;
  const e1 = nice(q(0.5));
  const e2 = Math.max(nice(q(0.8)), e1 * 2);
  const e3 = Math.max(nice(q(0.95)), e2 * 2);
  return [-e3, -e2, -e1, e1, e2, e3];
}

/** The colour class of a figure: 1–5 by share of the world for production and use; 1–7 for net trade, 1 the largest net exporter. */
export function classFor(p: FoodPage, v: number, world: number | null): number {
  if (p.layer === 'trade') return 7 - p.edges.filter((e) => v >= e).length;
  return world ? shareClass(v / world) : 1;
}

/** A figure's share of the world, for reading ("18%", "<0.1%"). */
export const shareOf = (v: number, world: number | null) => (world ? shareText(v / world) : null);

function buildPage(commodity: Commodity, layer: FoodLayer): FoodPage | null {
  const d = foodData();
  if (!d) return null;
  const crop = commodity !== 'potash' && commodity !== 'phosphate';
  const b = crop ? d.crops[commodity as Crop] : d.fertilisers[commodity as Nutrient];
  const s = seriesFor(b, layer);
  const count = new Map<number, number>();
  for (const ys of Object.values(s)) for (const y of Object.keys(ys).map(Number)) if (y >= FIRST_YEAR) count.set(y, (count.get(y) ?? 0) + 1);
  if (!count.size) return null;
  // The default year: the latest with at least 90% of the best coverage; the slider offers the years with half of it.
  const most = Math.max(...count.values());
  const year = Math.max(...[...count].filter(([, n]) => n >= 0.9 * most).map(([y]) => y));
  const years = [...count].filter(([y, n]) => y <= year && n >= 0.5 * count.get(year)!).map(([y]) => y).sort((x, y) => x - y);
  const byYear: Record<number, FoodYear> = {};
  for (const y of years) {
    const rows = Object.entries(s).filter(([, v]) => v[y] !== undefined).map(([id, v]) => ({ id, value: v[y] }))
      .sort((x, z) => z.value - x.value || x.id.localeCompare(z.id));
    const own = layer === 'production' ? b.world.production[y] : undefined;
    const sum = (rs: number[]) => rs.reduce((t, v) => t + v, 0);
    const world = own ?? (layer === 'trade' ? sum(Object.values(b.exports).map((v) => v[y] ?? 0)) : sum(rows.map((r) => r.value)));
    const notYet = y === year
      ? Object.entries(s).filter(([, v]) => v[y] === undefined && Math.abs(v[y - 1] ?? v[y - 2] ?? 0) >= 0.001)
        .map(([id, v]) => ({ id, year: v[y - 1] !== undefined ? y - 1 : y - 2, value: v[y - 1] ?? v[y - 2] }))
      : [];
    byYear[y] = { year: y, rows, world: world || null, worldOwn: own !== undefined, notYet };
  }
  const edges = layer === 'trade' ? tradeEdges(byYear[year].rows) : SHARE_BINS;
  const T = FOOD_TEXT;
  const ticks = layer === 'trade'
    ? [...[2, 1, 0].map((i) => T.tick(edges[3 + i], i === 2 ? null : edges[4 + i])), T.balanced(edges[3]), ...[0, 1, 2].map((i) => T.tick(edges[3 + i], i === 2 ? null : edges[4 + i]))]
    : T.shareTicks;
  let flows: Flow[] = [];
  let flowYear: number | null = null;
  const all = crop ? d.flows[commodity as Crop] ?? [] : fertFlows()?.[commodity as 'potash' | 'phosphate'] ?? [];
  if (layer === 'trade' && all.length) {
    flowYear = Math.max(...all.map((f) => f.year));
    flows = all.filter((f) => f.year === flowYear).sort((x, z) => z.amount - x.amount);
  }
  return { id: `${commodity}-${layer}`, commodity, layer, crop, text: T.commodities[commodity], balance: b, years, year, byYear, edges, ticks, flows, flowYear };
}

let cache: FoodPage[] | null = null;
/** Every food page with data in this snapshot: each commodity's production, use and trade. */
export function foodPages(): FoodPage[] {
  cache ??= COMMODITIES.flatMap((c) => FOOD_LAYERS.map((l) => buildPage(c, l))).filter((p): p is FoodPage => p !== null);
  return cache;
}
export const foodPage = (id: string) => foodPages().find((p) => p.id === id);
export const commodityPages = (c: Commodity) => foodPages().filter((p) => p.commodity === c);

/** A figure as the layer's table and panel write it. */
export const valueText = (p: FoodPage, v: number) => (p.layer === 'trade' ? netText(v) : mt(v));

/** The change in the world figure from the year before, as a share, when both years have one. */
export function worldChange(p: FoodPage, y: number): number | null {
  const a = p.byYear[y]?.world;
  const b = p.byYear[y - 1]?.world;
  return a && b ? a / b - 1 : null;
}

/** Whether FAOSTAT flags a place's figure on this layer as its estimate (for net trade: either side). */
export function estimated(p: FoodPage, id: string, y: number): boolean {
  const e = p.balance.estimated;
  return p.layer === 'trade' ? !!(e.imports[id]?.[y] || e.exports[id]?.[y]) : !!e[p.layer][id]?.[y];
}

/** A place's balance in a year: production, imports, exports and use, each where FAOSTAT has it. */
export function balanceOf(p: FoodPage, id: string, y: number) {
  const g = (s: Series) => s[id]?.[y];
  return { production: g(p.balance.production), imports: g(p.balance.imports), exports: g(p.balance.exports), use: g(p.balance.use) };
}

/** The one-sentence answer under the title. */
export function lede(p: FoodPage, year = p.year): string | null {
  const y = p.byYear[year];
  const top = y?.rows[0];
  if (!top) return null;
  const T = p.text;
  if (p.layer === 'trade') {
    const imp = y.rows.at(-1)!;
    return FOOD_TEXT.tradeLede(inSentence(nameOf(top.id), true), mt(top.value), inSentence(nameOf(imp.id)), mt(-imp.value), T.name, year);
  }
  const top3 = y.rows.length > 3 ? shareOf(y.rows.slice(0, 3).reduce((s, r) => s + r.value, 0), y.world) : null;
  return FOOD_TEXT.lede[p.layer](inSentence(nameOf(top.id), true), shareOf(top.value, y.world) ?? '', T.name, year, top3);
}

/** The summary paragraphs: the world figure and its change, the top countries, coverage and the caveats. */
export function summary(p: FoodPage, year = p.year): string[] {
  const T = FOOD_TEXT;
  const y = p.byYear[year];
  const first: string[] = [];
  const ch = worldChange(p, year);
  const change = ch === null || Math.abs(ch) < 0.005 ? null : T.changeIn(shareText(Math.abs(ch)), ch > 0, year - 1);
  if (y.world) first.push(T.total[p.layer](mt(y.world), p.text.name, year, change, y.worldOwn));
  if (p.layer === 'trade') {
    const ex = y.rows.filter((r) => r.value > 0).slice(0, 3);
    const im = [...y.rows].reverse().filter((r) => r.value < 0).slice(0, 3);
    if (ex.length) first.push(T.exporters(ex.map((r, i) => `${inSentence(nameOf(r.id), i === 0)} ${mt(r.value)}`)));
    if (im.length) first.push(T.importers(im.map((r, i) => `${inSentence(nameOf(r.id), i === 0)} ${mt(-r.value)}`)));
  } else {
    const top = y.rows.slice(0, 3);
    const together = top.length === 3 ? shareOf(top.reduce((s, r) => s + r.value, 0), y.world) : null;
    first.push(T.top(top.map((r, i) => T.topPart(inSentence(nameOf(r.id), i === 0), mt(r.value), shareOf(r.value, y.world))), together));
  }
  const second = [T.coverage(y.rows.length, year), ...(y.notYet.length ? [T.notYetSentence(y.notYet.length, year)] : []), ...T.caveats(p.commodity, p.layer, p.flowYear)];
  return [first.join(' '), second.join(' ')];
}

/** The source line: FAOSTAT's domains this page reads (and UN Comtrade for fertiliser flows). */
export const sourceOf = (p: FoodPage) => (p.crop ? FOOD_TEXT.sourceCrops : FOOD_TEXT.sourceFertilisers);
/** The source line under a page's flows. */
export const flowSourceOf = (p: FoodPage) => (p.crop ? FOOD_TEXT.sourceCrops : FOOD_TEXT.sourceFertFlows);
