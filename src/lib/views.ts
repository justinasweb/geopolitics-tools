// The map views drawn from the indicator registry (src/data/views.ts), worked out once per page: the years the
// slider offers, every year's ranked countries and world figure, the colour classes (fixed across years so the
// slider compares like with like), and the template sentences. The page template, the map layer files and the
// share images all read this, so a figure is computed once.
import { DIV_EDGES, VIEW_FAMILIES, type ViewFamily, type ViewLayer } from '../data/views.ts';
import type { Format, Loaded } from '../data/indicators.ts';
import { emissions } from '../adapters/owid.ts';
import { displacement } from '../adapters/unhcr.ts';
import { PARTS_TEXT, PLACE_NOTES, VIEW_TEXT, VIEWS_TEXT as W, type LayerText } from '../i18n/views.en.ts';
import { INDICATOR_TEXT } from '../i18n/en.ts';
import { ANSWER, SOURCE_NOTE, SOURCE_SHORT, inSentence } from '../i18n/pages.en.ts';
import { indicator, refreshed, shared, sourceName, tryLoad } from './data.ts';
import { VIEW_MEASURES } from '../data/view-measures.ts';
import { yearsOf } from '../adapters/core.ts';
import { formatValue } from './format.ts';
import { place } from './places.ts';
import { breaks, classOf, counts, defaultYear, ranking, type Row } from './stats.ts';

const emissionsData = shared(emissions);
const unhcrData = shared(displacement);

export interface ViewYear {
  year: number;
  /** Ranked countries and territories with a figure for the year, largest first. */
  rows: Row[];
  /** The world figure: the source's own world row where it has one (CO2), else the sum of the rows for layers that add up. */
  world: number | null;
  /** The world figure is the source's own, not a sum of the countries listed. */
  worldOwn: boolean;
}

export interface ViewPage {
  family: ViewFamily;
  layer: ViewLayer;
  /** The registry id, also the page id ("emissions:co2"). */
  id: string;
  text: LayerText;
  format: Format;
  loaded: Loaded;
  years: number[];
  /** The default year: the latest with the source's usual coverage. */
  year: number;
  byYear: Record<number, ViewYear>;
  /** Class edges: four for the five sequential classes, six for the seven diverging ones. */
  edges: number[];
  ticks: string[];
}

const nameOf = (id: string) => place(id)?.name ?? id;

/** A share of the world figure, for reading: "31%", "4.2%", "<0.1%". */
export const shareOf = (v: number, world: number | null) => (!world ? null : v > 0 && v / world < 0.0005 ? '<0.1%' : formatValue(v / world, { kind: 'share' }));

/** A value as the layer writes it; diverging values carry their sign ("+12%", "−8%"). */
export function valueText(p: ViewPage, v: number): string {
  const s = formatValue(v, p.format);
  return p.layer.scale === 'div' && v > 0 ? `+${s}` : s;
}

/** The colour class of a value: 1–5 sequential; 1–7 diverging, 1 at the "consumes more" end. */
export function classFor(p: ViewPage, v: number): number {
  if (p.layer.scale === 'div') return 7 - p.edges.filter((e) => v >= e).length;
  return 1 + classOf(v, p.edges);
}

/** Five sequential classes from the default year's values, rounded, and kept for every year. */
function seqEdges(rows: Row[]): number[] {
  const b = breaks(rows.map((r) => r.value).filter((v) => v > 0));
  return b.length === 4 ? b : [...b, ...Array(4 - b.length).fill(b.at(-1) ?? 1)].slice(0, 4);
}

function worldOf(layer: ViewLayer, year: number, rows: Row[]): { world: number | null; worldOwn: boolean } {
  const e = emissionsData();
  const own = e?.world[year];
  if (layer.indicator === 'co2' && own?.co2 != null) return { world: own.co2, worldOwn: true };
  if (layer.indicator === 'co2cum' && own?.cum != null) return { world: own.cum, worldOwn: true };
  if (layer.indicator === 'co2pc' && own?.pc != null) return { world: own.pc, worldOwn: true };
  if (layer.sums) return { world: rows.reduce((s, r) => s + r.value, 0), worldOwn: false };
  return { world: null, worldOwn: false };
}

/** A measure only the views show (../data/view-measures.ts), loaded like a registry one. */
function viewMeasure(id: string): Loaded | null {
  const d = VIEW_MEASURES[id];
  if (!d) return null;
  const fetched = Number(refreshed([d.source].flat()[0])?.slice(0, 4));
  const values = tryLoad((raw) => d.load(raw, fetched));
  return values && Object.keys(values).length ? { indicator: { ...d, load: undefined }, values, years: yearsOf(values) } : null;
}

