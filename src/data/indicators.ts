// The indicator registry: every country-level measure, in one shape, so maps, rankings, profiles,
// Compare and the indicator pages read measures the same way and a new dataset becomes comparable
// everywhere by adding one entry. Ported from the prototype's src/data/indicators.js.
//
// Entries hold no words: labels, units and notes are in the per-language text (src/i18n/<lang>.ts),
// and slugs in the slug table, so a translation adds rows, not code. Formats are named, and
// src/lib/format.ts turns them into locale-aware numbers.
//
// load(raw, get) returns values by internal place id and year; `get` loads another indicator, for
// derived measures (GDP per person). An entry whose adapter waits on a key or permission says why
// in `pending` and has no loader yet.
import type { Raw, Series } from '../adapters/core.ts';
import { combine, put, yearsOf } from '../adapters/core.ts';
import { emissions } from '../adapters/owid.ts';
import { food, CROPS } from '../adapters/faostat.ts';
import { demography, WPP_LAST_ESTIMATE } from '../adapters/wpp.ts';
import { displacement } from '../adapters/unhcr.ts';
import { arms } from '../adapters/sipri.ts';
import { water } from '../adapters/water.ts';
import { lending } from '../adapters/aiddata.ts';
import { weo, worldBank } from '../adapters/worldbank.ts';

export type Group = 'economy' | 'people' | 'energy' | 'food' | 'climate' | 'security' | 'tech' | 'influence';
export const GROUPS: Group[] = ['economy', 'people', 'energy', 'food', 'climate', 'security', 'tech', 'influence'];

/** How a value is written: money in US$, a count, a percentage (value 12.5 → 12.5%), a share (0.125 → 12.5%), or a number with a unit. */
export type Format = { kind: 'money' } | { kind: 'count' } | { kind: 'percent'; digits?: number } | { kind: 'share' } | { kind: 'number'; digits?: number; unit?: string };

export interface Indicator {
  id: string;
  group: Group;
  /** Source id, for the credit line and the licence table. */
  source: string;
  format: Format;
  /** Suggested scale for maps and charts. */
  scale: 'linear' | 'log';
  /** One value per country, not a time series. */
  static?: boolean;
  /** Years after this are projections, labelled as such. */
  projectedAfter?: number;
  load?: (raw: Raw, get: (id: string) => Series) => Series;
  /** Why it has no loader yet. */
  pending?: string;
}

/** The IMF's last year of actual figures in the October 2026 WEO; later years are projections. */
export const WEO_LAST_ACTUAL = 2025;

const wb = (code: string) => (raw: Raw) => worldBank(raw, code);
const once = <T>(f: (raw: Raw) => T) => {
  const cache = new WeakMap<Raw, T>();
  return (raw: Raw) => { if (!cache.has(raw)) cache.set(raw, f(raw)); return cache.get(raw)!; };
};
const foodOf = once(food);
const emisOf = once(emissions);
const wppOf = once(demography);
const unhcrOf = once(displacement);
const waterOf = once(water);
const staticYear = (values: Record<string, number | null>, year: number): Series => {
  const out: Series = {};
  for (const [id, v] of Object.entries(values)) put(out, id, year, v);
  return out;
};
const armsBy = (side: 'from' | 'to') => (raw: Raw) => {
  const out: Series = {};
  for (const p of arms(raw).pairs) put(out, p[side], p.year, p.tiv, true);
  return out;
};

const money: Format = { kind: 'money' };
const count: Format = { kind: 'count' };
const share: Format = { kind: 'share' };
const pct = (digits = 1): Format => ({ kind: 'percent', digits });
const unit = (u: string, digits = 0): Format => ({ kind: 'number', unit: u, digits });

const IMF_PENDING = 'IMF World Economic Outlook, waiting for the IMF to allow scheduled downloads';

