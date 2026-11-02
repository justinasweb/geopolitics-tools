// This week (/this-week) and its archive (/this-week/{yyyy}-{ww}), as the build sees them.
//
// The live page is worked out from the build's snapshot for the current ISO week, Monday to the snapshot's day (./week/model.ts).
// Closed ISO weeks are frozen by the data run when the week closes (pipeline/lib/weeks.ts) and kept in R2 next to the
// snapshots (gt-snapshots/weeks/); pipeline/pull.ts brings them to data/raw/weeks/, with the sanctions lists as they
// stood on the week's Monday, with GDACS's alerts (data/raw/weeks/baseline/). An archived week is read as frozen and
// never worked out again, so a source revising its data later does not change it.
//
// The AI summary ("The week in brief") is optional: data/raw/weeks/{id}.summary.json once the editor has approved
// one. Without it the page shows the cards only, with no empty box.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawDir } from '../adapters/core.ts';
import { data } from './data.ts';
import { place } from './places.ts';
import { viewHref, paths } from './routes.ts';
import { computeWeek, alertCount, hasFigures, CARD_ORDER, type AlertItem, type Card, type FeedItem, type WeekData } from './week/model.ts';
import { isWeekId, lastClosedWeek, rollingWeek, weekNumber, weekRange } from './week/period.ts';
import { WEEK_TEXT as W, PRICE_TEXT, day, month, months, pct, range } from '../i18n/week.en.ts';
import type { Status } from './tags.ts';

const weeksDir = () => join(process.env.GT_DATA_DIR ?? join(process.cwd(), 'data/raw'), 'weeks');
const readJson = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null);

const snapshotSources = () => Object.fromEntries(Object.entries(data().snapshot.sources).map(([k, s]) => [k, { fetched: s.fetched, changed: s.changed }]));

let liveCache: WeekData | null | undefined;
/** The live page's period: the last 7 days, to the snapshot's day. Null when no source on the page is in the snapshot. */
export function liveWeek(): WeekData | null {
  if (liveCache !== undefined) return liveCache;
  const d = data();
  const period = rollingWeek(d.snapshot.created.slice(0, 10));
  const b = d.sample ? null : readJson<{ date: string }>(join(weeksDir(), 'baseline.json'));
  // Only the copy from the period's first day: any other would make the sanctions and alert counts cover another range.
  const baseline = b && b.date === period.from ? { date: b.date, raw: rawDir(join(weeksDir(), 'baseline')) } : null;
  const w = computeWeek({ raw: d.raw, period, sources: snapshotSources(), baseline, made: d.snapshot.created });
  return (liveCache = w.cards.length ? w : null);
}

let archiveCache: Map<string, WeekData> | undefined;
/**
 * Every frozen week, newest first. A sample build has no frozen weeks, so it works out the week before the sample
 * date from the sample files instead, to show the archive page (never deployed).
 */
export function archivedWeeks(): Map<string, WeekData> {
  if (archiveCache) return archiveCache;
  const out = new Map<string, WeekData>();
  const d = data();
  if (d.sample) {
    const id = lastClosedWeek(d.snapshot.created);
    const period = weekRange(id);
    const w = computeWeek({ raw: d.raw, period, sources: snapshotSources(), baseline: null, made: d.snapshot.created, week: id, feedFrom: period.from });
    if (w.cards.length) out.set(id, w);
  } else if (existsSync(weeksDir())) {
    for (const f of readdirSync(weeksDir()).sort().reverse()) {
      const id = f.replace(/\.json$/, '');
      if (!isWeekId(id)) continue;
      const w = readJson<WeekData>(join(weeksDir(), f));
      if (w?.v === 1 && w.cards.length) out.set(id, w);
    }
  }
  return (archiveCache = out);
}

/** An archived week holds real cards once one of its cards has figures (quiet cards alone do not count). */
export const weekIndexed = (w: WeekData) => w.cards.some(hasFigures);

