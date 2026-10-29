// The alliance history views (/blocs/{bloc}/history): membership year by year from each grouping's founding, for the
// 11 groupings with a history. Spans come from src/data/bloc-history.csv, one row per membership (a country that left
// and rejoined has two), years only; a span's `to` is the year the country left. The membership table (./blocs.ts)
// must agree with the spans still open, which the tests check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { BLOCS_CHECKED } from './blocs.ts';
import { place } from './places.ts';
import { HISTORY_TEXT } from '../i18n/blocs.en.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';

export const HISTORY_BLOCS = ['nato', 'eu', 'g7', 'g20', 'brics', 'sco', 'asean', 'opec', 'csto', 'quad', 'oecd'];
/** The last year a history shows: the year the membership table was checked. */
export const LAST_YEAR = Number(BLOCS_CHECKED.slice(0, 4));

export interface Span { place: string; from: number; to: number | null }
export type Status = 'joined' | 'member' | 'left' | 'former';
/** Map classes: joined that year darkest, then members; left that year and former members light. */
export const STATUS_CLASS: Record<Status, number> = { joined: 5, member: 3, left: 2, former: 1 };

export interface HistoryYear { year: number; members: string[]; joined: string[]; left: string[] }
export interface HistoryPage {
  id: string;
  spans: Span[];
  years: number[];
  byYear: Record<number, HistoryYear>;
  /** Years when someone joined or left, oldest first. */
  changes: number[];
  /** Every place that has ever been a member, by first year joined. */
  ever: string[];
}

let spans: Map<string, Span[]> | null = null;
/** Membership spans by grouping. Fails on an unknown place or grouping, or a span that ends before it starts. */
export function historySpans(): Map<string, Span[]> {
  if (spans) return spans;
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data/bloc-history.csv'), 'utf8'));
  const at = (k: string) => head.indexOf(k);
  const out = new Map<string, Span[]>(HISTORY_BLOCS.map((b) => [b, []]));
  for (const r of rows) {
    const b = r[at('bloc')]?.trim();
    if (!b) continue;
    const p = r[at('place')].trim();
    const from = Number(r[at('from')]);
    const to = r[at('to')]?.trim() ? Number(r[at('to')]) : null;
    if (!out.has(b)) throw new Error(`bloc-history.csv: unknown grouping "${b}"`);
    if (!place(p)) throw new Error(`bloc-history.csv: unknown place "${p}" in ${b}`);
    if (!from || (to !== null && to < from)) throw new Error(`bloc-history.csv: bad years for ${p} in ${b}`);
    out.get(b)!.push({ place: p, from, to });
  }
  spans = out;
  return out;
}

/** A place's standing in a grouping in a year, or null if it has never been a member by then. */
export function statusIn(ss: Span[], p: string, year: number): Status | null {
  const mine = ss.filter((s) => s.place === p && s.from <= year);
  if (!mine.length) return null;
  if (mine.some((s) => s.to === year)) return 'left';
  if (mine.some((s) => s.from === year)) return 'joined';
  if (mine.some((s) => s.to === null || s.to > year)) return 'member';
  return 'former';
}

function buildPage(id: string): HistoryPage {
  const ss = historySpans().get(id)!;
  const first = Math.min(...ss.map((s) => s.from));
  const years = Array.from({ length: LAST_YEAR - first + 1 }, (_, i) => first + i);
  const ever = [...new Set([...ss].sort((a, b) => a.from - b.from || a.place.localeCompare(b.place)).map((s) => s.place))];
  const byYear: Record<number, HistoryYear> = {};
  for (const y of years) {
    const st = ever.map((p) => [p, statusIn(ss, p, y)] as const);
    byYear[y] = {
      year: y,
      members: st.filter(([, s]) => s === 'member' || s === 'joined').map(([p]) => p),
      joined: st.filter(([, s]) => s === 'joined').map(([p]) => p),
      left: st.filter(([, s]) => s === 'left').map(([p]) => p),
    };
  }
  // A country that joined and left in the same year (Indonesia in OPEC, 2016) shows as having left, and counts in both lists.
  for (const s of ss) if (s.to === s.from) byYear[s.from].joined.push(s.place);
  const changes = years.filter((y) => byYear[y].joined.length || byYear[y].left.length);
  return { id, spans: ss, years, byYear, changes, ever };
}

let cache: HistoryPage[] | null = null;
export function historyPages(): HistoryPage[] {
  cache ??= HISTORY_BLOCS.map(buildPage);
  return cache;
}
export const historyPage = (id: string) => historyPages().find((p) => p.id === id);

/** A place's spans in a grouping, as text: "1949–", "1962–2009, 2016". */
export const spanText = (ss: Span[], p: string) => ss.filter((s) => s.place === p).map((s) => (s.to === null ? `${s.from}–` : s.to === s.from ? String(s.from) : `${s.from}–${s.to}`)).join(', ');

/** The view's answer in one sentence (founding members, members now, changes): its page and its hub card. */
export function historyLede(id: string): string | null {
  const p = historyPage(id);
  if (!p) return null;
  const first = p.years[0], last = p.years.at(-1)!;
  return HISTORY_TEXT.lede(BLOC_TEXT[id] ?? id, first, p.byYear[first].members.length, p.byYear[last].members.length, last, p.changes.length);
}
