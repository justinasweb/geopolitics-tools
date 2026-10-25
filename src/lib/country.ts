// Everything a country page shows, worked out once per place from the registry and the adapters: key figures
// with world rank, the dependencies table, minerals it mines a large share of, the short blocks, the template
// summary, and the sources it used. Profiles and dossiers share it; dossiers add their own sections on top.
import { aggregate, sanctions as loadSanctions, type PlaceListings } from '../adapters/sanctions.ts';
import { lending as loadLending } from '../adapters/aiddata.ts';
import { minerals as loadMinerals, type Mineral } from '../adapters/minerals.ts';
import { parseGdacs, type Hazard } from '../adapters/hazards.ts';
import { INDICATORS, type Loaded } from '../data/indicators.ts';
import { INDICATOR_TEXT } from '../i18n/en.ts';
import { DEP_TEXT, RESOURCE_TEXT, SOURCE_SHORT, SUMMARY, inSentence, mineralName } from '../i18n/pages.en.ts';
import { data, indicator, refreshed, shared, changed } from './data.ts';
import { dependencies, depSources, type DepRow } from './dependence.ts';
import { formatShare, formatValue } from './format.ts';
import { PLACES, place, type Place } from './places.ts';
import { figureFor, ranked } from './stats.ts';

/** The full dossiers (spec: United States, Russia, China); every other place with data gets a profile. */
export const DOSSIERS = ['USA', 'CHN', 'RUS'];

/** Key figures, in order, with the measure that replaces one when the place has no value for it. */
const KEY_FIGURES: [string, string?][] = [['gdp'], ['population'], ['gdppc'], ['milpct', 'milusd'], ['co2pc', 'co2']];

/** A mineral counts as "what it dominates" from this share of world mine production. */
export const MINERAL_SHARE = 0.1;
/** Fewer figures than this, and the profile is built but not indexed (the indexing rule; ThinProfile design). */
export const THIN_BELOW = 4;

export interface Figure { id: string; value: number; year: number; rank: number; of: number; source: string }
export interface MineralShare { id: string; label: string; share: number; year: number; estimated: boolean; rank: number; of: number; measure: 'mine' | 'primary' }

const mineralsData = shared(loadMinerals);
const gdacsData = shared((raw) => parseGdacs(raw.json('gdacs', 'events.json')));
const sanctionsData = shared((raw) => (raw.has('csl', 'consolidated.json') ? loadSanctions(raw) : aggregate([])));
const lendingData = shared(loadLending);

/** The registry's measures that have data in this snapshot, loaded. */
export const loadedIndicators = (() => {
  let cache: Loaded[] | null = null;
  return () => (cache ??= Object.keys(INDICATORS).map((id) => indicator(id)).filter((l): l is Loaded => l !== null));
})();

export const sourceOf = (id: string) => {
  const s = INDICATORS[id].source;
  return Array.isArray(s) ? s[0] : s;
};

export function figure(indId: string, placeId: string): Figure | null {
  const l = indicator(indId);
  const f = l && figureFor(l, placeId);
  return f ? { id: indId, ...f, source: sourceOf(indId) } : null;
}

/** Shares of world production (mine production; primary production for gallium) of at least `min`, largest first. */
export function mineralShares(placeId: string, min = MINERAL_SHARE): MineralShare[] {
  const ms = mineralsData() ?? [];
  const out: MineralShare[] = [];
  for (const m of ms as Mineral[]) {
    const producers = m.producers.filter((p) => p.share !== null && p.place);
    const i = producers.findIndex((p) => p.place === placeId);
    if (i < 0 || (producers[i].share ?? 0) < min) continue;
    const rank = producers.findIndex((p) => p.share === producers[i].share) + 1;
    out.push({ id: m.id, label: m.label, share: producers[i].share!, year: m.year, estimated: m.estimated, rank, of: producers.length, measure: m.measure });
  }
  return out.sort((a, b) => b.share - a.share);
}

