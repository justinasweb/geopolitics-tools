// This week's figures, worked out from one snapshot's raw files for one period: the current ISO week so far (the live page), or a
// closed ISO week that the data run freezes (pipeline/lib/weeks.ts) so its archive page never changes. The result is
// small, plain JSON with numbers, dates and place ids only; the words come from src/i18n/week.en.ts when a page is
// built, so a frozen week reads in any language.
//
// One card per source the site has, in the design's order; PortWatch (shipping) and IPC (food crises) wait on
// permission and are left out until they are live, not shown empty. A card whose source has not changed since the
// period began is "quiet": it keeps the source's dates and drops its figures, so last month's numbers never read as
// this week's.
//
// Imports adapters only (no build modules), so the data run can call it under plain Node.
import type { Raw } from '../../adapters/core.ts';
import { parseGdacs, type HazardKind } from '../../adapters/hazards.ts';
import { ged } from '../../adapters/ucdp.ts';
import { prices } from '../../adapters/prices.ts';
import { outages } from '../../adapters/digital.ts';
import { changes, entries, type List } from '../../adapters/sanctions.ts';
import { addDays, inPeriod, type Period } from './period.ts';

export type CardKind = 'shipping' | 'disaster' | 'conflict' | 'prices' | 'food' | 'outage' | 'sanctions';
/** The design's order. Shipping and food crises are listed so their place is kept; nothing builds them yet. */
export const CARD_ORDER: CardKind[] = ['shipping', 'disaster', 'conflict', 'prices', 'food', 'outage', 'sanctions'];
/** Each card's sources in the snapshot. */
export const CARD_SOURCES: Record<CardKind, string[]> = {
  shipping: ['portwatch'], disaster: ['gdacs'], conflict: ['ucdp'], prices: ['pinksheet'], food: ['ipc'], outage: ['ioda'],
  sanctions: ['csl', 'eu-sanctions', 'uk-sanctions'],
};

/** The Pink Sheet series on the prices card: energy, grains, metals. */
export const PRICE_CODES = ['NGAS_EUR', 'WHEAT_US_HRW', 'MAIZE', 'RICE_05', 'COPPER', 'GOLD'];
/** At most this many conflict countries and listed alerts. */
export const CONFLICT_ROWS = 5;
/** The feed reaches back this many days on the live page. */
export const FEED_DAYS = 30;
const FEED_MAX = 60;

/** When the site last fetched a source, and when its data last changed. */
export interface SourceInfo { fetched: string; changed: string }

export interface AlertItem {
  id: string;
  level: 'red' | 'orange';
  type: HazardKind;
  places: string[];
  name: string;
  from: string;
  start?: string;
  /** Began before the week and rose to orange or red in it (its level at the week's start was lower). */
  rose?: boolean;
  /** GDACS event ids merged into this one: records GDACS keeps apart for one named storm. */
  merged?: string[];
}
export interface Base { src: SourceInfo; quiet: boolean }
export interface DisasterCard extends Base {
  kind: 'disaster';
  /** What the card counts: orange and red alerts that began in the week, or rose to orange or red in it. */
  alerts: AlertItem[];
  /** Orange and red alerts that began earlier and are still active, listed apart and not counted. */
  active: AlertItem[];
  /** Whether GDACS's file from the week's start was there to tell which earlier alerts rose in the week. */
  compared: boolean;
}
export interface ConflictCard extends Base {
  kind: 'conflict';
  /** The latest month and the one before (YYYY-MM). */
  month: string;
  prev: string;
  /** Some of the latest month's events come from a Candidate release. */
  preliminary: boolean;
  /** Events in each month, most in the latest month first. */
  rows: { place: string; a: number; b: number }[];
  total: { a: number; b: number };
}
export interface PriceRow { code: string; value: number; month: number | null; year: number | null }
export interface PricesCard extends Base { kind: 'prices'; month: string; rows: PriceRow[] }
export interface OutageCard extends Base { kind: 'outage'; rows: { place: string; start: string; hours: number }[] }
export interface SanctionsCard extends Base {
  kind: 'sanctions';
  /** The day of the earlier copy the lists are compared with; null when no earlier copy is kept yet. */
  since: string | null;
  lists: { list: List; added: number; removed: number }[];
  /** Places named most often in the added entries. */
  places: { place: string; n: number }[];
}
export type Card = DisasterCard | ConflictCard | PricesCard | OutageCard | SanctionsCard;

