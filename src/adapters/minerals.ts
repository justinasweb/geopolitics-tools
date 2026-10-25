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
/** Each row says whether its figure is estimated: in the notes ("Estimated."), or as the detail in older files. */
const isEstimated = (r: Row | undefined) => Boolean(r) && (/^estimated?\b/i.test((r!.Statistics_detail ?? '').trim()) || /^estimated\b/i.test((r!.Notes ?? '').trim()));
export const slug = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/:/g, ' ').trim().replace(/[^a-z0-9]+/g, '-');

export function parseValue(raw: string | undefined): { value: number | null; withheld?: boolean; small?: boolean } {
  const v = String(raw ?? '').trim();
  if (v === 'W') return { value: null, withheld: true };
  if (v === 's') return { value: 0, small: true };
  if (v === '—' || v === '-' || v === '–') return { value: 0 };
  const n = Number(v.replace(/[,\s]/g, ''));
  return { value: v !== '' && Number.isFinite(n) ? n : null };
}

export interface Producer {
  place: string | null; label: string; value: number | null; share: number | null; prevValue: number | null; withheld: boolean; small: boolean;
  /** USGS marks this figure as estimated ("Estimated." in the notes, or an "Estimated" detail). */
  estimated: boolean;
  /** The release's own note on this figure ("Production quota; does not include undocumented production."). */
  note: string | null;
}

export interface MineralYear {
  id: string;
  /** The release's label ("Rare Earths"); display names are in the per-language text. */
  label: string;
  unit: string;
  year: number;
  /** The world total is an estimate (or, without a world row, any listed figure is). */
  estimated: boolean;
  world: number | null;
  worldPrev: number | null;
  /** Herfindahl–Hirschman index on listed producers (0–10,000); "other countries" is treated as fragmented. */
  hhi: number;
  topShare: number | null;
  /** Largest first. */
  producers: Producer[];
  /** "Other countries": the release's own figure when it has one, else what the world total leaves. */
  other: { value: number | null; share: number | null };
  /** The release's note on the world total ("Excludes U.S. production."). */
  worldNote: string | null;
}

export interface Mineral extends MineralYear {
  years: number[];
  byYear: Record<number, MineralYear>;
  history: Record<string, { year: number; share: number | null }[]>;
  /** What is measured: mine production, or primary (smelter or refinery) production where nothing is mined as such (gallium). */
  measure: 'mine' | 'primary';
  /** What the figures count, from the chapter's "(Data in metric tons, lithium content, …)": "lithium content". */
  basis: string | null;
  /** The chapter's note on revised production figures, as USGS words it. */
  revisions: string | null;
}

/**
 * A row's note without the estimate marker USGS puts first ("Estimated. -- Overseas territory of France." →
 * "Overseas territory of France."); null when nothing else is said.
 */
export function cleanNote(n: string | undefined): string | null {
  const parts = String(n ?? '').split(/\s+--\s+/).map((x) => x.trim()).filter((x) => x && !/^(estimated|reported)\.?$/i.test(x));
  return parts.length ? parts.join(' ') : null;
}

/**
 * "(Data in metric tons, lithium content, unless otherwise specified)" → "lithium content", without abbreviations
 * ("rare-earth-oxide (REO) equivalent" → "rare-earth-oxide equivalent"); null for plain weight.
 */
export function basisOf(otherNotes: string | undefined): string | null {
  const m = /\(Data in [^,]+?(?:, (.+?))?,? unless otherwise specified\)/i.exec(otherNotes ?? '');
  return m?.[1]?.replace(/\s*\([A-Z]+\)/g, '').trim() || null;
}

/** The sentences of the chapter's notes that say 2024 production was revised. */
export function revisionsOf(otherNotes: string | undefined): string | null {
  const s = String(otherNotes ?? '').split(/\s+--\s+/).flatMap((x) => x.split(/(?<=\.)\s+(?=[A-Z])/))
    .filter((x) => /revis/i.test(x) && /production/i.test(x) && !/^reserves/i.test(x.trim()));
  return s.length ? s.join(' ') : null;
}

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
  const otherRow = [...cur.values()].find((r) => isOther(r.Country));
  const reportedOther = otherRow ? parseValue(otherRow.Value).value : null;
  // The world total is the countries plus "Other countries", rounded (to 900,000 or 1,800,000), so the parts can
  // add up to more than it; shares are of whichever is larger, so they never pass 100%.
  const denom = Math.max(world ?? 0, known + (reportedOther ?? 0)) || null;
  const producers = parsed
    // "—" is zero: USGS lists the country (often the United States) as producing none, so it is not a producer.
    .filter((p) => p.withheld || p.small || (p.value != null && p.value > 0))
    .map(({ r, value, withheld, small }) => ({
      place: m.match(r.Country), label: r.Country.trim(), value, share: value != null && denom ? value / denom : null,
      prevValue: prev.has(r.Country) ? parseValue(prev.get(r.Country)!.Value).value : null, withheld: Boolean(withheld), small: Boolean(small),
      estimated: isEstimated(r), note: cleanNote(r.Notes),
    }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const otherValue = reportedOther ?? (denom != null ? Math.max(0, denom - known) : null);
  const worldRow = [...cur.values()].find((r) => isWorld(r.Country));
  const sample = countryRows[0] ?? worldRow ?? ({} as Row);
  return {
    id: slug(label), label, unit: sample.Unit ?? '', year: Number(year), estimated: worldRow ? isEstimated(worldRow) : producers.some((p) => p.estimated),
    world, worldPrev: prev.size ? worldOf(prev) : null,
    hhi: Math.round(producers.reduce((s, p) => s + (p.share ? (p.share * 100) ** 2 : 0), 0)),
    topShare: producers[0]?.share ?? null, producers, other: { value: otherValue, share: denom && otherValue != null ? otherValue / denom : null },
    worldNote: worldRow ? cleanNote(worldRow.Notes) : null,
  };
}

function buildMineral(label: string, rows: Row[], statistic: string): Mineral {
  const years = [...new Set(rows.map((r) => r.Year))].filter(Boolean).sort();
  const byYear: Record<number, MineralYear> = {};
  years.forEach((y, i) => { byYear[Number(y)] = buildYear(label, rows, y, i > 0 ? years[i - 1] : null); });
  const history: Mineral['history'] = {};
  for (const y of years) {
    for (const p of byYear[Number(y)].producers) if (p.place) (history[p.place] ??= []).push({ year: Number(y), share: p.withheld ? null : p.share });
  }
  const notes = rows.find((r) => r['Other notes'])?.['Other notes'];
  return {
    ...byYear[Number(years.at(-1))], years: years.map(Number), byYear, history,
    measure: /^primary/i.test(statistic) ? 'primary' : 'mine', basis: basisOf(notes), revisions: revisionsOf(notes),
  };
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
    return detail && !isEstimateMarker(detail) ? { ...r, Statistics: detail, Statistics_detail: '' } : r;
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
      for (const d of details) all.push(buildMineral(lower.includes(d.toLowerCase()) ? d : `${commodity}: ${d}`, prod.filter((r) => r.Statistics_detail === d), stat));
    } else all.push(buildMineral(commodity, prod, stat));
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