export interface Summary { text: string; approved: string }
/** The editor's approved summary for a week, if there is one. */
export function weekSummary(id: string): Summary | null {
  if (data().sample) return null;
  const s = readJson<Partial<Summary>>(join(weeksDir(), `${id}.summary.json`));
  return s && typeof s.text === 'string' && s.text.trim() && typeof s.approved === 'string' ? { text: s.text.trim(), approved: s.approved } : null;
}

// ---- What the page shows ---------------------------------------------------------------------------------------

const nameOf = (id: string) => place(id)?.name ?? id;
const HOURLY = new Set(['disaster', 'outage']);
/** "21 Oct" or, for hourly sources, "21 Oct, 06:00 UTC". */
const updatedText = (kind: string, fetched: string) => W.updated(day(fetched), HOURLY.has(kind) ? fetched.slice(11, 16) : undefined);

/** Each kind's shape glyph and categorical colour (the design's), so a kind never relies on colour alone. */
export const GLYPHS: Record<string, { cat: number; svg: string }> = {
  shipping: { cat: 1, svg: '<path d="M6 .8 11.2 6 6 11.2.8 6z"/>' },
  disaster: { cat: 4, svg: '<path d="M6 1.2 11.2 10.6H.8z"/>' },
  conflict: { cat: 3, svg: '<circle cx="6" cy="6" r="5"/>' },
  prices: { cat: 8, svg: '<path d="M1 9.5 4.3 5.6 7 7.8 11 2.6" fill="none" stroke="currentColor" stroke-width="2"/>' },
  food: { cat: 2, svg: '<path d="M6 .8l4.7 2.6v5.2L6 11.2 1.3 8.6V3.4z"/>' },
  outage: { cat: 5, svg: '<rect x="1.4" y="1.4" width="9.2" height="9.2"/>' },
  sanctions: { cat: 6, svg: '<path d="M1 2.2h10M1 6h10M1 9.8h6.5" fill="none" stroke="currentColor" stroke-width="2.2"/>' },
};

/** Where each card's "Open the … map" goes, when that page is live. */
const MAPS: Record<string, string> = { disaster: 'disasters', conflict: 'conflict', outage: 'internet', sanctions: 'sanctions' };

export interface AlertRow {
  level: 'red' | 'orange';
  levelText: string;
  /** The kind ("Tropical cyclone") and the first countries; the rest fold behind `more`. */
  what: string;
  places: string[];
  more: { text: string; label: string; places: string } | null;
  date: string;
  /** "Rose to red this week", for an earlier alert counted because it rose. */
  note?: string;
}
export interface PairRow { name: string; a: number; b: number; aw: number; bw: number; value: string; change: string }
export interface TableRow { head: string; sub?: string; cells: { text: string; num?: boolean; dir?: 'up' | 'down' | 'flat' }[] }
export type Body =
  | { type: 'alerts'; rows: AlertRow[]; empty?: string; active: AlertRow[]; activeTitle: string; activeNote: string; activeMore?: string; notes: string[] }
  | { type: 'pair'; label: string; rows: PairRow[]; keyA: string; keyB: string; key: string; notes: string[] }
  | { type: 'table'; cols: { text: string; num?: boolean }[]; rows: TableRow[]; notes: string[] }
  | { type: 'notes'; notes: string[] };

export interface CardView {
  kind: string;
  label: string;
  headline: string;
  wide: boolean;
  quiet?: { title: string; text: string };
  body?: Body;
  source: string;
  period: string;
  updated: string;
  tags: Status[];
  href?: string;
  go?: string;
}