export type FeedKind = 'disaster' | 'shipping' | 'conflict' | 'outage' | 'food' | 'sanctions' | 'prices';
export type FeedItem =
  | { kind: 'disaster'; date: string; time?: string; level: 'red' | 'orange'; type: HazardKind; places: string[] }
  | { kind: 'outage'; date: string; time?: string; place: string; hours: number }
  | { kind: 'conflict'; date: string; month: string }
  | { kind: 'prices'; date: string; month: string };

export interface WeekData {
  /** File format version. */
  v: 1;
  /** The ISO week, for an archived week; absent on the live page. */
  week?: string;
  period: Period;
  /** When the data were taken: the snapshot (live) or the state the data run froze. */
  made: string;
  cards: Card[];
  feed: FeedItem[];
}

export interface WeekInput {
  raw: Raw;
  period: Period;
  /** Per source: when the site last fetched it and when it last changed (the snapshot's fetched and changed). */
  sources: Record<string, { fetched: string; changed?: string } | undefined>;
  /**
   * The copies kept from the start of the period (the week's Monday) and that day: the sanctions lists, to count
   * entries added and removed, and GDACS's alerts, to tell which earlier alerts rose in the week. Null when none.
   */
  baseline: { date: string; raw: Raw } | null;
  made: string;
  week?: string;
  /** First day of the feed: the live page reaches back FEED_DAYS days, an archived week only its own. */
  feedFrom?: string;
}

const missing = (e: unknown) => /is not in the snapshot/.test((e as Error).message);
function attempt<T>(f: () => T): T | null {
  try {
    return f();
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** Parsed files per snapshot, so the live page and a week worked out from the same files parse them once. */
const parsed = new WeakMap<Raw, Map<string, unknown>>();
function cached<T>(raw: Raw, key: string, f: (raw: Raw) => T): T {
  let m = parsed.get(raw);
  if (!m) parsed.set(raw, (m = new Map()));
  if (!m.has(key)) m.set(key, f(raw));
  return m.get(key) as T;
}

const monthBefore = (m: string, n = 1) => {
  const k = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 - n;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
};
const changeOf = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined || b === 0 ? null : a / b - 1);

function info(input: WeekInput, ids: string[]): SourceInfo | null {
  const s = ids.map((id) => input.sources[id]).filter((x): x is { fetched: string; changed?: string } => !!x);
  if (!s.length) return null;
  return { fetched: s.map((x) => x.fetched).sort().at(-1)!, changed: s.map((x) => x.changed ?? x.fetched).sort().at(-1)! };
}
/** Nothing new since the period began. */
const quietOf = (src: SourceInfo, p: Period) => src.changed.slice(0, 10) < p.from;

const RANK: Record<string, number> = { green: 0, none: 0, orange: 1, red: 2 };
type Hz = ReturnType<typeof parseGdacs>[number];

/**
 * One named storm can reach GDACS as two events (a new id when a storm is re-detected or moves basin), which would list
 * one cyclone twice. Tropical cyclones with the same name whose dates meet (within two days) are merged: earliest
 * start, latest end, highest level, every country. Other kinds are never merged: floods and droughts share generic
 * names ("Flood in India") across separate events.
 */
export function mergeStorms(list: Hz[]): (Hz & { merged?: string[] })[] {
  const out: (Hz & { merged?: string[] })[] = [];
  const key = (h: Hz) => (h.kind === 'TC' ? h.name.trim().toLowerCase().replace(/^tropical cyclone\s+/, '') : '');
  for (const h of [...list].sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))) {
    const k = key(h);
    const m = k ? out.find((o) => key(o) === k && h.from <= addDays(o.to, 2) && o.from <= addDays(h.to, 2)) : undefined;
    if (!m) {
      out.push({ ...h });
      continue;
    }
    m.merged = [...(m.merged ?? [m.id]), h.id];
    if (RANK[h.alert] > RANK[m.alert]) m.alert = h.alert;
    m.to = h.to > m.to ? h.to : m.to;
    m.places = [...new Set([...m.places, ...h.places])];
    m.place ??= h.place;
  }
  return out;
}

