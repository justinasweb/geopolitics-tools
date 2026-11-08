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
import { OTHER_SUPPLIER, arms } from '../adapters/sipri.ts';
import { water } from '../adapters/water.ts';
import { lending } from '../adapters/aiddata.ts';
import { weo, weoOwnLastActual, weoRelease, worldBank } from '../adapters/worldbank.ts';
import { space } from '../adapters/celestrak.ts';
import { ai, computeAt } from '../adapters/epoch.ts';
import { LISTS, listingsAt, sanctions } from '../adapters/sanctions.ts';
import { gas, oil } from '../adapters/eia.ts';
import { ember, powerSeries } from '../adapters/ember.ts';
import { deathsByYear, ged } from '../adapters/ucdp.ts';
import { hungerSeries, ipc } from '../adapters/ipc.ts';

export type Group = 'economy' | 'people' | 'energy' | 'food' | 'climate' | 'security' | 'tech' | 'influence';
export const GROUPS: Group[] = ['economy', 'people', 'energy', 'food', 'climate', 'security', 'tech', 'influence'];

/** How a value is written: money in US$, a count, a percentage (value 12.5 → 12.5%), a share (0.125 → 12.5%), or a number with a unit. */
/** Money with `millions` writes any sum under a million dollars as "under $1 m" (totals, not amounts per person). */
export type Format = { kind: 'money'; millions?: boolean } | { kind: 'count' } | { kind: 'percent'; digits?: number } | { kind: 'share' } | { kind: 'number'; digits?: number; unit?: string }
  /** Million tonnes, written in tonnes below one million ("148 Mt", "12.3 Mt", "540,000 t"). */
  | { kind: 'mt' };

export interface Indicator {
  id: string;
  group: Group;
  /** Source id (or ids, when one measure combines several), for the credit line and the licence table. */
  source: string | string[];
  format: Format;
  /** Suggested scale for maps and charts. */
  scale: 'linear' | 'log';
  /** One value per country, not a time series. */
  static?: boolean;
  /** Years after this are projections, labelled as such. */
  projectedAfter?: number;
  /** The source's own last actual year, when its files say (the WEO's release): replaces projectedAfter. */
  lastActual?: (raw: Raw) => number | undefined;
  /** Each place's own last actual year, when the files give one (the WEO's LATEST_ACTUAL_ANNUAL_DATA). */
  ownLastActual?: (raw: Raw) => Record<string, number> | undefined;
  /** Set from ownLastActual for the build's snapshot: a place's years after its own and up to projectedAfter are estimates. */
  lastActualBy?: Record<string, number>;
  load?: (raw: Raw, get: (id: string) => Series) => Series;
  /** The figures the source flags as its own estimate or imputation (FAOSTAT's E and I), 1 by place and year. */
  estimates?: (raw: Raw) => Series;
  /** Set from `estimates` when the indicator loads: statusAt tags these values Estimate wherever they are shown. */
  estimatedBy?: Series;
  /** Why it has no loader yet. */
  pending?: string;
}

/** The IMF's last year of actual figures, for WEO files without a release file (the samples); an imported release sets its own. */
export const WEO_LAST_ACTUAL = 2025;
const weoLastActual = (raw: Raw) => weoRelease(raw)?.lastActual;

const wb = (code: string) => (raw: Raw) => worldBank(raw, code);
/** A World Bank percentage (62.5) as a share (0.625), so changes are in percentage points like the other share measures. */
const wbShare = (code: string) => (raw: Raw) => {
  const out: Series = {};
  for (const [id, ys] of Object.entries(worldBank(raw, code))) for (const [y, v] of Object.entries(ys)) put(out, id, Number(y), v / 100);
  return out;
};
const once = <T>(f: (raw: Raw) => T) => {
  const cache = new WeakMap<Raw, T>();
  return (raw: Raw) => { if (!cache.has(raw)) cache.set(raw, f(raw)); return cache.get(raw)!; };
};
const foodOf = once(food);
const emisOf = once(emissions);
const wppOf = once(demography);
const unhcrOf = once(displacement);
const waterOf = once(water);
const spaceOf = once(space);
const aiOf = once(ai);
const sanctionsOf = once(sanctions);
const oilOf = once(oil);
const gasOf = once(gas);
const powerOf = once(ember);
const ipcOf = once(ipc);
const staticYear = (values: Record<string, number | null>, year: number): Series => {
  const out: Series = {};
  for (const [id, v] of Object.entries(values)) put(out, id, year, v);
  return out;
};
const armsBy = (side: 'from' | 'to') => (raw: Raw) => {
  const out: Series = {};
  for (const p of arms(raw).pairs) if (p[side] !== OTHER_SUPPLIER) put(out, p[side], p.year, p.tiv, true);
  return out;
};

