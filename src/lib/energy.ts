// The oil and gas views (/oil, /oil/consumption, /oil/trade, /oil/reserves, and the same for /gas), worked out once
// per page from the EIA adapter, with UN Comtrade's flows on the trade maps: the years the slider offers, every
// year's ranked countries and world figure, the colour classes (fixed across years so the slider compares like with
// like), the places that have not reported the latest year yet, and the largest flows. The page template, the map
// layer files and the share images read this. Built on food.ts's rules, so the two read alike.
import { gas, oil, oilPrices, type Fuel, type Oil } from '../adapters/eia.ts';
import { comtrade, crudeFlows, gasFlows, type GasFlow } from '../adapters/comtrade.ts';
import type { Series } from '../adapters/core.ts';
import { ENERGY_TEXT, type EnergyLayer, type FuelId, type FuelText } from '../i18n/energy.en.ts';
import { inSentence } from '../i18n/pages.en.ts';
import { shared } from './data.ts';
import { nice } from './food.ts';
import { place } from './places.ts';
import { SHARE_BINS, shareClass, shareText } from './minerals.ts';

export const FUELS = ['oil', 'gas'] as const;
export const ENERGY_LAYERS = ['production', 'consumption', 'trade', 'reserves'] as const;
/** The first year the views offer: the year the fetcher starts from. */
export const FIRST_YEAR = 2000;
/** Flows drawn on a trade map and listed under it (each kind, for gas). */
export const TOP_FLOWS = 20;
export type { EnergyLayer, FuelId };

const fuels = { oil: shared(oil), gas: shared(gas) };
const flowData = shared((raw) => { const r = comtrade(raw); return { oil: crudeFlows(r), gas: gasFlows(r) }; });
export const prices = shared(oilPrices);

const n = (v: number, digits: number) => new Intl.NumberFormat('en', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
const MINUS = '−';
/** A figure in the layer's unit: "13.2 m b/d", "450k b/d", "1,035 bcm", "47.8 tcm", "303 bn barrels". */
export function amount(fuel: FuelId, layer: EnergyLayer, v: number): string {
  const s = v < 0 ? MINUS : '';
  const a = Math.abs(v);
  // Non-breaking spaces, so a figure never wraps between number and unit.
  if (layer === 'reserves') return fuel === 'oil' ? `${s}${n(a, a < 10 ? 1 : 0)}\u00a0bn barrels` : `${s}${n(a, a < 10 ? 2 : 1)}\u00a0tcm`;
  if (fuel === 'oil') return a >= 1000 ? `${s}${n(a / 1000, 1)}\u00a0m\u00a0b/d` : `${s}${n(a, a < 10 ? 1 : 0)}k\u00a0b/d`;
  return `${s}${n(a, a < 10 ? 2 : a < 100 ? 1 : 0)}\u00a0bcm`;
}
/** Short, for bars and ticks. */
export const amountShort = (fuel: FuelId, layer: EnergyLayer, v: number) => amount(fuel, layer, v).replace('\u00a0barrels', '');

export interface EnergyRow { id: string; value: number }
export interface EnergyYear {
  year: number;
  /** Places with a figure, largest first (trade: from the largest net exporter to the largest net importer). */
  rows: EnergyRow[];
  /** World production, use or reserves (sum of the countries reporting); for trade, the net exports of the exporters. */
  world: number | null;
  /** Latest year only: places with a figure in one of the two years before but none yet. */
  notYet: { id: string; year: number; value: number }[];
}

export interface EnergyPage {
  /** "oil-trade": the route's page id and the layer file's suffix. */
  id: string;
  fuel: FuelId;
  layer: EnergyLayer;
  text: FuelText;
  data: Fuel;
  years: number[];
  year: number;
  byYear: Record<number, EnergyYear>;
  /** Trade: the diverging scale's six edges in the layer's unit; the others use the minerals' share classes. */
  edges: number[];
  ticks: string[];
  /** Trade: the largest flows in Comtrade's latest year, exporter → importer, as importers report them. */
  flows: (GasFlow | { from: string; to: string; amount: number; year: number; kind?: undefined })[];
  flowYear: number | null;
}

const nameOf = (id: string) => place(id)?.name ?? id;

function seriesFor(f: Fuel, layer: EnergyLayer): Series {
  return layer === 'trade' ? f.net : f[layer];
}

/** Three edges for the size of net trade, from the default year: about the median, the 80th and 95th percentile. */
function tradeEdges(rows: EnergyRow[]): number[] {
  const a = rows.map((r) => Math.abs(r.value)).filter((v) => v > 0).sort((x, y) => x - y);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))] ?? 1;
  const e1 = nice(q(0.5));
  const e2 = Math.max(nice(q(0.8)), e1 * 2);
  const e3 = Math.max(nice(q(0.95)), e2 * 2);
  return [-e3, -e2, -e1, e1, e2, e3];
}

