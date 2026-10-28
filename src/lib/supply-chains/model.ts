// The Supply chains tool's shared model: the flow the build embeds in each page, the focus the page keeps in its
// address, the totals, the Herfindahl index and the Sankey layout. The build (src/lib/supply-chains.ts) and the
// browser script (src/scripts/supply-chains.ts) both use it, so it imports nothing that needs Node.
import type { ChainKind } from '../../i18n/supply-chains.en.ts';

export interface Chain {
  key: string;
  label: string;
  kind: ChainKind;
  /** The one year (or SIPRI's five-year period) every pair is for. */
  period: string;
  /** Pairs as [from, to, amount], largest first. */
  pairs: [string, string, number][];
  /** Names (n), ISO codes (c), short names (s) and country page links (h) of every place in the pairs. */
  places: Record<string, { n: string; c: string; s?: string; h?: string }>;
  /** Amounts are divided by `div` and written with `digits` decimals in the short unit; `count` writes 2.8 m. */
  div: number;
  digits: number;
  count?: boolean;
  /** The source id, its name for the source line, its short name, and the download. */
  src: string;
  source: string;
  credit: string;
  updated?: string;
  retrieved: string;
  csv: boolean;
  /** Methodology's section on supply chains. */
  method: string;
}

/** Nodes drawn on each side before the rest is grouped as Others; seven supplier colours. */
export const SHOWN = { from: 7, to: 10 };
/** Bars in the panel, and flows in the phone list. */
export const TOP = 5;
export const PHONE_FLOWS = 10;
/** Herfindahl thresholds (2023 US merger guidelines), as on the critical minerals views. */
export const HHI = { moderate: 1000, high: 1800 };
export const OTHERS = '_';

export interface State { country: string }

export function parseState(q: URLSearchParams, chain: Chain): State {
  const c = q.get('country') ?? '';
  return { country: chain.pairs.some(([f, t]) => f === c || t === c) ? c : '' };
}

export function queryOf(s: State): string {
  return s.country ? new URLSearchParams({ country: s.country }).toString() : '';
}

const nf = (digits: number) => new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** An amount in the flow's short unit, without the unit: "45.0", "0.31", "2.8 m". */
export function amount(v: number, c: Chain): string {
  if (c.count) {
    if (v >= 1e6) return `${nf(v < 1e7 ? 1 : 0).format(v / 1e6)} m`;
    return nf(0).format(v);
  }
  const x = v / c.div;
  if (x >= 100) return nf(0).format(x);
  if (x >= 1 || x === 0) return nf(c.digits).format(x);
  return new Intl.NumberFormat('en', { maximumSignificantDigits: 2 }).format(x);
}

export const nameOf = (c: Chain, id: string) => c.places[id]?.n ?? id;
/** Diagram labels: the name, or the short name when the name is too long for the space beside a node. */
const shortOf = (c: Chain, id: string) => (nameOf(c, id).length > 18 && c.places[id]?.s) || nameOf(c, id);

/** Each place's total on one side, largest first. */
export function totals(pairs: Chain['pairs'], side: 0 | 1): [string, number][] {
  const by = new Map<string, number>();
  for (const p of pairs) by.set(p[side], (by.get(p[side]) ?? 0) + p[2]);
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const sum = (xs: [string, number][]) => xs.reduce((t, x) => t + x[1], 0);

/** The Herfindahl–Hirschman index (0–10,000) of these amounts' shares. */
export function hhi(xs: [string, number][]): number {
  const t = sum(xs);
  return t ? Math.round(xs.reduce((s, [, v]) => s + ((100 * v) / t) ** 2, 0)) : 0;
}

export const concentration = (h: number): 'low' | 'moderate' | 'high' => (h > HHI.high ? 'high' : h >= HHI.moderate ? 'moderate' : 'low');

/** The pairs a focused country is part of, or all of them. */
export const pairsOf = (c: Chain, s: State) => (s.country ? c.pairs.filter(([f, t]) => f === s.country || t === s.country) : c.pairs);

/** The first place whose name is, starts with, then contains the search. */
export function foundPlace(c: Chain, q: string): string | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  const ids = totals(c.pairs, 0).concat(totals(c.pairs, 1)).map(([id]) => id);
  const name = (id: string) => nameOf(c, id).toLowerCase();
  return ids.find((id) => name(id) === t) ?? ids.find((id) => name(id).startsWith(t)) ?? ids.find((id) => name(id).includes(t)) ?? null;
}

// ---------- Sankey layout ----------

export interface SkNode { id: string; side: 0 | 1; label: string; value: number; x: number; y: number; h: number; mid: number; sel: boolean }
export interface SkBand { from: string; to: string; value: number; colour: number; d: string }
export interface Sankey { width: number; height: number; nodes: SkNode[]; bands: SkBand[] }

const W = 900;
/** Left nodes at 150 with bands leaving at 164, right nodes at 716; labels outside them (SankeyFlow design). */
export const X = { from: 150, to: 716, node: 14 };
const PAD = 10, GAP = 10, MIN_SLOT = 18, AXIS = 34;

