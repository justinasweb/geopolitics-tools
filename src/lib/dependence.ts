// "Dependencies at a glance": one row per resource, the same ten as the Dependencies tool. Dependence is net
// imports as a share of use (Methodology, "Import reliance"); arms and chips show supplier concentration only.
// Rows whose source is not in the snapshot yet (oil and gas: EIA, partners from UN Comtrade; chips: UN Comtrade) say so.
import { food, type Balance, type Crop } from '../adapters/faostat.ts';
import { gas, oil, type Fuel, type Oil } from '../adapters/eia.ts';
import { FLOWS, loadFlows, type Flows } from '../data/flows.ts';
import { shared } from './data.ts';

export const RESOURCES = ['oil', 'gas', 'wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate', 'arms', 'chips'] as const;
export type Resource = (typeof RESOURCES)[number];
export type DepTag = 'most' | 'some' | 'self' | 'exp';

/** Thresholds on import reliance, written out in Methodology. */
export const THRESHOLDS = { most: 0.5, self: 0.15 };

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
  /** Main suppliers, or buyers for an exporter. */
  partners: string[];
  buyers?: boolean;
  /** Use is zero, so no share. */
  noUse?: boolean;
}

const foodData = shared(food);
const fuels = { oil: shared(oil), gas: shared(gas) };
const flowsOf = new Map<string, () => Flows | null>();
const flows = (key: string) => {
  if (!flowsOf.has(key)) flowsOf.set(key, shared((raw) => loadFlows(raw, key)));
  return flowsOf.get(key)!();
};

/** The latest year with production, imports and exports all reported for this place. */
function balanceRow(b: Balance, id: string) {
  const ys = Object.keys(b.production[id] ?? {}).map(Number).filter((y) => b.imports[id]?.[y] !== undefined && b.exports[id]?.[y] !== undefined).sort((a, b) => b - a);
  const y = ys[0];
  if (y === undefined) return null;
  const p = b.production[id][y];
  const i = b.imports[id][y];
  const e = b.exports[id][y];
  return { year: y, production: p, imports: i, exports: e, use: b.use[id]?.[y] ?? Math.max(0, p + i - e) };
}

function fromBalance(resource: Resource, b: Balance | undefined, id: string, flowKey?: string): DepRow {
  const base = { resource, source: 'faostat', partners: [] as string[] };
  const r = b && balanceRow(b, id);
  if (!r) return { ...base, state: 'none' };
  const net = r.imports - r.exports;
  const row: DepRow = { ...base, state: 'ok', year: r.year };
  if (r.use <= 0) {
    if (net < 0 && r.production > 0) Object.assign(row, { reliance: -1, exportShare: -net / r.production, tag: 'exp' });
    else return { ...row, noUse: true };
  } else {
    row.reliance = net / r.use;
    row.tag = tagFor(row.reliance);
    if (row.reliance < 0 && r.production > 0) row.exportShare = Math.min(1, -net / r.production);
  }
  const f = flowKey ? flows(flowKey) : null;
  if (f) {
    const buyers = row.tag === 'exp';
    row.buyers = buyers;
    row.partners = f.pairs.filter((p) => (buyers ? p.from === id : p.to === id)).slice(0, 3).map((p) => (buyers ? p.to : p.from));
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
  return { ...base, state: 'ok', period: f.period, main: { id: ins[0].from, share: ins[0].amount / total }, partners: ins.slice(0, 3).map((p) => p.from) };
}

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
        // The balance is FAOSTAT's; the partners come from UN Comtrade's flows, when it has them.
        return fd ? fromBalance(res, fd.fertilisers[res], id, res) : { resource: res, state: 'pending', source: 'faostat', partners: [] };
      default:
        return concentration(res, id);
    }
  });
}

/** Sources behind the rows that have data. */
export const depSources = (rows: DepRow[]) => [...new Set(rows.filter((r) => r.state === 'ok').map((r) => r.source))];
