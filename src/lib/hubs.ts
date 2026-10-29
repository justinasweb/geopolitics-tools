// The topic hubs (/resources, /technology, /climate, /security, /power): one page per hub of src/data/nav.ts, the
// parent of its map views. Everything on a hub comes from what the views already have: a card per live view family
// with the family's main layer drawn small (from its layer file, src/lib/map/layers.ts), the view's own one-sentence
// answer as the headline, its source and period; the tools for the topic; country pages and indicator rankings by
// stated rules (there is no traffic data, so nothing is called popular). No figures of its own.
import { NAV_HUBS } from '../data/nav.ts';
import { HUB_FLOWS, HUB_GROUPS, HUB_TOOLS } from '../data/hubs.ts';
import { INDICATORS } from '../data/indicators.ts';
import { FLOW_TEXT, INDICATOR_TEXT, NAV_TEXT } from '../i18n/en.ts';
import { HUB_TEXT as H, inLine } from '../i18n/hubs.en.ts';
import { ATLAS_TEXT } from '../i18n/atlas.en.ts';
import { ENERGY_TEXT } from '../i18n/energy.en.ts';
import { list } from '../i18n/pages.en.ts';
import { DOSSIERS } from './country.ts';
import { refreshed } from './data.ts';
import { energyKey, energyPage, energyPages, lede as energyLede } from './energy.ts';
import { foodPage, foodPages, lede as foodLede } from './food.ts';
import { indicatorModel } from './indicator.ts';
import { formatValue } from './format.ts';
import { layerFile, mapLayers } from './map/layers.ts';
import type { LayerFile } from './map/types.ts';
import { worldMap } from './mapsvg.ts';
import { lede as mineralLede, mineralPage, mineralPages } from './minerals.ts';
import { place } from './places.ts';
import { countryHref, live, routes, viewHref } from './routes.ts';
import { familyPages, lede as viewLede, viewPage } from './views.ts';
import { answerOf as disasterAnswer, disasterPage, disasterPages } from './disasters.ts';
import { conflictPage, ledeFor as conflictLede } from './conflict.ts';
import { blocLede } from './blocview.ts';
import { HISTORY_BLOCS, historyLede } from './history.ts';
import { riverIds, riverLede } from './rivers.ts';
import { BLOC_ORDER } from './blocs.ts';
import { BLOCS_TEXT } from '../i18n/blocs.en.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';
import { KIND_TEXT } from '../i18n/disasters.en.ts';
import { RIVERS_TEXT } from '../i18n/water.en.ts';
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
  /** `pattern` names the patterns it uses (withheld hatching, not-yet dots), defined in the card's own SVG. */
  thumb: { width: number; height: number; paths: { d: string; fill: string }[]; label: string; pattern: string; withheld: boolean; notyet: boolean };
  /** The thumbnail's small key: a swatch (a colour, or the legend's swatch class) and words for each, so colour is
   *  never the only cue; every state the full map shows has its entry. */
  key: { fill?: string; sw?: 'withheld' | 'notyet' | 'nodata'; label: string }[];
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
  if (family === 'disasters') { const p = disasterPage(id); return p ? disasterAnswer(p) : null; }
  if (family === 'conflict') { const p = conflictPage(); return p ? conflictLede(p.byMonth[p.month]) : null; }
  if (family === 'blocs') return blocLede(id);
  if (family === 'alliance-history') return historyLede(id);
  if (family === 'rivers') return riverLede(id);
  const p = viewPage(id);
  return p && p.family.id === family ? viewLede(p) : null;
}

