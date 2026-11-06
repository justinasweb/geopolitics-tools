// The homepage at / (HomepageOptionC design, spec D19), as the build sees it. Every part links only to live pages and
// every figure comes from the snapshot with its source and period: the tool row (live tools only, in a fixed order),
// the three worked questions, the This week strip (the current week's counts), the topics, the prepared questions, the
// countries and rankings (by stated rules), and the trust strip. A part with nothing to show is left out.
import { HOME_TEXT as T, QUESTION_TEXT } from '../i18n/home.en.ts';
import { INDICATOR_TEXT, NAV_TEXT, TRAIL_TEXT } from '../i18n/en.ts';
import { HUB_TEXT as H } from '../i18n/hubs.en.ts';
import { treasuryHolders } from '../adapters/treasury.ts';
import { INDICATORS } from '../data/indicators.ts';
import { DOSSIERS, countryModel } from './country.ts';
import { data, shared } from './data.ts';
import { dependencies } from './dependence.ts';
import { explorerMeasures } from './explorer.ts';
import { formatDate, formatValue } from './format.ts';
import { topLine } from './hubs.ts';
import { indicatorModel, tagOf } from './indicator.ts';
import { menu } from './menu.ts';
import { listed, mineralPage, nameOf as producerName, shareText } from './minerals.ts';
import { place } from './places.ts';
import { countryHref, live, navKey, paths, routes, type Route } from './routes.ts';
import { sourceRows } from './sources.ts';
import { chainOf, liveChains } from './supply-chains.ts';
import { weekPage, type WeekPageModel } from './week.ts';
import type { Status } from './tags.ts';

export interface Link { label: string; href: string }
const nameOf = (id: string) => place(id)?.name ?? id;

// ---- Tool row ----------------------------------------------------------------------------------------------------

/** The hero's tools, in the design's fixed order. */
export const TRAIL = ['atlas', 'explorer', 'dependencies', 'supply-chains', 'blocs-overlap', 'this-week'] as const;

export interface TrailTool { id: string; href: string; name: string; desc: string }

/** The tool row: the live tools only, in TRAIL's order; a tool that is not live is left out, never shown as coming.
 *  `liveRoute` is the route registry's, replaceable in tests; `goods` counts Supply chains' live flows of goods. */
export function toolRow(liveRoute: (key: string) => { path: string } | undefined = live, goods = () => liveChains().filter((k) => k !== 'refugees').length): TrailTool[] {
  return TRAIL.flatMap((id) => {
    const r = liveRoute(navKey(id));
    if (!r) return [];
    const [name, line] = TRAIL_TEXT.tools[id];
    const n = id === 'supply-chains' ? goods() : 0;
    return [{ id, href: r.path, name, desc: n ? TRAIL_TEXT.goods(n) : line }];
  });
}

// ---- Worked questions --------------------------------------------------------------------------------------------

export interface QCard {
  q: string;
  href: string;
  go: string;
  measure: string;
  /** Ranked bars, the widths against the largest. */
  bars?: { name: string; value: string; width: number }[];
  /** A dependence bar: the main supplier's share of imports, and the net imports' share of use. */
  dep?: { num: string; lead: string; segments: { cls: 'a' | 'c'; width: number; label: string }[]; note: string; label: string };
  source: string;
  parts: string[];
  status?: Status;
}

const ticData = shared(treasuryHolders);
const pct = (s: number) => `${Math.round(s * 100)}%`;
const month = (ym: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));

function rareEarths(): QCard | null {
  const p = mineralPage('rare-earths');
  const r = live('view:minerals:rare-earths');
  const top = p ? listed(p.latest).slice(0, 3) : [];
  if (!p || !r || !top.length) return null;
  const max = top[0].share!;
  return {
    q: T.rareEarths.q(p.name), href: r.path, go: T.rareEarths.go(p.name), measure: T.rareEarths.measure,
    bars: top.map((x) => ({ name: producerName(x), value: shareText(x.share!), width: (x.share! / max) * 100 })),
    source: 'USGS', parts: [String(p.latest.year)], ...(p.latest.estimated ? { status: 'estimate' as const } : {}),
  };
}