const money: Format = { kind: 'money' };
const count: Format = { kind: 'count' };
const share: Format = { kind: 'share' };
const pct = (digits = 1): Format => ({ kind: 'percent', digits });
const unit = (u: string, digits = 0): Format => ({ kind: 'number', unit: u, digits });

const LIST: Indicator[] = [
  // Economy
  { id: 'gdp', group: 'economy', source: 'worldbank', format: money, scale: 'log', load: wb('NY.GDP.MKTP.CD') },
  { id: 'gdppc', group: 'economy', source: 'worldbank', format: money, scale: 'log', load: (_r, get) => combine(get('gdp'), get('population'), (g, p) => g / p) },
  { id: 'growth', group: 'economy', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('NY.GDP.MKTP.KD.ZG') },
  { id: 'inflation', group: 'economy', source: 'worldbank', format: pct(1), scale: 'linear', load: wb('FP.CPI.TOTL.ZG') },
  { id: 'debt', group: 'economy', source: 'imf-weo', format: pct(0), scale: 'linear', projectedAfter: WEO_LAST_ACTUAL, lastActual: weoLastActual, ownLastActual: (raw) => weoOwnLastActual(raw, 'GGXWDG_NGDP'), load: (raw) => weo(raw, 'GGXWDG_NGDP') },
  { id: 'deficit', group: 'economy', source: 'imf-weo', format: pct(1), scale: 'linear', projectedAfter: WEO_LAST_ACTUAL, lastActual: weoLastActual, ownLastActual: (raw) => weoOwnLastActual(raw, 'GGXCNL_NGDP'), load: (raw) => weo(raw, 'GGXCNL_NGDP') },
  { id: 'currentaccount', group: 'economy', source: 'imf-weo', format: pct(1), scale: 'linear', projectedAfter: WEO_LAST_ACTUAL, lastActual: weoLastActual, ownLastActual: (raw) => weoOwnLastActual(raw, 'BCA_NGDPD'), load: (raw) => weo(raw, 'BCA_NGDPD') },
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
  { id: 'oilprod', group: 'energy', source: 'eia', format: unit('kb/d'), scale: 'log', load: (raw) => oilOf(raw).production },
  { id: 'oiluse', group: 'energy', source: 'eia', format: unit('kb/d'), scale: 'log', load: (raw) => oilOf(raw).consumption },
  { id: 'gasprod', group: 'energy', source: 'eia', format: unit('bcm', 1), scale: 'log', load: (raw) => gasOf(raw).production },
  { id: 'gasuse', group: 'energy', source: 'eia', format: unit('bcm', 1), scale: 'log', load: (raw) => gasOf(raw).consumption },
  { id: 'power', group: 'energy', source: 'ember', format: unit('TWh'), scale: 'log', load: (raw) => powerSeries(powerOf(raw), 'total') },
  { id: 'lowcarbon', group: 'energy', source: 'ember', format: share, scale: 'linear', load: (raw) => powerSeries(powerOf(raw), 'lowcarbon') },
  { id: 'coalpower', group: 'energy', source: 'ember', format: share, scale: 'linear', load: (raw) => powerSeries(powerOf(raw), 'coal') },
  { id: 'windsolar', group: 'energy', source: 'ember', format: share, scale: 'linear', load: (raw) => powerSeries(powerOf(raw), 'windsolar') },
  // Food
  ...CROPS.flatMap((c): Indicator[] => [
    { id: `${c}prod`, group: 'food', source: 'faostat', format: unit('Mt', 1), scale: 'log', load: (raw) => foodOf(raw).crops[c].production, estimates: (raw) => foodOf(raw).crops[c].estimated.production },
    { id: `${c}imp`, group: 'food', source: 'faostat', format: unit('Mt', 1), scale: 'log', load: (raw) => foodOf(raw).crops[c].imports, estimates: (raw) => foodOf(raw).crops[c].estimated.imports },
  ]),
  { id: 'fertpotash', group: 'food', source: 'faostat', format: unit('Mt', 2), scale: 'log', load: (raw) => foodOf(raw).fertilisers.potash.use, estimates: (raw) => foodOf(raw).fertilisers.potash.estimated.use },
  { id: 'fertphosphate', group: 'food', source: 'faostat', format: unit('Mt', 2), scale: 'log', load: (raw) => foodOf(raw).fertilisers.phosphate.use, estimates: (raw) => foodOf(raw).fertilisers.phosphate.estimated.use },
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
  { id: 'conflictdeaths', group: 'security', source: 'ucdp', format: count, scale: 'log', load: (raw) => deathsByYear(ged(raw)) },
  { id: 'armsimp', group: 'security', source: 'sipri', format: unit('TIV m'), scale: 'log', load: armsBy('to') },
  { id: 'armsexp', group: 'security', source: 'sipri', format: unit('TIV m'), scale: 'log', load: armsBy('from') },
  { id: 'hunger', group: 'security', source: 'ipc', format: count, scale: 'log', load: (raw) => hungerSeries(ipcOf(raw), 'people') },
  { id: 'hungershare', group: 'security', source: 'ipc', format: share, scale: 'linear', load: (raw) => hungerSeries(ipcOf(raw), 'share') },
  // Technology and space
  { id: 'satellites', group: 'tech', source: 'celestrak', format: count, scale: 'log', load: (raw) => spaceOf(raw).inOrbit },
  { id: 'launches', group: 'tech', source: 'celestrak', format: count, scale: 'linear', load: (raw) => spaceOf(raw).launches },
  { id: 'aicompute', group: 'tech', source: 'epoch', format: share, scale: 'linear', static: true,
    load: (raw) => { const a = aiOf(raw); const c = computeAt(a.clusters, a.lastYear); return staticYear(Object.fromEntries(Object.entries(c.by).map(([id, v]) => [id, c.total ? v / c.total : null])), a.lastYear); } },
  // ITU's figures and the IMF's balance-of-payments figures, as the World Bank publishes them.
  { id: 'netuser', group: 'tech', source: 'worldbank', format: share, scale: 'linear', load: wbShare('IT.NET.USER.ZS') },
  { id: 'ictexp', group: 'tech', source: 'worldbank', format: { kind: 'money', millions: true }, scale: 'log', load: wb('BX.GSR.CCIS.CD') },
  { id: 'ictshare', group: 'tech', source: 'worldbank', format: share, scale: 'linear', load: wbShare('BX.GSR.CCIS.ZS') },
  // Influence
  { id: 'sanctions', group: 'influence', source: ['csl', 'eu-sanctions', 'uk-sanctions'], format: count, scale: 'log', static: true,
    load: (raw) => { const s = sanctionsOf(raw); return listingsAt(s, Math.max(0, ...LISTS.flatMap((l) => Object.keys(s.added[l]).map(Number)))); } },
  { id: 'chinaloans', group: 'influence', source: 'aiddata', format: money, scale: 'log', load: (raw) => lending(raw).byYear },
];

