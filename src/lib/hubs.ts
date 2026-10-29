// The topic hubs (/resources, /technology, /climate, /security, /power): one page per hub of src/data/nav.ts, the
// parent of its map views. Everything on a hub comes from what the views already have: a card per live view family
// with the family's main layer drawn small (from its layer file, src/lib/map/layers.ts), the view's own one-sentence
// answer as the headline, its source and period; the tools for the topic; country pages and indicator rankings by
// stated rules (there is no traffic data, so nothing is called popular). No figures of its own.
import { NAV_HUBS } from '../data/nav.ts';
import { HUB_FLOWS, HUB_GROUPS, HUB_TOOLS } from '../data/hubs.ts';
import { INDICATORS } from '../data/indicators.ts';
import { FLOW_TEXT, INDICATOR_TEXT, NAV_TEXT } from '../i18n/en.ts';
import { HUB_TEXT as H } from '../i18n/hubs.en.ts';
import { ATLAS_TEXT } from '../i18n/atlas.en.ts';
import { ENERGY_TEXT } from '../i18n/energy.en.ts';
import { list } from '../i18n/pages.en.ts';
import { DOSSIERS } from './country.ts';
import { refreshed } from './data.ts';
import { energyKey, energyPage, energyPages, lede as energyLede } from './energy.ts';
import { foodPage, foodPages, lede as foodLede } from './food.ts';
import { indicatorModel } from './indicator.ts';
import { layerFile, mapLayers } from './map/layers.ts';
import type { LayerFile } from './map/types.ts';
import { worldMap } from './mapsvg.ts';
import { lede as mineralLede, mineralPage, mineralPages } from './minerals.ts';
import { place } from './places.ts';
import { countryHref, live, routes, viewHref } from './routes.ts';
import { familyPages, lede as viewLede, viewPage } from './views.ts';
import { keyOf } from './atlas.ts';

export interface Link { label: string; href: string }

export interface HubCard {
  family: string;
  /** The family's name ("Critical minerals"), the card's kicker. */
  kicker: string;
  href: string;
  /** The view's own one-sentence answer, from its sentence template. */
  headline: string;
  /** What the map shades, from the layer's legend ("Share of world mine production, 2025"). */
  sub: string;
  source: string;
  period: string;
  estimated: boolean;
  /** When the site last refreshed the source. */
  updated?: string;
  chips: Link[];
  thumb: { width: number; height: number; paths: { d: string; fill: string }[]; label: string };
  /** The thumbnail's small key: a swatch and words for each, so colour is never the only cue. */
  key: { fill: string; label: string }[];
  open: string;
}

export interface HubTool { id: string; name: string; desc: string; href: string; links: Link[] }
export interface HubCountry { id: string; name: string; href: string; what: string }
export interface HubRanking { id: string; name: string; href: string; top: string }

export interface HubModel {
  id: string;
  name: string;
  cards: HubCard[];
  tools: HubTool[];
  countries: HubCountry[];
  rankings: HubRanking[];
  sources: string[];
}

const nameOf = (id: string) => place(id)?.name ?? id;
const routeAt = (path: string) => routes().find((r) => r.live && r.path === path);

/** A map view's one-sentence answer, from the same template its page shows under the title. */
export function answerOf(key: string): string | null {
  const [, family, id] = key.split(':');
  if (family === 'minerals') { const p = mineralPage(id); return p ? mineralLede(p) : null; }
  if (family === 'food') { const p = foodPage(id); return p ? foodLede(p) : null; }
  if (family === 'oil' || family === 'gas') { const p = energyPage(`${family}-${id}`); return p ? energyLede(p) : null; }
  const p = viewPage(id);
  return p && p.family.id === family ? viewLede(p) : null;
}