function buildPage(family: ViewFamily, layer: ViewLayer): ViewPage | null {
  const loaded = indicator(layer.indicator) ?? viewMeasure(layer.indicator);
  if (!loaded) return null;
  // A running year (launches so far this year) is left out: it would read as a fall.
  const running = layer.fullYears ? Number(refreshed([loaded.indicator.source].flat()[0])?.slice(0, 4)) : NaN;
  const c = counts(loaded);
  if (running) for (const y of [...c.keys()]) if (y >= running) c.delete(y);
  // Counts of events (launches, models) are complete once the year ends, so the latest full year is the default.
  const year = layer.fullYears ? Math.max(...c.keys()) : defaultYear(loaded);
  if (year === undefined || !c.size) return null;
  // Years up to the default one with at least half its coverage, so the slider never lands on a near-empty map.
  const years = [...c.keys()].filter((y) => y <= year && c.get(y)! >= 0.5 * c.get(year)!).sort((a, b) => a - b);
  const byYear: Record<number, ViewYear> = {};
  for (const y of years) {
    const rows = ranking(loaded, y);
    byYear[y] = { year: y, rows, ...worldOf(layer, y, rows) };
  }
  const format = loaded.indicator.format;
  const edges = layer.edges ?? (layer.scale === 'div' ? DIV_EDGES : seqEdges(byYear[year].rows));
  const f = (v: number) => formatValue(v, format);
  // Ticks name ranges once, with their unit ("1–7 Mt"). A diverging scale's ticks are sizes, the same on both
  // sides ("10–30%"); its two ends say the direction.
  const unitOf = format.kind === 'number' && format.unit ? ` ${format.unit}` : '';
  const bare = (v: number) => f(v).replace(unitOf, '');
  const n = (v: number) => Math.round(Math.abs(v) * 100);
  const [d1, d2, d3] = [n(edges[3]), n(edges[4]), n(edges[5])];
  const side = [`${d3}%+`, `${d2}–${d3}%`, `${d1}–${d2}%`];
  const named = VIEW_TEXT[family.id].layers[layer.indicator].ticks;
  const ticks = named ?? (layer.scale === 'div'
    ? [...side, `±${d1}%`, ...[...side].reverse()]
    // Money ranges are too long for the legend ("$430 m–$1.4 bn"), so each class names its lower bound.
    : format.kind === 'money' ? [`<${f(edges[0])}`, ...edges.map((x) => `${f(x)}+`)]
    : [`under ${f(edges[0])}`, ...edges.slice(0, 3).map((x, i) => `${bare(x)}–${f(edges[i + 1])}`), `${f(edges[3])}+`]);
  return {
    family, layer, id: layer.indicator, text: VIEW_TEXT[family.id].layers[layer.indicator], format, loaded,
    years, year, byYear, edges, ticks,
  };
}

let cache: ViewPage[] | null = null;
/** Every registry map view page with data in this snapshot, in the site's order. */
export function viewPages(): ViewPage[] {
  cache ??= VIEW_FAMILIES.flatMap((f) => f.layers.map((l) => buildPage(f, l)).filter((p): p is ViewPage => p !== null));
  return cache;
}
export const viewPage = (id: string) => viewPages().find((p) => p.id === id);
export const familyPages = (family: string) => viewPages().filter((p) => p.family.id === family);

/** The change in the world figure from the year before, as a share, when both years have one. */
export function worldChange(p: ViewPage, y: number): number | null {
  const a = p.byYear[y]?.world;
  const b = p.byYear[y - 1]?.world;
  return a && b ? a / b - 1 : null;
}

/** Countries above and below zero, for a diverging layer's answer. */
export const divCounts = (y: ViewYear) => ({ up: y.rows.filter((r) => r.value > 0).length, down: y.rows.filter((r) => r.value < 0).length });

