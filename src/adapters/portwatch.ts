// IMF PortWatch chokepoints (portwatch/chokepoints.json and chokepoints_daily.json, ArcGIS
// { features: [{ attributes }] }), fetched or imported by hand (D22). Each chokepoint gets its daily transits for the
// last 365 days, with each day's usual range; a 7-day average against the same week in the three years before, and a
// status from it; the
// vessel mix of the last 30 days; and its ships and estimated cargo by vessel type for each day.
//
// What "usual" means here: the same days in each of the three years before. The status compares the last 7 days'
// average with the median of the same 7 days' averages in each of those years (2023–2025 for a week of 2026), from
// two years at least, or it has no status; the monthly table compares a month the same way; the chart's usual range
// shades, for each day, the lowest to highest count on that day in the same three years (a day missing in any of
// them has no range). One meaning, so a collapse inside the last year never lowers the level it is compared with.
//
// Estimated cargo (capacity_*) is PortWatch's estimate in metric tonnes, from the ships' signals (AIS) and their
// size, not official statistics. PortWatch has no country field. Ported from the prototype's src/adapters/portwatch.js.
import { day } from '../../pipeline/sources/portwatch.ts';
import { CHOKEPOINT_NOTES, type ChokepointNote } from '../data/chokepoint-notes.ts';
import type { Raw } from './core.ts';

export const VESSEL_TYPES = ['n_tanker', 'n_container', 'n_dry_bulk', 'n_general_cargo', 'n_roro'] as const;
export type VesselType = (typeof VESSEL_TYPES)[number];
/** The estimated cargo column of each vessel type. */
export const CARGO_OF: Record<VesselType, string> = { n_tanker: 'capacity_tanker', n_container: 'capacity_container', n_dry_bulk: 'capacity_dry_bulk', n_general_cargo: 'capacity_general_cargo', n_roro: 'capacity_roro' };

export type Status = 'disrupted' | 'below' | 'normal' | 'above' | 'unknown';

/** A change as the pages show it: a whole percent (−0.097 → −10). Statuses are worked out from this, so a status
 *  never contradicts the number beside it. */
export const wholePercent = (change: number) => Math.round(change * 100) + 0;

/** The 7-day average against the same week in the three years before: 30% or more below is disrupted, 10% below, 15%
 *  above; read from the change as shown, in whole percent. */
export function statusFor(change: number | null): Status {
  if (change == null) return 'unknown';
  const p = wholePercent(change);
  if (p <= -30) return 'disrupted';
  if (p <= -10) return 'below';
  if (p >= 15) return 'above';
  return 'normal';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const numOr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A year's days count when at least this share of them has a count. */
const COUNTED = 0.7;

/**
 * The usual level for some days: for each of the three years before, the average count on the same calendar days
 * (when at least 70% of them have one), then the median of those years' averages. Null with fewer than two years.
 * `years` is the first and last year used, by the last day's year (2023–2025 for a week ending in 2026).
 */
export function sameDaysBefore(dates: string[], byDate: Map<string, number | null>): { median: number; years: [number, number] } | null {
  if (!dates.length) return null;
  const last = Number(dates.at(-1)!.slice(0, 4));
  const found: { year: number; avg: number }[] = [];
  for (const k of [1, 2, 3]) {
    const vs = dates.map((d) => byDate.get(yearsBefore(d, k))).filter((v): v is number => typeof v === 'number');
    if (vs.length >= Math.ceil(dates.length * COUNTED)) found.push({ year: last - k, avg: vs.reduce((a, b) => a + b, 0) / vs.length });
  }
  if (found.length < 2) return null;
  const sorted = found.map((f) => f.avg).sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  const ys = found.map((f) => f.year);
  return { median, years: [Math.min(...ys), Math.max(...ys)] };
}

/** One day at a chokepoint. */
export interface Transit {
  date: string;
  /** Ships of every type that crossed. */
  total: number | null;
  /** The usual range: lowest and highest count on the same day in each of the three years before; null when one is missing. */
  range: [number, number] | null;
  ships: Record<VesselType, number | null>;
  /** PortWatch's estimated cargo in metric tonnes, by vessel type, and in all (`all`). */
  cargo: Record<VesselType | 'all', number | null>;
}

export interface Chokepoint {
  /** PortWatch's id (chokepoint6), which can change between releases; `slug`, from the name, is what pages use. */
  id: string; slug: string; name: string; lat: number; lon: number; industries: string[];
  series: Transit[]; lastDate: string | null;
  /** The last 7 days' average; the usual level (median of the same 7 days in the three years before) and the years it
   *  comes from; the change between them. */
  avg7: number | null; baseline: number | null; baseYears: [number, number] | null; change: number | null; status: Status;
  /** Every day's count PortWatch gave (four years and more), for comparing other periods with the years before. */
  byDate: Map<string, number | null>;
  mix: Record<VesselType, number | null>;
  /** A caveat the source gives on these figures (src/data/chokepoint-notes.ts). */
  caveat?: ChokepointNote;
}

type Attr = Record<string, unknown>;

/** A page's slug from PortWatch's name: "Bab el-Mandeb Strait" → bab-el-mandeb-strait, "Øresund" → oresund. */
export const slugOf = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/gi, 'o').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The same calendar day `years` earlier: 2026-11-15 → 2023-11-15. */
export const yearsBefore = (date: string, years: number) => `${Number(date.slice(0, 4)) - years}${date.slice(4)}`;

