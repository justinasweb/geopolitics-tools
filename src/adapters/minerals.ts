// USGS Mineral Commodity Summaries data release (usgs-minerals/MCS<year>_Commodities_Data.csv,
// imported; the newest edition in the snapshot is read). Columns: MCS chapter, Section, Commodity,
// Country, Statistics, Statistics_detail, Unit, Year, Value, Notes, Other notes. A value can be a
// code: W (withheld), s (small), NA, XX (no world total), — (zero). Ported from the prototype's
// src/adapters/usgs.js.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, matcher } from './core.ts';

/** The minerals the site shows, in order, by the release's commodity (or detail) label. */
export const MINERALS = ['Lithium', 'Cobalt', 'Rare earths', 'Gallium', 'Graphite (natural)', 'Nickel', 'Palladium', 'Tungsten'];

type Row = Record<string, string>;

const isWorld = (c: string) => /^world\b/i.test(c.trim());
const isAggregate = (c: string) => /^(world|other countries|total|rest of world)/i.test(c.trim());
const isOther = (c: string) => /^(other countries|rest of world)/i.test(c.trim());
const isEstimateMarker = (d: string | undefined) => /^(estimated?|e|preliminary|)$/i.test((d ?? '').trim());
export const slug = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/:/g, ' ').trim().replace(/[^a-z0-9]+/g, '-');

export function parseValue(raw: string | undefined): { value: number | null; withheld?: boolean; small?: boolean } {
  const v = String(raw ?? '').trim();
  if (v === 'W') return { value: null, withheld: true };
  if (v === 's') return { value: 0, small: true };
  if (v === '—' || v === '-' || v === '–') return { value: 0 };
  const n = Number(v.replace(/[,\s]/g, ''));
  return { value: v !== '' && Number.isFinite(n) ? n : null };
}

export interface Producer { place: string | null; label: string; value: number | null; share: number | null; prevValue: number | null; withheld: boolean; small: boolean }

export interface MineralYear {
  id: string;
  /** The release's label ("Rare Earths"); display names are in the per-language text. */
  label: string;
  unit: string;
  year: number;
  estimated: boolean;
  world: number | null;
  worldPrev: number | null;
  /** Herfindahl–Hirschman index on listed producers (0–10,000); "other countries" is treated as fragmented. */
  hhi: number;
  topShare: number | null;
  /** Largest first. */
  producers: Producer[];
  other: { value: number | null; share: number | null };
}

export interface Mineral extends MineralYear { years: number[]; byYear: Record<number, MineralYear>; history: Record<string, { year: number; share: number | null }[]> }

/** "Mine production" if there is one, else a production statistic with a world row, else any production statistic. */
function chooseStatistic(rows: Row[]): string | null {
  const labels = [...new Set(rows.map((r) => r.Statistics))];
  return labels.find((l) => /^mine production/i.test(l))
    ?? labels.find((l) => /production/i.test(l) && rows.some((r) => r.Statistics === l && isWorld(r.Country)))
    ?? labels.find((l) => /production/i.test(l))
    ?? null;
}