/** A family's main layers as chips, worded as its view's own picker, linked to their pages (up to eight). */
export function chipsOf(family: string): Link[] {
  const at = (key: string) => live(key)?.path;
  const pick = (ids: string[], key: (id: string) => string, label: (id: string) => string) => ids.map((id) => (at(key(id)) ? { label: label(id), href: at(key(id))! } : null));
  const out: (Link | null)[] = family === 'disasters' ? pick(disasterPages().map((p) => p.id), (id) => `view:disasters:${id}`, (id) => KIND_TEXT[id]?.pick ?? id)
    : family === 'blocs' ? pick(['all', ...BLOC_ORDER], (id) => `view:blocs:${id}`, (id) => (id === 'all' ? BLOCS_TEXT.all : BLOC_TEXT[id] ?? id))
    : family === 'alliance-history' ? pick(HISTORY_BLOCS, (id) => `view:alliance-history:${id}`, (id) => BLOC_TEXT[id] ?? id)
    : family === 'rivers' ? pick(riverIds(), (id) => `view:rivers:${id}`, (id) => RIVERS_TEXT.name[id] ?? id)
    : family === 'conflict' ? []
    : family === 'minerals'
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

/** A place's fill on a layer, as the full map draws it: its class colour, the withheld hatching, the not-yet dots,
 *  or the no-data grey (patterns `${pattern}-w` and `${pattern}-n` are in the card's SVG). */
function fillOf(f: LayerFile, cls: number | undefined, pattern: string): string {
  if (cls === undefined) return 'var(--map-nodata)';
  if (cls === 0) return `url(#${pattern}-w)`;
  if (cls === -1) return `url(#${pattern}-n)`;
  return `var(--${f.scale}-${cls})`;
}

/** The thumbnail's key, worded as the layer's legend: the scale's two ends (or its named classes), then each state
 *  without a class the year shows (withheld, not yet reported) and no data. */
function keyOf2(f: LayerFile, i: number): HubCard['key'] {
  const top = f.scale === 'seq' ? 5 : 7;
  const scale: HubCard['key'] = f.categories?.length ? f.categories.map((c) => ({ fill: `var(--seq-${c.cls})`, label: c.label }))
    : f.ends ? [{ fill: `var(--${f.scale}-1)`, label: f.ends[0] }, { fill: `var(--${f.scale}-${top})`, label: f.ends[1] }]
    : f.ticks.length ? [{ fill: `var(--${f.scale}-1)`, label: f.ticks[0] }, { fill: `var(--${f.scale}-${top})`, label: f.ticks.at(-1)! }]
    : [];
  const v = Object.values(f.data[i].v);
  return [
    ...scale,
    ...(f.missing.withheld && v.some((e) => e[0] === 0) ? [{ sw: 'withheld' as const, label: f.missing.withheld }] : []),
    ...(f.missing.notyet && v.some((e) => e[0] === -1) ? [{ sw: 'notyet' as const, label: f.missing.notyet }] : []),
    { sw: 'nodata' as const, label: f.missing.none },
  ];
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
  const pattern = `th-${family}`;
  return {
    family, kicker, href: route.path,
    headline: answerOf(route.key) ?? f.name,
    sub: y.legend, source: f.source, period, estimated: y.status === 'estimate',
    updated: def.source ? refreshed(def.source) : undefined,
    chips: chipsOf(family),
    thumb: {
      width: map.width, height: map.height, label: H.thumb(y.legend), pattern,
      paths: map.paths.map((p) => ({ d: p.d, fill: fillOf(f, p.id ? y.v[p.id]?.[0] : undefined, pattern) })),
      withheld: Object.values(y.v).some((e) => e[0] === 0), notyet: Object.values(y.v).some((e) => e[0] === -1),
    },
    key: keyOf2(f, i),
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
 * topic's maps (each live layer of its views whose figures rank countries by size, in its default year; a first
 * place shared with the next country does not count), up to ten.
 */
function countriesOf(families: string[]): HubCountry[] {
  const first = new Map<string, string[]>();
  const top3 = new Map<string, number>();
  for (const d of mapLayers()) {
    // Measures that rank countries by size only: world shares, volumes and counts (the registry's `ranks`), not a
    // share of a country's own total (electricity from coal), a per-person figure, a score or a membership.
    if (!families.includes(d.family) || !live(d.view) || !d.ranks) continue;
    const f = layerFile(d.id);
    const y = f.data[Math.max(0, f.years.indexOf(f.year))];
    // First only when ahead: a figure the next place shares (100% low-carbon) names no one first.
    const lead = y.order[0];
    if (lead && y.v[lead]?.[1] !== y.v[y.order[1]]?.[1]) first.set(lead, [...(first.get(lead) ?? []), f.name]);
    for (const id of y.order.slice(0, 3)) top3.set(id, (top3.get(id) ?? 0) + 1);
  }
  const what = (id: string) => {
    const maps = first.get(id) ?? [];
    if (maps.length) {
      const named = maps.slice(0, 2).map((m, i) => (i === 0 ? m : inLine(m)));
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

/**
 * How a ranking's top reads: its top three, or, when several places share the first figure as the page shows it
 * (low-carbon electricity at 100%), those places named as tied first (four at most, then how many more).
 */
export function topLine(rows: { id: string; value: number }[], fmt: (v: number) => string): string {
  const first = fmt(rows[0].value);
  const tied = rows.filter((r) => fmt(r.value) === first);
  if (tied.length < 2) return H.top3(rows.slice(0, 3).map((x) => nameOf(x.id)).join(', '));
  const names = tied.slice(0, 4).map((x) => nameOf(x.id));
  return H.tiedFirst(first, list(tied.length > 4 ? [...names, H.more(tied.length - 4)] : names));
}

/** Indicator rankings for a topic: the indexed indicator pages of its groups (src/data/hubs.ts), with how their top reads. */
function rankingsOf(hub: string): HubRanking[] {
  const groups = HUB_GROUPS[hub] ?? [];
  return Object.values(INDICATORS).filter((i) => groups.includes(i.group)).flatMap((i) => {
    const r = live(`indicator:${i.id}`);
    const m = r?.indexed ? indicatorModel(i.id) : null;
    if (!r || !m || m.common.length < 3) return [];
    const t = INDICATOR_TEXT[i.id];
    return [{ id: i.id, name: H.ranking(t?.label ?? i.id, t?.rate), href: r.path, top: H.inYear(m.year, topLine(m.common, (v) => formatValue(v, i.format))) }];
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
      // Each source once, though a layer may name several ("WRI Aqueduct; FAO AQUASTAT; Global Dam Watch").
      sources: [...new Set(cards.flatMap((c) => c.source.split(/;\s*/)))],
    };
  }
  cache.set(id, out);
  return out;
}

