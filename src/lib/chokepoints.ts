// The chokepoints view (/chokepoints) and pages (/chokepoints/{slug}), from IMF PortWatch's daily transits
// (src/adapters/portwatch.ts), imported by hand once a month (D22). They are live while the imported files are in the
// snapshot and under 45 days old (the import's `staleAfter`, pipeline/sources/imported.ts): monthly figures any older
// would not say what "the last 7 days" means. Every sentence and figure here comes with its last data day.
import { chokepoints, VESSEL_TYPES, type Chokepoint, type Status, type VesselType } from '../adapters/portwatch.ts';
import { IMPORTED } from '../../pipeline/sources/imported.ts';
import { CHOKEPOINTS_TEXT as T, changeWords } from '../i18n/chokepoints.en.ts';
import { data, shared } from './data.ts';
import { formatDate } from './format.ts';

const DAY = 86_400_000;
const all = shared(chokepoints);

/** The order statuses are listed in: furthest below first. */
export const STATUSES: Status[] = ['disrupted', 'below', 'normal', 'above', 'unknown'];

/** How long an import stays current, in hours (45 days). */
export const FRESH_HOURS = IMPORTED.find((s) => s.id === 'portwatch')?.staleAfter ?? 45 * 24;

/** Whether an import made at `importedAt` is current in a snapshot made at `created`: under 45 days old. */
export const freshImport = (importedAt: string | undefined, created: string, hours = FRESH_HOURS) =>
  !!importedAt && (Date.parse(created) - Date.parse(importedAt)) / 3_600_000 <= hours;

let cache: Chokepoint[] | null = null;
/** Every chokepoint with a page, by name; none while the import is missing or older than 45 days. */
export function liveChokepoints(): Chokepoint[] {
  if (cache) return cache;
  const d = data();
  const list = all();
  const fresh = freshImport(d.snapshot.sources.portwatch?.fetched, d.snapshot.created);
  const out = list && fresh ? [...list].sort((a, b) => a.name.localeCompare(b.name, 'en')) : [];
  const seen = new Map<string, string>();
  for (const c of out) {
    if (seen.has(c.slug)) throw new Error(`chokepoints ${seen.get(c.slug)} and ${c.id} share the slug "${c.slug}"`);
    seen.set(c.slug, c.id);
  }
  cache = out;
  return out;
}

export const chokepointBySlug = (slug: string) => liveChokepoints().find((c) => c.slug === slug);

/** When the site imported PortWatch's files, and the last day they cover. */
export const importedOn = () => data().snapshot.sources.portwatch?.fetched;
export const lastDataDay = () => liveChokepoints().map((c) => c.lastDate).filter((d): d is string => !!d).sort().at(-1) ?? null;

/** The chokepoints furthest below their usual level first; no data last. */
export function ranked(list = liveChokepoints()): Chokepoint[] {
  return [...list].sort((a, b) => (a.change ?? Infinity) - (b.change ?? Infinity) || a.name.localeCompare(b.name, 'en'));
}

/** How many have each status. */
export const statusCounts = (list = liveChokepoints()) => Object.fromEntries(STATUSES.map((s) => [s, list.filter((c) => c.status === s).length])) as Record<Status, number>;

const isBelow = (c: Chokepoint) => c.status === 'below' || c.status === 'disrupted';

/** The view's summary line: how many have 10% or more fewer ships than usual, and which is furthest below. */
export function viewLede(): string | null {
  const list = liveChokepoints();
  const last = lastDataDay();
  if (!list.length || !last) return null;
  const below = list.filter(isBelow);
  const furthest = ranked(below)[0];
  return T.lede(formatDate(last), below.length, list.length, furthest ? { name: displayName(furthest.name, true), change: changeWords(furthest.change!) } : null);
}

/** A chokepoint's name inside a sentence: every PortWatch chokepoint takes "the" (the Strait of Hormuz, the Suez Canal,
 *  the Cape of Good Hope). */
export const displayName = (name: string, inSentence = false) => (inSentence ? `the ${name}` : name);

/** The status line on a chokepoint's page: "Traffic was 12% below its usual level in the week to 31 Oct 2026." */
export function statusLine(c: Chokepoint): string {
  if (!c.lastDate) return '';
  if (c.change === null) return T.noRecent(formatDate(c.lastDate));
  return T.statusLine(changeWords(c.change), formatDate(c.lastDate));
}

/** The first day of the 7 or 365 ending on `date`. */
export const daysBefore = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) - (n - 1) * DAY).toISOString().slice(0, 10);

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** The last 7 days by vessel type: ships a day and estimated cargo a day (tonnes), and in all. */
export function lastWeek(c: Chokepoint): { type: VesselType | 'all'; ships: number | null; cargo: number | null }[] {
  const days = c.series.slice(-7);
  return [
    ...VESSEL_TYPES.map((t) => ({ type: t, ships: avg(days.map((d) => d.ships[t])), cargo: avg(days.map((d) => d.cargo[t])) })),
    { type: 'all' as const, ships: avg(days.map((d) => d.total)), cargo: avg(days.map((d) => d.cargo.all)) },
  ];
}

/** Tankers' share of the ships of the last 7 days. */
export function tankerShare(c: Chokepoint): number | null {
  const days = c.series.slice(-7);
  const total = days.reduce((s, d) => s + (d.total ?? 0), 0);
  return total ? days.reduce((s, d) => s + (d.ships.n_tanker ?? 0), 0) / total : null;
}

export interface MonthRow { month: string; to?: string; transits: number; perDay: number; against: number | null; cargo: number | null }

/**
 * The last 12 months, newest first: ships counted, ships a day over the days with a count, against the usual level,
 * and estimated cargo (null when no day has an estimate). The month the series starts in mid-way is left out; the
 * month it ends in mid-way says the day it runs to.
 */
export function months(c: Chokepoint): MonthRow[] {
  const by = new Map<string, typeof c.series>();
  for (const d of c.series) {
    const m = d.date.slice(0, 7);
    const list = by.get(m);
    if (list) list.push(d); else by.set(m, [d]);
  }
  const out: MonthRow[] = [];
  for (const [m, days] of by) {
    if (days[0].date !== `${m}-01` && m === c.series[0]?.date.slice(0, 7)) continue;
    const counted = days.filter((d) => d.total !== null);
    if (!counted.length) continue;
    const transits = counted.reduce((s, d) => s + d.total!, 0);
    const perDay = transits / counted.length;
    const cargoDays = days.filter((d) => d.cargo.all !== null);
    const end = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    out.push({
      month: m, ...(days.at(-1)!.date < end ? { to: days.at(-1)!.date } : {}), transits, perDay,
      against: c.baseline ? perDay / c.baseline - 1 : null,
      cargo: cargoDays.length ? cargoDays.reduce((s, d) => s + d.cargo.all!, 0) : null,
    });
  }
  return out.reverse().slice(0, 12);
}

/** Great-circle distance in km, for the nearest chokepoints. */
const km = (a: Chokepoint, b: Chokepoint) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
};
/** The chokepoints nearest to one, nearest first. */
export const nearest = (c: Chokepoint, n = 3) => liveChokepoints().filter((x) => x.id !== c.id).sort((a, b) => km(c, a) - km(c, b)).slice(0, n);
