// The Sources page, generated on each build: every source the runner fetches, every hand import and every source
// still waiting on a key, with what it feeds, its licence, how often we check it, when it was last refreshed and
// its status. Corrections come from src/data/corrections.csv (date, page, what changed), newest first.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES } from '../../pipeline/sources/index.ts';
import { IMPORTED } from '../../pipeline/sources/imported.ts';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { INDICATORS } from '../data/indicators.ts';
import { LICENCES, type Licence } from '../data/licences.ts';
import { INDICATOR_TEXT } from '../i18n/en.ts';
import { SOURCE_FEEDS, SOURCES_PAGE as T } from '../i18n/pages.en.ts';
import { data, licenceOf } from './data.ts';

export type SourceState = 'live' | 'delayed' | 'key' | 'manual' | 'soon';

export interface SourceRow {
  id: string;
  name: string;
  feeds: string[];
  licence?: Licence;
  every: string;
  last?: string;
  state: SourceState;
  /** Why it is off, for a source waiting on a key or permission. */
  why?: string;
}

/** Sources with no adapter yet because they wait on a key or permission (their measures are listed as pending). */
const WAITING: Record<string, string> = {
  eia: 'EIA international energy data', ember: 'Ember electricity data', ucdp: 'UCDP conflict data', ipc: 'IPC food security analyses',
};

function feedsOf(id: string): string[] {
  const measures = Object.values(INDICATORS).filter((i) => (Array.isArray(i.source) ? i.source : [i.source]).includes(id)).map((i) => INDICATOR_TEXT[i.id].label);
  return [...new Set([...(SOURCE_FEEDS[id] ?? []), ...measures])];
}

export function sourceRows(): SourceRow[] {
  const snap = data().snapshot.sources;
  const status = data().status?.sources ?? {};
  const out: SourceRow[] = [];
  for (const s of SOURCES) {
    const off = s.enabled !== true;
    out.push({
      id: s.id, name: licenceOf(s.id)?.name ?? s.name, feeds: feedsOf(s.id), licence: licenceOf(s.id), every: T.every(s.every),
      last: snap[s.id]?.fetched ?? status[s.id]?.lastSuccess ?? undefined,
      state: off ? 'key' : status[s.id]?.stale ? 'delayed' : 'live', why: off ? String(s.enabled) : undefined,
    });
  }
  for (const s of IMPORTED) {
    const imp = snap[s.id]?.imported;
    const dates = imp ? Object.values(imp).map((x) => x.date).filter((x): x is string => !!x).sort() : [];
    out.push({ id: s.id, name: licenceOf(s.id)?.name ?? s.name, feeds: feedsOf(s.id), licence: licenceOf(s.id), every: T.onRelease(s.release), last: dates.at(-1) ?? snap[s.id]?.fetched, state: 'manual' });
  }
  const seen = new Set(out.map((r) => r.id));
  for (const l of LICENCES) if (!seen.has(l.source)) out.push({ id: l.source, name: l.name, feeds: feedsOf(l.source), licence: l, every: '–', state: 'key', why: l.note });
  for (const [id, name] of Object.entries(WAITING)) {
    const reason = Object.values(INDICATORS).find((i) => i.source === id && i.pending)?.pending;
    out.push({ id, name, feeds: feedsOf(id), every: '–', state: 'key', why: reason });
  }
  return out;
}

export interface Correction { date: string; page: string; what: string }

export function corrections(): Correction[] {
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data/corrections.csv'), 'utf8'));
  return rows.filter((r) => r.length >= 3 && r[0]).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])) as unknown as Correction)
    .sort((a, b) => b.date.localeCompare(a.date));
}
