// The Explorer's shared model: what the page knows about each measure, the compact per-measure data files, the
// settings each view keeps in its address, the starting points, and the sums the views share (values with the
// two-year fallback, the 30× log rule, the correlation). The build (src/lib/explorer.ts) and the browser script
// (src/scripts/explorer.ts) both use it, so it imports nothing that needs Node.
import type { Format } from '../../data/indicators.ts';

export type View = 'table' | 'lines' | 'scatter';
export const VIEWS: View[] = ['table', 'lines', 'scatter'];

/** Up to this many measures in the table, and countries over time. */
export const MAX_MEASURES = 8;
export const MAX_COUNTRIES = 8;
/** A missing year falls back to the latest of this many years before, marked with its year. */
export const FALLBACK_YEARS = 2;
/** Values that span more than this many times start on a log scale (the reader can turn it off). */
export const LOG_SPAN = 30;
/** A scatter year needs at least this many countries with both figures to be offered on the slider. */
export const SCATTER_MIN = 20;

export interface MeasureMeta {
  id: string;
  label: string;
  short?: string;
  unit: string;
  group: string;
  format: Format;
  static?: boolean;
  projectedAfter?: number;
  /** The common year: the latest most places have reported. */
  year: number;
  from: number;
  to: number;
  /** The credit line, and the licence's credit for the CSV. */
  credit: string;
  updated?: string;
  /** The licence allows downloads. */
  csv: boolean;
  /** The indicator page. */
  href?: string;
}

export interface Meta {
  measures: MeasureMeta[];
  groups: [string, string][];
  /** Ranked places: name, iso3 and country page. */
  places: Record<string, { n: string; c: string; h?: string }>;
  blocs: { id: string; name: string; members: string[] }[];
  /** Where the data files are: `${base}${id}.json`. */
  base: string;
  /** Retrieval date of each measure's source, for the CSV. */
  retrieved: Record<string, string>;
}

/** One measure's values, place by place, from year `from` (null where the source has none). */
export interface MeasureData { from: number; v: Record<string, (number | null)[]> }

export interface State {
  view: View;
  /** Table: the columns. Over time: the first is the measure. */
  m: string[];
  sort: string;
  dir: 'asc' | 'desc';
  bloc: string;
  year: number | null;
  find: string;
  /** Over time: the countries. */
  c: string[];
  index: number | null;
  /** Null: the 30× rule decides. */
  log: boolean | null;
  x: string;
  y: string;
  size: string;
  pin: string[];
}

export const DEFAULTS: Record<View, Partial<State>> = {
  table: { m: ['gdp', 'gdppc', 'population', 'milpct', 'co2pc', 'lowcarbon'], sort: 'gdp', dir: 'desc' },
  lines: { m: ['gdp'], c: ['USA', 'CHN', 'IND', 'JPN', 'DEU'] },
  scatter: { x: 'gdppc', y: 'co2pc', size: 'population' },
};

export interface Preset { id: string; view: View; state: Partial<State> }
export const PRESETS: Preset[] = [
  { id: 'richer', view: 'scatter', state: { x: 'gdppc', y: 'co2pc', size: 'population' } },
  { id: 'refugees', view: 'table', state: { m: ['refin', 'refinpc', 'refout', 'population', 'gdppc'], sort: 'refin', dir: 'desc' } },
  { id: 'military', view: 'scatter', state: { x: 'gdp', y: 'milusd', size: 'population' } },
  { id: 'emitters', view: 'lines', state: { m: ['co2'], c: ['CHN', 'USA', 'IND', 'RUS', 'JPN', 'DEU'] } },
];

/** The measures a preset shows; it is offered only when all of them are. */
export const presetMeasures = (p: Preset) => [...(p.state.m ?? []), p.state.x, p.state.y, p.state.size].filter((x): x is string => Boolean(x));

const blank = (view: View): State => ({
  view, m: [], sort: '', dir: 'desc', bloc: '', year: null, find: '', c: [], index: null, log: null, x: '', y: '', size: '', pin: [],
});

const list = (s: string | null) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const int = (s: string | null) => (s && /^\d{4}$/.test(s) ? Number(s) : null);