/** The largest holders in TIC Table 5's latest month, linked to the dossier of the first dossier country among them. */
function treasuries(): QCard | null {
  const t = ticData();
  if (!t?.months.length) return null;
  const top = t.holders.filter((h) => h.place && h.values[0] !== null).sort((a, b) => b.values[0]! - a.values[0]!).slice(0, 3);
  const doss = top.find((h) => DOSSIERS.includes(h.place!));
  const href = doss && countryHref(doss.place!);
  if (top.length < 3 || !doss || !href) return null;
  const max = top[0].values[0]!;
  return {
    q: T.treasuries.q, href: `${href}#money`, go: T.treasuries.go(nameOf(doss.place!)), measure: T.treasuries.measure,
    bars: top.map((h) => ({ name: nameOf(h.place!), value: T.treasuries.value(new Intl.NumberFormat('en').format(Math.round(h.values[0]!))), width: (h.values[0]! / max) * 100 })),
    source: T.treasuries.source, parts: [T.treasuries.month(month(t.months[0]))],
  };
}

/** The design's question, Hungary's gas, from the same row as the Dependencies tool: the main supplier's share of
 *  imports (UN Comtrade) and net imports against use (EIA), each with its own year. Never multiplied together. */
export function gasCard(id = 'HUN'): QCard | null {
  const r = live('tool:dependencies');
  const row = dependencies(id).find((d) => d.resource === 'gas');
  const imports = liveChains().includes('gas') ? chainOf('gas').period : null;
  if (!r || !row || row.state !== 'ok' || !row.top || row.reliance === undefined || row.reliance <= 0 || row.year === undefined || !imports) return null;
  const country = nameOf(id);
  const supplier = nameOf(row.top.id);
  const share = pct(row.top.share);
  const net = pct(Math.min(1, row.reliance));
  return {
    q: T.gas.q(country, supplier), href: `${r.path}?sort=gas&find=${encodeURIComponent(country)}`, go: T.gas.go, measure: T.gas.measure,
    dep: {
      num: share, lead: T.gas.lead(country, supplier), note: T.gas.net(net, row.year), label: T.gas.label(country, supplier, share, net),
      segments: [
        { cls: 'a', width: row.top.share * 100, label: `${supplier} ${share}` },
        { cls: 'c', width: (1 - row.top.share) * 100, label: `${T.gas.others} ${pct(1 - row.top.share)}` },
      ],
    },
    source: T.gas.source, parts: T.gas.parts(imports, row.year),
  };
}

export const questionCards = (): QCard[] => [rareEarths(), treasuries(), gasCard()].filter((c): c is QCard => !!c);

// ---- This week strip ---------------------------------------------------------------------------------------------

export interface WeekStrip { range: string; href: string; counts: { num: string; label: string; source: string }[] }

/** The current week's counts, dates and sources, exactly as /this-week shows them; nothing when /this-week is not
 *  live or its week has no count. `page` and `liveRoute` are the week model's and the route registry's, replaceable
 *  in tests. */
export function weekStrip(page: () => Pick<WeekPageModel, 'rangeText' | 'counts'> | null = weekPage, liveRoute: (key: string) => { path: string } | undefined = live): WeekStrip | null {
  const r = liveRoute('week');
  const m = r ? page() : null;
  return m && r && m.counts.length ? { range: m.rangeText, href: r.path, counts: m.counts } : null;
}

// ---- Topics and questions ----------------------------------------------------------------------------------------

export interface Topic { id: string; name: string; href?: string; line: string; views: Link[] }

/** One card per hub with a live view, in the menu's order, listing its live views. */
export const topics = (): Topic[] => menu().hubs.map((h) => ({
  id: h.id, name: NAV_TEXT.hubs[h.id], href: h.href, line: T.topic[h.id] ?? '', views: h.views.map((v) => ({ label: NAV_TEXT.views[v.id][0], href: v.path })),
}));