export function disasterCard(input: WeekInput): { card: DisasterCard; feed: FeedItem[] } | null {
  const src = info(input, CARD_SOURCES.disaster);
  const all = src && attempt(() => cached(input.raw, 'gdacs', (r) => mergeStorms(parseGdacs(r.json('gdacs', 'events.json')))));
  if (!src || !all) return null;
  const counted = all.filter((h) => h.alert === 'red' || h.alert === 'orange')
    .sort((a, b) => (b.start ?? b.from).localeCompare(a.start ?? a.from) || a.id.localeCompare(b.id));
  const p = input.period;
  // GDACS's alerts as they stood when the week began: an earlier alert that was lower then rose in the week.
  const base = input.baseline?.raw.has('gdacs', 'events.json') ? mergeStorms(parseGdacs(input.baseline.raw.json('gdacs', 'events.json'))) : null;
  const before = new Map<string, number>();
  for (const h of base ?? []) for (const id of h.merged ?? [h.id]) before.set(id, Math.max(before.get(id) ?? 0, RANK[h.alert]));
  const levelBefore = (h: Hz & { merged?: string[] }) => Math.max(0, ...(h.merged ?? [h.id]).map((id) => before.get(id) ?? 0));
  const item = (h: Hz & { merged?: string[] }, rose = false): AlertItem => ({
    id: h.id, level: h.alert as 'red' | 'orange', type: h.kind, places: h.places, name: h.name, from: h.from,
    ...(h.start ? { start: h.start } : {}), ...(rose ? { rose } : {}), ...(h.merged ? { merged: h.merged } : {}),
  });
  const quiet = quietOf(src, p);
  const alerts: AlertItem[] = [];
  const active: AlertItem[] = [];
  if (!quiet) {
    for (const h of counted) {
      if (h.to < p.from || h.from > p.to) continue;
      if (h.from >= p.from) alerts.push(item(h));
      else if (base && levelBefore(h) < RANK[h.alert]) alerts.push(item(h, true));
      else active.push(item(h));
    }
  }
  const from = input.feedFrom ?? addDays(p.to, -FEED_DAYS);
  const feed: FeedItem[] = counted.filter((h) => inPeriod(h.from, { from, to: p.to })).map((h) => ({
    kind: 'disaster', date: h.from, ...(h.start ? { time: h.start.slice(11, 16) } : {}), level: h.alert as 'red' | 'orange', type: h.kind, places: h.places,
  }));
  return { card: { kind: 'disaster', src, quiet, alerts, active, compared: base !== null }, feed };
}

export function conflictCard(input: WeekInput): { card: ConflictCard; feed: FeedItem[] } | null {
  const src = info(input, CARD_SOURCES.conflict);
  const events = src && attempt(() => cached(input.raw, 'ged', ged));
  if (!src || !events?.length) return null;
  const month = events.reduce((m, e) => (e.month > m ? e.month : m), '');
  const prev = monthBefore(month);
  const quiet = quietOf(src, input.period);
  const by = new Map<string, { a: number; b: number }>();
  const total = { a: 0, b: 0 };
  let preliminary = false;
  for (const e of events) {
    if (e.month !== month && e.month !== prev) continue;
    const k = e.month === month ? 'b' : 'a';
    total[k]++;
    if (e.month === month && e.candidate) preliminary = true;
    if (!e.place) continue;
    const r = by.get(e.place) ?? { a: 0, b: 0 };
    r[k]++;
    by.set(e.place, r);
  }
  // a: the month before, b: the latest month (the design's outline and solid bars).
  const rows = quiet ? [] : [...by].map(([place, r]) => ({ place, ...r })).sort((x, y) => y.b - x.b || y.a - x.a || x.place.localeCompare(y.place)).slice(0, CONFLICT_ROWS);
  const feed = releaseItem('conflict', src, input, month);
  return { card: { kind: 'conflict', src, quiet, month, prev, preliminary, rows, total: quiet ? { a: 0, b: 0 } : total }, feed };
}

/** A monthly source's release, in the feed on the day its data changed. */
function releaseItem(kind: 'conflict' | 'prices', src: SourceInfo, input: WeekInput, month: string): FeedItem[] {
  const from = input.feedFrom ?? addDays(input.period.to, -FEED_DAYS);
  return inPeriod(src.changed, { from, to: input.period.to }) ? [{ kind, date: src.changed.slice(0, 10), month }] : [];
}

