// The Atlas's state in the URL: /atlas?layer=oil-trade&year=2023&country=IND&overlays=… (spec, "Atlas"). Defaults are
// left out, so the plain Atlas keeps its plain address; the canonical is always /atlas, and the Worker marks any
// address with a query noindex. `year` is written the way the layer's own view writes its step: a year (2023), a
// month on the conflict layer (2026-03), or a period in days on the disaster layers (90).
import type { Overlay } from '../../lib/map/types';
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
  /** The overlay choices that can be turned on, in list order ("flows-oil-trade", "bloc-nato"). */
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
  // One choice per overlay (one trade flow, one grouping): the first named wins.
  const asked = (q.get('overlays') ?? '').toLowerCase().split(',').filter((o) => ctx.overlays.includes(o));
  state.overlays = ctx.overlays.filter((o) => asked.find((a) => kindOf(a) === kindOf(o)) === o);
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

/** The overlay a choice belongs to: "flows-oil-trade" → "flows", "bloc-nato" → "bloc". */
export const kindOf = (token: string) => token.split('-')[0];

/** Turns an overlay choice on (in place of another choice of the same overlay) or off, keeping the list order. */
export function toggleOverlay(on: string[], token: string, want: boolean, order: string[]): string[] {
  const rest = on.filter((o) => kindOf(o) !== kindOf(token));
  return order.filter((o) => rest.includes(o) || (want && o === token));
}

/**
 * The step of an overlay's own layer to show: a fixed one (an alert period); else, of the steps that have marks, the
 * year nearest the one the map shows when both step in years, or else nearest the overlay layer's own default.
 */
export function overlayStep(src: AtlasLayerRef, fixed: number | undefined, map: AtlasLayerRef, shown: number, has: (index: number) => boolean): number {
  if (fixed !== undefined) return fixed;
  const years = src.years.filter((_, i) => has(i));
  if (!years.length) return src.years.indexOf(src.year);
  return src.years.indexOf(nearestYear(years, !src.axis && !map.axis ? shown : src.year));
}

/** An overlay's marks for one step of its own layer, with the step masks taken off, so they stay put on another layer. */
export function overlayAt(o: Overlay, index: number): Overlay {
  const inStep = (x: { m?: number; i?: number }) => (x.i !== undefined ? x.i === index : !x.m || Math.floor(x.m / 2 ** index) % 2 === 1);
  if (o.kind === 'arcs') return { ...o, items: o.items.filter(inStep).map((a) => ({ ...a, m: 0 })) };
  if (o.kind === 'points') return { ...o, items: o.items.filter(inStep).map((p) => { const q = { ...p, m: 0 }; delete q.i; return q; }) };
  return o;
}

/**
 * When an overlay's drawn marks are from: the one year every mark carries (a crop's largest flows), else the step drawn,
 * as its layer says it (2025, "2021–2025", "Last 30 days"). `year` is the year to compare with the map's, when there is one.
 */
export function overlayTime(parts: Overlay[], step: { year: number; label?: string } | undefined): { text: string; year?: number } | null {
  const fixed = parts.find((o) => o.year !== undefined)?.year;
  if (fixed !== undefined) return { text: String(fixed), year: fixed };
  if (!step) return null;
  return { text: step.label ?? String(step.year), year: step.label && !/\d{4}/.test(step.label) ? undefined : step.year };
}

/**
 * The map view's own address for the Atlas's state on a layer: its page, with the year (as that view writes it) and the
 * country (its slug), so "See full page" opens the view as the Atlas shows it.
 */
export function viewHref(path: string, l: AtlasLayerRef, s: AtlasState, slugs: Record<string, string>): string {
  const q = new URLSearchParams();
  const shown = yearOn(l, s.year);
  if (shown !== l.year) q.set(l.axis === 'months' ? 'month' : l.axis === 'days' ? 'days' : 'year', stepText(l, shown));
  if (s.country) q.set('country', slugs[s.country] ?? s.country.toLowerCase());
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * What the year slider says about a year the reader chose: kept, or moved to the latest, earliest or nearest year the
 * layer has (design review decision 7.4). Nothing when the reader never chose one, or the layer is not over years.
 */
export function yearNote(l: AtlasLayerRef, chosen: number | undefined): { kind: 'kept' } | { kind: 'latest' | 'earliest' | 'nearest'; got: number; want: number } | null {
  if (chosen === undefined || l.axis) return null;
  const got = yearOn(l, chosen);
  if (got === chosen) return { kind: 'kept' };
  return { kind: got === Math.max(...l.years) ? 'latest' : got === Math.min(...l.years) ? 'earliest' : 'nearest', got, want: chosen };
}
