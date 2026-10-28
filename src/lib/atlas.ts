// The Atlas (/atlas): every shaded layer of every live map view on one map. It adds no data and no layer logic:
// it lists the map layer registry (./map/layers.ts), keeps the layers whose view is live, and groups them as the
// menu does (src/data/nav.ts): five topics, then one row per map view family, with a select when a family has
// several layers (the minerals, the crops). Each layer's name, source and years come from its own layer file.
import { NAV_HUBS } from '../data/nav.ts';
import { NAV_TEXT } from '../i18n/en.ts';
import { ATLAS_TEXT as A } from '../i18n/atlas.en.ts';
import { monthText } from '../i18n/conflict.en.ts';
import { layerFile, layerPath, mapLayers } from './map/layers.ts';
import type { LayerFile, Overlay } from './map/types.ts';
import { live } from './routes.ts';
import { BLOC_ORDER } from './blocs.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';
import type { MarkSymbol } from '../scripts/map/legend.ts';

/** One shaded layer, as the Atlas lists it and its script reads it. */
export interface AtlasLayer {
  /** Its name in the address (?layer=): its map view's path without slashes ("oil-trade", "minerals-lithium"). */
  key: string;
  /** The layer file's id and address. */
  id: string;
  file: string;
  family: string;
  name: string;
  /** What a figure on it measures ("Share of world mine production"). */
  measure: string;
  /** Source and years, for the list ("USGS Mineral Commodity Summaries 2026 · 2024–2025"). */
  source: string;
  span: string;
  /** Its map view page: "See full page". */
  path: string;
  years: number[];
  /** The year it opens on: its view's default. */
  year: number;
  axis?: LayerFile['axis'];
}

export interface AtlasRow { family: string; label: string; layers: AtlasLayer[] }
export interface AtlasTopic { id: string; label: string; rows: AtlasRow[] }

/** The layer the Atlas opens on (design: "The map opens on lithium"), else the first one listed. */
export const DEFAULT_LAYER = 'minerals-lithium';