/** Each day's usual range from every day's count: the same day in each of the three years before, lowest to highest. */
export function usualRange(date: string, byDate: Map<string, number | null>): [number, number] | null {
  const past = [1, 2, 3].map((k) => byDate.get(yearsBefore(date, k)));
  if (past.some((v) => v === undefined || v === null)) return null;
  const vs = past as number[];
  return [Math.min(...vs), Math.max(...vs)];
}

export function parseChokepoints(meta: { features?: { attributes: Attr }[] }, daily: { features?: { attributes: Attr }[] }, notes: ChokepointNote[] = CHOKEPOINT_NOTES): Chokepoint[] {
  const byId = new Map<string, (Attr & { date: string })[]>();
  for (const { attributes: a } of daily.features ?? []) {
    const date = day(a.date);
    if (!date) continue;
    const list = byId.get(String(a.portid));
    if (list) list.push({ ...a, date }); else byId.set(String(a.portid), [{ ...a, date }]);
  }
  // Every chokepoint PortWatch lists (28 in November 2026), matched to its days by portid.
  return (meta.features ?? []).map((f) => f.attributes).filter((m) => m.portid != null).map((m) => {
    const every = (byId.get(String(m.portid)) ?? []).sort((x, y) => x.date.localeCompare(y.date));
    const byDate = new Map(every.map((r) => [r.date, numOr(r.n_total)]));
    let rows = every;
    if (rows.length) {
      const cutoff = new Date(Date.parse(`${rows.at(-1)!.date}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
      rows = rows.filter((r) => r.date >= cutoff);
    }
    const series: Transit[] = rows.map((r) => ({
      date: r.date, total: numOr(r.n_total), range: usualRange(r.date, byDate),
      ships: Object.fromEntries(VESSEL_TYPES.map((t) => [t, numOr(r[t])])) as Transit['ships'],
      cargo: { ...Object.fromEntries(VESSEL_TYPES.map((t) => [t, numOr(r[CARGO_OF[t]])])), all: numOr(r.capacity) } as Transit['cargo'],
    }));
    const week = series.slice(-7);
    const avg7 = mean(week.map((s) => s.total).filter((t): t is number => t != null));
    const usual = sameDaysBefore(week.map((d) => d.date), byDate);
    const baseline = usual?.median ?? null;
    const change = avg7 != null && baseline ? avg7 / baseline - 1 : null;
    const last30 = rows.slice(-30);
    const sum30 = last30.reduce((s, r) => s + (Number(r.n_total) || 0), 0);
    const mix = Object.fromEntries(VESSEL_TYPES.map((t) => [t, sum30 ? last30.reduce((s, r) => s + (Number(r[t]) || 0), 0) / sum30 : null])) as Chokepoint['mix'];
    // PortWatch's full name where it gives one, else its short name; the slug follows it, never the portid.
    const name = String(m.fullname || m.portname);
    const slug = slugOf(name);
    const caveat = notes.find((n) => n.slug === slug);
    return {
      id: String(m.portid), slug, name, lat: Number(m.lat), lon: Number(m.lon),
      industries: [m.industry_top1, m.industry_top2, m.industry_top3].filter(Boolean).map(String),
      series, lastDate: series.at(-1)?.date ?? null, avg7, baseline, baseYears: usual?.years ?? null, change, status: statusFor(change), mix, byDate,
      ...(caveat ? { caveat } : {}),
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export const chokepoints = (raw: Raw) => parseChokepoints(raw.json('portwatch', 'chokepoints.json'), raw.json('portwatch', 'chokepoints_daily.json'));
