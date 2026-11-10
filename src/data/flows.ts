// Bilateral flows in one shape, for the supply-chain and dependency views: from = supplier
// (exporter, origin), to = buyer (importer, host), amounts summed per pair. Ported from the
// prototype's src/data/flows.js; words are in src/i18n/<lang>.ts.
import type { Raw } from '../adapters/core.ts';
import { chipFlows, comtrade, crudeFlows, fertiliserFlows, gasFlows, type Flow } from '../adapters/comtrade.ts';
import { food } from '../adapters/faostat.ts';
import { OTHER_SUPPLIER, arms } from '../adapters/sipri.ts';
import { displacement } from '../adapters/unhcr.ts';
import { registry, type Format } from './indicators.ts';

/** `mirror`: the amount is the exporter's report of the flow (UN Comtrade mirror data; src/adapters/comtrade.ts).
 *  `output`: oil and gas, the exporter's own production in the same year (EIA), when the flow is larger. */
export interface Pair { from: string; to: string; amount: number; mirror?: true; output?: number }
export interface Flows { key: string; source: string; format: Format; period: string; pairs: Pair[] }

export interface FlowDef {
  source: string;
  format: Format;
  load?: (raw: Raw) => { period: string; pairs: Pair[] };
  pending?: string;
}

/** Rows summed per pair; a pair is `mirror` when most of its amount is the exporter's report (gas: a pair's pipeline
 *  and LNG rows are summed, and a few cubic metres of one should not label the other). */
export function sumPairs<T extends { from: string; to: string; mirror?: true }>(rows: T[], amount: (r: T) => number): Pair[] {
  const by = new Map<string, Pair>();
  const mirrored = new Map<string, number>();
  for (const r of rows) {
    if (!r.from || !r.to || r.from === r.to) continue;
    const k = `${r.from}>${r.to}`;
    const p = by.get(k);
    if (p) p.amount += amount(r);
    else by.set(k, { from: r.from, to: r.to, amount: amount(r) });
    if (r.mirror) mirrored.set(k, (mirrored.get(k) ?? 0) + amount(r));
  }
  for (const [k, m] of mirrored) if (m > by.get(k)!.amount / 2) by.get(k)!.mirror = true;
  return [...by.values()].filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount);
}

const maxYear = (rows: { year: number }[]) => Math.max(0, ...rows.map((r) => r.year));
const mt: Format = { kind: 'number', unit: 'Mt', digits: 1 };

/** The latest year of a set of yearly flows, summed per pair. */
const latest = (f: Flow[]) => { const y = maxYear(f); return { period: String(y), pairs: sumPairs(f.filter((r) => r.year === y), (r) => r.amount) }; };
const fromComtrade = (format: Format, pick: (rows: ReturnType<typeof comtrade>) => Flow[]): FlowDef => ({
  source: 'comtrade', format, load: (raw) => latest(pick(comtrade(raw))),
});

const n0 = (v: number) => Math.round(v).toLocaleString('en');
/**
 * Checks a year's flows against production in the same unit (oil, gas). A flow, or the year's total, larger than the
 * world's production is a unit error in the source and stops the build. A flow larger than what its exporter produces
 * and imports is returned as a warning when it is at least 0.1% of world production: re-exports and consignment
 * countries make some real (Belgium's LNG on to France), so it is for a person to look at, not a stop.
 */
export function checkFlows(label: string, year: number, pairs: Pair[], production: Record<string, Record<number, number>>): string[] {
  const world = Object.values(production).reduce((t, ys) => t + (ys[year] ?? 0), 0);
  if (!world) return [];
  for (const p of pairs) {
    if (p.amount > world) throw new Error(`${label} ${year}: ${p.from} → ${p.to} ${n0(p.amount)} is more than the world's production (${n0(world)}); the source's unit is probably wrong`);
  }
  const total = pairs.reduce((t, p) => t + p.amount, 0);
  if (total > world) throw new Error(`${label} ${year}: the flows' total ${n0(total)} is more than the world's production (${n0(world)})`);
  const imports = new Map<string, number>();
  for (const p of pairs) imports.set(p.to, (imports.get(p.to) ?? 0) + p.amount);
  return pairs.filter((p) => p.amount >= world / 1000 && production[p.from]?.[year] !== undefined && p.amount > production[p.from][year] + (imports.get(p.from) ?? 0))
    .map((p) => `${label} ${year}: ${p.from} → ${p.to} ${n0(p.amount)} is more than ${p.from} produces and imports (${n0(production[p.from][year] + (imports.get(p.from) ?? 0))})`);
}