function buildYear(label: string, rows: Row[], year: string, prevYear: string | null): MineralYear {
  const m = matcher('usgs-minerals', 'name');
  const firstByCountry = (yr: string) => {
    const out = new Map<string, Row>();
    for (const r of rows) if (r.Year === yr && !out.has(r.Country)) out.set(r.Country, r);
    return out;
  };
  const cur = firstByCountry(year);
  const prev = prevYear ? firstByCountry(prevYear) : new Map<string, Row>();
  // The world total: its own row if the release has one, else the listed countries plus "Other countries".
  const worldOf = (rs: Map<string, Row>) => {
    const row = [...rs.values()].find((r) => isWorld(r.Country));
    const v = row ? parseValue(row.Value).value : null;
    if (v != null) return v;
    let sum = 0;
    let any = false;
    for (const r of rs.values()) {
      if (isAggregate(r.Country) && !isOther(r.Country)) continue;
      const x = parseValue(r.Value).value;
      if (x != null) { sum += x; any = true; }
    }
    return any ? sum : null;
  };
  const world = worldOf(cur);
  const countryRows = [...cur.values()].filter((r) => !isAggregate(r.Country) && r.Country.trim() !== '');
  const parsed = countryRows.map((r) => ({ r, ...parseValue(r.Value) }));
  const known = parsed.reduce((s, p) => s + (p.value ?? 0), 0);
  // The world total is rounded, so listed countries can add up to a little more; shares never pass 100%.
  const denom = Math.max(world ?? 0, known) || null;
  const producers = parsed
    .filter((p) => p.value != null || p.withheld)
    .map(({ r, value, withheld, small }) => ({
      place: m.match(r.Country), label: r.Country.trim(), value, share: value != null && denom ? value / denom : null,
      prevValue: prev.has(r.Country) ? parseValue(prev.get(r.Country)!.Value).value : null, withheld: Boolean(withheld), small: Boolean(small),
    }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const otherValue = denom != null ? Math.max(0, denom - known) : null;
  const sample = countryRows[0] ?? [...cur.values()].find((r) => isWorld(r.Country)) ?? ({} as Row);
  return {
    id: slug(label), label, unit: sample.Unit ?? '', year: Number(year), estimated: /estimat/i.test(`${sample.Statistics_detail ?? ''} ${sample.Notes ?? ''}`),
    world, worldPrev: prev.size ? worldOf(prev) : null,
    hhi: Math.round(producers.reduce((s, p) => s + (p.share ? (p.share * 100) ** 2 : 0), 0)),
    topShare: producers[0]?.share ?? null, producers, other: { value: otherValue, share: denom && otherValue != null ? otherValue / denom : null },
  };
}

function buildMineral(label: string, rows: Row[]): Mineral {
  const years = [...new Set(rows.map((r) => r.Year))].filter(Boolean).sort();
  const byYear: Record<number, MineralYear> = {};
  years.forEach((y, i) => { byYear[Number(y)] = buildYear(label, rows, y, i > 0 ? years[i - 1] : null); });
  const history: Mineral['history'] = {};
  for (const y of years) {
    for (const p of byYear[Number(y)].producers) if (p.place) (history[p.place] ??= []).push({ year: Number(y), share: p.withheld ? null : p.share });
  }
  return { ...byYear[Number(years.at(-1))], years: years.map(Number), byYear, history };
}

/**
 * The real release mixes US-only "Salient Statistics" rows with the world table ("World Mine
 * Production and Reserves" and the like); only the world table has every country, so when there is
 * one only its rows are used. There the measure sits in Statistics_detail ("Mine production:
 * Palladium"), with the world total marked ": rounded"; that detail becomes the statistic.
 */
function normalise(all: Row[]): Row[] {
  if (!all.some((r) => /^world/i.test(r.Section ?? ''))) return all;
  return all.filter((r) => /^world/i.test(r.Section ?? '')).map((r) => {
    const detail = (r.Statistics_detail ?? '').replace(/[:,]\s*rounded\s*$/i, '').trim();
    return detail ? { ...r, Statistics: detail, Statistics_detail: '' } : r;
  });
}

/** The shown minerals, in MINERALS order; every usable one if none of them is in the release. */
export function parseMinerals(text: string): Mineral[] {
  const byCommodity = new Map<string, Row[]>();
  for (const r of normalise(csvRecords(text))) if (r.Commodity) byCommodity.set(r.Commodity, [...(byCommodity.get(r.Commodity) ?? []), r]);
  const lower = MINERALS.map((n) => n.toLowerCase());
  const all: Mineral[] = [];
  for (const [commodity, rows] of byCommodity) {
    const stat = chooseStatistic(rows);
    if (!stat) continue;
    const prod = rows.filter((r) => r.Statistics === stat);
    // Some chapters split one statistic by detail (platinum-group metals → Palladium, Platinum).
    const details = [...new Set(prod.map((r) => r.Statistics_detail).filter((d) => !isEstimateMarker(d)))];
    if (details.length > 1) {
      for (const d of details) all.push(buildMineral(lower.includes(d.toLowerCase()) ? d : `${commodity}: ${d}`, prod.filter((r) => r.Statistics_detail === d)));
    } else all.push(buildMineral(commodity, prod));
  }
  const usable = all.filter((x) => x.producers.length >= 2);
  const shown = usable.filter((x) => lower.includes(x.label.toLowerCase())).sort((a, b) => lower.indexOf(a.label.toLowerCase()) - lower.indexOf(b.label.toLowerCase()));
  return shown.length ? shown : usable.sort((a, b) => a.label.localeCompare(b.label));
}

/** The newest MCS edition in the snapshot. */
export function minerals(raw: Raw): Mineral[] {
  const file = raw.list('usgs-minerals').filter((f) => /^MCS\d{4}_Commodities_Data\.csv$/.test(f)).at(-1);
  if (!file) throw new Error('usgs-minerals/MCS<year>_Commodities_Data.csv is not in the snapshot');
  return parseMinerals(raw.text('usgs-minerals', file));
}
