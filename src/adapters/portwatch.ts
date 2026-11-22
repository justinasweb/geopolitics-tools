// IMF PortWatch chokepoints (portwatch/chokepoints.json and chokepoints_daily.json, ArcGIS
// { features: [{ attributes }] }), fetched or imported by hand (D22). Each chokepoint gets its daily transits for the
// last 365 days, with each day's usual range; a 7-day average against the 365-day mean, and a status from it; the
// vessel mix of the last 30 days; and its ships and estimated cargo by vessel type for each day.
//
// What "usual" means here. The status and the page's "below its usual level" compare the last 7 days' average with
// the mean of the last 365 days (the baseline). The chart's usual range is something else, drawn for context: for
// each day, the lowest and highest count on the same calendar day in each of the three years before. A day missing
// in any of those years has no range (a gap in the band), so the band never narrows to one or two years unannounced.
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

/** The 7-day average against the 365-day mean: 30% or more below is disrupted, 10% below, 15% above. */
export function statusFor(change: number | null): Status {
  if (change == null) return 'unknown';
  if (change <= -0.3) return 'disrupted';
  if (change <= -0.1) return 'below';
  if (change >= 0.15) return 'above';
  return 'normal';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const numOr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

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
  avg7: number | null; baseline: number | null; change: number | null; status: Status;
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
    const totals = series.map((s) => s.total).filter((t): t is number => t != null);
    const avg7 = mean(totals.slice(-7));
    const baseline = mean(totals);
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
      series, lastDate: series.at(-1)?.date ?? null, avg7, baseline, change, status: statusFor(change), mix,
      ...(caveat ? { caveat } : {}),
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export const chokepoints = (raw: Raw) => parseChokepoints(raw.json('portwatch', 'chokepoints.json'), raw.json('portwatch', 'chokepoints_daily.json'));
