// The nuclear weapons views: /nuclear (FAS warhead estimates since 1945), /nuclear/treaties (NPT and TPNW status) and
// /nuclear/sharing (hosted weapons and nuclear guarantees). Warheads come from the FAS adapter (../adapters/nuclear.ts);
// treaties and sharing are hand-kept facts files, one dated, cited row each, like the alliance histories:
//
// - src/data/nuclear-treaties.csv: place, treaty (npt, tpnw), status (party, signed, not-party, withdrew), date, source.
// - src/data/nuclear-sharing.csv: place, provider (a place id, or "nato"), kind (host, umbrella), status (stated,
//   reported), date, source. "stated" only when a government or alliance has said it; "reported" when FAS reports it.
//
// The build fails on an unknown place, a status it does not know, a missing source or a duplicate row.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { nuclear } from '../adapters/nuclear.ts';
import { NUCLEAR_TEXT as T, type SharingClass, type TreatyClass, type TreatyStatus } from '../i18n/nuclear.en.ts';
import { inSentence } from '../i18n/pages.en.ts';
import { shared } from './data.ts';
import { formatValue } from './format.ts';
import { place } from './places.ts';

/** The warheads CSV's name, at /downloads/<name>.csv. */
export const NUCLEAR_CSV = 'nuclear-warheads';

/** The three pages, in the picker's order; the first is /nuclear itself. */
export const NUCLEAR_PAGES = ['warheads', 'treaties', 'sharing'] as const;
export type NuclearPage = (typeof NUCLEAR_PAGES)[number];

/**
 * When src/data/nuclear-treaties.csv was last checked against the UNODA Treaties Database. Empty until someone has:
 * the file was compiled in a session that could not reach UNODA, so /nuclear/treaties stays hidden until a check
 * sets this date (sample builds show it, to review the page).
 */
export const TREATIES_CHECKED = '';
export const treatiesChecked = () => TREATIES_CHECKED;
/** When src/data/nuclear-sharing.csv was last checked against its sources. */
export const SHARING_CHECKED = '2026-11-02';

/** Class edges for warhead counts, fixed so every year is shaded on one scale: under 100 … 5,000 and over. */
export const WARHEAD_EDGES = [100, 300, 1000, 5000];
export const warheadClass = (v: number) => 1 + WARHEAD_EDGES.filter((e) => v >= e).length;

/** A warhead count as FAS gives it: a whole number, never more precise than FAS's own figure. */
export const warheads = (v: number) => formatValue(Math.round(v), { kind: 'count' });

const nuclearData = shared(nuclear);

/**
 * Former states whose figures the source files under a successor's code (OWID writes the Soviet Union's warheads as
 * Russia's, RUS, through 1991). The figures stay with the successor's shape on the map (the basemap has no Soviet
 * Union); every place that shows a year says the former state's name (docs/territories.md, historical states).
 */
export const FORMER: Record<string, { id: string; until: number }> = { RUS: { id: 'SUN', until: 1991 } };

/** A state's name in a year: the former state's before its end (the Soviet Union to 1991), else its own. */
export function nameIn(id: string, year: number): string {
  const f = FORMER[id];
  return f && year <= f.until ? place(f.id)?.name ?? f.id : place(id)?.name ?? id;
}
/** The id and ISO code a year's figure belongs to, for the CSV: SUN for the Soviet Union's years. */
export const codeIn = (id: string, year: number) => (FORMER[id] && year <= FORMER[id].until ? place(FORMER[id].id)?.iso3 || FORMER[id].id : place(id)?.iso3 ?? id);

export interface WarheadYear { year: number; rows: { id: string; value: number }[]; world: number }
export interface WarheadsModel {
  years: number[];
  /** The latest year: FAS's current estimate. */
  year: number;
  byYear: Record<number, WarheadYear>;
  /** Every state with an estimate in any year, by its latest figure, largest first. */
  states: string[];
  forces: ReturnType<typeof nuclear>['forces'];
  /** The year taken from FAS's current figures because they are newer than the series, or null. */
  extended: number | null;
  /** Which of the split's totals the series counts. */
  measure: 'stockpile' | 'inventory';
  /** The split is for the map's latest year, so it can sit beside that year's totals. */
  splitIsLatest: boolean;
  /** The year FAS's current page gives (its split's year): only it says "FAS estimate, as of early {year}". */
  current: number | null;
}