const LIST: Indicator[] = [
  // Economy
  { id: 'gdp', group: 'economy', source: 'worldbank', format: money, scale: 'log', load: wb('NY.GDP.MKTP.CD') },
  { id: 'gdppc', group: 'economy', source: 'worldbank', format: money, scale: 'log', load: (_r, get) => combine(get('gdp'), get('population'), (g, p) => g / p) },
  { id: 'growth', group: 'economy', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('NY.GDP.MKTP.KD.ZG') },
  { id: 'inflation', group: 'economy', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('FP.CPI.TOTL.ZG') },
  { id: 'debt', group: 'economy', source: 'imf-weo', format: pct(0), scale: 'linear', projectedAfter: WEO_LAST_ACTUAL, load: (raw) => weo(raw, 'GGXWDG_NGDP'), pending: IMF_PENDING },
  { id: 'deficit', group: 'economy', source: 'imf-weo', format: pct(1), scale: 'linear', projectedAfter: WEO_LAST_ACTUAL, load: (raw) => weo(raw, 'GGXCNL_NGDP'), pending: IMF_PENDING },
  { id: 'currentaccount', group: 'economy', source: 'imf-weo', format: pct(1), scale: 'linear', projectedAfter: WEO_LAST_ACTUAL, load: (raw) => weo(raw, 'BCA_NGDPD'), pending: IMF_PENDING },
  { id: 'unemployment', group: 'economy', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('SL.UEM.TOTL.ZS') },
  { id: 'reserves', group: 'economy', source: 'worldbank', format: money, scale: 'log', load: wb('FI.RES.TOTL.CD') },
  { id: 'trade', group: 'economy', source: 'worldbank', format: pct(0), scale: 'linear', load: wb('NE.TRD.GNFS.ZS') },
  { id: 'fdi', group: 'economy', source: 'worldbank', format: money, scale: 'linear', load: wb('BX.KLT.DINV.CD.WD') },
  { id: 'remittances', group: 'economy', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('BX.TRF.PWKR.DT.GD.ZS') },
  // People
  { id: 'population', group: 'people', source: 'worldbank', format: count, scale: 'log', load: wb('SP.POP.TOTL') },
  { id: 'popun', group: 'people', source: 'wpp', format: count, scale: 'log', projectedAfter: WPP_LAST_ESTIMATE, load: (raw) => wppOf(raw).total.Medium ?? {} },
  { id: 'tfr', group: 'people', source: 'wpp', format: unit('', 2), scale: 'linear', projectedAfter: WPP_LAST_ESTIMATE, load: (raw) => wppOf(raw).tfr },
  { id: 'median', group: 'people', source: 'wpp', format: unit('', 1), scale: 'linear', projectedAfter: WPP_LAST_ESTIMATE, load: (raw) => wppOf(raw).median },
  { id: 'lex', group: 'people', source: 'wpp', format: unit('', 1), scale: 'linear', projectedAfter: WPP_LAST_ESTIMATE, load: (raw) => wppOf(raw).lex },
  { id: 'refout', group: 'people', source: 'unhcr', format: count, scale: 'log', load: (raw) => unhcrOf(raw).origin },
  { id: 'refin', group: 'people', source: 'unhcr', format: count, scale: 'log', load: (raw) => unhcrOf(raw).host },
  { id: 'refinpc', group: 'people', source: 'unhcr', format: unit('', 1), scale: 'linear', load: (_r, get) => combine(get('refin'), get('population'), (r, p) => (r / p) * 1000) },
  { id: 'idps', group: 'people', source: 'unhcr', format: count, scale: 'log', load: (raw) => unhcrOf(raw).idps },
  // Energy
  { id: 'oilprod', group: 'energy', source: 'eia', format: unit('kb/d'), scale: 'log', pending: 'EIA, waiting for an API key' },
  { id: 'oiluse', group: 'energy', source: 'eia', format: unit('kb/d'), scale: 'log', pending: 'EIA, waiting for an API key' },
  { id: 'gasprod', group: 'energy', source: 'eia', format: unit('bcm', 1), scale: 'log', pending: 'EIA, waiting for an API key' },
  { id: 'gasuse', group: 'energy', source: 'eia', format: unit('bcm', 1), scale: 'log', pending: 'EIA, waiting for an API key' },
  { id: 'power', group: 'energy', source: 'ember', format: unit('TWh'), scale: 'log', pending: 'Ember, waiting for an API key' },
  { id: 'lowcarbon', group: 'energy', source: 'ember', format: share, scale: 'linear', pending: 'Ember, waiting for an API key' },
  { id: 'coalpower', group: 'energy', source: 'ember', format: share, scale: 'linear', pending: 'Ember, waiting for an API key' },
  { id: 'windsolar', group: 'energy', source: 'ember', format: share, scale: 'linear', pending: 'Ember, waiting for an API key' },
  // Food
  ...CROPS.flatMap((c): Indicator[] => [
    { id: `${c}prod`, group: 'food', source: 'faostat', format: unit('Mt', 1), scale: 'log', load: (raw) => foodOf(raw).crops[c].production },
    { id: `${c}imp`, group: 'food', source: 'faostat', format: unit('Mt', 1), scale: 'log', load: (raw) => foodOf(raw).crops[c].imports },
  ]),
  { id: 'fertpotash', group: 'food', source: 'faostat', format: unit('Mt', 2), scale: 'log', load: (raw) => foodOf(raw).fertilisers.potash.use },
  { id: 'fertphosphate', group: 'food', source: 'faostat', format: unit('Mt', 2), scale: 'log', load: (raw) => foodOf(raw).fertilisers.phosphate.use },
  // Climate and water
  { id: 'co2', group: 'climate', source: 'owid', format: unit('Mt'), scale: 'log', load: (raw) => emisOf(raw).byField.co2 },
  { id: 'co2pc', group: 'climate', source: 'owid', format: unit('t', 1), scale: 'linear', load: (raw) => emisOf(raw).byField.pc },
  { id: 'co2cum', group: 'climate', source: 'owid', format: unit('Mt'), scale: 'log', load: (raw) => emisOf(raw).byField.cum },
  { id: 'co2trade', group: 'climate', source: 'owid', format: share, scale: 'linear', load: (raw) => combine(emisOf(raw).byField.cons, emisOf(raw).byField.co2, (c, t) => (t ? c / t - 1 : null)) },
  { id: 'waterstress', group: 'climate', source: 'aqueduct', format: unit('', 1), scale: 'linear', static: true,
    load: (raw) => staticYear(Object.fromEntries(Object.entries(waterOf(raw).stress).map(([id, s]) => [id, s.score])), 2023) },
  { id: 'waterdep', group: 'climate', source: 'aquastat', format: pct(0), scale: 'linear', static: true,
    load: (raw) => { const r = waterOf(raw).resources; const out: Series = {}; for (const [id, v] of Object.entries(r)) if (v.year) put(out, id, v.year, v.dependency); return out; } },
  // Security
  { id: 'milpct', group: 'security', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('MS.MIL.XPND.GD.ZS') },
  { id: 'milusd', group: 'security', source: 'worldbank', format: money, scale: 'log', load: wb('MS.MIL.XPND.CD') },
  { id: 'conflictdeaths', group: 'security', source: 'ucdp', format: count, scale: 'log', pending: 'UCDP, waiting for an API token' },
  { id: 'armsimp', group: 'security', source: 'sipri', format: unit('TIV m'), scale: 'log', load: armsBy('to') },
  { id: 'armsexp', group: 'security', source: 'sipri', format: unit('TIV m'), scale: 'log', load: armsBy('from') },
  { id: 'hunger', group: 'security', source: 'ipc', format: count, scale: 'log', pending: 'IPC, waiting for an API key' },
  { id: 'hungershare', group: 'security', source: 'ipc', format: share, scale: 'linear', pending: 'IPC, waiting for an API key' },
  // Technology and space
  { id: 'satellites', group: 'tech', source: 'celestrak', format: count, scale: 'log', pending: 'CelesTrak adapter, next' },
  { id: 'launches', group: 'tech', source: 'celestrak', format: count, scale: 'linear', pending: 'CelesTrak adapter, next' },
  { id: 'aicompute', group: 'tech', source: 'epoch', format: share, scale: 'linear', static: true, pending: 'Epoch adapter, next' },
  // Influence
  { id: 'sanctions', group: 'influence', source: 'csl', format: count, scale: 'log', static: true, pending: 'Sanctions adapters (US, EU, UK), next' },
  { id: 'chinaloans', group: 'influence', source: 'aiddata', format: money, scale: 'log', load: (raw) => lending(raw).byYear },
];