/** A family's main layers as chips, worded as its view's own picker, linked to their pages (up to eight). */
export function chipsOf(family: string): Link[] {
  const at = (key: string) => live(key)?.path;
  const out: (Link | null)[] = family === 'minerals'
    ? mineralPages().map((m) => (at(`view:minerals:${m.id}`) ? { label: m.title, href: at(`view:minerals:${m.id}`)! } : null))
    : family === 'oil' || family === 'gas'
      ? energyPages().filter((p) => p.fuel === family).map((p) => (at(energyKey(p)) ? { label: ENERGY_TEXT.layer[p.layer].pick, href: at(energyKey(p))! } : null))
      : family === 'food'
        // The view's first picker: each commodity, on its production page.
        ? foodPages().filter((p) => p.layer === 'production').map((p) => (at(`view:food:${p.id}`) ? { label: p.text.pick, href: at(`view:food:${p.id}`)! } : null))
        : familyPages(family).map((p) => (at(`view:${family}:${p.id}`) ? { label: p.text.pick, href: at(`view:${family}:${p.id}`)! } : null));
  const chips = out.filter((x): x is Link => !!x);
  return chips.length > 1 ? chips.slice(0, 8) : [];
}

/** The class colour of a place on a layer, as the map draws it; no data and withheld are the no-data grey. */
function fillOf(f: LayerFile, cls: number | undefined): string {
  if (cls === undefined || cls < 1) return 'var(--map-nodata)';
  return `var(--${f.scale}-${cls})`;
}

/** The thumbnail's key: the scale's two ends (or named classes), worded as the layer's legend words them. */
function keyOf2(f: LayerFile): HubCard['key'] {
  if (f.categories?.length) return f.categories.map((c) => ({ fill: `var(--seq-${c.cls})`, label: c.label }));
  const top = f.scale === 'seq' ? 5 : 7;
  if (f.ends) return [{ fill: `var(--${f.scale}-1)`, label: f.ends[0] }, { fill: `var(--${f.scale}-${top})`, label: f.ends[1] }];
  if (f.ticks.length) return [{ fill: `var(--${f.scale}-1)`, label: f.ticks[0] }, { fill: `var(--${f.scale}-${top})`, label: f.ticks.at(-1)! }];
  return [];
}

function cardOf(family: string, lead: boolean): HubCard | null {
  const path = viewHref(family);
  const route = path && routeAt(path);
  const def = route && mapLayers().find((d) => d.view === route.key);
  if (!route || !def) return null;
  const f = layerFile(def.id);
  const i = Math.max(0, f.years.indexOf(f.year));
  const y = f.data[i];
  const kicker = NAV_TEXT.views[family]?.[0] ?? family;
  const map = worldMap(lead ? 600 : 400);
  const period = y.label ?? String(y.year);
  return {
    family, kicker, href: route.path,
    headline: answerOf(route.key) ?? f.name,
    sub: y.legend, source: f.source, period, estimated: y.status === 'estimate',
    updated: def.source ? refreshed(def.source) : undefined,
    chips: chipsOf(family),
    thumb: { width: map.width, height: map.height, paths: map.paths.map((p) => ({ d: p.d, fill: fillOf(f, p.id ? y.v[p.id]?.[0] : undefined) })), label: H.thumb(y.legend) },
    key: keyOf2(f),
    open: H.open(kicker),
  };
}

/** The tools listed for a topic (src/data/hubs.ts), live ones only, with links into them for this topic. */
function toolsOf(hub: string, cards: HubCard[]): HubTool[] {
  return (HUB_TOOLS[hub] ?? []).flatMap((id) => {
    const r = live(`tool:${id}`);
    if (!r) return [];
    let links: Link[] = [];
    if (id === 'supply-chains') {
      links = (HUB_FLOWS[hub] ?? []).flatMap((k) => { const c = live(`tool:supply-chains:${k}`); return c ? [{ label: FLOW_TEXT[k]?.label ?? k, href: c.path }] : []; });
    } else if (id === 'atlas') {
      // The Atlas opened on this topic's first two maps.
      links = cards.slice(0, 2).flatMap((c) => {
        const def = mapLayers().find((d) => d.view === routeAt(c.href)?.key);
        return def ? [{ label: ATLAS_TEXT.current(c.kicker, layerFile(def.id).name), href: `${r.path}?layer=${keyOf(c.href)}` }] : [];
      });
    }
    return [{ id, name: NAV_TEXT.tools[id]?.[0] ?? id, desc: NAV_TEXT.tools[id]?.[1] ?? '', href: r.path, links }];
  });
}