let wcache: WarheadsModel | null | undefined;
export function warheadsModel(): WarheadsModel | null {
  if (wcache !== undefined) return wcache;
  const d = nuclearData();
  if (!d || !Object.keys(d.inventory).length) return (wcache = null);
  const years = [...new Set(Object.values(d.inventory).flatMap((y) => Object.keys(y).map(Number)))].sort((a, b) => a - b);
  const byYear: Record<number, WarheadYear> = {};
  for (const year of years) {
    const rows = Object.entries(d.inventory).filter(([, y]) => y[year] > 0).map(([id, y]) => ({ id, value: y[year] })).sort((a, b) => b.value - a.value);
    byYear[year] = { year, rows, world: rows.reduce((s, r) => s + r.value, 0) };
  }
  const year = years.at(-1)!;
  const last = (id: string) => { const y = d.inventory[id]; return y[Math.max(...Object.keys(y).map(Number))]; };
  const states = Object.keys(d.inventory).sort((a, b) => last(b) - last(a));
  return (wcache = { years, year, byYear, states, forces: d.forces, extended: d.extended, measure: d.measure, splitIsLatest: d.forces?.year === year, current: d.forces && years.includes(d.forces.year) ? d.forces.year : null });
}

const nameOf = (id: string) => place(id)?.name ?? id;
const shareText = (v: number) => formatValue(v, { kind: 'share' });

/** The warheads view's one-sentence answer: the two largest inventories and their share of the world's. */
export function warheadsLede(m = warheadsModel()): string | null {
  const y = m?.byYear[m.year];
  if (!y || y.rows.length < 2) return null;
  const [a, b] = y.rows;
  return T.lede(inSentence(nameOf(a.id), true), warheads(a.value), inSentence(nameOf(b.id)), warheads(b.value), shareText((a.value + b.value) / y.world), y.year);
}

/** The peak of a series: the largest world total and its year. */
export function peakOf(m: WarheadsModel): { year: number; world: number } {
  return m.years.map((y) => m.byYear[y]).reduce((best, y) => (y.world > best.world ? y : best), m.byYear[m.years[0]]);
}

// Treaties

export interface TreatyRow { place: string; treaty: 'npt' | 'tpnw'; status: TreatyStatus; date: string; source: string }
const STATUSES: TreatyStatus[] = ['party', 'signed', 'not-party', 'withdrew'];

