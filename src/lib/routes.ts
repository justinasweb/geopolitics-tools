// The route registry: every page the site has or will have, with its stable internal key, its path in each
// language, whether it is live (built and linked) and indexed, the old addresses that redirect to it, its share
// image and when its content last changed. Pages, redirects (dist/_redirects), the sitemap, the menu, the old
// hash-link map and the page counts are all generated from here, and the build fails on a clash (spec, "Fixes
// from the review").
//
// Map views, hubs and tools are registered but not live until their phase builds them; the menu and every link
// skip routes that are not live, so nothing links to a page that does not exist.
import { SECTION_SLUGS, INDICATOR_SLUGS, COMPARE_JOIN, VIEW_SLUGS, DISASTER_SLUGS, FOOD_SLUGS, FOOD_LAYER_SLUGS, ENERGY_LAYER_SLUGS, BLOC_SLUGS, EXPLORER_SLUGS } from '../i18n/slugs.en.ts';
import { NAV_HUBS, NAV_UTIL } from '../data/nav.ts';
import { INDICATORS } from '../data/indicators.ts';
import { countryModel, countryPages, DOSSIERS } from './country.ts';
import { data, changed } from './data.ts';
import { indicatorModel } from './indicator.ts';
import { PLACES, place } from './places.ts';
import { mineralPages } from './minerals.ts';
import { viewPages } from './views.ts';
import { disasterPages } from './disasters.ts';
import { conflictPage } from './conflict.ts';
import { foodPages } from './food.ts';
import { energyPages } from './energy.ts';
import { blocPages } from './blocview.ts';
import { BLOCS_CHECKED } from './blocs.ts';
import { HISTORY_BLOCS } from './history.ts';
import { riverIds } from './rivers.ts';
import { explorerMeasures } from './explorer.ts';
import { VIEWS as EXPLORER_VIEWS } from './explorer/model.ts';

export type Lang = 'en';
export type Kind = 'countries' | 'country' | 'compare' | 'indicators' | 'indicator' | 'page' | 'sources' | 'view' | 'hub' | 'tool';

/** The kinds built so far (src/pages/[...path].astro); hubs and tools come in later phases. */
export const BUILT_KINDS: Kind[] = ['countries', 'country', 'compare', 'indicators', 'indicator', 'page', 'sources', 'view', 'tool'];

export interface Route {
  /** Stable internal key: "country:DEU", "indicator:milpct", "page:about". Slugs can change; keys do not. */
  key: string;
  kind: Kind;
  lang: Lang;
  path: string;
  live: boolean;
  indexed: boolean;
  /** Old or alternative addresses, answered with a 301 to `path`. */
  aliases: string[];
  /** The id the page template needs: a place, an indicator, a static page, or "a,b" for Compare. */
  id: string;
  /** Share image path, for og:image and the sitemap. */
  image?: string;
  lastmod?: string;
}

const S = SECTION_SLUGS;
const slugOf = (id: string) => place(id)!.slug;

export const paths = {
  countries: () => `/${S.countries}`,
  country: (id: string) => `/${S.countries}/${slugOf(id)}`,
  compare: (a: string, b: string) => `/${S.compare}/${slugOf(a)}${COMPARE_JOIN}${slugOf(b)}`,
  indicators: () => `/${S.indicators}`,
  indicator: (id: string) => `/${S.indicators}/${INDICATOR_SLUGS[id]}`,
  csv: (id: string) => `/${S.downloads}/${INDICATOR_SLUGS[id]}.csv`,
  page: (id: keyof typeof SECTION_SLUGS) => `/${S[id]}`,
  image: (kind: string, name: string) => `/og/${kind}/${name}.png`,
  mineral: (id: string) => `/${S.minerals}/${id}`,
  /** A registry map view: /emissions, /emissions/per-person. */
  view: (family: keyof typeof SECTION_SLUGS, layer: string) => `/${S[family]}${VIEW_SLUGS[layer] ? `/${VIEW_SLUGS[layer]}` : ''}`,
  /** Food and fertiliser: /food/wheat, /food/wheat/use, /food/soybeans/trade. */
  food: (commodity: string, layer: string) => `/${S.food}/${FOOD_SLUGS[commodity]}${FOOD_LAYER_SLUGS[layer] ? `/${FOOD_LAYER_SLUGS[layer]}` : ''}`,
  /** Oil and gas: /oil, /oil/consumption, /gas/trade. */
  energy: (fuel: 'oil' | 'gas', layer: string) => `/${S[fuel]}${ENERGY_LAYER_SLUGS[layer] ? `/${ENERGY_LAYER_SLUGS[layer]}` : ''}`,
  /** Blocs: /blocs, /blocs/nato. */
  blocs: (bloc: string) => `/${S.blocs}${BLOC_SLUGS[bloc] ? `/${BLOC_SLUGS[bloc]}` : ''}`,
  /** Alliance history: /blocs/nato/history. */
  history: (bloc: string) => `/${S.blocs}/${BLOC_SLUGS[bloc]}/history`,
  /** Disputed rivers: /water/rivers/nile. */
  river: (id: string) => `/${S.water}/rivers/${id}`,
  /** Explorer: /explorer (table), /explorer/over-time, /explorer/scatter. */
  explorer: (view: string) => `/${S.explorer}${EXPLORER_SLUGS[view] ? `/${EXPLORER_SLUGS[view]}` : ''}`,
  /** Disasters: /disasters, /disasters/earthquakes. */
  disasters: (kind: string) => `/${S.disasters}${DISASTER_SLUGS[kind] ? `/${DISASTER_SLUGS[kind]}` : ''}`,
};