/** Growth, inflation and unemployment are the World Bank's; the WEO, imported by hand, gives debt, deficit and the current account. */
export const INDICATORS: Record<string, Indicator> = Object.fromEntries(LIST.map((d) => [d.id, d]));

export interface Loaded { indicator: Indicator; values: Series; years: number[] }

/** Each entry's own projectedAfter, for files that do not set one. */
const PROJECTED_AFTER = new Map(LIST.map((d) => [d.id, d.projectedAfter]));

/** Loads indicators from one snapshot, each once, with derived ones loading what they need. */
export function registry(raw: Raw) {
  const cache = new Map<string, Series>();
  // The build has one snapshot: an imported WEO release moves the projection label for every page.
  for (const d of LIST) {
    if (d.lastActual) d.projectedAfter = d.lastActual(raw) ?? PROJECTED_AFTER.get(d.id);
    if (d.ownLastActual) d.lastActualBy = d.ownLastActual(raw);
    if (d.estimates) d.estimatedBy = undefined;
  }
  const get = (id: string): Series => {
    const d = INDICATORS[id];
    if (!d) throw new Error(`unknown indicator ${id}`);
    if (!d.load) throw new Error(`indicator ${id} has no data yet: ${d.pending}`);
    if (!cache.has(id)) {
      cache.set(id, d.load(raw, get));
      if (d.estimates) d.estimatedBy = d.estimates(raw);
    }
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

export type ValueStatus = 'estimate' | 'projection';

/**
 * A value's tag: a projection after the indicator's last actual year; an estimate after the place's own last actual
 * year and up to the indicator's (a country whose WEO figures end in 2023 has estimates for 2024 and 2025), or where
 * the source flags the figure itself as an estimate (FAOSTAT).
 */
export function statusAt(ind: Indicator, place: string, year: number): ValueStatus | undefined {
  if (ind.projectedAfter !== undefined && year > ind.projectedAfter) return 'projection';
  const own = ind.lastActualBy?.[place];
  if (own !== undefined && year > own) return 'estimate';
  return ind.estimatedBy?.[place]?.[year] ? 'estimate' : undefined;
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