/** Entries waiting on IMF permission use the World Bank where it has the same measure (growth, inflation, unemployment above). */
export const INDICATORS: Record<string, Indicator> = Object.fromEntries(LIST.map((d) => [d.id, d]));

export interface Loaded { indicator: Indicator; values: Series; years: number[] }

/** Loads indicators from one snapshot, each once, with derived ones loading what they need. */
export function registry(raw: Raw) {
  const cache = new Map<string, Series>();
  const get = (id: string): Series => {
    const d = INDICATORS[id];
    if (!d) throw new Error(`unknown indicator ${id}`);
    if (!d.load) throw new Error(`indicator ${id} has no data yet: ${d.pending}`);
    if (!cache.has(id)) cache.set(id, d.load(raw, get));
    return cache.get(id)!;
  };
  return {
    get,
    load: (id: string): Loaded => { const values = get(id); return { indicator: INDICATORS[id], values, years: yearsOf(values) }; },
    /** Indicators whose source files are in this snapshot. */
    available: () => LIST.filter((d) => d.load && !d.pending),
  };
}

/**
 * A place's value in a year. Static indicators ignore the year. With fallback n, a missing year falls
 * back to the latest of the n years before; the returned year says which.
 */
export function valueAt(l: Loaded, id: string, year: number, fallback = 0): { value: number; year: number } | null {
  const s = l.values[id];
  if (!s) return null;
  if (l.indicator.static) {
    const [y, v] = Object.entries(s)[0] ?? [];
    return v === undefined ? null : { value: v, year: Number(y) };
  }
  for (let y = year; y >= year - fallback; y--) if (s[y] !== undefined) return { value: s[y], year: y };
  return null;
}

/** Latest actual year (projections excluded) with values for at least `min` places, or the best-covered recent year. */
export function latestYear(l: Loaded, min = 5): number | undefined {
  if (l.indicator.static) return l.years.at(-1);
  const counts = new Map<number, number>();
  for (const s of Object.values(l.values)) for (const y of Object.keys(s)) counts.set(Number(y), (counts.get(Number(y)) ?? 0) + 1);
  const actual = [...counts.keys()].filter((y) => l.indicator.projectedAfter === undefined || y <= l.indicator.projectedAfter).sort((a, b) => a - b);
  const most = Math.max(0, ...actual.map((y) => counts.get(y)!));
  return actual.filter((y) => counts.get(y)! >= Math.min(min, most)).at(-1);
}