/** The Compare pairs: every pair of dossier countries, in a fixed order (United States, China, Russia). */
export const COMPARE_PAIRS: [string, string][] = DOSSIERS.flatMap((a, i) => DOSSIERS.slice(i + 1).map((b): [string, string] => [a, b]));

/** The long-read pages written in Markdown (src/content/pages/<id>.md). */
export const STATIC_PAGES = ['about', 'methodology', 'privacy'] as const;

function build(): Route[] {
  const lang: Lang = 'en';
  const out: Route[] = [];
  const snapshotDate = data().snapshot.created;

  out.push({ key: 'countries', kind: 'countries', lang, path: paths.countries(), live: true, indexed: true, aliases: [], id: '', image: paths.image('page', 'countries'), lastmod: snapshotDate });
  for (const m of countryPages()) {
    const id = m.place.id;
    const aliases = [m.place.iso3, m.place.iso2].filter(Boolean).map((c) => `/${S.countries}/${c.toLowerCase()}`);
    out.push({ key: `country:${id}`, kind: 'country', lang, path: paths.country(id), live: true, indexed: !m.thin, aliases, id, image: paths.image('countries', m.place.slug), lastmod: m.lastmod });
  }
  for (const [a, b] of COMPARE_PAIRS) {
    if (!countryModel(a) || !countryModel(b)) continue;
    const lastmod = [countryModel(a)!.lastmod, countryModel(b)!.lastmod].sort().at(-1);
    out.push({ key: `compare:${a},${b}`, kind: 'compare', lang, path: paths.compare(a, b), live: true, indexed: true, aliases: [paths.compare(b, a)], id: `${a},${b}`, image: paths.image('compare', `${slugOf(a)}${COMPARE_JOIN}${slugOf(b)}`), lastmod });
  }
  out.push({ key: 'indicators', kind: 'indicators', lang, path: paths.indicators(), live: true, indexed: true, aliases: [], id: '', image: paths.image('page', 'indicators'), lastmod: snapshotDate });
  for (const id of Object.keys(INDICATORS)) {
    const m = indicatorModel(id);
    out.push({
      key: `indicator:${id}`, kind: 'indicator', lang, path: paths.indicator(id), live: m !== null, indexed: m?.indexed ?? false, aliases: [], id,
      image: paths.image('indicators', INDICATOR_SLUGS[id]), lastmod: m ? changed(m.source) : undefined,
    });
  }
  for (const id of STATIC_PAGES) out.push({ key: `page:${id}`, kind: 'page', lang, path: paths.page(id), live: true, indexed: true, aliases: [], id, image: paths.image('page', id) });
  out.push({ key: 'page:sources', kind: 'sources', lang, path: paths.page('sources'), live: true, indexed: true, aliases: [], id: 'sources', image: paths.image('page', 'sources'), lastmod: snapshotDate });

  // Map views (phase 4 onwards). A view family's pages have keys "view:<family>:<page>"; the family's own address
  // (/minerals) redirects to its first page (spec, "Fixes from the review").
  const families = new Set<string>();
  mineralPages().forEach((m, i) => {
    families.add('minerals');
    out.push({
      key: `view:minerals:${m.id}`, kind: 'view', lang, path: paths.mineral(m.id), live: true, indexed: true,
      aliases: i === 0 ? [`/${S.minerals}`] : [], id: `minerals:${m.id}`, image: paths.image('views', `minerals-${m.id}`), lastmod: changed('usgs-minerals'),
    });
  });

  // Map views on registry measures (phase 5): the family's first layer is the section's own address.
  for (const v of viewPages()) {
    families.add(v.family.id);
    out.push({
      key: `view:${v.family.id}:${v.id}`, kind: 'view', lang, path: paths.view(v.family.id as keyof typeof SECTION_SLUGS, v.id), live: true, indexed: true,
      aliases: [], id: `${v.family.id}:${v.id}`, image: paths.image('views', `${v.family.id}-${v.id}`), lastmod: changed([v.loaded.indicator.source].flat()[0]),
    });
  }

  // Disasters (phase 5): every kind at /disasters, one kind at /disasters/{kind}.
  for (const d of disasterPages()) {
    families.add('disasters');
    out.push({
      key: `view:disasters:${d.id}`, kind: 'view', lang, path: paths.disasters(d.id), live: true, indexed: true,
      aliases: [], id: `disasters:${d.id}`, image: paths.image('views', `disasters-${d.id.toLowerCase()}`), lastmod: changed('gdacs'),
    });
  }

  // Food and fertiliser (phase 5): each commodity's production at /food/{commodity}, its use and trade after it.
  foodPages().forEach((f, i) => {
    families.add('food');
    out.push({
      key: `view:food:${f.id}`, kind: 'view', lang, path: paths.food(f.commodity, f.layer), live: true, indexed: true,
      aliases: i === 0 ? [`/${S.food}`] : [], id: `food:${f.id}`, image: paths.image('views', `food-${f.id}`), lastmod: changed('faostat'),
    });
  });

  // Oil and gas (phase 5b): production at /oil and /gas, consumption, trade and reserves after it.
  for (const e of energyPages()) {
    families.add(e.fuel);
    out.push({
      key: `view:${e.fuel}:${e.layer}`, kind: 'view', lang, path: paths.energy(e.fuel, e.layer), live: true, indexed: true,
      aliases: e.layer === 'production' ? [`/${S[e.fuel]}/production`] : [], id: `energy:${e.id}`, image: paths.image('views', `energy-${e.id}`),
      lastmod: changed(e.layer === 'trade' && e.flowYear ? 'comtrade' : 'eia'),
    });
  }

  // Conflict (phase 5b): one page, its months on the slider.
  if (conflictPage()) {
    families.add('conflict');
    out.push({
      key: 'view:conflict:events', kind: 'view', lang, path: paths.page('conflict'), live: true, indexed: true,
      aliases: [], id: 'conflict:events', image: paths.image('views', 'conflict'), lastmod: changed('ucdp'),
    });
  }

  // Blocs (phase 5): every grouping at /blocs, one at /blocs/{bloc}.
  families.add('blocs');
  for (const id of ['all', ...blocPages().map((b) => b.id)]) {
    out.push({
      key: `view:blocs:${id}`, kind: 'view', lang, path: paths.blocs(id), live: true, indexed: true,
      aliases: [], id: `blocs:${id}`, image: paths.image('views', `blocs-${id}`), lastmod: BLOCS_CHECKED,
    });
  }

  // Alliance history (phase 5): /blocs/{bloc}/history for the 11 groupings with one.
  families.add('alliance-history');
  for (const id of HISTORY_BLOCS) {
    out.push({
      key: `view:alliance-history:${id}`, kind: 'view', lang, path: paths.history(id), live: true, indexed: true,
      aliases: [], id: `history:${id}`, image: paths.image('views', `history-${id}`), lastmod: BLOCS_CHECKED,
    });
  }

  // Disputed rivers (phase 5): /water/rivers/{river} for the eight rivers.
  families.add('rivers');
  for (const id of riverIds()) {
    out.push({
      key: `view:rivers:${id}`, kind: 'view', lang, path: paths.river(id), live: true, indexed: true,
      aliases: [], id: `rivers:${id}`, image: paths.image('views', `rivers-${id}`),
    });
  }

  // Explorer (phase 6): the table is the tool's own key (tool:explorer, the menu's link), the other views after it.
  const tools = new Set<string>();
  if (explorerMeasures().length >= 2) {
    tools.add('explorer');
    for (const v of EXPLORER_VIEWS) {
      out.push({
        key: v === 'table' ? 'tool:explorer' : `tool:explorer:${v}`, kind: 'tool', lang, path: paths.explorer(v), live: true, indexed: true,
        aliases: [], id: `explorer:${v}`, image: paths.image('tools', `explorer-${EXPLORER_SLUGS[v] || 'table'}`), lastmod: snapshotDate,
      });
    }
  }

  // Not built yet (phases 5–8): registered so links, the menu and redirects know about them.
  for (const hub of NAV_HUBS) {
    out.push({ key: `hub:${hub.id}`, kind: 'hub', lang, path: hub.path, live: false, indexed: false, aliases: [], id: hub.id });
    for (const v of hub.views) if (!families.has(v.id)) out.push({ key: `view:${v.id}`, kind: 'view', lang, path: v.path, live: false, indexed: false, aliases: [], id: v.id });
  }
  for (const u of NAV_UTIL) if (u.id !== 'countries' && !tools.has(u.id)) out.push({ key: `tool:${u.id}`, kind: 'tool', lang, path: u.path, live: false, indexed: false, aliases: [], id: u.id });
  return out;
}