export interface Blocks {
  refugees?: { hosted?: Figure; from?: Figure };
  disasters?: { count: number; byKind: Record<string, number>; from: string; to: string };
  emissions?: Figure;
  sanctions?: { listings: PlaceListings | null };
  lending?: { total: number; from: number; to: number };
}

function disastersFor(id: string): Blocks['disasters'] | undefined {
  const all = gdacsData();
  if (!all) return undefined;
  const to = (refreshed('gdacs') ?? data().snapshot.created).slice(0, 10);
  const from = new Date(Date.parse(to) - 365 * 864e5).toISOString().slice(0, 10);
  const hits = (all as Hazard[]).filter((h) => (h.alert === 'orange' || h.alert === 'red') && h.places.includes(id) && h.from >= from && h.from <= to);
  const byKind: Record<string, number> = {};
  for (const h of hits) byKind[h.kind] = (byKind[h.kind] ?? 0) + 1;
  return { count: hits.length, byKind, from, to };
}

function blocksFor(id: string): Blocks {
  const out: Blocks = {};
  const hosted = figure('refin', id);
  const from = figure('refout', id);
  if (hosted || from) out.refugees = { hosted: hosted ?? undefined, from: from ?? undefined };
  out.disasters = disastersFor(id);
  out.emissions = figure('co2pc', id) ?? undefined;
  const s = sanctionsData();
  if (s && data().raw.has('csl', 'consolidated.json')) out.sanctions = { listings: s.byPlace[id] ?? null };
  const l = lendingData();
  if (l?.byYear[id]) {
    const total = Object.values(l.byYear[id]).reduce((a, b) => a + b, 0);
    if (total > 0) out.lending = { total, from: l.years[0], to: l.years.at(-1)! };
  }
  return out;
}

export interface SourceUse { source: string; feeds: string[] }

export interface CountryModel {
  place: Place;
  dossier: boolean;
  figures: Figure[];
  /** Every registry measure with a recent value for this place (the profile rule counts these). */
  allFigures: Figure[];
  deps: DepRow[];
  minerals: MineralShare[];
  blocks: Blocks;
  summary: string[];
  sources: SourceUse[];
  thin: boolean;
  /** When the newest of the page's sources last changed (sitemap lastmod). */
  lastmod: string;
  updated: string;
}


function summaryFor(c: Place, figs: Figure[], minerals: MineralShare[], deps: DepRow[], blocks: Blocks): string[] {
  const out: string[] = [];
  const subject = inSentence(c.name, true);
  if (minerals.length) {
    // Gallium is produced, not mined: it gets its own sentence.
    const top = minerals.slice(0, 3);
    const mined = top.filter((m) => m.measure === 'mine');
    const made = top.filter((m) => m.measure === 'primary');
    if (mined.length) out.push(SUMMARY.mines(subject, mined.map((m, i) => SUMMARY.minePart(formatShare(m.share), mineralName(m.id, m.label), i === 0)), `${SOURCE_SHORT['usgs-minerals']}, ${mined[0].year}`));
    if (made.length) out.push(SUMMARY.produces(out.length ? 'It' : subject, made.map((m, i) => SUMMARY.minePart(formatShare(m.share), `primary ${mineralName(m.id, m.label)}`, i === 0)), `${SOURCE_SHORT['usgs-minerals']}, ${made[0].year}`));
  }
  const pop = figs.find((f) => f.id === 'population');
  const gdp = figs.find((f) => f.id === 'gdp');
  if (pop) {
    const popText = formatValue(pop.value, INDICATORS.population.format);
    const gdpText = gdp ? formatValue(gdp.value, INDICATORS.gdp.format) : null;
    out.push(SUMMARY.people(out.length ? 'It' : subject, popText, `${SOURCE_SHORT[pop.source]}, ${pop.year}`, gdpText, gdp ? `${SOURCE_SHORT[gdp.source]}, ${gdp.year}` : ''));
  }
  const most = deps.filter((d) => d.state === 'ok' && d.tag === 'most').sort((a, b) => (b.reliance ?? 0) - (a.reliance ?? 0))[0];
  if (most && most.reliance !== undefined) {
    const src = `${SOURCE_SHORT[most.source]}, ${most.year}`;
    const noun = RESOURCE_TEXT[most.resource].noun;
    out.push(most.reliance >= 0.995 ? SUMMARY.importsAll(noun, src) : SUMMARY.imports(formatShare(most.reliance), noun, src));
  } else if (blocks.refugees?.hosted && blocks.refugees.hosted.value >= 100_000) {
    const h = blocks.refugees.hosted;
    out.push(SUMMARY.hosts(formatValue(h.value, INDICATORS.refin.format), `${SOURCE_SHORT.unhcr}, ${h.year}`));
  }
  if (!out.length) out.push(SUMMARY.none(inSentence(c.name)));
  return out.slice(0, 3);
}

