// "Dependencies at a glance": one row per resource, the same ten as the Dependencies tool. Dependence is net
// imports as a share of use (Methodology, "Import reliance"); for crops and fertilisers use is supply, production plus
// net imports, as FAOSTAT's trade covers every use and its fertiliser use only farms. Arms and chips show supplier
// concentration only.
// Rows whose source is not in the snapshot yet (oil and gas: EIA, partners from UN Comtrade; chips: UN Comtrade) say so.
import { food, type Balance, type Crop } from '../adapters/faostat.ts';
import { gas, oil, type Fuel, type Oil } from '../adapters/eia.ts';
import { FLOWS, loadFlows, topSupplier, type Flows } from '../data/flows.ts';
import { OTHER_SUPPLIER } from '../adapters/sipri.ts';
import { shared } from './data.ts';
import { place } from './places.ts';
import { DEP_TEXT, SOURCE_SHORT, onSupply } from '../i18n/pages.en.ts';

export const RESOURCES = ['oil', 'gas', 'wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate', 'arms', 'chips'] as const;
export type Resource = (typeof RESOURCES)[number];
export type DepTag = 'most' | 'some' | 'self' | 'exp';

/** Thresholds on import reliance, written out in Methodology. `excess`: net imports above use, or exports above
 *  production plus imports, by more than this share give no figure (transit trade or stock changes the source does
 *  not separate). */
export const THRESHOLDS = { most: 0.5, self: 0.15, excess: 0.1 };

export function tagFor(reliance: number): DepTag {
  if (reliance >= THRESHOLDS.most) return 'most';
  if (reliance >= THRESHOLDS.self) return 'some';
  if (reliance > -THRESHOLDS.self) return 'self';
  return 'exp';
}

export interface DepRow {
  resource: Resource;
  /** No data yet (source waiting on a key), or the source has no row for this country. */
  state: 'ok' | 'pending' | 'none';
  source: string;
  year?: number;
  period?: string;
  /** Net imports ÷ use; negative for a net exporter. */
  reliance?: number;
  /** Net exports ÷ production, for exporters. */
  exportShare?: number;
  tag?: DepTag;
  /** Arms and chips: the main supplier and its share of imports. */
  main?: { id: string; share: number };
  /** Food, fuel and fertiliser importers: the main supplier and its share of imports, from the trade flows. */
  top?: { id: string; share: number };
  /** Main suppliers, or buyers for an exporter. */
  partners: string[];
  buyers?: boolean;
  /** Use is zero, so no share. */
  noUse?: boolean;
  /** Net imports exceed use, or exports exceed production plus imports, by more than THRESHOLDS.excess: no share, so
   *  out of rankings by share and lead imports. 'imports' has no tag; 'exports' is tagged an exporter, with buyers. */
  excess?: 'imports' | 'exports';
  /** The source flags a figure the row uses as its estimate or imputation (FAOSTAT flags E and I): the Estimate label. */
  estimated?: true;
  /** Where the partners and the main supplier come from, when it is a trade source with its own period; `mirror`:
   *  the flows shown whose amount is the exporter's report (mirror data), named ("United States → Mexico"). */
  partnersFrom?: { source: string; period: string; mirror?: string[] };
}

/**
 * The imports a country page names first: the largest by share of use, then the largest fuel (oil, gas) the place
 * imports most of, when that is another row. Germany: rice (100%), then gas (95%).
 */
export function leadImports(deps: DepRow[]): DepRow[] {
  const most = deps.filter((d) => d.state === 'ok' && d.tag === 'most' && d.reliance !== undefined).sort((a, b) => b.reliance! - a.reliance!);
  if (!most.length) return [];
  const fuel = most.find((d) => d.resource === 'oil' || d.resource === 'gas');
  return fuel && fuel !== most[0] ? [most[0], fuel] : [most[0]];
}

/** A row's source and year as its line reads: "EIA, use 2024 · UN Comtrade, imports 2025"; null without figures. */
export function rowSource(r: DepRow): string | null {
  const short = (s: string) => SOURCE_SHORT[s] ?? s;
  if (r.year === undefined) return r.period ? DEP_TEXT.dated(short(r.source), r.period) : null;
  const f = r.partnersFrom;
  const line = DEP_TEXT.dated(short(r.source), String(r.year), f && short(f.source), f?.period, r.buyers, onSupply(r.resource) ? 'supply' : 'use');
  return f?.mirror?.length ? `${line}, ${DEP_TEXT.asReported(f.mirror)}` : line;
}

const foodData = shared(food);
const fuels = { oil: shared(oil), gas: shared(gas) };
const flowsOf = new Map<string, () => Flows | null>();
const flows = (key: string) => {
  if (!flowsOf.has(key)) flowsOf.set(key, shared((raw) => loadFlows(raw, key)));
  return flowsOf.get(key)!();
};

/** The latest year with production, imports and exports all reported for this place. `supply`: use is production
 *  plus imports minus exports, not the source's own use figure (fertilisers). */
function balanceRow(b: Balance, id: string, supply = false) {
  const ys = Object.keys(b.production[id] ?? {}).map(Number).filter((y) => b.imports[id]?.[y] !== undefined && b.exports[id]?.[y] !== undefined).sort((a, b) => b - a);
  const y = ys[0];
  if (y === undefined) return null;
  const p = b.production[id][y];
  const i = b.imports[id][y];
  const e = b.exports[id][y];
  const est = (['production', 'imports', 'exports', ...(supply ? [] : ['use'] as const)] as const).some((k) => b.estimated[k][id]?.[y]);
  return { year: y, production: p, imports: i, exports: e, use: (supply ? undefined : b.use[id]?.[y]) ?? Math.max(0, p + i - e), est };
}