/** The prepared questions, in order: each opens a view or a tool set up to answer it. */
const QUESTIONS: { id: string; href: () => string | undefined }[] = [
  { id: 'richer', href: () => (['gdppc', 'co2pc', 'population'].every((m) => explorerMeasures().includes(m)) ? withQuery(live('tool:explorer:scatter'), 'x=gdppc&y=co2pc&size=population') : undefined) },
  { id: 'refugees', href: () => live('view:refugees:refin')?.path },
  { id: 'wheat', href: () => withQuery(live('tool:dependencies'), 'sort=wheat') },
  { id: 'chokepoints', href: () => routes().find((r) => r.live && r.key.startsWith('view:chokepoints:'))?.path },
  { id: 'china-oil', href: () => withQuery(live('tool:supply-chains:oil'), 'country=CHN') },
  { id: 'overlap', href: () => withQuery(live('tool:blocs-overlap'), 'blocs=brics,g20&a=brics&b=g20') },
  { id: 'lithium', href: () => live('view:minerals:lithium')?.path },
  { id: 'arms', href: () => live('view:arms:armsexp5')?.path },
];
const withQuery = (r: Route | undefined, q: string) => (r ? `${r.path}?${q}` : undefined);

export const questions = (): (Link & { to: string })[] => QUESTIONS.flatMap((q) => {
  const href = q.href();
  return href ? [{ label: QUESTION_TEXT[q.id][0], to: QUESTION_TEXT[q.id][1], href }] : [];
}).slice(0, 6);

// ---- Countries and rankings --------------------------------------------------------------------------------------

export interface Places {
  /** Each with the first sentence of its page's template summary, and whether that sentence's USGS year is an estimate. */
  dossiers: (Link & { id: string; fact: string | null; estimated: boolean })[];
  /** The largest economies after the dossiers, by GDP in the common year: a stated rule, not popularity. */
  profiles: { year: number; links: Link[] } | null;
  rankings: (Link & { top: string })[];
}

const RANKINGS = ['milusd', 'co2pc', 'refin'];

/** A dossier card's fact: the first sentence of the country page's template summary (src/lib/country.ts), with its
 *  source and year in it. With mineral shares that sentence is always the USGS one, for the lead mineral's year, so
 *  its Estimate tag follows that mineral, as on the minerals pages. */
export function dossierFact(id: string): { fact: string | null; estimated: boolean } {
  const m = countryModel(id);
  const fact = m?.summary[0] ?? null;
  const top = m?.minerals.slice(0, 3) ?? [];
  const lead = top.find((x) => x.measure === 'mine') ?? top[0];
  return { fact, estimated: Boolean(fact && lead?.estimated) };
}

export function places(): Places {
  const dossiers = DOSSIERS.flatMap((id) => { const href = countryHref(id); return href ? [{ id, label: nameOf(id), href, ...dossierFact(id) }] : []; });
  const gdp = indicatorModel('gdp');
  const links = gdp ? gdp.common.filter((r) => !DOSSIERS.includes(r.id)).flatMap((r) => { const href = countryHref(r.id); return href ? [{ label: nameOf(r.id), href }] : []; }).slice(0, 6) : [];
  const rankings = RANKINGS.flatMap((id) => {
    const r = live(`indicator:${id}`);
    const m = r ? indicatorModel(id) : null;
    if (!r || !m || m.common.length < 3) return [];
    const t = INDICATOR_TEXT[id];
    return [{ label: H.ranking(t.label, t.rate), href: r.path, top: H.inYear(m.year, topLine(m.common, (v) => formatValue(v, INDICATORS[id].format), (x) => tagOf(m, x.id, x.year))) }];
  });
  return { dossiers, profiles: gdp && links.length ? { year: gdp.year, links } : null, rankings };
}

// ---- Countries -------------------------------------------------------------------------------------------------

/** The Countries section's finder: every country and territory page, the dossiers and territories marked. Site search
 *  (the hero's box) finds everything else. */
export function countryOptions(): { name: string; note?: string; href: string }[] {
  return routes().filter((r) => r.live && r.kind === 'country').map((r) => {
    const p = place(r.id)!;
    const note = DOSSIERS.includes(r.id) ? T.kind.dossier : p.kind === 'territory' ? T.kind.territory : undefined;
    return { name: p.name, ...(note ? { note } : {}), href: r.path };
  });
}

// ---- Trust strip -------------------------------------------------------------------------------------------------

/** The Sources page's count, and when the snapshot was made. */
export function trust() {
  const made = data().snapshot.created;
  return { sources: sourceRows().length, when: `${formatDate(made)}, ${made.slice(11, 16)} UTC`, sourcesHref: paths.page('sources'), methodHref: live('page:methodology')?.path };
}
