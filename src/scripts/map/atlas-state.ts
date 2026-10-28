// The Atlas's state in the URL: /atlas?layer=oil-trade&year=2023&country=IND&overlays=… (spec, "Atlas"). Defaults are
// left out, so the plain Atlas keeps its plain address; the canonical is always /atlas, and the Worker marks any
// address with a query noindex. `year` is written the way the layer's own view writes its step: a year (2023), a
// month on the conflict layer (2026-03), or a period in days on the disaster layers (90).
import { monthCode, monthNumber, nearestYear } from './state';

export interface AtlasLayerRef { key: string; years: number[]; year: number; axis?: 'days' | 'months' }

export interface AtlasState {
  layer: string;
  /** The step the reader chose; left out, the layer opens on its view's default. */
  year?: number;
  /** An internal place id (ISO3 for countries). */
  country?: string;
  overlays: string[];
}

export interface AtlasContext {
  layers: AtlasLayerRef[];
  /** The layer the Atlas opens on. */
  start: string;
  /** Place ids, and their slugs (an old or hand-written link may use one). */
  slugs: Record<string, string>;
  /** The overlays that can be turned on. */
  overlays: string[];
}

const layerOf = (ctx: AtlasContext, key: string) => ctx.layers.find((l) => l.key === key);

/** A step as the URL writes it, and back (NaN when it does not read). */
const stepText = (l: AtlasLayerRef, v: number) => (l.axis === 'months' ? monthCode(v) : String(v));
const stepOf = (l: AtlasLayerRef, s: string) => (l.axis === 'months' ? monthNumber(s) : /^\d+$/.test(s) ? Number(s) : NaN);

/** The step to show on a layer for the year the reader asked for: the nearest one it has, or its default. */
export function yearOn(l: AtlasLayerRef, want: number | undefined): number {
  return want === undefined ? l.year : nearestYear(l.years, want);
}

/** Reads the address; unknown layers, places and overlays are dropped. `askedYear` is set when a year moved. */
export function readAtlasState(search: string, ctx: AtlasContext): { state: AtlasState; askedYear?: number } {
  const q = new URLSearchParams(search);
  const layer = layerOf(ctx, (q.get('layer') ?? '').toLowerCase()) ?? layerOf(ctx, ctx.start) ?? ctx.layers[0];
  const state: AtlasState = { layer: layer.key, overlays: [] };
  let askedYear: number | undefined;
  const y = stepOf(layer, q.get('year') ?? '');
  if (Number.isInteger(y)) {
    state.year = nearestYear(layer.years, y);
    if (state.year !== y) askedYear = y;
  }
  const c = (q.get('country') ?? '').toLowerCase();
  if (c) state.country = Object.keys(ctx.slugs).find((id) => id.toLowerCase() === c) ?? Object.entries(ctx.slugs).find(([, s]) => s === c)?.[0];
  const ov = new Set((q.get('overlays') ?? '').toLowerCase().split(',').filter(Boolean));
  state.overlays = ctx.overlays.filter((o) => ov.has(o));
  return { state, askedYear };
}

/** The address for a state, in a fixed order (layer, year, country, overlays), defaults left out. */
export function writeAtlasState(url: URL, s: AtlasState, ctx: AtlasContext): URL {
  const u = new URL(url.href);
  u.search = '';
  const layer = layerOf(ctx, s.layer);
  if (!layer) return u;
  const shown = yearOn(layer, s.year);
  if (s.layer !== ctx.start) u.searchParams.set('layer', s.layer);
  if (shown !== layer.year) u.searchParams.set('year', stepText(layer, shown));
  if (s.country) u.searchParams.set('country', s.country.toUpperCase());
  if (s.overlays.length) u.searchParams.set('overlays', s.overlays.join(','));
  // Commas read better than %2C in a shared link, and are safe in a query.
  u.search = u.search.replace(/%2C/gi, ',');
  return u;
}

/**
 * The year carried to another layer: the one the reader chose, when the new layer steps the same way (years with
 * years); a layer over periods or months, or a reader who never chose, opens on its default.
 */
export function carryYear(from: AtlasLayerRef, to: AtlasLayerRef, chosen: number | undefined): number | undefined {
  if (chosen === undefined || (from.axis ?? 'years') !== (to.axis ?? 'years')) return undefined;
  return chosen;
}
