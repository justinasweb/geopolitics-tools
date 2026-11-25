// IPC and Cadre Harmonisé acute food insecurity analyses (ipc/country.json, from pipeline/sources/ipc.ts, in the IPC
// API's own format). Countries are named by ISO2 code; IPC's regional analysis ("LAC") is not a country and is left out
// (codes.csv). Each analysis covers part of a country's people (the population analysed) for one period, its latest
// (current, projection or projection update), and counts the people in each phase: 1 minimal, 2 stressed, 3 crisis,
// 4 emergency, 5 catastrophe. Phase 3 or above is "in food crisis". Phase 5 counts people in catastrophe; famine is a
// classification of an area, which this endpoint does not give. An analysis with no people in any phase (some from
// 2012–2014) has no figures and is left out: blank, not zero. ipc/analyses.json, IPC's list of analyses, gives each its
// link and, in the title, the area it covers when that is not the whole place ("Palestine (Gaza Strip) - …").
import { type Raw, type Series, matcher, num, put } from './core.ts';

type Row = Record<string, unknown>;

export interface Analysis {
  id: number;
  place: string;
  title: string;
  /** IPC or CH (Cadre Harmonisé, West Africa, the Sahel and a few others), from the analysis's title: the API has no field for it. */
  system: 'IPC' | 'CH';
  /** Which of the analysis's periods the figures are for: IPC's C, P and A. */
  period: 'current' | 'projection' | 'update';
  /** The period's first and last month, YYYY-MM: the analysis is valid for these months. */
  from: string;
  to: string;
  /** The year the analysis was made, which can be before its period. */
  year: number;
  analysed: number;
  /** The population IPC gives for the whole country with the analysis, when it gives one: analyses can cover only part
   *  of a country (Yemen's south, Pakistan's Punjab). */
  population: number | null;
  /** The area the analysis covers when IPC's list of analyses names one in its title ("Gaza Strip"); never from a hand note. */
  area: string | null;
  /** The analysis's page on ipcinfo.org, from IPC's list of analyses. */
  link: string | null;
  phases: [number, number, number, number, number];
  crisis: number;
  /** Phase 3 or above as a share of the population analysed. */
  share: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 2026" → "2026-11"; null for anything else. */
export function ipcMonth(s: unknown): string | null {
  const m = String(s ?? '').trim().match(/^([A-Z][a-z]{2})\w* (\d{4})$/);
  const i = m ? MONTHS.indexOf(m[1]) : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}` : null;
}
/** The area in a title from IPC's list of analyses: "Palestine (Gaza Strip) - Acute Food Insecurity …" → "Gaza Strip". */
export const areaIn = (title: unknown) => String(title ?? '').match(/^[^(–-]*\(([^)]+)\)\s+[-–]\s/)?.[1].trim() ?? null;
const PERIOD: Record<string, Analysis['period']> = { C: 'current', P: 'projection', A: 'update' };

export function parseIpc(rows: Row[], list: Row[] = []): Analysis[] {
  const m = matcher('ipc', 'iso2');
  const listed = new Map(list.map((r) => [String(r.id), r]));
  const out: Analysis[] = [];
  for (const r of rows) {
    if (r.condition && r.condition !== 'A') continue;
    const from = ipcMonth(r.from);
    const to = ipcMonth(r.to);
    if (!from || !to) continue;
    const place = m.match(String(r.country ?? ''));
    if (!place) continue;
    const list = Array.isArray(r.phases) ? (r.phases as Row[]) : [];
    const ph = [1, 2, 3, 4, 5].map((k) => num(list.find((p) => Number(p.phase) === k)?.population) ?? 0) as Analysis['phases'];
    const total = ph.reduce((a, b) => a + b, 0);
    if (!total) continue;
    const crisis = ph[2] + ph[3] + ph[4];
    // A few early analyses give a population analysed far below the people they count in phases (Pakistan 2013: 144).
    const analysed = Math.max(num(r.estimated_population) ?? 0, total);
    const title = String(r.title ?? '').trim();
    const l = listed.get(String(r.id));
    out.push({
      id: Number(r.id), place, title, system: /cadre harmonis/i.test(title) || /\bCH\b/.test(title) ? 'CH' : 'IPC', period: PERIOD[String(r.ipc_period)] ?? 'current',
      from, to, year: num(r.year) ?? Number(from.slice(0, 4)), analysed, population: num(r.population) || null, area: l ? areaIn(l.title) : null, link: l?.link ? String(l.link) : null, phases: ph, crisis, share: crisis / analysed,
    });
  }
  // Two analyses can share a period (a March update of November's projection): the later analysis comes last.
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.year - b.year || a.id - b.id);
}

export const ipc = (raw: Raw) => parseIpc(raw.json<Row[]>('ipc', 'country.json'), raw.has('ipc', 'analyses.json') ? raw.json<Row[]>('ipc', 'analyses.json') : []);

/** The analysis covered less than the whole country: IPC's population for the country is known and the people analysed
 *  are under 95% of it (Yemen's south, Pakistan's Punjab). */
export const isPartial = (a: Analysis) => a.population !== null && a.analysed < a.population * 0.95;

/** Whether an analysis is valid on a day (YYYY-MM-DD): the day's month is within its period. */
export const inForce = (a: Analysis, day: string) => a.from <= day.slice(0, 7) && day.slice(0, 7) <= a.to;

/** Each place's latest analysis (by the start of its period), or its latest valid on `day` when one is given. */
export function latestOf(list: Analysis[], day?: string): Map<string, Analysis> {
  const out = new Map<string, Analysis>();
  for (const a of list) if (!day || inForce(a, day)) out.set(a.place, a);
  return out;
}

/** The latest analysis of each place starting in each year. */
export function latestByYear(list: Analysis[]): Record<string, Record<number, Analysis>> {
  const out: Record<string, Record<number, Analysis>> = {};
  for (const a of list) (out[a.place] ??= {})[Number(a.from.slice(0, 4))] = a;
  return out;
}

/** 1 where the year's analysis (as hungerSeries takes it) covered part of the country: the values to tag Partial. */
export function partialSeries(list: Analysis[]): Series {
  const out: Series = {};
  for (const [id, years] of Object.entries(latestByYear(list))) for (const [y, a] of Object.entries(years)) if (isPartial(a)) put(out, id, Number(y), 1);
  return out;
}

/** People in Phase 3 or above, or their share of the population analysed, by place and year (the year's latest analysis). */
export function hungerSeries(list: Analysis[], measure: 'people' | 'share'): Series {
  const out: Series = {};
  for (const [id, years] of Object.entries(latestByYear(list))) {
    for (const [y, a] of Object.entries(years)) put(out, id, Number(y), measure === 'people' ? a.crisis : a.share);
  }
  return out;
}