export function pricesCard(input: WeekInput): { card: PricesCard; feed: FeedItem[] } | null {
  const src = info(input, CARD_SOURCES.prices);
  const p = src && attempt(() => prices(input.raw));
  if (!src || !p) return null;
  const last = (code: string) => p.series[code]?.reduce((m, x) => (x.date > m.date ? x : m));
  const month = PRICE_CODES.map((c) => last(c)?.date ?? '').sort().at(-1);
  if (!month) return null;
  const quiet = quietOf(src, input.period);
  const at = (code: string, m: string) => p.series[code]?.find((x) => x.date === m)?.value;
  const rows: PriceRow[] = quiet ? [] : PRICE_CODES.flatMap((code) => {
    const v = at(code, month);
    return v === undefined ? [] : [{ code, value: v, month: changeOf(v, at(code, monthBefore(month))), year: changeOf(v, at(code, monthBefore(month, 12))) }];
  });
  return { card: { kind: 'prices', src, quiet, month, rows }, feed: releaseItem('prices', src, input, month) };
}

export function outageCard(input: WeekInput): { card: OutageCard; feed: FeedItem[] } | null {
  const src = info(input, CARD_SOURCES.outage);
  const all = src && attempt(() => outages(input.raw));
  if (!src || !all) return null;
  const quiet = quietOf(src, input.period);
  const rows = quiet ? [] : all.filter((o) => inPeriod(o.start, input.period)).map((o) => ({ place: o.place, start: o.start, hours: o.hours }));
  const from = input.feedFrom ?? addDays(input.period.to, -FEED_DAYS);
  const feed: FeedItem[] = all.filter((o) => inPeriod(o.start, { from, to: input.period.to }))
    .map((o) => ({ kind: 'outage', date: o.start.slice(0, 10), time: o.start.slice(11, 16), place: o.place, hours: o.hours }));
  return { card: { kind: 'outage', src, quiet, rows }, feed };
}

export function sanctionsCard(input: WeekInput): { card: SanctionsCard; feed: FeedItem[] } | null {
  const src = info(input, CARD_SOURCES.sanctions);
  const files: [string, string][] = [['csl', 'consolidated.json'], ['eu-sanctions', 'sanctions.csv'], ['uk-sanctions', 'sanctions.csv']];
  if (!src || !files.some(([s, f]) => input.raw.has(s, f))) return null;
  const quiet = quietOf(src, input.period);
  const base = input.baseline;
  // Reading the lists is the slow part, so it waits until there is something to compare.
  const now = quiet || !base ? null : entries(input.raw);
  if (!now || !base) return { card: { kind: 'sanctions', src, quiet, since: base?.date ?? null, lists: [], places: [] }, feed: [] };
  const diff = changes(entries(base.raw), now);
  const counts = new Map<string, number>();
  for (const d of diff) for (const pl of d.places) if (pl) counts.set(pl, (counts.get(pl) ?? 0) + 1);
  return {
    card: {
      kind: 'sanctions', src, quiet, since: base.date,
      lists: diff.map((d) => ({ list: d.list, added: d.added.length, removed: d.removed.length })),
      places: [...counts].map(([place, n]) => ({ place, n })).sort((a, b) => b.n - a.n || a.place.localeCompare(b.place)).slice(0, 3),
    },
    feed: [],
  };
}

const BUILDERS = { disaster: disasterCard, conflict: conflictCard, prices: pricesCard, outage: outageCard, sanctions: sanctionsCard };

/** Every card the snapshot has a source for, and the feed, newest first. */
export function computeWeek(input: WeekInput): WeekData {
  const cards: Card[] = [];
  const feed: FeedItem[] = [];
  for (const kind of CARD_ORDER) {
    const b = BUILDERS[kind as keyof typeof BUILDERS];
    const r = b?.(input);
    if (!r) continue;
    cards.push(r.card);
    feed.push(...r.feed);
  }
  const at = (f: FeedItem) => `${f.date}T${('time' in f && f.time) || '00:00'}`;
  feed.sort((a, b) => at(b).localeCompare(at(a)) || CARD_ORDER.indexOf(a.kind) - CARD_ORDER.indexOf(b.kind));
  return { v: 1, ...(input.week ? { week: input.week } : {}), period: input.period, made: input.made, cards, feed: feed.slice(0, FEED_MAX) };
}

/** A card with figures to show: not quiet, and not a sanctions card still waiting for an earlier copy. */
export const hasFigures = (c: Card) => !c.quiet && !(c.kind === 'sanctions' && c.since === null);

/** Orange and red alerts in the period: the count at the top of the page. */
export const alertCount = (w: WeekData) => {
  const d = w.cards.find((c): c is DisasterCard => c.kind === 'disaster');
  return d && !d.quiet ? d.alerts.length : null;
};
