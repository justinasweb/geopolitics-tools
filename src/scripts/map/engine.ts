// The map engine: one MapLibre map drawing a layer file (src/lib/map/types.ts) on the projected basemap
// (src/lib/map/basemap.ts). It shades places by class through feature state, so changing the year or selecting a
// country never rebuilds the map; outlines a bloc; draws overlays (flow arcs, lines, points); and reports hover,
// clicks and keys to the page script (./view.ts), which owns the panel, the controls and the URL.
//
// Loaded only when a map is shown (desktop: when the stage scrolls into view; phone: on "Show map"), so MapLibre's
// 1 MB never delays the page's text.
import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
// The worker is a self-contained file; ?url makes the bundler copy it as it is and give its hashed address
// (07-platform-test.md, finding 3: a bundled worker silently fails to draw).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { WORLD_BOUNDS } from '../../lib/map/projection';
import type { LayerFile, Overlay } from '../../lib/map/types';

maplibregl.setWorkerUrl(workerUrl);

export interface Basemap { countries: FeatureCollection; disputed: FeatureCollection }

export interface Hit {
  /** A place id, or null for a shape that maps to no place (Siachen) or an overlay mark. */
  id: string | null;
  /** Natural Earth's code and name, for shapes without a place. */
  code?: string;
  name?: string;
  /** An overlay mark's tooltip text. */
  tip?: string;
  /** The disputed boundary under the pointer, if any. */
  disputed?: string;
  point: { x: number; y: number };
}

export interface Handlers {
  hover: (hit: Hit | null, touch: boolean) => void;
  click: (hit: Hit | null, touch: boolean) => void;
  /** N / P / Enter / Escape while the map has focus. */
  key: (key: 'next' | 'prev' | 'open' | 'clear') => void;
  ready: () => void;
  error: (message: string) => void;
}

export interface MapController {
  setYear: (index: number) => void;
  select: (id: string | null) => void;
  setBloc: (members: string[] | null) => void;
  zoom: (how: 'in' | 'out' | 'reset') => void;
  /** Fits the world into the part of the map that nothing covers (the phone map's legend and sheet). */
  frame: (pad: { top: number; bottom: number }) => void;
  resize: () => void;
  /** The screen point of a place's largest shape, for a keyboard user's tooltip. */
  pointOf: (id: string) => { x: number; y: number } | null;
  remove: () => void;
}

/** The token colours the style uses, read from the page so the map follows the design tokens. */
const TOKENS = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--div-1', '--div-2', '--div-3', '--div-4', '--div-5', '--div-6', '--div-7',
  '--map-nodata', '--map-withheld', '--map-border', '--paper-sunk', '--paper-raised', '--ink', '--ink-muted', '--accent', '--brand'] as const;
type Token = (typeof TOKENS)[number];

function readTokens(): Record<Token, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<Token, string>;
  for (const t of TOKENS) {
    const v = cs.getPropertyValue(t).trim();
    // One undefined colour breaks MapLibre's whole style (spec, "Lessons"); say which one instead.
    if (!v) throw new Error(`design token ${t} is not defined`);
    out[t] = v;
  }
  return out;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** An 8 × 8 pattern as image data: the hatch for "withheld", dots for "not yet reported", and point symbols. */
function pattern(draw: (g: CanvasRenderingContext2D) => void, size = 8): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g);
  return g.getImageData(0, 0, size, size);
}

function symbol(kind: 'triangle' | 'diamond' | 'square', fill: string, stroke: string): ImageData {
  const s = 32;
  return pattern((g) => {
    g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 2.5;
    g.beginPath();
    if (kind === 'triangle') { g.moveTo(16, 5); g.lineTo(28, 26); g.lineTo(4, 26); }
    else if (kind === 'diamond') { g.moveTo(16, 3); g.lineTo(29, 16); g.lineTo(16, 29); g.lineTo(3, 16); }
    else g.rect(7, 7, 18, 18);
    g.closePath(); g.fill(); g.stroke();
  }, s);
}

type Expr = maplibregl.ExpressionSpecification;

