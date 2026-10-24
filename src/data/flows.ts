// Bilateral flows in one shape, for the supply-chain and dependency views: from = supplier
// (exporter, origin), to = buyer (importer, host), amounts summed per pair. Ported from the
// prototype's src/data/flows.js; words are in src/i18n/<lang>.ts.
import type { Raw } from '../adapters/core.ts';
import { food } from '../adapters/faostat.ts';
import { arms } from '../adapters/sipri.ts';
import { displacement } from '../adapters/unhcr.ts';
import type { Format } from './indicators.ts';

export interface Pair { from: string; to: string; amount: number }
export interface Flows { key: string; source: string; format: Format; period: string; pairs: Pair[] }

export interface FlowDef {
  source: string;
  format: Format;
  load?: (raw: Raw) => { period: string; pairs: Pair[] };
  pending?: string;
}

export function sumPairs<T extends { from: string; to: string }>(rows: T[], amount: (r: T) => number): Pair[] {
  const by = new Map<string, Pair>();
  for (const r of rows) {
    if (!r.from || !r.to || r.from === r.to) continue;
    const k = `${r.from}>${r.to}`;
    const p = by.get(k);
    if (p) p.amount += amount(r);
    else by.set(k, { from: r.from, to: r.to, amount: amount(r) });
  }
  return [...by.values()].filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount);
}

const maxYear = (rows: { year: number }[]) => Math.max(0, ...rows.map((r) => r.year));
const mt: Format = { kind: 'number', unit: 'Mt', digits: 1 };

const crop = (k: 'wheat' | 'maize' | 'rice' | 'soy'): FlowDef => ({
  source: 'faostat', format: mt,
  load: (raw) => { const f = food(raw).flows[k] ?? []; const y = maxYear(f); return { period: String(y), pairs: sumPairs(f.filter((r) => r.year === y), (r) => r.amount) }; },
});

export const FLOWS: Record<string, FlowDef> = {
  oil: { source: 'comtrade', format: { kind: 'number', unit: 'kb/d' }, pending: 'UN Comtrade, waiting for an API key' },
  gas: { source: 'comtrade', format: { kind: 'number', unit: 'bcm', digits: 1 }, pending: 'UN Comtrade, waiting for an API key' },
  wheat: crop('wheat'),
  maize: crop('maize'),
  rice: crop('rice'),
  soy: crop('soy'),
  // FAOSTAT has no fertiliser trade matrix.
  potash: { source: 'comtrade', format: mt, pending: 'UN Comtrade, waiting for an API key' },
  phosphate: { source: 'comtrade', format: mt, pending: 'UN Comtrade, waiting for an API key' },
  arms: {
    source: 'sipri', format: { kind: 'number', unit: 'TIV m' },
    load: (raw) => { const a = arms(raw).pairs; const y = maxYear(a); return { period: `${y - 4}–${y}`, pairs: sumPairs(a.filter((p) => p.year > y - 5), (p) => p.tiv) }; },
  },
  chips: { source: 'comtrade', format: { kind: 'money' }, pending: 'UN Comtrade, waiting for an API key' },
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
  if (!total) return null;
  return { from: ins[0].from, share: ins[0].amount / total, total, count: ins.length };
}