/** A view's settings from its address, falling back to the defaults for anything missing or unknown. */
export function parseState(view: View, q: URLSearchParams, meta: Pick<Meta, 'measures' | 'places' | 'blocs'>): State {
  const known = new Set(meta.measures.map((m) => m.id));
  const place = (id: string) => (meta.places[id.toUpperCase()] ? id.toUpperCase() : null);
  const blocOk = (b: string) => meta.blocs.some((x) => x.id === b);
  const s = { ...blank(view), ...DEFAULTS[view] } as State;
  const ms = list(q.get('m')).filter((id) => known.has(id));
  if (view === 'table') {
    if (ms.length) s.m = [...new Set(ms)].slice(0, MAX_MEASURES);
    if (!s.m.some((id) => known.has(id))) s.m = meta.measures.slice(0, 1).map((m) => m.id);
    s.m = s.m.filter((id) => known.has(id));
    const sort = q.get('sort');
    const sortable = (k: string | null) => Boolean(k) && (k === 'country' || s.m.includes(k!));
    s.sort = sortable(sort) ? sort! : sortable(s.sort) ? s.sort : (s.m[0] ?? 'country');
    if (q.get('dir') === 'asc') s.dir = 'asc';
    s.find = (q.get('find') ?? '').slice(0, 60);
  }
  if (view === 'lines') {
    s.m = ms.length ? [ms[0]] : s.m.filter((id) => known.has(id));
    if (!s.m.length) s.m = meta.measures.slice(0, 1).map((m) => m.id);
    if (q.has('c')) s.c = [...new Set(list(q.get('c')).map(place).filter((x): x is string => Boolean(x)))].slice(0, MAX_COUNTRIES);
    else s.c = s.c.filter((id) => meta.places[id]);
    s.index = int(q.get('index'));
  }
  if (view === 'scatter') {
    for (const k of ['x', 'y'] as const) {
      const v = q.get(k);
      if (v && known.has(v)) s[k] = v;
      if (!known.has(s[k])) s[k] = meta.measures.find((m) => m.id !== s.x && m.id !== s.y)?.id ?? '';
    }
    const size = q.get('size');
    if (size !== null) s.size = size && known.has(size) ? size : '';
    else if (!known.has(s.size)) s.size = '';
    s.pin = [...new Set(list(q.get('pin')).map(place).filter((x): x is string => Boolean(x)))].slice(0, 12);
  }
  if (view !== 'lines') {
    const b = q.get('bloc') ?? '';
    s.bloc = blocOk(b) ? b : '';
    s.year = int(q.get('year'));
  }
  const log = q.get('log');
  s.log = log === '1' ? true : log === '0' ? false : null;
  return s;
}