export function fromBalance(resource: Resource, b: Balance | undefined, id: string, flowKey?: string, supply = false): DepRow {
  const base = { resource, source: 'faostat', partners: [] as string[] };
  const r = b && balanceRow(b, id, supply);
  if (!r) return { ...base, state: 'none' };
  const net = r.imports - r.exports;
  const row: DepRow = { ...base, state: 'ok', year: r.year, ...(r.est ? { estimated: true as const } : {}) };
  if (supply && r.exports > (r.production + r.imports) * (1 + THRESHOLDS.excess)) {
    // Morocco's phosphate: exports 1.7 times production plus imports (stock or re-exports the source does not split).
    // A net exporter all the same, with no share of output.
    Object.assign(row, { excess: 'exports', tag: 'exp' });
  } else if (r.use <= 0) {
    if (net < 0 && r.production > 0) Object.assign(row, { reliance: -1, exportShare: Math.min(1, -net / r.production), tag: 'exp' });
    else return { ...row, noUse: true };
  } else if (net > r.use * (1 + THRESHOLDS.excess)) {
    // Net imports far above use: only where use is the source's own figure, as supply cannot be smaller than them.
    row.excess = 'imports';
  } else {
    row.reliance = net / r.use;
    row.tag = tagFor(row.reliance);
    if (row.reliance < 0 && r.production > 0) row.exportShare = Math.min(1, -net / r.production);
  }
  const f = flowKey ? flows(flowKey) : null;
  if (f) {
    const buyers = row.tag === 'exp';
    row.buyers = buyers;
    row.partnersFrom = { source: f.source, period: f.period };
    row.partners = f.pairs.filter((p) => (buyers ? p.from === id : p.to === id)).slice(0, 3).map((p) => (buyers ? p.to : p.from));
    const t = !buyers && ((row.reliance ?? 0) > 0 || row.excess === 'imports') ? topSupplier(f, id) : null;
    if (t) row.top = { id: t.from, share: t.share };
    // The partners shown whose flow is the exporter's report: named in the row's source line.
    const shown = (p: { from: string; to: string }) => (buyers ? p.from === id && row.partners.includes(p.to) : p.to === id && (row.partners.includes(p.from) || row.top?.id === p.from));
    const mirror = f.pairs.filter((p) => p.mirror && shown(p)).map((p) => DEP_TEXT.flow(place(p.from)?.name ?? p.from, place(p.to)?.name ?? p.to));
    if (mirror.length) row.partnersFrom.mirror = mirror;
  }
  return row;
}

/** Oil and gas: EIA's output minus use in the latest year with both, as a share of use; partners from Comtrade. */
function fromFuel(resource: 'oil' | 'gas', f: Fuel | null, id: string): DepRow {
  const base = { resource, source: 'eia', partners: [] as string[] };
  if (!f) return { ...base, state: 'pending' };
  const ys = Object.keys(f.net[id] ?? {}).map(Number).sort((a, b) => b - a);
  const y = ys[0];
  if (y === undefined) return { ...base, state: 'none' };
  const use = f.consumption[id][y];
  const net = -f.net[id][y];
  // Oil's output is all liquids, the figure its net trade is worked out from.
  const production = ('liquids' in f ? (f as Oil).liquids : f.production)[id]?.[y] ?? 0;
  const one = (v: number) => ({ [id]: { [y]: v } });
  const balance: Balance = { production: one(production), imports: one(Math.max(0, net)), exports: one(Math.max(0, -net)), use: one(use), world: { production: {} }, estimated: { production: {}, imports: {}, exports: {}, use: {} } };
  const row = fromBalance(resource, balance, id, resource);
  return { ...row, source: 'eia' };
}

function concentration(resource: Resource, id: string): DepRow {
  const def = FLOWS[resource];
  const base = { resource, source: def.source, partners: [] as string[] };
  if (!def.load) return { ...base, state: 'pending' };
  const f = flows(resource);
  if (!f) return { ...base, state: 'pending' };
  const ins = f.pairs.filter((p) => p.to === id);
  const total = ins.reduce((s, p) => s + p.amount, 0);
  if (!total) return { ...base, state: 'none', period: f.period };
  // Deliveries from suppliers that are not a country count in the total, never as a supplier shown.
  const named = ins.filter((p) => p.from !== OTHER_SUPPLIER);
  if (!named.length) return { ...base, state: 'none', period: f.period };
  return { ...base, state: 'ok', period: f.period, main: { id: named[0].from, share: named[0].amount / total }, partners: named.slice(0, 3).map((p) => p.from) };
}

/** The tool and the country tables have something to show: the food or the fuel balances are in the snapshot. */
export const depsLive = () => Boolean(foodData() || fuels.oil());

/** The ten rows for a place. */
export function dependencies(id: string): DepRow[] {
  const fd = foodData();
  return RESOURCES.map((res): DepRow => {
    switch (res) {
      case 'oil': case 'gas':
        return fromFuel(res, fuels[res](), id);
      case 'wheat': case 'maize': case 'rice': case 'soy':
        return fd ? fromBalance(res, fd.crops[res as Crop], id, res) : { resource: res, state: 'pending', source: 'faostat', partners: [] };
      case 'potash': case 'phosphate':
        // The balance is FAOSTAT's, on supply (its trade covers every use, its use only farms); the partners come
        // from UN Comtrade's flows, when it has them.
        return fd ? fromBalance(res, fd.fertilisers[res], id, res, true) : { resource: res, state: 'pending', source: 'faostat', partners: [] };
      default:
        return concentration(res, id);
    }
  });
}

/** Sources behind the rows that have data. */
export const depSources = (rows: DepRow[]) => [...new Set(rows.filter((r) => r.state === 'ok').map((r) => r.source))];