/** Fails on two routes with one path, an alias that is also a path, or a path that breaks the URL rules. */
export function checkRoutes(routes: Route[]): void {
  const seen = new Map<string, string>();
  const claim = (path: string, key: string) => {
    if (!/^\/([a-z0-9-]+\/?)*[a-z0-9-]+$/.test(path) || path.endsWith('/')) throw new Error(`route ${key}: "${path}" is not a clean lowercase path without a trailing slash`);
    const other = seen.get(path);
    if (other && other !== key) throw new Error(`route clash: ${path} is claimed by ${other} and ${key}`);
    seen.set(path, key);
  };
  for (const r of routes) claim(r.path, r.key);
  for (const r of routes) for (const a of r.aliases) if (a !== r.path) claim(a, `${r.key} (alias)`);
  const keys = new Set<string>();
  for (const r of routes) {
    if (keys.has(r.key)) throw new Error(`route key ${r.key} is used twice`);
    keys.add(r.key);
  }
}

let cache: Route[] | null = null;
export function routes(): Route[] {
  if (!cache) {
    const r = build();
    checkRoutes(r);
    cache = r;
  }
  return cache;
}

const byKey = () => new Map(routes().map((r) => [r.key, r]));
let keyMap: Map<string, Route> | null = null;
/** The route for a key, if it is live. */
export function live(key: string): Route | undefined {
  keyMap ??= byKey();
  const r = keyMap.get(key);
  return r?.live ? r : undefined;
}
export const route = (key: string) => (keyMap ??= byKey()).get(key);