/**
 * Suppliers on the left and buyers on the right, the largest named and the rest grouped as Others, bands as wide
 * as their amounts. A focused country is drawn on both sides when it both sends and receives: its sources on the
 * left run into it on the right, and it on the left runs out to its destinations.
 */
export function sankey(c: Chain, s: State, tallest = 520): Sankey {
  const pairs = pairsOf(c, s);
  const keep = (side: 0 | 1, n: number) => {
    const t = totals(pairs, side);
    // A focused country is always named on its own side.
    const named = t.slice(0, n).map(([id]) => id);
    if (s.country && t.some(([id]) => id === s.country) && !named.includes(s.country)) named.splice(n - 1, 1, s.country);
    // Grouping one place as Others hides its name for nothing.
    return new Set(t.length === n + 1 ? t.map(([id]) => id) : named);
  };
  const names = [keep(0, SHOWN.from), keep(1, SHOWN.to)] as const;
  const group = (id: string, side: 0 | 1) => (names[side].has(id) ? id : OTHERS);
  const agg = new Map<string, { from: string; to: string; value: number }>();
  for (const [f, t, v] of pairs) {
    const a = group(f, 0), b = group(t, 1);
    const k = `${a}>${b}`;
    const x = agg.get(k);
    if (x) x.value += v;
    else agg.set(k, { from: a, to: b, value: v });
  }
  const flows = [...agg.values()];
  const order = (side: 0 | 1) => {
    const t = new Map<string, number>();
    for (const f of flows) { const id = side ? f.to : f.from; t.set(id, (t.get(id) ?? 0) + f.value); }
    return [...t.entries()].sort((a, b) => (a[0] === OTHERS ? 1 : b[0] === OTHERS ? -1 : b[1] - a[1]));
  };
  const sides = [order(0), order(1)] as const;
  const total = flows.reduce((t, f) => t + f.value, 0) || 1;
  const most = Math.max(sides[0].length, sides[1].length);
  // A few flows get a shorter diagram, not a few very wide bands.
  const height = Math.min(tallest, Math.max(200, 46 * most));
  const k = Math.max(0, height - 2 * PAD - (most - 1) * GAP) / total;
  const colour = new Map(sides[0].map(([id], i) => [id, id === OTHERS ? 0 : (i % SHOWN.from) + 1]));
  const nodes: SkNode[] = [];
  const at = new Map<string, { y: number; used: number }>();
  let bottom = 0;
  ([0, 1] as const).forEach((side) => {
    let y = PAD;
    for (const [id, value] of sides[side]) {
      const h = value * k;
      const slot = Math.max(h, MIN_SLOT);
      const top = y + (slot - h) / 2;
      nodes.push({ id, side, label: id === OTHERS ? '' : shortOf(c, id), value, x: side ? X.to : X.from, y: top, h, mid: y + slot / 2, sel: id === s.country });
      at.set(`${side}:${id}`, { y: top, used: 0 });
      y += slot + GAP;
    }
    bottom = Math.max(bottom, y - GAP + PAD);
  });
  // Bands leave each supplier in buyer order and reach each buyer in supplier order, so few of them cross.
  const rank = (side: 0 | 1) => new Map(sides[side].map(([id], i) => [id, i]));
  const r0 = rank(0), r1 = rank(1);
  const bands: SkBand[] = [];
  const sorted = [...flows].sort((a, b) => r0.get(a.from)! - r0.get(b.from)! || r1.get(a.to)! - r1.get(b.to)!);
  const ends = new Map<SkBand, [number, number]>();
  for (const f of sorted) {
    const a = at.get(`0:${f.from}`)!;
    const t = f.value * k;
    const b: SkBand = { ...f, colour: colour.get(f.from) ?? 0, d: '' };
    ends.set(b, [a.y + a.used, 0]);
    a.used += t;
    bands.push(b);
  }
  for (const b of [...bands].sort((x, y) => r1.get(x.to)! - r1.get(y.to)! || r0.get(x.from)! - r0.get(y.from)!)) {
    const z = at.get(`1:${b.to}`)!;
    ends.get(b)![1] = z.y + z.used;
    z.used += b.value * k;
  }
  const x0 = X.from + X.node, x1 = X.to, mx = (x0 + x1) / 2;
  const f1 = (n: number) => n.toFixed(1);
  for (const b of bands) {
    const [y0, y1] = ends.get(b)!;
    const t = b.value * k;
    b.d = `M${x0},${f1(y0)}C${mx},${f1(y0)} ${mx},${f1(y1)} ${x1},${f1(y1)}L${x1},${f1(y1 + t)}C${mx},${f1(y1 + t)} ${mx},${f1(y0 + t)} ${x0},${f1(y0 + t)}Z`;
  }
  return { width: W, height: Math.ceil(bottom + AXIS), nodes, bands };
}
