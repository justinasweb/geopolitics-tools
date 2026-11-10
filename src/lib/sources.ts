// The Sources page, generated on each build: every source the runner fetches, every hand import and every source
// still waiting on a key, with what it feeds, its licence, how often we check it, when it was last refreshed and
// its status. Corrections come from src/data/corrections.csv (date, page, what changed), newest first: only changes to
// figures that were live on the site, not fixes made before launch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES } from '../../pipeline/sources/index.ts';
import { IMPORTED } from '../../pipeline/sources/imported.ts';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { INDICATORS } from '../data/indicators.ts';
import { LICENCE_OF, LICENCES, type Licence } from '../data/licences.ts';
import { treatiesChecked } from './nuclear.ts';
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

function feedsOf(id: string): string[] {
  const measures = Object.values(INDICATORS).filter((i) => (Array.isArray(i.source) ? i.source : [i.source]).includes(id)).map((i) => INDICATOR_TEXT[i.id].label);
  return [...new Set([...(SOURCE_FEEDS[id] ?? []), ...measures])];
}

/** Sources kept by hand in the repository, checked against the publisher on a schedule: when they were last checked. */
const HAND_KEPT: Record<string, { every: string; checked: () => string | undefined }> = {
  unoda: { every: 'monthly', checked: () => treatiesChecked() || undefined },
};

/**
 * One row per source in the licence table, so the page's count is the licence table's (the one list every count reads).
 * A hand import kept under another source's licence (the FAS table under FAS) adds its date to that source's row.
 */
export function sourceRows(): SourceRow[] {
  const snap = data().snapshot.sources;
  const status = data().status?.sources ?? {};
  const out: SourceRow[] = [];
  const importDate = (id: string) => {
    const imp = snap[id]?.imported;
    const dates = imp ? Object.values(imp).map((x) => x.date).filter((x): x is string => !!x).sort() : [];
    return dates.at(-1) ?? snap[id]?.fetched;
  };
  for (const s of SOURCES) {
    // A switched-off fetcher whose files are imported by hand (the IMF WEO) is listed as the import.
    if (s.enabled !== true && IMPORTED.some((x) => x.id === s.id)) continue;
    const off = s.enabled !== true;
    const parts = IMPORTED.filter((x) => LICENCE_OF[x.id] === s.id).map((x) => importDate(x.id)).filter((x): x is string => !!x);
    const last = [snap[s.id]?.fetched ?? status[s.id]?.lastSuccess ?? undefined, ...parts].filter((x): x is string => !!x).sort().at(-1);
    out.push({
      id: s.id, name: licenceOf(s.id)?.name ?? s.name, feeds: feedsOf(s.id), licence: licenceOf(s.id), every: T.every(s.every), last,
      state: off ? 'key' : status[s.id]?.stale ? 'delayed' : 'live', why: off ? String(s.enabled) : undefined,
    });
  }
  for (const s of IMPORTED) {
    if (LICENCE_OF[s.id]) continue;
    out.push({ id: s.id, name: licenceOf(s.id)?.name ?? s.name, feeds: feedsOf(s.id), licence: licenceOf(s.id), every: T.onRelease(s.release), last: importDate(s.id), state: 'manual' });
  }
  for (const [id, h] of Object.entries(HAND_KEPT)) {
    const l = licenceOf(id);
    if (l) out.push({ id, name: l.name, feeds: feedsOf(id), licence: l, every: T.byHand(h.every), last: h.checked(), state: 'manual' });
  }
  const seen = new Set(out.map((r) => r.id));
  for (const l of LICENCES) {
    if (seen.has(l.source)) continue;
    out.push({ id: l.source, name: l.name, feeds: feedsOf(l.source), licence: l, every: '–', state: 'key', why: l.note });
  }
  return out;
}

export interface Correction { date: string; page: string; what: string }

export function corrections(): Correction[] {
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data/corrections.csv'), 'utf8'));
  return rows.filter((r) => r.length >= 3 && r[0]).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])) as unknown as Correction)
    .sort((a, b) => b.date.localeCompare(a.date));
}
