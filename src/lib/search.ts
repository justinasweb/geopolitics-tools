// Site search's index, made at build time from the route registry so only live pages are in it (served at
// /search-index.json and searched in the browser: src/lib/search-match.ts, src/scripts/search.ts). Each page has its
// name as the page uses it, the line shown under it, its group, other names and codes:
// - Countries: every country page, with the territory table's ISO codes and the other names sources use for it
//   (codes.csv: Burma, Turkey, Ivory Coast), and the Compare pages.
// - Maps: every map view page by its layer's name, and each view family by its menu name.
// - Measures: the indicator rankings. Places: disputed rivers, and chokepoints and ports once they are live.
// - Blocs: each grouping (with its full name and members, so a country's blocs follow it), its history page.
// - Tools, and Topics and pages: the tools, Supply chains' flows, the topic hubs and the site's own pages.
import { BLOC_TEXT } from '../i18n/map.en.ts';
import { BLOC_ABOUT } from '../i18n/blocs.en.ts';
import { RIVERS_TEXT } from '../i18n/water.en.ts';
import { EXPLORER_TEXT } from '../i18n/explorer.en.ts';
import { FLOW_TEXT, INDICATOR_TEXT, NAV_TEXT, TRAIL_TEXT } from '../i18n/en.ts';
import { INDICATOR_SLUGS } from '../i18n/slugs.en.ts';
import { SEARCH_ALIASES, SEARCH_TEXT as T } from '../i18n/search.en.ts';
import { NAV_FOOTER } from '../data/nav.ts';
import { atlasLayers } from './atlas.ts';
import { blocs } from './blocs.ts';
import { DOSSIERS } from './country.ts';
import { menu } from './menu.ts';
import { CODES, PLACES, place } from './places.ts';
import { countryHref, hubOf, live, routes } from './routes.ts';
import { fold, type WireIndex } from './search-match.ts';

export const GROUPS = ['countries', 'maps', 'measures', 'places', 'blocs', 'tools', 'pages'] as const;
type GroupId = (typeof GROUPS)[number];

/** Map view families whose pages are places with names of their own. */
const PLACE_FAMILIES = new Set(['rivers', 'chokepoints', 'ports']);
const BLOC_FAMILIES = new Set(['blocs', 'alliance-history']);

interface Item { name: string; group: GroupId; detail: string; path: string; aliases?: string[]; codes?: string[]; extra?: string }

/** The other names a place goes by in sources (codes.csv), leaving out any that name a different place it is not part
 *  of by name ("Taiwan Province of China" is not offered for "China"; "Congo (Kinshasa)" is, for DR Congo). */
export function otherNames(id: string): string[] {
  const p = place(id);
  if (!p) return [];
  const own = ` ${fold(p.name)} `;
  const others = PLACES.filter((x) => x.id !== id).map((x) => fold(x.name)).filter((n) => !own.includes(` ${n} `));
  const names = new Set([p.short, p.isoName, ...CODES.filter((c) => c.system === 'name' && c.place === id).map((c) => c.code)]);
  return [...names].filter((n) => {
    if (!n || fold(n) === fold(p.name)) return false;
    const f = ` ${fold(n)} `;
    return !others.some((o) => f.includes(` ${o} `));
  });
}

/** A grouping's full name, from the first words of its one-line description ("The North Atlantic Treaty Organization:"). */
export function blocFullName(id: string): string | undefined {
  return BLOC_ABOUT[id]?.match(/^(?:The )?([^:.]+):/)?.[1];
}

const aliasesOf = (...keys: string[]) => keys.flatMap((k) => SEARCH_ALIASES[k] ?? []);
const hubLine = (family: string, rest?: string) => [NAV_TEXT.hubs[hubOf(family) ?? ''], rest ?? NAV_TEXT.views[family]?.[0]].filter(Boolean).join(' · ');

