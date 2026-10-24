// IMF PortWatch chokepoints (portwatch/chokepoints.json and chokepoints_daily.json, ArcGIS
// { features: [{ attributes }] }). Each chokepoint gets its daily transits for the last 365 days,
// a 7-day average against the 365-day mean, a status, and the vessel mix of the last 30 days.
// PortWatch has no country field. Off with the other IMF sources until the IMF allows scheduled
// downloads. Ported from the prototype's src/adapters/portwatch.js.
import { day } from '../../pipeline/sources/portwatch.ts';
import type { Raw } from './core.ts';

/** The chokepoints the site shows, matched loosely (see normaliseName). */
export const CHOKEPOINTS = ['Suez Canal', 'Panama Canal', 'Bosporus Strait', 'Bab el-Mandeb Strait', 'Malacca Strait', 'Strait of Hormuz', 'Cape of Good Hope', 'Gibraltar Strait', 'Dover Strait'];
export const VESSEL_TYPES = ['n_tanker', 'n_container', 'n_dry_bulk', 'n_general_cargo', 'n_roro'] as const;

export type Status = 'disrupted' | 'below' | 'normal' | 'above' | 'unknown';

/** "Strait of Hormuz" and "Hormuz Strait" both → "hormuz". */
export const normaliseName = (name: unknown) => String(name ?? '').toLowerCase().replace(/\b(strait|straits|canal|of|the|channel|passage)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function statusFor(change: number | null): Status {
  if (change == null) return 'unknown';
  if (change <= -0.3) return 'disrupted';
  if (change <= -0.1) return 'below';
  if (change >= 0.15) return 'above';
  return 'normal';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface Chokepoint {
  id: string; name: string; lat: number; lon: number; industries: string[];
  series: { date: string; total: number | null }[]; lastDate: string | null;
  avg7: number | null; baseline: number | null; change: number | null; status: Status;
  mix: Record<(typeof VESSEL_TYPES)[number], number | null>;
}

type Attr = Record<string, unknown>;

export function parseChokepoints(meta: { features?: { attributes: Attr }[] }, daily: { features?: { attributes: Attr }[] }): Chokepoint[] {
  const byId = new Map<string, (Attr & { date: string })[]>();
  for (const { attributes: a } of daily.features ?? []) {
    const date = day(a.date);
    if (date) byId.set(String(a.portid), [...(byId.get(String(a.portid)) ?? []), { ...a, date }]);
  }
  const wanted = CHOKEPOINTS.map(normaliseName);
  const all = (meta.features ?? []).map((f) => f.attributes);
  const shown = all.filter((m) => wanted.includes(normaliseName(m.portname)));
  // No match at all means PortWatch renamed them: show every one rather than none.
  return (shown.length ? shown : all).map((m) => {
    let rows = (byId.get(String(m.portid)) ?? []).sort((x, y) => x.date.localeCompare(y.date));
    if (rows.length) {
      const cutoff = new Date(Date.parse(`${rows.at(-1)!.date}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
      rows = rows.filter((r) => r.date >= cutoff);
    }
    const series = rows.map((r) => ({ date: r.date, total: typeof r.n_total === 'number' ? r.n_total : null }));
    const totals = series.map((s) => s.total).filter((t): t is number => t != null);
    const avg7 = mean(totals.slice(-7));
    const baseline = mean(totals);
    const change = avg7 != null && baseline ? avg7 / baseline - 1 : null;
    const last30 = rows.slice(-30);
    const sum30 = last30.reduce((s, r) => s + (Number(r.n_total) || 0), 0);
    const mix = Object.fromEntries(VESSEL_TYPES.map((t) => [t, sum30 ? last30.reduce((s, r) => s + (Number(r[t]) || 0), 0) / sum30 : null])) as Chokepoint['mix'];
    return {
      id: String(m.portid), name: String(m.portname), lat: Number(m.lat), lon: Number(m.lon),
      industries: [m.industry_top1, m.industry_top2, m.industry_top3].filter(Boolean).map(String),
      series, lastDate: series.at(-1)?.date ?? null, avg7, baseline, change, status: statusFor(change), mix,
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export const chokepoints = (raw: Raw) => parseChokepoints(raw.json('portwatch', 'chokepoints.json'), raw.json('portwatch', 'chokepoints_daily.json'));
