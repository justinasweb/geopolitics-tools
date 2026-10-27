// The Explorer's data, worked out at build time from the indicator registry: what the page knows about each
// measure (src/lib/explorer/model.ts, Meta) and one compact file per measure (/explorer/data/<id>.json), which the
// browser loads as the reader picks measures. Every live indicator is in it, so a measure added to the registry
// appears in the Explorer too.
import { GROUPS, INDICATORS } from '../data/indicators.ts';
import { GROUP_TEXT, INDICATOR_TEXT } from '../i18n/en.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';
import { SOURCE_NOTE, SOURCE_SHORT } from '../i18n/pages.en.ts';
import { blocs } from './blocs.ts';
import { refreshed, sourceName } from './data.ts';
import { csvAllowed, indicatorModel } from './indicator.ts';
import { place } from './places.ts';
import { countryHref, indicatorHref } from './routes.ts';
import { ranked } from './stats.ts';
import type { MeasureData, MeasureMeta, Meta } from './explorer/model.ts';

export const EXPLORER_DATA = '/explorer/data/';

/** The measures the Explorer offers: every indicator with a live page, in registry order. */
export const explorerMeasures = () => Object.keys(INDICATORS).filter((id) => indicatorModel(id) !== null);

/** Six significant figures are more than any view shows; counts stay whole. */
const tidy = (v: number, count: boolean) => (count ? Math.round(v) : Number(v.toPrecision(6)));

const dataCache = new Map<string, MeasureData>();
export function explorerData(id: string): MeasureData {
  const hit = dataCache.get(id);
  if (hit) return hit;
  const m = indicatorModel(id)!;
  const count = m.indicator.format.kind === 'count';
  const ids = Object.keys(m.loaded.values).filter(ranked).sort();
  const years = ids.flatMap((p) => Object.keys(m.loaded.values[p]).map(Number));
  const from = Math.min(...years), to = Math.max(...years);
  const v: MeasureData['v'] = {};
  for (const p of ids) {
    const s = m.loaded.values[p];
    const arr: (number | null)[] = [];
    for (let y = from; y <= to; y++) arr.push(s[y] === undefined || !Number.isFinite(s[y]) ? null : tidy(s[y], count));
    while (arr.length && arr.at(-1) === null) arr.pop();
    if (arr.some((x) => x !== null)) v[p] = arr;
  }
  const out = { from, v };
  dataCache.set(id, out);
  return out;
}

let metaCache: Meta | null = null;
export function explorerMeta(): Meta {
  if (metaCache) return metaCache;
  const measures: MeasureMeta[] = [];
  const retrieved: Record<string, string> = {};
  const placeIds = new Set<string>();
  for (const id of explorerMeasures()) {
    const m = indicatorModel(id)!;
    const t = INDICATOR_TEXT[id];
    const d = explorerData(id);
    for (const p of Object.keys(d.v)) placeIds.add(p);
    const len = Math.max(...Object.values(d.v).map((a) => a.length));
    measures.push({
      id, label: t.label, short: t.short, unit: t.unit, group: m.indicator.group, format: m.indicator.format,
      static: m.indicator.static, projectedAfter: m.indicator.projectedAfter, year: m.year, from: d.from, to: d.from + len - 1,
      credit: SOURCE_NOTE[id] ?? m.sources.map((s) => SOURCE_SHORT[s] ?? sourceName(s)).join('; '),
      updated: refreshed(m.source), csv: csvAllowed(m), href: indicatorHref(id),
    });
    retrieved[id] = (refreshed(m.source) ?? '').slice(0, 10);
  }
  const places: Meta['places'] = {};
  for (const id of [...placeIds].sort((a, b) => place(a)!.name.localeCompare(place(b)!.name, 'en'))) {
    const p = place(id)!;
    places[id] = { n: p.name, c: p.iso3, ...(countryHref(id) ? { h: countryHref(id) } : {}) };
  }
  const groups = GROUPS.filter((g) => measures.some((m) => m.group === g)).map((g): [string, string] => [g, GROUP_TEXT[g]]);
  const bl = [...blocs()].map(([id, members]) => ({ id, name: BLOC_TEXT[id] ?? id, members: members.filter((p) => places[p]) }));
  metaCache = { measures, groups, places, blocs: bl, base: EXPLORER_DATA, retrieved };
  return metaCache;
}
