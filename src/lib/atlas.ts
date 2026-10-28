// The Atlas (/atlas): every shaded layer of every live map view on one map. It adds no data and no layer logic:
// it lists the map layer registry (./map/layers.ts), keeps the layers whose view is live, and groups them as the
// menu does (src/data/nav.ts): five topics, then one row per map view family, with a select when a family has
// several layers (the minerals, the crops). Each layer's name, source and years come from its own layer file.
import { NAV_HUBS } from '../data/nav.ts';
import { NAV_TEXT } from '../i18n/en.ts';
import { ATLAS_TEXT as A } from '../i18n/atlas.en.ts';
import { monthText } from '../i18n/conflict.en.ts';
import { layerFile, layerPath, mapLayers } from './map/layers.ts';
import type { LayerFile } from './map/types.ts';
import { live } from './routes.ts';

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