/** The address of a view with these settings: only what the view uses, in a fixed order. */
export function queryOf(s: State): string {
  const q: [string, string][] = [];
  const add = (k: string, v: string | number | null | undefined) => { if (v !== null && v !== undefined && v !== '') q.push([k, String(v)]); };
  if (s.view === 'table') {
    add('m', s.m.join(','));
    add('sort', s.sort);
    if (s.dir === 'asc') add('dir', 'asc');
    add('bloc', s.bloc);
    add('year', s.year);
    add('find', s.find);
  } else if (s.view === 'lines') {
    add('m', s.m[0]);
    // Always written, so a reader who removes every country does not get the default ones back.
    q.push(['c', s.c.join(',')]);
    add('index', s.index);
  } else {
    add('x', s.x);
    add('y', s.y);
    q.push(['size', s.size]);
    add('year', s.year);
    add('bloc', s.bloc);
    add('pin', s.pin.join(','));
  }
  if (s.view !== 'table' && s.log !== null) add('log', s.log ? '1' : '0');
  return q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`).join('&');
}

/** A preset's own settings on top of its view's defaults. */
export function presetState(p: Preset, meta: Pick<Meta, 'measures' | 'places' | 'blocs'>): State {
  const s = { ...blank(p.view), ...DEFAULTS[p.view], ...p.state } as State;
  return parseState(p.view, new URLSearchParams(queryOf(s)), meta);
}

/** Whether the settings shown are a preset's (the chip is pressed). */
export function isPreset(s: State, p: Preset, meta: Pick<Meta, 'measures' | 'places' | 'blocs'>): boolean {
  if (p.view !== s.view) return false;
  const a = presetState(p, meta);
  const strip = (x: State) => queryOf({ ...x, find: '', pin: [], year: null, bloc: '', log: null });
  return strip(a) === strip(s);
}

/** A place's value in a year, or the latest of the FALLBACK_YEARS before it; a static measure's only value. */
export function valueAt(d: MeasureData | undefined, m: MeasureMeta, id: string, year: number, fallback = FALLBACK_YEARS): { value: number; year: number } | null {
  const arr = d?.v[id];
  if (!arr) return null;
  if (m.static) {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return { value: arr[i]!, year: d!.from + i };
    return null;
  }
  for (let y = year; y >= year - fallback; y--) {
    const v = arr[y - d!.from];
    if (v !== null && v !== undefined) return { value: v, year: y };
  }
  return null;
}

/** A place's series as [year, value] pairs. */
export const seriesOf = (d: MeasureData | undefined, id: string): [number, number][] =>
  (d?.v[id] ?? []).flatMap((v, i) => (v === null ? [] : [[d!.from + i, v] as [number, number]]));

/** Whether values belong on a log scale: all above zero and spanning more than LOG_SPAN times. */
export function wantsLog(values: number[]): boolean {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2 || v.some((x) => x <= 0)) return false;
  return Math.max(...v) / Math.min(...v) > LOG_SPAN;
}
/** Whether a log scale is possible at all. */
export const canLog = (values: number[]) => values.length > 0 && values.every((x) => x > 0);

/** Pearson's correlation, or null with fewer than three pairs or no spread. */
export function correlation(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Years where at least `min` places have both figures. */
export function sharedYears(a: MeasureData | undefined, ma: MeasureMeta, b: MeasureData | undefined, mb: MeasureMeta, places: string[], min = SCATTER_MIN): number[] {
  const lo = Math.max(ma.static ? -Infinity : ma.from, mb.static ? -Infinity : mb.from);
  const hi = Math.min(ma.static ? Infinity : lastActual(ma), mb.static ? Infinity : lastActual(mb));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    const y = Math.min(ma.static ? Infinity : ma.year, mb.static ? Infinity : mb.year);
    return [Number.isFinite(y) ? y : Math.max(ma.year, mb.year)];
  }
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) {
    let n = 0;
    for (const id of places) if (valueAt(a, ma, id, y, 0) && valueAt(b, mb, id, y, 0)) n++;
    if (n >= min) out.push(y);
  }
  return out;
}

/** The last year that is not a projection. */
export const lastActual = (m: MeasureMeta) => (m.projectedAfter !== undefined ? Math.min(m.to, m.projectedAfter) : m.to);

/** "GDP per person" stays as it is inside a sentence; "Population" becomes "population". */
export const inSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label);

/** Tidy axis ticks: a linear step of 1, 2, 2.5 or 5 × 10ⁿ, or powers of ten (with 2 and 5 between, when few). */
export function ticks(lo: number, hi: number, log: boolean, count = 5): { lo: number; hi: number; ticks: number[] } {
  if (log) {
    const a = Math.floor(Math.log10(lo));
    const b = Math.ceil(Math.log10(hi));
    const out: number[] = [];
    for (let e = a; e <= b; e++) {
      out.push(10 ** e);
      if (b - a <= 2 && e < b) out.push(2 * 10 ** e, 5 * 10 ** e);
    }
    const step = Math.max(1, Math.ceil((b - a + 1) / 7));
    return { lo: 10 ** a, hi: 10 ** b, ticks: b - a <= 2 ? out : out.filter((_, i) => i % step === 0) };
  }
  if (!(hi > lo)) hi = lo + 1;
  const span = hi - lo;
  const mag = 10 ** Math.floor(Math.log10(span / count));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= count) ?? mag * 10;
  const l = Math.floor(lo / step) * step;
  const h = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = l; v <= h + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return { lo: l, hi: h, ticks: out };
}