function readCsv(file: string): Record<string, string>[] {
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data', file), 'utf8'));
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Checks one facts row's date (YYYY, YYYY-MM or YYYY-MM-DD, or empty where allowed) and source link. */
function checkRow(file: string, r: Record<string, string>, dateRequired: boolean) {
  if (!place(r.place)) throw new Error(`${file}: unknown place "${r.place}"`);
  if (!/^https?:\/\//.test(r.source)) throw new Error(`${file}: ${r.place} has no source link`);
  if ((r.date || dateRequired) && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(r.date)) throw new Error(`${file}: ${r.place} has a bad date "${r.date}"`);
}

let tcache: Map<string, Partial<Record<'npt' | 'tpnw', TreatyRow>>> | null = null;
/** Each place's NPT and TPNW rows. */
export function treaties(): Map<string, Partial<Record<'npt' | 'tpnw', TreatyRow>>> {
  if (tcache) return tcache;
  const out = new Map<string, Partial<Record<'npt' | 'tpnw', TreatyRow>>>();
  for (const r of readCsv('nuclear-treaties.csv')) {
    checkRow('nuclear-treaties.csv', r, false);
    if (r.treaty !== 'npt' && r.treaty !== 'tpnw') throw new Error(`nuclear-treaties.csv: unknown treaty "${r.treaty}"`);
    if (!STATUSES.includes(r.status as TreatyStatus)) throw new Error(`nuclear-treaties.csv: unknown status "${r.status}" for ${r.place}`);
    if (r.status === 'withdrew' && r.treaty !== 'npt') throw new Error('nuclear-treaties.csv: only the NPT has a withdrawal');
    const o = out.get(r.place) ?? {};
    if (o[r.treaty]) throw new Error(`nuclear-treaties.csv: ${r.place} has two ${r.treaty} rows`);
    o[r.treaty] = { place: r.place, treaty: r.treaty, status: r.status as TreatyStatus, date: r.date, source: r.source };
    out.set(r.place, o);
  }
  return (tcache = out);
}

/** A place's class on the treaties map, from its two statuses; null when UNODA lists it for neither. */
export function treatyClass(id: string): TreatyClass | null {
  const t = treaties().get(id);
  if (!t?.npt) return null;
  if (t.npt.status === 'withdrew') return 'withdrew';
  if (t.npt.status !== 'party') return 'outside';
  return t.tpnw?.status === 'party' ? 'both' : t.tpnw?.status === 'signed' ? 'npt-signed' : 'npt';
}
export const TREATY_CLASSES: TreatyClass[] = ['both', 'npt-signed', 'npt', 'outside', 'withdrew'];

export function treatyCounts() {
  const all = [...treaties().values()];
  const c = (t: 'npt' | 'tpnw', s: TreatyStatus) => all.filter((x) => x[t]?.status === s).length;
  return { npt: c('npt', 'party'), tpnw: c('tpnw', 'party'), tpnwSigned: c('tpnw', 'signed') };
}

export function treatiesLede(): string {
  const c = treatyCounts();
  return T.treatyLede(c.npt, c.tpnw, c.tpnwSigned);
}

// Sharing

export interface SharingRow { place: string; provider: string; kind: 'host' | 'umbrella'; status: 'stated' | 'reported'; date: string; source: string }

let scache: SharingRow[] | null = null;
export function sharingRows(): SharingRow[] {
  if (scache) return scache;
  const seen = new Set<string>();
  scache = readCsv('nuclear-sharing.csv').map((r) => {
    checkRow('nuclear-sharing.csv', r, true);
    if (r.provider !== 'nato' && !place(r.provider)) throw new Error(`nuclear-sharing.csv: unknown provider "${r.provider}"`);
    if (r.kind !== 'host' && r.kind !== 'umbrella') throw new Error(`nuclear-sharing.csv: unknown kind "${r.kind}"`);
    if (r.status !== 'stated' && r.status !== 'reported') throw new Error(`nuclear-sharing.csv: unknown status "${r.status}"`);
    const k = `${r.place}|${r.provider}|${r.kind}`;
    if (seen.has(k)) throw new Error(`nuclear-sharing.csv: ${k} is listed twice`);
    seen.add(k);
    return r as unknown as SharingRow;
  });
  return scache;
}

/** The nine states with nuclear weapons: those with an FAS estimate in the latest year, else the providers named. */
export function armedStates(): string[] {
  const m = warheadsModel();
  return m ? m.byYear[m.year].rows.map((r) => r.id) : ['USA', 'RUS', 'GBR', 'FRA', 'CHN', 'IND', 'PAK', 'ISR', 'PRK'];
}

/** A place's class on the sharing map: armed states first, then a stated host, a reported host, a guarantee. */
export function sharingClass(id: string): SharingClass | null {
  if (armedStates().includes(id)) return 'armed';
  const mine = sharingRows().filter((r) => r.place === id);
  if (mine.some((r) => r.kind === 'host' && r.status === 'stated')) return 'host';
  if (mine.some((r) => r.kind === 'host')) return 'reported';
  if (mine.some((r) => r.kind === 'umbrella')) return 'umbrella';
  return null;
}
export const SHARING_CLASSES: SharingClass[] = ['armed', 'host', 'reported', 'umbrella'];

/**
 * How many countries have each arrangement, counted by arrangement, not by map colour: a host that is also covered by
 * a guarantee counts as a host and as covered. The answer under the title and the world panel both read this.
 */
export function sharingCounts(): Record<SharingClass, number> {
  const rows = sharingRows();
  const places = (f: (r: SharingRow) => boolean) => new Set(rows.filter(f).map((r) => r.place));
  const stated = places((r) => r.kind === 'host' && r.status === 'stated');
  const reported = [...places((r) => r.kind === 'host')].filter((p) => !stated.has(p));
  return { armed: armedStates().length, host: stated.size, reported: reported.length, umbrella: places((r) => r.kind === 'umbrella').size };
}

export function sharingLede(): string {
  const c = sharingCounts();
  return T.sharingLede(c.host, c.reported, c.umbrella);
}

/** Who provides an arrangement, in words. */
export const providerName = (p: string) => T.provider[p] ?? inSentence(nameOf(p));
/** The note on an arrangement: by place and kind, else by provider and kind. */
export const sharingNote = (r: SharingRow) => T.sharingNotes[`${r.kind}:${r.place}`] ?? T.sharingNotes[`${r.kind}:${r.provider}`] ?? '';

// Pages

/** Whether a page has what it needs: FAS's series, a checked treaty file (or a sample build), the sharing file. */
export function nuclearLive(id: NuclearPage, sample: boolean): boolean {
  if (id === 'warheads') return warheadsModel() !== null;
  if (id === 'treaties') return (sample || !!TREATIES_CHECKED) && treaties().size > 0;
  return sharingRows().length > 0;
}

/** Each page's one-sentence answer, for its page and its hub card. */
export function nuclearAnswer(id: string): string | null {
  if (id === 'warheads') return warheadsLede();
  if (id === 'treaties') return treatiesLede();
  if (id === 'sharing') return sharingLede();
  return null;
}