/**
 * Country pages for a topic, by a stated rule: the three dossiers, then the countries ranked first on most of the
 * topic's maps (each live layer of its views that ranks places on one scale, in its default year; a first place
 * shared with the next country does not count), up to ten.
 */
function countriesOf(families: string[]): HubCountry[] {
  const first = new Map<string, string[]>();
  const top3 = new Map<string, number>();
  for (const d of mapLayers()) {
    if (!families.includes(d.family) || !live(d.view)) continue;
    const f = layerFile(d.id);
    // Rankings only: a diverging scale (net trade) or named classes (membership) does not rank places by size.
    if (f.scale !== 'seq' || f.categories) continue;
    const y = f.data[Math.max(0, f.years.indexOf(f.year))];
    // First only when ahead: a figure the next place shares (100% low-carbon) names no one first.
    const lead = y.order[0];
    if (lead && y.v[lead]?.[1] !== y.v[y.order[1]]?.[1]) first.set(lead, [...(first.get(lead) ?? []), f.name]);
    for (const id of y.order.slice(0, 3)) top3.set(id, (top3.get(id) ?? 0) + 1);
  }
  const what = (id: string) => {
    const maps = first.get(id) ?? [];
    if (maps.length) {
      const named = maps.slice(0, 2).map((m, i) => (i === 0 ? m : m.charAt(0).toLowerCase() + m.slice(1)));
      return H.firstOn(list(maps.length > 2 ? [...named, H.more(maps.length - 2)] : named));
    }
    return top3.get(id) ? H.topThree(top3.get(id)!) : '';
  };
  const leaders = [...first.keys()].filter((id) => !DOSSIERS.includes(id))
    .sort((a, b) => first.get(b)!.length - first.get(a)!.length || (top3.get(b) ?? 0) - (top3.get(a) ?? 0) || nameOf(a).localeCompare(nameOf(b)));
  return [...DOSSIERS, ...leaders].slice(0, 10).flatMap((id) => {
    const href = countryHref(id);
    return href ? [{ id, name: nameOf(id), href, what: what(id) }] : [];
  });
}

/** Indicator rankings for a topic: the indexed indicator pages of its groups (src/data/hubs.ts), with their top three. */
function rankingsOf(hub: string): HubRanking[] {
  const groups = HUB_GROUPS[hub] ?? [];
  return Object.values(INDICATORS).filter((i) => groups.includes(i.group)).flatMap((i) => {
    const r = live(`indicator:${i.id}`);
    const m = r?.indexed ? indicatorModel(i.id) : null;
    if (!r || !m || m.common.length < 3) return [];
    return [{ id: i.id, name: INDICATOR_TEXT[i.id]?.label ?? i.id, href: r.path, top: H.top3(m.common.slice(0, 3).map((x) => nameOf(x.id)).join(', ')) }];
  }).slice(0, 6);
}

const cache = new Map<string, HubModel | null>();
/** A live hub's page, or null. */
export function hubModel(id: string): HubModel | null {
  if (cache.has(id)) return cache.get(id)!;
  const hub = NAV_HUBS.find((h) => h.id === id);
  let out: HubModel | null = null;
  if (hub && live(`hub:${id}`)) {
    const cards = hub.views.map((v) => cardOf(v.id, false)).filter((c): c is HubCard => !!c);
    // The first card is the lead: drawn larger.
    if (cards[0]) cards[0] = cardOf(cards[0].family, true)!;
    out = {
      id, name: NAV_TEXT.hubs[id] ?? id, cards, tools: toolsOf(id, cards),
      countries: countriesOf(cards.map((c) => c.family)), rankings: rankingsOf(id),
      sources: [...new Set(cards.map((c) => c.source))],
    };
  }
  cache.set(id, out);
  return out;
}