const models = new Map<string, CountryModel | null>();

/** The model for one place, or null when no source has a figure for it (it then gets no page). */
export function countryModel(id: string): CountryModel | null {
  if (models.has(id)) return models.get(id)!;
  const p = place(id);
  let out: CountryModel | null = null;
  if (p && ranked(id)) {
    const allFigures = loadedIndicators().map((l) => figure(l.indicator.id, id)).filter((f): f is Figure => f !== null);
    const figures: Figure[] = [];
    for (const [first, alt] of KEY_FIGURES) {
      const f = allFigures.find((x) => x.id === first) ?? (alt ? allFigures.find((x) => x.id === alt) : undefined);
      if (f) figures.push(f);
    }
    const minerals = mineralShares(id);
    const deps = dependencies(id);
    const blocks = blocksFor(id);
    const depsOk = deps.some((d) => d.state === 'ok');
    if (allFigures.length || minerals.length || depsOk) {
      const feeds = new Map<string, Set<string>>();
      const add = (s: string, what: string) => { if (!feeds.has(s)) feeds.set(s, new Set()); feeds.get(s)!.add(what); };
      for (const f of allFigures) add(f.source, INDICATOR_TEXT[f.id].short ?? INDICATOR_TEXT[f.id].label);
      for (const s of depSources(deps)) add(s, DEP_TEXT.heading);
      if (minerals.length) add('usgs-minerals', 'Minerals');
      if (blocks.disasters) add('gdacs', 'Disasters');
      if (blocks.sanctions) for (const s of ['csl', 'eu-sanctions', 'uk-sanctions']) add(s, 'Sanctions');
      if (blocks.lending) add('aiddata', 'Chinese lending');
      const sources = [...feeds].map(([source, f]) => ({ source, feeds: [...f] }));
      const dates = sources.map((s) => changed(s.source)).filter((d): d is string => !!d).sort();
      const fetched = sources.map((s) => refreshed(s.source)).filter((d): d is string => !!d).sort();
      out = {
        place: p, dossier: DOSSIERS.includes(id), figures, allFigures, deps, minerals, blocks,
        summary: summaryFor(p, figures, minerals, deps, blocks), sources,
        thin: allFigures.length < THIN_BELOW && !DOSSIERS.includes(id),
        lastmod: dates.at(-1) ?? data().snapshot.created, updated: fetched.at(-1) ?? data().snapshot.created,
      };
    }
  }
  models.set(id, out);
  return out;
}

/** Every place that gets a country page, by name. */
export const countryPages = (() => {
  let cache: CountryModel[] | null = null;
  return () => (cache ??= PLACES.filter((p) => ranked(p.id)).map((p) => countryModel(p.id)).filter((m): m is CountryModel => m !== null)
    .sort((a, b) => a.place.name.localeCompare(b.place.name, 'en')));
})();

/** Every source some country page uses, for the "few sources" box. */
export const countrySources = (() => {
  let cache: string[] | null = null;
  return () => (cache ??= [...new Set(countryPages().flatMap((m) => m.sources.map((s) => s.source)))].sort());
})();