/** The exporter's production in `year` when a flow of `amount` is larger than it (oil, gas; same unit) and at least
 *  0.1% of world production, as checkFlows warns, else null. Malaysia → China crude, 2025: 1,300 kb/d against 513 kb/d
 *  produced; China's customs records the origin. Smaller flows from places that produce none are left unmarked. */
export function overOutput(production: Record<string, Record<number, number>>, from: string, year: number, amount: number): number | null {
  const o = production[from]?.[year];
  const world = Object.values(production).reduce((t, ys) => t + (ys[year] ?? 0), 0);
  return o !== undefined && amount > o && amount >= world / 1000 ? o : null;
}

const warned = new Set<string>();
/** Oil and gas flows, checked against EIA production (checkFlows); warnings go to the build log, once each. */
const checked = (label: string, production: string, format: Format, pick: (rows: ReturnType<typeof comtrade>) => Flow[]): FlowDef => ({
  source: 'comtrade', format,
  load: (raw) => {
    const l = latest(pick(comtrade(raw)));
    let prod: Record<string, Record<number, number>> = {};
    try { prod = registry(raw).get(production); } catch { /* no EIA files in this snapshot: nothing to check against */ }
    for (const w of checkFlows(label, Number(l.period), l.pairs, prod)) if (!warned.has(w)) { warned.add(w); console.warn(`flows: ${w}`); }
    for (const p of l.pairs) { const o = overOutput(prod, p.from, Number(l.period), p.amount); if (o !== null) p.output = o; }
    return l;
  },
});

const crop = (k: 'wheat' | 'maize' | 'rice' | 'soy'): FlowDef => ({
  source: 'faostat', format: mt,
  load: (raw) => { const f = food(raw).flows[k] ?? []; const y = maxYear(f); return { period: String(y), pairs: sumPairs(f.filter((r) => r.year === y), (r) => r.amount) }; },
});

export const FLOWS: Record<string, FlowDef> = {
  oil: checked('oil', 'oilprod', { kind: 'number', unit: 'kb/d' }, crudeFlows),
  gas: checked('gas', 'gasprod', { kind: 'number', unit: 'bcm', digits: 1 }, gasFlows),
  wheat: crop('wheat'),
  maize: crop('maize'),
  rice: crop('rice'),
  soy: crop('soy'),
  // FAOSTAT has no fertiliser trade matrix; Comtrade's are in tonnes of product, not of nutrient.
  potash: fromComtrade(mt, (r) => fertiliserFlows(r, 'potash')),
  phosphate: fromComtrade(mt, (r) => fertiliserFlows(r, 'phosphate')),
  arms: {
    source: 'sipri', format: { kind: 'number', unit: 'TIV m' },
    load: (raw) => { const a = arms(raw).pairs; const y = maxYear(a); return { period: `${y - 4}–${y}`, pairs: sumPairs(a.filter((p) => p.year > y - 5), (p) => p.tiv) }; },
  },
  chips: fromComtrade({ kind: 'money' }, (r) => chipFlows(r, 'chips')),
  refugees: {
    source: 'unhcr', format: { kind: 'count' },
    load: (raw) => { const p = displacement(raw).pairs; const y = maxYear(p); return { period: String(y), pairs: sumPairs(p.filter((r) => r.year === y), (r) => r.people) }; },
  },
};

export function loadFlows(raw: Raw, key: string): Flows {
  const f = FLOWS[key];
  if (!f?.load) throw new Error(`flow ${key} has no data yet${f ? `: ${f.pending}` : ''}`);
  return { key, source: f.source, format: f.format, ...f.load(raw) };
}

/** For a buyer: total bought, and its main supplier with that supplier's share. */
export function topSupplier(flows: Flows, id: string) {
  const ins = flows.pairs.filter((p) => p.to === id);
  const total = ins.reduce((t, p) => t + p.amount, 0);
  // Suppliers that are not a country count in the total, never as the main supplier.
  const top = ins.find((p) => p.from !== OTHER_SUPPLIER);
  if (!total || !top) return null;
  return { from: top.from, share: top.amount / total, total, count: ins.length };
}