export function createMap(container: HTMLElement, base: Basemap, layer: LayerFile, on: Handlers): MapController {
  const T = readTokens();
  const scale = layer.scale === 'seq' ? 5 : 7;
  const colours = Array.from({ length: scale }, (_, i) => T[`--${layer.scale}-${i + 1}` as Token]);
  // Where the map starts and the reset button returns: the layer's own area (a disputed river), else the world.
  const home = layer.bounds ?? WORLD_BOUNDS;

  const map = new maplibregl.Map({
    container,
    style: { version: 8, sources: {}, layers: [{ id: 'sea', type: 'background', paint: { 'background-color': T['--paper-sunk'] } }] },
    bounds: home, fitBoundsOptions: { padding: 16 },
    renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0, maxZoom: 5,
    // The whole world is 512 px wide at zoom 0; a phone needs less to show all of it. MapLibre's own limit keeps
    // the world as tall as the screen, which crops a tall phone map; this one only keeps the centre on the world.
    minZoom: -2,
    transformConstrain: (c, zoom) => ({
      center: new maplibregl.LngLat(Math.max(-180, Math.min(180, c.lng)), Math.max(WORLD_BOUNDS[0][1], Math.min(WORLD_BOUNDS[1][1], c.lat))),
      zoom,
    }),
    fadeDuration: reduced() ? 0 : 300,
    attributionControl: { compact: true, customAttribution: 'Natural Earth' },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  let ready = false;
  let fitPad: number | { top: number; bottom: number; left: number; right: number } = 16;
  let year = layer.data.length - 1;
  let selected: string | null = null;
  const ids = new Set<string>();
  for (const f of base.countries.features) if (f.properties?.id) ids.add(f.properties.id);

  const paint = () => {
    if (!ready) return;
    const v = layer.data[year].v;
    for (const id of ids) {
      const e = v[id];
      map.setFeatureState({ source: 'countries', id }, { c: e ? e[0] : -9, dim: selected !== null && id !== selected });
    }
  };

  const canvas = map.getCanvas();
  canvas.setAttribute('aria-label', container.getAttribute('aria-label') ?? '');
  canvas.setAttribute('aria-describedby', container.getAttribute('aria-describedby') ?? '');
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', 'map');
  container.removeAttribute('aria-label');

  map.on('load', () => {
    try {
      map.addImage('withheld', pattern((g) => {
        g.fillStyle = T['--map-nodata']; g.fillRect(0, 0, 8, 8);
        g.strokeStyle = T['--map-withheld']; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
      }), { pixelRatio: 1 });
      map.addImage('notyet', pattern((g) => {
        g.fillStyle = T['--paper-raised']; g.fillRect(0, 0, 8, 8);
        g.fillStyle = T['--ink-muted']; g.beginPath(); g.arc(4, 4, 1.1, 0, Math.PI * 2); g.fill();
      }), { pixelRatio: 1 });
      for (const k of ['triangle', 'diamond', 'square'] as const) {
        map.addImage(`sym-${k}`, symbol(k, k === 'triangle' ? T['--ink'] : T['--paper-raised'], k === 'triangle' ? T['--paper-raised'] : T['--ink']), { pixelRatio: 2 });
      }

      map.addSource('countries', { type: 'geojson', data: base.countries, promoteId: 'id' });
      map.addSource('disputed', { type: 'geojson', data: base.disputed });
      const cls: Expr = ['coalesce', ['feature-state', 'c'], -9];
      const dim: Expr = ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 1];
      const fill: Expr = ['match', cls, ...colours.flatMap((c, i) => [i + 1, c]), T['--map-nodata']] as unknown as Expr;
      map.addLayer({ id: 'fill', type: 'fill', source: 'countries', paint: { 'fill-color': fill, 'fill-opacity': dim } });
      // Withheld and not-yet-reported are patterns, so neither ever reads as zero or as a colour of the scale.
      map.addLayer({ id: 'withheld', type: 'fill', source: 'countries', paint: { 'fill-pattern': 'withheld', 'fill-opacity': ['case', ['==', cls, 0], dim, 0] } });
      map.addLayer({ id: 'notyet', type: 'fill', source: 'countries', paint: { 'fill-pattern': 'notyet', 'fill-opacity': ['case', ['==', cls, -1], dim, 0] } });
      map.addLayer({ id: 'border', type: 'line', source: 'countries', paint: { 'line-color': T['--map-border'], 'line-width': 0.6 } });
      map.addLayer({ id: 'disputed', type: 'line', source: 'disputed', paint: { 'line-color': T['--ink-muted'], 'line-width': 1, 'line-dasharray': [3, 2] } });
      map.addLayer({ id: 'bloc', type: 'line', source: 'countries', filter: ['in', ['get', 'id'], ['literal', []]], paint: { 'line-color': T['--ink'], 'line-width': 2 } });
      map.addLayer({ id: 'hover', type: 'line', source: 'countries', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': T['--ink'], 'line-width': 1.4 } });
      map.addLayer({ id: 'selected', type: 'line', source: 'countries', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': T['--accent'], 'line-width': 2.5 } });
      addOverlays(layer.overlays ?? []);
      ready = true;
      showMarks();
      paint();
      on.ready();
    } catch (e) {
      on.error((e as Error).message);
    }
  });
  // Show the error state only if the map never got going (no WebGL, a file failed); later warnings do not hide
  // a working map.
  map.on('error', (e) => { if (!ready) on.error(e.error?.message ?? 'map error'); });

  const overlayLayers: string[] = [];
  // Overlays whose marks show in some years (or periods) only: filtered on the mark's bit for the year.
  const masked: string[] = [];
  const showMarks = () => {
    const bit = 2 ** year;
    for (const id of masked) map.setFilter(id, ['any', ['==', ['get', 'm'], 0], ['==', ['%', ['floor', ['/', ['get', 'm'], bit]], 2], 1]]);
  };
  function addOverlays(list: Overlay[]) {
    const widths = (max: number): Expr => ['interpolate', ['linear'], ['get', 'w'], 0, 0.8, max || 1, 6];
    for (const o of list) {
      const src = `ov-${o.id}`;
      if (o.kind === 'arcs') {
        const max = Math.max(0, ...o.items.map((a) => a.w));
        map.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: o.items.map((a) => ({ type: 'Feature', properties: { w: a.w, tip: a.tip, m: a.m ?? 0 }, geometry: { type: 'LineString', coordinates: a.p } })) } });
        if (o.items.some((a) => a.m)) masked.push(src);
        map.addLayer({ id: src, type: 'line', source: src, layout: { 'line-cap': 'round' }, paint: { 'line-color': T['--ink'], 'line-opacity': 0.55, 'line-width': widths(max) } });
      } else if (o.kind === 'lines') {
        map.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: o.items.map((l) => ({ type: 'Feature', properties: { tip: l.tip }, geometry: { type: 'MultiLineString', coordinates: l.p } })) } });
        map.addLayer({
          id: src, type: 'line', source: src, layout: { 'line-cap': 'round' },
          paint: o.dashed ? { 'line-color': T['--accent'], 'line-width': 1.6, 'line-dasharray': [3, 2] } : { 'line-color': T['--brand'], 'line-width': 1.4, 'line-opacity': 0.85 },
        });
      } else {
        map.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: o.items.map((p) => ({ type: 'Feature', properties: { r: p.r ?? 5, tip: p.tip, m: p.m ?? 0 }, geometry: { type: 'Point', coordinates: p.at } })) } });
        if (o.items.some((p) => p.m)) masked.push(src);
        if (o.symbol === 'dot' || o.symbol === 'hollow') {
          const hollow = o.symbol === 'hollow';
          map.addLayer({
            id: src, type: 'circle', source: src,
            paint: { 'circle-radius': ['get', 'r'], 'circle-color': hollow ? T['--paper-raised'] : T['--accent'], 'circle-opacity': hollow ? 1 : 0.8, 'circle-stroke-color': hollow ? T['--accent'] : T['--paper-raised'], 'circle-stroke-width': hollow ? 2 : 1.2 },
          });
        } else {
          map.addLayer({ id: src, type: 'symbol', source: src, layout: { 'icon-image': `sym-${o.symbol}`, 'icon-size': 0.7, 'icon-allow-overlap': true } });
        }
      }
      overlayLayers.push(src);
    }
  }

  // Hover and click are read from the whole map, not bound to country shapes, so marks over the sea answer too
  // (spec, "Lessons": map events must work over the sea).
  function hitAt(point: maplibregl.Point): Hit | null {
    if (!ready) return null;
    const pad = 4;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]];
    const mark = overlayLayers.length ? map.queryRenderedFeatures(box, { layers: overlayLayers })[0] : undefined;
    const pt = { x: point.x, y: point.y };
    if (mark) return { id: null, tip: String(mark.properties.tip ?? ''), point: pt };
    const shape = map.queryRenderedFeatures(point, { layers: ['fill'] })[0];
    const line = map.queryRenderedFeatures(box, { layers: ['disputed'] })[0];
    if (!shape) return line ? { id: null, disputed: String(line.properties.name ?? ''), point: pt } : null;
    return { id: (shape.properties.id as string) || null, code: shape.properties.code as string, name: shape.properties.name as string | undefined, disputed: line ? String(line.properties.name ?? '') : undefined, point: pt };
  }
  const isTouch = (e: maplibregl.MapMouseEvent) => (e.originalEvent as PointerEvent).pointerType === 'touch' || matchMedia('(hover: none)').matches;
  let hovered: string | null = null;
  const setHover = (id: string | null) => {
    if (id === hovered || !ready) return;
    hovered = id;
    map.setFilter('hover', ['==', ['get', 'id'], id ?? '']);
  };
  map.on('mousemove', (e) => {
    if (isTouch(e)) return;
    const h = hitAt(e.point);
    setHover(h?.id ?? null);
    canvas.style.cursor = h && (h.id || h.tip) ? 'pointer' : '';
    on.hover(h, false);
  });
  map.on('mouseout', () => { setHover(null); on.hover(null, false); });
  map.on('click', (e) => on.click(hitAt(e.point), isTouch(e)));
  canvas.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'n') on.key('next');
    else if (k === 'p') on.key('prev');
    else if (k === 'enter') on.key('open');
    else if (k === 'escape') on.key('clear');
    else return;
    e.preventDefault();
  });
  canvas.addEventListener('blur', () => { setHover(null); on.hover(null, false); });

  // The largest polygon's centre of each place, for the keyboard tooltip.
  const centres = new Map<string, [number, number]>();
  for (const f of base.countries.features) {
    const id = f.properties?.id as string | undefined;
    if (!id || f.geometry.type !== 'MultiPolygon') continue;
    let best = 0;
    for (const poly of f.geometry.coordinates) {
      const r = poly[0];
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
        a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k;
      }
      if (Math.abs(a) > best && a) { best = Math.abs(a); centres.set(id, [cx / (3 * a), cy / (3 * a)]); }
    }
  }

  return {
    setYear(i) { year = i; paint(); if (ready) showMarks(); },
    select(id) {
      selected = id;
      if (ready) map.setFilter('selected', ['==', ['get', 'id'], id ?? '']);
      paint();
    },
    setBloc(members) { if (ready) map.setFilter('bloc', ['in', ['get', 'id'], ['literal', members ?? []]]); },
    zoom(how) {
      const opts = { duration: reduced() ? 0 : 300 };
      if (how === 'in') map.zoomIn(opts);
      else if (how === 'out') map.zoomOut(opts);
      else map.fitBounds(home, { padding: fitPad, ...opts });
    },
    frame({ top, bottom }) {
      const pad = { top, bottom, left: 12, right: 12 };
      fitPad = pad;
      map.fitBounds(home, { padding: pad, duration: reduced() ? 0 : 300 });
    },
    resize() { map.resize(); },
    pointOf(id) {
      const c = centres.get(id);
      if (!c) return null;
      const p = map.project(c as [number, number]);
      return { x: p.x, y: p.y };
    },
    remove() { map.remove(); },
  };
}