function items(): Item[] {
  const out: Item[] = [];
  const all = routes().filter((r) => r.live);
  const layerName = new Map(atlasLayers().map((l) => [l.path, l.name]));

  // Countries, then Compare.
  for (const r of all.filter((x) => x.kind === 'country')) {
    const p = place(r.id)!;
    const detail = DOSSIERS.includes(r.id) ? T.dossier : p.kind === 'territory' ? T.territory : p.kind === 'historical' ? T.former : T.profile;
    out.push({ name: p.name, group: 'countries', detail, path: r.path, aliases: otherNames(r.id), codes: [p.iso2, p.iso3].filter(Boolean), extra: r.id });
  }
  for (const r of all.filter((x) => x.kind === 'compare')) {
    const [a, b] = r.id.split(',').map((id) => place(id)!);
    out.push({ name: `${a.name} and ${b.name}`, group: 'countries', detail: T.compare, path: r.path, aliases: [...otherNames(a.id), ...otherNames(b.id)] });
  }

  // Each view family by its menu name, then its pages.
  for (const h of menu().hubs) {
    for (const v of h.views) {
      const group: GroupId = PLACE_FAMILIES.has(v.id) ? 'places' : BLOC_FAMILIES.has(v.id) ? 'blocs' : 'maps';
      if (v.id === 'blocs') continue; // its own page, /blocs, is listed with the groupings
      out.push({ name: NAV_TEXT.views[v.id][0], group, detail: hubLine(v.id, NAV_TEXT.views[v.id][1]), path: v.path, aliases: aliasesOf(`view:${v.id}`) });
    }
  }
  for (const r of all.filter((x) => x.kind === 'view')) {
    const [, family, id] = r.key.split(':');
    const familyName = NAV_TEXT.views[family]?.[0];
    if (family === 'blocs') {
      const full = blocFullName(id);
      out.push(id === 'all'
        ? { name: layerName.get(r.path) ?? familyName, group: 'blocs', detail: hubLine(family, NAV_TEXT.views.blocs[1]), path: r.path, aliases: ['alliances', 'groupings'] }
        : {
          name: BLOC_TEXT[id] ?? id, group: 'blocs', detail: full && full !== BLOC_TEXT[id] ? full : T.bloc, path: r.path, aliases: full ? [full] : [],
          // Its short id is a code, so "eu" or "g7" typed whole finds it first.
          codes: id.length <= 4 ? [id] : [], extra: blocs().get(id)?.join(' '),
        });
    } else if (family === 'alliance-history') {
      out.push({ name: BLOC_TEXT[id] ?? id, group: 'blocs', detail: T.history, path: r.path, aliases: ['history', T.history, ...(blocFullName(id) ? [blocFullName(id)!] : [])] });
    } else if (family === 'rivers') {
      out.push({ name: RIVERS_TEXT.name[id] ?? id, group: 'places', detail: T.river, path: r.path, aliases: ['river'] });
    } else {
      const name = layerName.get(r.path) ?? familyName;
      if (!name) continue;
      out.push({
        name, group: PLACE_FAMILIES.has(family) ? 'places' : 'maps', detail: hubLine(family), path: r.path,
        aliases: [...(familyName ? [familyName] : []), ...aliasesOf(`view:${family}`, r.key)],
      });
    }
  }

  // Measures.
  for (const r of all.filter((x) => x.kind === 'indicator')) {
    const t = INDICATOR_TEXT[r.id];
    if (!t) continue;
    out.push({ name: t.label, group: 'measures', detail: T.ranking, path: r.path, aliases: [...(t.short ? [t.short] : []), INDICATOR_SLUGS[r.id].replace(/-/g, ' '), ...aliasesOf(r.key)] });
  }

  // Tools, Supply chains' flows and This week.
  const tool = (id: string) => TRAIL_TEXT.tools[id] ?? NAV_TEXT.tools[id];
  for (const t of menu().tools) out.push({ name: tool(t.id)[0], group: 'tools', detail: tool(t.id)[1], path: t.path, aliases: aliasesOf(`tool:${t.id}`) });
  for (const r of all.filter((x) => x.kind === 'tool')) {
    const [, id, sub] = r.key.split(':');
    if (id === 'explorer' && sub) out.push({ name: T.explorerView(EXPLORER_TEXT.views[sub] ?? sub), group: 'tools', detail: tool('explorer')[1], path: r.path });
    if (id === 'supply-chains' && sub && FLOW_TEXT[sub]) out.push({ name: FLOW_TEXT[sub].label, group: 'tools', detail: T.flow, path: r.path, aliases: ['supply chain', ...aliasesOf(r.key)] });
  }
  const week = live('week');
  if (week) out.push({ name: tool('this-week')[0], group: 'tools', detail: tool('this-week')[1], path: week.path, aliases: ['news', 'latest'] });

  // Topics and the site's own pages.
  for (const h of menu().hubs) if (h.href) out.push({ name: NAV_TEXT.hubs[h.id], group: 'pages', detail: T.topic, path: h.href });
  const page = (key: string, name: string, detail: string) => { const r = live(key); if (r) out.push({ name, group: 'pages', detail, path: r.path }); };
  page('countries', NAV_TEXT.top.countries, T.countriesPage);
  page('indicators', NAV_TEXT.top.indicators, T.indicatorsPage);
  for (const f of NAV_FOOTER) page(f.id === 'sources' ? 'page:sources' : `page:${f.id}`, NAV_TEXT.footer[f.id], f.id === 'sources' ? T.sourcesPage : T.page);

  // One entry per name and address.
  const seen = new Set<string>();
  return out.filter((i) => {
    const k = `${i.name}\n${i.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The suggestions under an empty box and after no match: one of each kind of thing search finds, live pages only. */
const TRY: [string, () => string | undefined][] = [
  ['Germany', () => countryHref('DEU')],
  ['lithium', () => live('view:minerals:lithium')?.path],
  ['military spending', () => live('indicator:milusd')?.path],
  ['wheat', () => live('view:food:wheat-production')?.path],
  ['BRICS', () => live('view:blocs:brics')?.path],
  ['Nile', () => live('view:rivers:nile')?.path],
];
export const tryLinks = (): { label: string; href: string }[] => TRY.flatMap(([label, href]) => { const h = href(); return h ? [{ label, href: h }] : []; });

/** The index as served. Names and lines are kept as written; other names that fold to the name are dropped. */
export function searchIndex(): WireIndex {
  const e = items().map((i): WireIndex['e'][number] => {
    const own = fold(i.name);
    const aliases = [...new Set((i.aliases ?? []).filter((a) => a && fold(a) !== own))];
    return [i.name, GROUPS.indexOf(i.group), i.detail, i.path, aliases.join('|'), (i.codes ?? []).join(' '), i.extra ?? ''];
  });
  return { g: [...GROUPS], e, t: tryLinks().map((l) => [l.label, l.href]) };
}

/** The index's address, with the snapshot's date so a new build is never answered from an old copy. */
export const searchIndexPath = (made: string) => `/search-index.json?v=${made.replace(/\D/g, '').slice(0, 12)}`;


/** The words the browser needs, with "{q}", "{name}", "{country}", "{n}" and "{all}" where the figures go. */
export const searchClientText = () => ({
  groups: T.groups, try: T.try, loading: T.loading, failed: T.failed, noneHelp: T.noneHelp,
  none: T.none('{q}'), didYouMean: T.didYouMean('{name}'), member: T.member('{country}'), some: T.some('{n}', '{all}'),
  one: T.count(1), many: T.count('{n}'),
});
export type SearchClientText = ReturnType<typeof searchClientText>;