/** The one-sentence answer under the title. */
export function lede(p: ViewPage, year = p.year): string | null {
  const y = p.byYear[year];
  const top = y?.rows[0];
  if (!top) return null;
  if (p.layer.scale === 'div') return p.text.lede({ top: '', topIn: '', value: '', year, ...divCounts(y) });
  const top3 = p.layer.sums && y.rows.length > 3 ? shareOf(y.rows.slice(0, 3).reduce((s, r) => s + r.value, 0), y.world) ?? undefined : undefined;
  return p.text.lede({
    top: inSentence(nameOf(top.id), true), topIn: inSentence(nameOf(top.id)), value: valueText(p, top.value), share: shareOf(top.value, y.world) ?? undefined, top3, year,
    world: y.world !== null && !p.layer.sums ? valueText(p, y.world) : undefined,
    // Banded layers: how many places are in the top band, of how many.
    ...(p.layer.edges ? { up: y.rows.filter((r) => r.value >= p.edges[3]).length, of: y.rows.length } : {}),
  });
}

/** The summary paragraphs: the world figure and its change, the top countries, coverage and the caveats. */
export function summary(p: ViewPage, year = p.year): string[] {
  const y = p.byYear[year];
  const first: string[] = [];
  const ch = worldChange(p, year);
  if (y.world !== null && p.text.total) {
    const change = ch === null || p.id === 'co2cum' ? null : Math.abs(ch) < 0.005 ? null : W.changeIn(formatValue(Math.abs(ch), { kind: 'share' }), ch > 0, year - 1);
    first.push(p.text.total(valueText(p, y.world), year, change));
  }
  if (p.layer.scale === 'div') {
    const ends = [...y.rows.slice(0, 2), ...y.rows.slice(-2).reverse()];
    first.push(W.divTop(ends.map((r, i) => inSentence(nameOf(r.id), i === 0)), ends.map((r) => valueText(p, r.value))));
  } else if (p.layer.sums) {
    const top = y.rows.slice(0, 3);
    const together = top.length === 3 ? shareOf(top.reduce((s, r) => s + r.value, 0), y.world) : null;
    first.push(W.top(top.map((r, i) => W.topPart(inSentence(nameOf(r.id), i === 0), valueText(p, r.value), shareOf(r.value, y.world))), together));
  } else {
    first.push(W.topNoShare(y.rows.slice(0, 3).map((r) => W.topPart(inSentence(nameOf(r.id)), valueText(p, r.value), null))));
  }
  const second = [W.coverage(y.rows.length, p.text.period ? p.text.period(year) : year), ...(ANSWER[p.id]?.caveats ?? [])];
  return [first.join(' '), second.join(' ')];
}

/** The page's label for the indicator page link. */
export const indicatorLabel = (p: ViewPage) => INDICATOR_TEXT[p.id]?.label ?? p.text.title;

/** The source credit, as the indicator page writes it ("Global Carbon Budget", "UNHCR; World Bank population"). */
export const creditOf = (p: ViewPage) => SOURCE_NOTE[p.id] ?? [p.loaded.indicator.source].flat().map((s) => SOURCE_SHORT[s] ?? sourceName(s)).join('; ');

export interface Parts { refugees: number; asylum: number; oip: number }

/** UNHCR's three groups behind a refugees figure (origin for "fled from", host for the hosted layers). */
export function partsOf(p: ViewPage, id: string, year: number): Parts | null {
  const d = unhcrData();
  const src = p.id === 'refout' ? d?.originParts : p.id === 'refin' || p.id === 'refinpc' ? d?.hostParts : null;
  if (!src) return null;
  const g = (s: Record<string, Record<number, number>>) => s[id]?.[year] ?? 0;
  const out = { refugees: g(src.refugees), asylum: g(src.asylum), oip: g(src.oip) };
  return out.refugees + out.asylum + out.oip > 0 ? out : null;
}

/** Below this, a figure's make-up gets no note of its own (the table and panel still split it). */
const NOTE_FROM = 100_000;

/**
 * A place's note on a view: the fixed notes (what the source leaves out), then, with `worked`, one worked out from the
 * latest year's groups when most of a large figure is asylum seekers or others in need of protection.
 */
export function placeNote(p: ViewPage, id: string, worked = true): string | null {
  const notes: string[] = [];
  const fixed = PLACE_NOTES[p.id]?.[id];
  if (fixed) notes.push(fixed);
  const x = worked ? partsOf(p, id, p.year) : null;
  if (x) {
    const total = x.refugees + x.asylum + x.oip;
    const share = (v: number) => formatValue(v / total, { kind: 'share' });
    if (total >= NOTE_FROM && x.asylum / total > 0.5) notes.push(PARTS_TEXT.mostlyAsylum(share(x.asylum), p.year));
    else if (total >= NOTE_FROM && x.oip / total > 0.5) notes.push(PARTS_TEXT.mostlyOip(share(x.oip), p.year));
  }
  return notes.length ? notes.join(' ') : null;
}