/** "+17%", "−7%", "0%": the conflict pairs' change, in whole percent as the design shows it. */
const wholeChange = (c: number) => { const v = Math.round(c * 100); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`; };
/** An alert's row: the kind, the first countries, and the rest behind a "+ 11 more" disclosure. */
function alertRow(a: AlertItem, date: string, span: string): AlertRow {
  const names = a.places.map(nameOf);
  const k = W.placesShown;
  const rest = names.length > k ? names.slice(k) : [];
  return {
    level: a.level, levelText: W.level(a.level), what: W.hazard(a.type), places: rest.length ? names.slice(0, k) : names,
    more: rest.length ? { text: W.morePlaces(rest.length), label: W.morePlacesLabel(rest.length), places: rest.join(', ') } : null,
    date, ...(a.rose ? { note: W.rose(a.level, span) } : {}),
  };
}
const dirOf = (c: number | null): 'up' | 'down' | 'flat' | undefined => (c === null ? undefined : c > 0.0005 ? 'up' : c < -0.0005 ? 'down' : 'flat');
const fmt = (v: number) => new Intl.NumberFormat('en', { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 }).format(v);

function cardView(c: Card, w: WeekData): CardView {
  const p = w.period;
  const span = w.week ? W.span.week : W.span.live;
  const periodText = range(p.from, p.to);
  const base = {
    kind: c.kind, label: W.kind[c.kind], wide: c.kind === 'sanctions', updated: updatedText(c.kind, c.src.fetched), tags: [] as Status[],
    href: MAPS[c.kind] ? viewHref(MAPS[c.kind]) : undefined, go: W.go[c.kind],
  };
  const quiet = (m = '') => ({
    ...base, headline: W.quietTitle[c.kind], source: '', period: W.lastData(day(c.src.changed, { year: true })),
    quiet: { title: W.noNewData(day(c.src.changed)), text: W.quiet[c.kind](day(c.src.changed, { long: true }), m) },
  });
  switch (c.kind) {
    case 'disaster': {
      if (c.quiet) return { ...quiet(), source: W.source.disaster };
      const red = c.alerts.filter((a) => a.level === 'red').length;
      const shown = c.alerts.slice(0, 7);
      const active = c.active ?? [];
      const activeShown = active.slice(0, 5);
      return {
        ...base, headline: W.alertsHead(c.alerts.length, red), source: W.source.disaster, period: periodText,
        body: {
          type: 'alerts',
          rows: shown.map((a) => alertRow(a, day(a.from), span)),
          active: activeShown.map((a) => alertRow(a, W.sinceDay(day(a.from)), span)),
          activeTitle: W.activeTitle, activeNote: W.activeNote(span),
          ...(c.alerts.length ? {} : { empty: W.alertsNone(span) }),
          notes: [c.alerts.length > shown.length ? W.alertsMore(c.alerts.length - shown.length) : '', c.compared === false ? W.alertsRuleNew(span) : W.alertsRule(span)].filter(Boolean),
          ...(active.length > activeShown.length ? { activeMore: W.activeMore(active.length - activeShown.length) } : {}),
        },
      };
    }
    case 'conflict': {
      if (c.quiet) return { ...quiet(month(c.month, true)), source: W.source.conflict(c.preliminary) };
      const top = Math.max(1, ...c.rows.flatMap((r) => [r.a, r.b]));
      const [ma, mb] = [month(c.prev, true).split(' ')[0], month(c.month, true).split(' ')[0]];
      const ups = c.rows.slice(1).filter((r) => r.b > r.a).slice(0, 2).map((r) => nameOf(r.place));
      return {
        ...base, tags: c.preliminary ? ['preliminary'] : [],
        headline: c.rows.length ? W.conflictHead(nameOf(c.rows[0].place), ups, ma, month(c.month, true)) : W.conflictNone(month(c.month, true)),
        source: W.source.conflict(c.preliminary), period: months(c.prev, c.month),
        body: {
          type: 'pair', label: W.conflictLabel(month(c.prev, true), month(c.month, true)),
          rows: c.rows.map((r) => ({
            name: nameOf(r.place), a: r.a, b: r.b, aw: (100 * r.a) / top, bw: (100 * r.b) / top,
            value: new Intl.NumberFormat('en').format(r.b), change: r.a ? wholeChange(r.b / r.a - 1) : '',
          })),
          keyA: ma, keyB: mb, key: W.conflictKey(mb, ma),
          notes: [W.conflictCaption(new Intl.NumberFormat('en').format(c.total.b), month(c.month, true))],
        },
      };
    }
    case 'prices': {
      if (c.quiet) return { ...quiet(month(c.month, true)), source: W.source.prices };
      const moves = c.rows.filter((r) => r.month !== null).map((r) => ({ name: PRICE_TEXT[r.code].name, c: r.month! }));
      const up = moves.filter((m) => m.c > 0.005).sort((a, b) => b.c - a.c)[0] ?? null;
      const down = moves.filter((m) => m.c < -0.005).sort((a, b) => a.c - b.c)[0] ?? null;
      const cell = (x: number | null) => (x === null ? { text: '–', num: true } : { text: pct(x), num: true, dir: dirOf(x) });
      return {
        ...base, headline: W.pricesHead(up, down, month(c.month, true)), source: W.source.prices, period: W.monthly(month(c.month)),
        body: {
          type: 'table',
          cols: [{ text: W.pricesCols.name }, { text: month(c.month), num: true }, { text: W.pricesCols.month, num: true }, { text: W.pricesCols.year, num: true }],
          rows: c.rows.map((r) => ({ head: PRICE_TEXT[r.code].name, sub: PRICE_TEXT[r.code].unit, cells: [{ text: fmt(r.value), num: true }, cell(r.month), cell(r.year)] })),
          notes: [W.pricesCaption],
        },
      };
    }
    case 'outage': {
      if (c.quiet) return { ...quiet(), source: W.source.outage };
      return {
        ...base, headline: W.outagesHead(c.rows.length), source: W.source.outage, period: periodText,
        body: c.rows.length ? {
          type: 'table', cols: [{ text: W.outagesCols.place }, { text: W.outagesCols.began }, { text: W.outagesCols.length, num: true }],
          rows: c.rows.map((r) => ({ head: nameOf(r.place), cells: [{ text: `${day(r.start)}, ${r.start.slice(11, 16)} UTC` }, { text: W.hours(r.hours), num: true }] })),
          notes: [W.outagesNote],
        } : { type: 'notes', notes: [W.outagesNone(span), W.outagesNote] },
      };
    }
    case 'sanctions': {
      if (c.quiet) return { ...quiet(), source: W.source.sanctions };
      if (!c.since) return { ...base, headline: W.quietTitle.sanctions, source: W.source.sanctions, period: periodText, quiet: { title: W.noBaseline, text: W.noBaselineText(day(p.from, { long: true })) } };
      const added = c.lists.reduce((s, l) => s + l.added, 0);
      const removed = c.lists.reduce((s, l) => s + l.removed, 0);
      return {
        ...base, headline: W.sanctionsHead(added, removed, c.lists.map((l) => W.list(l.list).short)), source: W.source.sanctions,
        period: periodText,
        body: {
          type: 'table', cols: [{ text: W.sanctionsCols.list }, { text: W.sanctionsCols.added, num: true }, { text: W.sanctionsCols.removed, num: true }],
          rows: c.lists.map((l) => ({ head: W.list(l.list).name, sub: W.list(l.list).sub, cells: [{ text: String(l.added), num: true }, { text: String(l.removed), num: true }] })),
          notes: [c.places.length ? W.sanctionsPlaces(c.places.map((x) => `${nameOf(x.place)} (${x.n})`)) : '', W.sanctionsEntry].filter(Boolean),
        },
      };
    }
  }
}

export interface FeedView { kind: string; label: string; date: string; datetime: string; time?: string; text: string; href?: string; source: string }

function feedView(f: FeedItem): FeedView {
  const common = { kind: f.kind, label: W.kind[f.kind], date: day(f.date), datetime: f.date, time: 'time' in f && f.time ? `${f.time} UTC` : undefined, source: W.feedSource[f.kind] };
  switch (f.kind) {
    case 'disaster': return { ...common, text: W.feedItem.disaster(f.level, f.type, f.places.map(nameOf)), href: viewHref('disasters') };
    case 'outage': return { ...common, text: W.feedItem.outage(nameOf(f.place), W.hours(f.hours)), href: viewHref('internet') };
    case 'conflict': return { ...common, text: W.feedItem.conflict(month(f.month, true)), href: viewHref('conflict') };
    case 'prices': return { ...common, text: W.feedItem.prices(month(f.month, true)) };
  }
}

export interface WeekPageModel {
  /** The archived week's id, or null for the live page. */
  id: string | null;
  data: WeekData;
  path: string;
  title: string;
  description: string;
  shareText: string;
  rangeText: string;
  counts: { num: string; label: string; source: string }[];
  cards: CardView[];
  feed: FeedView[];
  feedKinds: string[];
  /** prev: an archived week's previous week; latest: the live page's link to the latest closed week, once one exists. */
  nav: { prev?: { href: string; label: string; range: string }; latest?: { href: string; label: string }; options: { value: string; label: string; selected: boolean }[] };
  summary: (Summary & { week: number; range: string }) | null;
}

/** The page for the live week (no id) or an archived one. */
export function weekPage(id?: string): WeekPageModel | null {
  const w = id ? archivedWeeks().get(id) : liveWeek();
  return w ? weekPageFor(w, id ?? null) : null;
}

/** The page for one period's figures: the last 7 days (id null) or an archived ISO week. Every range on it (title,
 *  counts, cards) comes from that period. */
export function weekPageFor(w: WeekData, weekOf: string | null): WeekPageModel {
  const p = w.period;
  const longRange = range(p.from, p.to, { long: true });
  const path = paths.week(weekOf ?? undefined);
  const n = alertCount(w);
  const counts = n === null ? [] : [{ num: String(n), label: W.counts.disaster(n), source: `GDACS · ${range(p.from, p.to)}` }];
  const archive = [...archivedWeeks().keys()];
  // An archived week links to the one before it; the live page to the latest closed week.
  const prevId = weekOf ? archive.find((k) => k < weekOf) : undefined;
  const latestId = weekOf ? undefined : archive[0];
  const opt = (k: string) => {
    const r = weekRange(k);
    return { value: paths.week(k), label: W.pickOption(weekNumber(k), range(r.from, r.to, { year: false })), selected: k === weekOf };
  };
  const live = liveWeek();
  const options = [
    ...(live ? [{ value: paths.week(), label: W.pickLive(range(live.period.from, live.period.to, { year: false })), selected: !weekOf }] : []),
    ...archive.map(opt),
  ];
  // Summaries are per closed week. The live page shows the latest closed week's, labelled with that week.
  const summaryId = weekOf ?? latestId;
  const s = summaryId ? weekSummary(summaryId) : null;
  const feed = w.feed.map(feedView);
  return {
    id: weekOf, data: w, path,
    title: weekOf ? W.archiveTitle(weekNumber(weekOf), longRange) : W.title(longRange),
    description: weekOf ? W.archiveDescription(weekNumber(weekOf), range(p.from, p.to)) : W.description(range(p.from, p.to)),
    shareText: weekOf ? W.shareArchive(weekNumber(weekOf), range(p.from, p.to)) : W.shareText(range(p.from, p.to)),
    rangeText: longRange,
    counts,
    cards: CARD_ORDER.flatMap((k) => w.cards.filter((c) => c.kind === k)).map((c) => cardView(c, w)),
    feed,
    feedKinds: [...new Set(feed.map((f) => f.kind))].sort((a, b) => CARD_ORDER.indexOf(a as never) - CARD_ORDER.indexOf(b as never)),
    nav: {
      prev: prevId ? { href: paths.week(prevId), label: W.week(weekNumber(prevId)), range: range(weekRange(prevId).from, weekRange(prevId).to, { year: false }) } : undefined,
      latest: latestId ? { href: paths.week(latestId), label: W.weekLink(weekNumber(latestId)) } : undefined,
      options: options.length > 1 ? options : [],
    },
    summary: s && summaryId ? { ...s, week: weekNumber(summaryId), range: range(weekRange(summaryId).from, weekRange(summaryId).to, { long: true }) } : null,
  };
}