/** A view family's first live page (/minerals → /minerals/lithium), or the view itself if it is one page. */
export function viewHref(family: string): string | undefined {
  const own = live(`view:${family}`);
  if (own) return own.path;
  return routes().find((r) => r.live && r.key.startsWith(`view:${family}:`))?.path;
}

/** A place's page, if it has one. */
export const countryHref = (id: string) => live(`country:${id}`)?.path;
export const indicatorHref = (id: string) => live(`indicator:${id}`)?.path;

/** dist/_redirects: every alias of a live page, as a 301 (Cloudflare's format, at most 2,000 lines). */
export function redirects(): string {
  const lines = routes().filter((r) => r.live).flatMap((r) => r.aliases.filter((a) => a !== r.path).map((a) => `${a} ${r.path} 301`));
  if (lines.length > 2000) throw new Error(`${lines.length} redirects; Cloudflare allows 2,000 static ones`);
  return `${lines.join('\n')}\n`;
}

/**
 * Old prototype hash routes (#/country/RUS) and where they go now, for the few lines of JavaScript on the home
 * and 404 pages. Only live targets; anything else falls back to the home page.
 */
export function hashMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PLACES) {
    const h = countryHref(p.id);
    if (h) out[`country/${p.id}`] = h;
  }
  for (const r of routes().filter((x) => x.kind === 'compare' && x.live)) {
    const [a, b] = r.id.split(',');
    out[`compare/${a},${b}`] = r.path;
    out[`compare/${b},${a}`] = r.path;
  }
  return out;
}

/** Counts by kind, for the build log and docs. */
export const routeCounts = () => {
  const c: Record<string, { live: number; indexed: number; hidden: number }> = {};
  for (const r of routes()) {
    const k = (c[r.kind] ??= { live: 0, indexed: 0, hidden: 0 });
    if (r.live) k.live++; else k.hidden++;
    if (r.live && r.indexed) k.indexed++;
  }
  return c;
};

/**
 * A few lines of JavaScript that move an old hash link (/#/country/RUS) to its page. Servers never see the part
 * after "#", so this runs on the home and 404 pages; unknown hashes stay where they are.
 */
export function hashRedirectScript(): string {
  return `(function(){var m=${JSON.stringify(hashMap())};var h=location.hash.replace(/^#\\/?/,'');if(h&&m[h])location.replace(m[h]);})();`;
}
