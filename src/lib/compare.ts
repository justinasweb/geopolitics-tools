// Compare at build time (D21): the shared Meta (measure labels, formats and credits, mineral names, the static
// pairs) and each country page's CountryData, written to /compare/data/{slug}.json for /compare in the browser and
// read directly by the static pairs. The model and markup are shared (src/lib/compare/model.ts, render.ts).
import { INDICATORS, statusAt } from '../data/indicators.ts';
import { INDICATOR_TEXT } from '../i18n/en.ts';
import { COMPARE_TEXT, COUNTRY_TEXT, mineralName } from '../i18n/pages.en.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';
import { blocIn } from '../i18n/blocs.en.ts';
import { BLOC_ORDER } from './blocs.ts';
import { blocFullName } from './search.ts';
import { fold } from './search-match.ts';
import { countryModel, countryPages, figure, mineralShares, loadedIndicators } from './country.ts';
import { seriesOf } from './dossier.ts';
import { creditName, indicator, sourceName } from './data.ts';
import { place } from './places.ts';
import { COMPARE_PAIRS, countryHref, indicatorHref, live, paths } from './routes.ts';
import { CHARTS, MEASURES, SERIES_FROM, type BlocNote, type CountryData, type MeasureMeta, type Meta, type MineralMeta } from './compare/model.ts';

/** Where the country files are served. */
export const COMPARE_DATA = '/compare/data/';

let metaCache: Meta | null = null;
export function compareMeta(): Meta {
  if (metaCache) return metaCache;
  const loaded = new Set(loadedIndicators().map((l) => l.indicator.id));
  const measures = MEASURES.filter((id) => loaded.has(id)).map((id): MeasureMeta => {
    const t = INDICATOR_TEXT[id];
    const src = INDICATORS[id].source as string;
    const latest = CHARTS.includes(id) ? latestYear(id) : undefined;
    return {
      id, label: t.label, noun: COMPARE_TEXT.nouns[id] ?? t.label, unit: t.unit, format: INDICATORS[id].format, href: indicatorHref(id), credit: creditName(src), source: sourceName(src),
      ...(latest ? { latest } : {}),
    };
  });
  const minerals = new Map<string, MineralMeta>();
  for (const m of countryPages()) {
    for (const x of mineralShares(m.place.id, 0)) {
      if (minerals.has(x.id)) continue;
      const name = mineralName(x.id, x.label).replace(/^./, (ch) => ch.toUpperCase()) + (x.measure === 'primary' ? COUNTRY_TEXT.primary : '');
      minerals.set(x.id, { id: x.id, name, year: x.year, estimated: x.estimated, primary: x.measure === 'primary' });
    }
  }
  const pairs = COMPARE_PAIRS.filter(([a, b]) => countryModel(a) && countryModel(b)).map(([a, b]) => ({
    a: place(a)!.slug, b: place(b)!.slug, path: paths.compare(a, b), title: COMPARE_TEXT.title(place(a)!.name, place(b)!.name),
  }));
  metaCache = { measures, minerals: [...minerals.values()], mineralSource: sourceName('usgs-minerals'), pairs, base: COMPARE_DATA };
  return metaCache;
}

/** The latest year any place has a figure for a measure. */
function latestYear(id: string): number | undefined {
  const v = indicator(id)?.values;
  const ys = v ? Object.values(v).flatMap((x) => Object.keys(x).map(Number)) : [];
  return ys.length ? Math.max(...ys) : undefined;
}

/** Six significant figures: more than any figure on the page shows, and a third smaller files. */
const sig = (v: number) => Number(v.toPrecision(6));

/** One country's figures for Compare. */
export function compareData(id: string): CountryData {
  const p = place(id)!;
  const f: CountryData['f'] = {};
  for (const m of compareMeta().measures) {
    const x = figure(m.id, id);
    if (!x) continue;
    const tag = statusAt(INDICATORS[m.id], id, x.year);
    f[m.id] = tag ? [sig(x.value), x.year, tag] : [sig(x.value), x.year];
  }
  const s: CountryData['s'] = {};
  for (const m of CHARTS) {
    const x = seriesOf(m, id, SERIES_FROM);
    if (x && x.values.some((v) => v !== null)) s[m] = [x.years[0], x.values.map((v) => (v === null ? null : sig(v)))];
  }
  const m: CountryData['m'] = {};
  for (const x of mineralShares(id, 0)) if (x.share > 0) m[x.id] = sig(x.share);
  return { id, slug: p.slug, name: p.name, ...(countryHref(id) ? { href: countryHref(id) } : {}), f, s, m };
}

/** Every country page, by slug: what the pickers offer. */
export const compareChoices = () => countryPages().map((m) => ({ name: m.place.name, value: m.place.slug, territory: m.place.kind === 'territory' }));

/** A grouping typed into a country box ("European Union", "EU", "NATO"): what the box says in place of "Try its
 *  English name", linking the grouping's page. Only groupings with a live page. */
export function compareBlocNotes(): BlocNote[] {
  return BLOC_ORDER.flatMap((id): BlocNote[] => {
    const r = live(`view:blocs:${id}`);
    if (!r) return [];
    const name = BLOC_TEXT[id] ?? id;
    const keys = [id, name, blocFullName(id), ...(COMPARE_TEXT.blocAliases[id] ?? [])].filter((k): k is string => Boolean(k)).map((k) => fold(k).trim());
    return [{ k: [...new Set(keys)], ...COMPARE_TEXT.blocNote(blocIn(id, name)), h: r.path }];
  });
}