/** The colour class of a figure: 1–5 by share of the world; 1–7 for net trade, 1 the largest net exporter. */
export function classFor(p: EnergyPage, v: number, world: number | null): number {
  if (p.layer === 'trade') return 7 - p.edges.filter((e) => v >= e).length;
  return world ? shareClass(v / world) : 1;
}

/** A figure's share of the world, for reading ("18%", "<0.1%"). */
export const shareOf = (v: number, world: number | null) => (world ? shareText(v / world) : null);

function buildPage(fuel: FuelId, layer: EnergyLayer): EnergyPage | null {
  const f = fuels[fuel]();
  if (!f) return null;
  const s = seriesFor(f, layer);
  const count = new Map<number, number>();
  for (const ys of Object.values(s)) for (const y of Object.keys(ys).map(Number)) if (y >= FIRST_YEAR) count.set(y, (count.get(y) ?? 0) + 1);
  if (!count.size) return null;
  // The default year: the latest with at least 90% of the best coverage; the slider offers the years with half of it.
  const most = Math.max(...count.values());
  const year = Math.max(...[...count].filter(([, c]) => c >= 0.9 * most).map(([y]) => y));
  const years = [...count].filter(([y, c]) => y <= year && c >= 0.5 * count.get(year)!).map(([y]) => y).sort((x, y) => x - y);
  const byYear: Record<number, EnergyYear> = {};
  for (const y of years) {
    const rows = Object.entries(s).filter(([, v]) => v[y] !== undefined).map(([id, v]) => ({ id, value: v[y] }))
      .sort((x, z) => z.value - x.value || x.id.localeCompare(z.id));
    const sum = (rs: number[]) => rs.reduce((t, v) => t + v, 0);
    const world = layer === 'trade' ? sum(rows.filter((r) => r.value > 0).map((r) => r.value)) : sum(rows.map((r) => r.value));
    const notYet = y === year
      ? Object.entries(s).filter(([, v]) => v[y] === undefined && (v[y - 1] ?? v[y - 2]) !== undefined)
        .map(([id, v]) => ({ id, year: v[y - 1] !== undefined ? y - 1 : y - 2, value: v[y - 1] ?? v[y - 2] }))
      : [];
    byYear[y] = { year: y, rows, world: world || null, notYet };
  }
  const T = ENERGY_TEXT;
  const edges = layer === 'trade' ? tradeEdges(byYear[year].rows) : SHARE_BINS;
  // Bare numbers, the unit in the legend's title: million barrels a day for oil, so the ticks stay short.
  const a = (v: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(fuel === 'oil' ? v / 1000 : v);
  const ticks = layer === 'trade'
    ? [...[2, 1, 0].map((i) => T.tick(a(edges[3 + i]), i === 2 ? null : a(edges[4 + i]))), T.balanced(a(edges[3])), ...[0, 1, 2].map((i) => T.tick(a(edges[3 + i]), i === 2 ? null : a(edges[4 + i])))]
    : T.shareTicks;
  let flows: EnergyPage['flows'] = [];
  let flowYear: number | null = null;
  const all = layer === 'trade' ? flowData()?.[fuel] ?? [] : [];
  if (all.length) {
    flowYear = Math.max(...all.map((x) => x.year));
    flows = all.filter((x) => x.year === flowYear).sort((x, z) => z.amount - x.amount);
  }
  return { id: `${fuel}-${layer}`, fuel, layer, text: T.fuels[fuel], data: f, years, year, byYear, edges, ticks, flows, flowYear };
}

let cache: EnergyPage[] | null = null;
/** Every oil and gas page with data in this snapshot. */
export function energyPages(): EnergyPage[] {
  cache ??= FUELS.flatMap((f) => ENERGY_LAYERS.map((l) => buildPage(f, l))).filter((p): p is EnergyPage => p !== null);
  return cache;
}
export const energyPage = (id: string) => energyPages().find((p) => p.id === id);
export const fuelPages = (f: FuelId) => energyPages().filter((p) => p.fuel === f);

/** A figure as the layer's table and panel write it. */
export const valueText = (p: EnergyPage, v: number) => (p.layer === 'trade' ? ENERGY_TEXT.net(amount(p.fuel, 'trade', Math.abs(v)), v >= 0) : amount(p.fuel, p.layer, v));

/** The change in the world figure from the year before, as a share, when both years have one. */
export function worldChange(p: EnergyPage, y: number): number | null {
  const a = p.byYear[y]?.world;
  const b = p.byYear[y - 1]?.world;
  return a && b ? a / b - 1 : null;
}

/** A place's figures in a year, each where EIA has it, and how many years of that year's output its reserves hold. */
export function balanceOf(p: EnergyPage, id: string, y: number) {
  const f = p.data;
  const g = (s: Series) => s[id]?.[y];
  const production = g(f.production);
  const reserves = g(f.reserves);
  const out = { production, liquids: p.fuel === 'oil' ? g((f as Oil).liquids) : undefined, consumption: g(f.consumption), net: g(f.net), reserves, reserveYears: undefined as number | undefined };
  // Reserves in billion barrels against output in thousand barrels a day; tcm against bcm a year.
  if (reserves && production) out.reserveYears = p.fuel === 'oil' ? (reserves * 1e9) / (production * 1000 * 365) : (reserves * 1000) / production;
  return out;
}

/**
 * The year of a place's balance: the latest year, up to `upTo`, in which EIA has both its output and its use, so
 * production, use and net trade are shown together (EIA's use figures run a year behind its output). Else `upTo`.
 */
export function balanceYear(p: EnergyPage, id: string, upTo: number): number {
  const years = Object.keys(p.data.consumption[id] ?? {}).map(Number).filter((y) => y <= upTo && p.data.production[id]?.[y] !== undefined);
  return years.length ? Math.max(...years) : upTo;
}

/** The one-sentence answer under the title. */
export function lede(p: EnergyPage, year = p.year): string | null {
  const y = p.byYear[year];
  const top = y?.rows[0];
  if (!top) return null;
  const T = ENERGY_TEXT;
  if (p.layer === 'trade') {
    const imp = y.rows.at(-1)!;
    if (top.value <= 0 || imp.value >= 0) return null;
    return T.tradeLede(inSentence(nameOf(top.id), true), amount(p.fuel, 'trade', top.value), inSentence(nameOf(imp.id)), amount(p.fuel, 'trade', -imp.value), p.text.name, year);
  }
  const top3 = y.rows.length > 3 ? shareOf(y.rows.slice(0, 3).reduce((s, r) => s + r.value, 0), y.world) : null;
  return T.lede[p.layer](inSentence(nameOf(top.id), true), shareOf(top.value, y.world) ?? '', p.layer === 'production' ? p.text.produced : p.text.name, year, top3);
}

/** The summary paragraphs: the world figure and its change, the top countries, coverage and the caveats. */
export function summary(p: EnergyPage, year = p.year): string[] {
  const T = ENERGY_TEXT;
  const y = p.byYear[year];
  const a = (v: number) => amount(p.fuel, p.layer, v);
  const first: string[] = [];
  const ch = worldChange(p, year);
  const change = ch === null || Math.abs(ch) < 0.005 ? null : T.changeIn(shareText(Math.abs(ch)), ch > 0, year - 1);
  if (y.world) first.push(T.total[p.layer](a(y.world), p.layer === 'production' ? p.text.produced : p.text.name, year, change));
  if (p.layer === 'trade') {
    const ex = y.rows.filter((r) => r.value > 0).slice(0, 3);
    const im = [...y.rows].reverse().filter((r) => r.value < 0).slice(0, 3);
    if (ex.length) first.push(T.exporters(ex.map((r, i) => `${inSentence(nameOf(r.id), i === 0)} ${a(r.value)}`)));
    if (im.length) first.push(T.importers(im.map((r, i) => `${inSentence(nameOf(r.id), i === 0)} ${a(-r.value)}`)));
  } else {
    const top = y.rows.slice(0, 3);
    const together = top.length === 3 ? shareOf(top.reduce((s, r) => s + r.value, 0), y.world) : null;
    first.push(T.top(top.map((r, i) => T.topPart(inSentence(nameOf(r.id), i === 0), a(r.value), shareOf(r.value, y.world))), together));
  }
  const second = [T.coverage(y.rows.length, year), ...(y.notYet.length ? [T.notYetSentence(y.notYet.length, year)] : []), ...T.caveats(p.fuel, p.layer, p.flowYear)];
  return [first.join(' '), second.join(' ')];
}

/** The unit words for a page's table caption. */
export const unitWords = (p: EnergyPage) => (p.layer === 'reserves' ? (p.fuel === 'oil' ? ENERGY_TEXT.units.oilReserves : ENERGY_TEXT.units.gasReserves) : ENERGY_TEXT.units[p.fuel]);
/** The map's id for a page's layer file and route key. */
export const energyKey = (p: Pick<EnergyPage, 'fuel' | 'layer'>) => `view:${p.fuel}:${p.layer}`;