/** A layer's key in the address, from its view's path: /oil/trade → oil-trade, /blocs → blocs. */
export const keyOf = (path: string) => path.slice(1).replace(/\//g, '-');

/** The years a layer covers, as the list says them. */
function spanOf(f: LayerFile): string {
  const first = f.data[0], last = f.data.at(-1)!;
  if (f.axis === 'days') return last.label ?? String(last.year);
  if (f.axis === 'months') return A.span(monthText(first.year), monthText(last.year));
  return A.span(String(first.year), String(last.year));
}

let cache: AtlasTopic[] | null = null;
/** The topics with their rows, in menu order; a topic or row with no live layer is left out. */
export function atlasTopics(): AtlasTopic[] {
  if (cache) return cache;
  const byFamily = new Map<string, AtlasLayer[]>();
  const keys = new Map<string, string>();
  for (const d of mapLayers()) {
    const route = live(d.view);
    if (!route) continue;
    const f = layerFile(d.id);
    const key = keyOf(route.path);
    // Two layers on one view (none today) would share a key; fail rather than list one twice.
    if (keys.has(key)) throw new Error(`atlas: layers ${keys.get(key)} and ${d.id} share the key "${key}"`);
    keys.set(key, d.id);
    const list = byFamily.get(d.family) ?? [];
    list.push({
      key, id: d.id, file: layerPath(d.id), family: d.family, name: f.name, measure: f.text.shareLabel, source: f.source,
      span: spanOf(f), path: route.path, years: f.years, year: f.year, axis: f.axis,
    });
    byFamily.set(d.family, list);
  }
  const listed = new Set(NAV_HUBS.flatMap((h) => h.views.map((v) => v.id)));
  const lost = [...byFamily.keys()].filter((f) => !listed.has(f));
  if (lost.length) throw new Error(`atlas: map layer families not in the menu (src/data/nav.ts): ${lost.join(', ')}`);
  cache = NAV_HUBS.map((h) => ({
    id: h.id, label: NAV_TEXT.hubs[h.id] ?? h.id,
    rows: h.views.flatMap((v) => {
      const layers = byFamily.get(v.id);
      return layers ? [{ family: v.id, label: NAV_TEXT.views[v.id]?.[0] ?? v.id, layers }] : [];
    }),
  })).filter((t) => t.rows.length);
  return cache;
}

export const atlasLayers = () => atlasTopics().flatMap((t) => t.rows.flatMap((r) => r.layers));

/** The layer the Atlas opens on. */
export const defaultLayer = () => atlasLayers().find((l) => l.id === DEFAULT_LAYER) ?? atlasLayers()[0];

/** One choice of an overlay: a trade flow, a grouping. Its marks are overlays of a live layer file. */
export interface AtlasOverlayVariant {
  /** Its name in the address (?overlays=flows-oil-trade,bloc-nato). The part before the first "-" is the overlay. */
  token: string;
  label: string;
  /** The layer file that draws it, and which of that file's overlays. A bloc outline has none: every file lists the blocs. */
  file?: string;
  parts?: string[];
  /** The step of its layer it shows: fixed (an alert period), or else the one nearest the map's year. */
  step?: number;
  source?: string;
  /** Its legend: a mark and words for each part. */
  legend: { symbol: MarkSymbol; label: string }[];
}

export interface AtlasOverlay {
  id: 'flows' | 'launches' | 'alerts' | 'bloc';
  label: string;
  desc: string;
  /** The topic it is listed under. */
  topic: string;
  glyph: MarkSymbol;
  variants: AtlasOverlayVariant[];
}

const markOf = (o: Overlay): MarkSymbol => (o.kind === 'arcs' ? (o.dashed ? 'arc-dashed' : 'arc') : o.kind === 'points' ? o.symbol : 'arc');
const variantOf = (token: string, l: AtlasLayer, f: LayerFile, parts: Overlay[], step?: number): AtlasOverlayVariant => ({
  token, label: l.name, file: l.file, parts: parts.map((o) => o.id), step, source: f.source,
  legend: parts.map((o) => ({ symbol: markOf(o), label: o.label })),
});

let overlayCache: AtlasOverlay[] | null = null;
/**
 * The overlays whose map view is live (spec: flow arcs, pipelines, cables, chokepoints, disaster dots, bloc outline).
 * Each is drawn from the layer file of the view that draws it, so the Atlas computes nothing of its own:
 *  - trade flows: the arcs of every live layer that has them (oil, gas, the crops, chips, arms); flows two layers
 *    share are offered once, named for their family ("Arms transfers");
 *  - launch sites: the marks on the launches view; disaster alerts: the orange and red alerts of the all-alerts view
 *    over its shortest period;
 *  - bloc outline: the groupings every layer file lists, when the blocs views are live.
 * Pipelines, cables, chokepoints and internet outage marks have no live view that draws them yet, so they are not listed.
 */
export function atlasOverlays(): AtlasOverlay[] {
  if (overlayCache) return overlayCache;
  const O = A.overlay;
  const layers = atlasLayers();
  const out: AtlasOverlay[] = [];

  const flows: AtlasOverlayVariant[] = [];
  // The same flows on several layers (arms exports and imports) are offered once, named for their family.
  const seen = new Map<string, AtlasOverlayVariant>();
  for (const l of layers) {
    const f = layerFile(l.id);
    const arcs = (f.overlays ?? []).filter((o) => o.kind === 'arcs' && o.items.length);
    const sig = JSON.stringify(arcs.map((o) => o.items));
    if (!arcs.length) continue;
    const twin = seen.get(sig);
    if (twin) {
      twin.label = NAV_TEXT.views[l.family]?.[0] ?? twin.label;
      continue;
    }
    const v = variantOf(`flows-${l.key}`, l, f, arcs);
    seen.set(sig, v);
    flows.push(v);
  }
  if (flows.length) out.push({ id: 'flows', label: O.flows.label, desc: O.flows.desc, topic: 'resources', glyph: 'arc', variants: flows });

  const launches = layers.find((l) => l.id === 'space-launches');
  const sites = launches && layerFile(launches.id).overlays?.find((o) => o.id === 'sites' && o.items.length);
  if (launches && sites) out.push({ id: 'launches', label: O.launches.label, desc: O.launches.desc, topic: 'technology', glyph: 'hollow', variants: [variantOf('launches', launches, layerFile(launches.id), [sites])] });

  const alerts = layers.find((l) => l.id === 'disasters-all');
  if (alerts) {
    const f = layerFile(alerts.id);
    const parts = (f.overlays ?? []).filter((o) => (o.id === 'alerts-orange' || o.id === 'alerts-red') && o.items.length);
    const step = f.years.indexOf(Math.min(...f.years));
    if (parts.length) out.push({ id: 'alerts', label: O.alerts.label, desc: O.alerts.desc(f.data[step].label ?? ''), topic: 'climate', glyph: 'triangle', variants: [variantOf('alerts', alerts, f, parts, step)] });
  }

  if (layers.some((l) => l.family === 'blocs')) {
    const f = layerFile(layers.find((l) => l.family === 'blocs')!.id);
    const variants = BLOC_ORDER.filter((b) => f.blocs[b]).map((b) => ({ token: `bloc-${b}`, label: BLOC_TEXT[b] ?? b, source: f.source, legend: [{ symbol: 'outline' as const, label: BLOC_TEXT[b] ?? b }] }));
    if (variants.length) out.push({ id: 'bloc', label: O.bloc.label, desc: O.bloc.desc, topic: 'power', glyph: 'outline', variants });
  }
  overlayCache = out;
  return out;
}
