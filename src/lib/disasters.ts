// The disasters map view (/disasters, /disasters/{kind}), worked out once per page: GDACS alerts by country over the
// last 30, 90 and 365 days, and, on the earthquakes page, USGS earthquakes of magnitude 5.5 and over. GDACS keeps
// green alerts for 30 days and orange and red ones for 365 (docs/data-pipeline.md), so 30 days counts every level
// and the longer periods orange and red only. Earthquake marks come from USGS alone: GDACS lists the same quakes.
// Country pages count alerts with the same rule (alertsIn), so a profile and the map agree.
import { parseGdacs, parseQuakes, type Alert, type Hazard, type HazardKind } from '../adapters/hazards.ts';
import { data, refreshed, shared } from './data.ts';

export const PERIODS = [30, 90, 365];
/** The default period: the year, as on country pages. */
export const DEFAULT_DAYS = 365;
export const KINDS: HazardKind[] = ['EQ', 'TC', 'FL', 'DR', 'WF', 'VO'];
export type DisasterId = 'all' | HazardKind;
/** Fixed class edges for alert counts: 1, 2–4, 5–9, 10–24, 25+. */
export const COUNT_EDGES = [2, 5, 10, 25];

const gdacsData = shared((raw) => parseGdacs(raw.json('gdacs', 'events.json')));
const quakeData = shared((raw) => parseQuakes(raw.json('usgs-quakes', 'earthquakes.json')));

/** The alert levels a period counts. */
export const levelsFor = (days: number): Alert[] => (days <= 30 ? ['red', 'orange', 'green'] : ['red', 'orange']);

/** The last day the alerts cover: the day GDACS was last fetched. */
export const lastDay = () => (refreshed('gdacs') ?? data().snapshot.created).slice(0, 10);
export const firstDay = (to: string, days: number) => new Date(Date.parse(to) - days * 864e5).toISOString().slice(0, 10);

/** An event counts in a period if it lasted into it. */
const inPeriod = (h: Hazard, from: string, to: string) => h.to >= from && h.from <= to;

/** GDACS alerts of these levels (and kind) active between two days, newest first. */
export function alertsIn(from: string, to: string, levels: Alert[], kind?: HazardKind): Hazard[] {
  return (gdacsData() ?? []).filter((h) => (!kind || h.kind === kind) && levels.includes(h.alert) && inPeriod(h, from, to))
    .sort((a, b) => b.from.localeCompare(a.from) || a.id.localeCompare(b.id));
}

export interface CountryCount { id: string; n: number; red: number; orange: number; green: number }
export interface Period {
  days: number;
  from: string;
  to: string;
  levels: Alert[];
  alerts: Hazard[];
  /** Countries named in an alert, most first. An alert counts once for each country it names. */
  rows: CountryCount[];
  /** USGS earthquakes of magnitude 5.5 and over (earthquakes page only), largest first. */
  quakes: Hazard[];
}

export interface DisasterPage {
  id: DisasterId;
  kind?: HazardKind;
  to: string;
  periods: Period[];
  byDays: Record<number, Period>;
  days: number;
}

export function countRows(alerts: Hazard[]): CountryCount[] {
  const by = new Map<string, CountryCount>();
  for (const h of alerts) {
    for (const id of h.places) {
      const c = by.get(id) ?? { id, n: 0, red: 0, orange: 0, green: 0 };
      c.n++;
      if (h.alert === 'red' || h.alert === 'orange' || h.alert === 'green') c[h.alert]++;
      by.set(id, c);
    }
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.red - a.red || b.orange - a.orange || a.id.localeCompare(b.id));
}

/** The colour class of a count: 1–5. */
export const countClass = (n: number) => 1 + COUNT_EDGES.filter((e) => n >= e).length;

function buildPage(id: DisasterId): DisasterPage | null {
  if (!gdacsData()) return null;
  const kind = id === 'all' ? undefined : id;
  const to = lastDay();
  const quakes = kind === 'EQ' ? quakeData() ?? [] : [];
  const periods = PERIODS.map((days) => {
    const from = firstDay(to, days);
    const levels = levelsFor(days);
    const alerts = alertsIn(from, to, levels, kind);
    return {
      days, from, to, levels, alerts, rows: countRows(alerts),
      quakes: quakes.filter((q) => inPeriod(q, from, to)).sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0) || b.from.localeCompare(a.from)),
    };
  });
  return { id, kind, to, periods, byDays: Object.fromEntries(periods.map((p) => [p.days, p])), days: DEFAULT_DAYS };
}

let cache: DisasterPage[] | null = null;
/** The disasters pages: every kind first, then one per kind. */
export function disasterPages(): DisasterPage[] {
  cache ??= (['all', ...KINDS] as DisasterId[]).map(buildPage).filter((p): p is DisasterPage => p !== null);
  return cache;
}
export const disasterPage = (id: string) => disasterPages().find((p) => p.id === id);

/** Alerts by kind, for the summary: [kind, count], most first. */
export function byKind(alerts: Hazard[]): [HazardKind, number][] {
  const c = new Map<HazardKind, number>();
  for (const h of alerts) c.set(h.kind, (c.get(h.kind) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

/** Every alert's days, as one text: "14 Oct 2026" or "12 Oct 2026 – 3 Nov 2026". */
export const daysText = (h: Hazard, fmt: (d: string) => string) => (h.from === h.to ? fmt(h.from) : `${fmt(h.from)} – ${fmt(h.to)}`);
