// This week's archive, kept by the data run in the snapshots bucket next to the snapshots:
//
//   weeks/ledger.json          the archive's memory: which weeks are frozen, and per day the raw copies of the
//                              three sanctions lists (for entries added and removed) and of GDACS's alerts (for
//                              alerts that rose to orange or red in the week) as they stood at that day's first run
//   weeks/<yyyy>-<ww>.json     a closed ISO week's cards and feed, frozen once and never written again
//
// It runs at the start of each scheduled run, before any fetch, so what it records is the data as it stood when the
// day (or the week) ended. The raw copies the ledger points at are the runner's own files in gt-raw, so nothing is
// copied: the sanctions lists' are kept for good; GDACS's for 14 days, longer than a week is ever compared.
//
// The week's AI summary is not kept here: it is a text of the drafting pipeline, in the repository
// (src/data/ai/texts/weeks/, docs/ai-drafting.md), drafted after the run that froze the week (scripts/week.ts).
//
// A closed week is frozen on the Monday or Tuesday after it, from the last good copies at that moment, with the week
// as its period; later revisions by a source never reach it. A week the data run missed on both days is not frozen.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rawDir } from '../../src/adapters/core.ts';
import { computeWeek, CARD_SOURCES, type WeekData } from '../../src/lib/week/model.ts';
import { addDays, lastClosedWeek, weekRange } from '../../src/lib/week/period.ts';
import { loadState, unpackSources } from './runner.ts';
import type { State } from './state.ts';
import type { Stores } from './store.ts';

export const LEDGER_KEY = 'weeks/ledger.json';
export const weekKey = (id: string) => `weeks/${id}.json`;
/** Copies are recorded once a day and listed this long (a week only ever compares with its own Monday's). */
export const BASELINE_DAYS = 45;
/** A closed week is frozen only this many days after its Sunday at most. */
export const FREEZE_DAYS = 2;
/** The sources whose copies are recorded each day: the sanctions lists and GDACS. */
export const BASELINE_SOURCES = [...CARD_SOURCES.sanctions, ...CARD_SOURCES.disaster];

type Rec = { key: string; sha256: string };
export interface Ledger {
  /** Day → source → file name → raw copy. */
  baselines: Record<string, Record<string, Record<string, Rec>>>;
  /** Frozen weeks, oldest first. */
  weeks: string[];
}

const enc = (o: unknown) => JSON.stringify(o, null, 2);
const dec = <T>(b: Uint8Array) => JSON.parse(new TextDecoder().decode(b)) as T;

export async function loadLedger(stores: Stores): Promise<Ledger> {
  const b = await stores.snapshots.get(LEDGER_KEY);
  const l = b ? dec<Partial<Ledger>>(b) : {};
  return { baselines: l.baselines ?? {}, weeks: l.weeks ?? [] };
}

/** The current copies of the sources recorded each day, from the runner's state. */
export function baselineCopies(state: State): Record<string, Record<string, Rec>> {
  const out: Record<string, Record<string, Rec>> = {};
  for (const id of BASELINE_SOURCES) {
    const st = state.sources[id];
    if (!st?.lastSuccess || !Object.keys(st.files ?? {}).length) continue;
    out[id] = Object.fromEntries(Object.entries(st.files).map(([n, f]) => [n, { key: f.key, sha256: f.sha256 }]));
  }
  return out;
}

/** The copy recorded on a day, or failing that the first one after it (up to `to`), with its day. */
export function baselineFor(ledger: Ledger, from: string, to: string): { date: string; files: Record<string, Record<string, Rec>> } | null {
  const date = Object.keys(ledger.baselines).sort().find((d) => d >= from && d <= to);
  return date ? { date, files: ledger.baselines[date] } : null;
}

/** Writes the given raw copies into a folder laid out as pipeline/pull.ts does (<dir>/<source>/<file>). */
export async function unpack(stores: Stores, files: Record<string, Record<string, Rec>>, dir: string) {
  mkdirSync(dir, { recursive: true });
  await unpackSources(stores, files, dir);
}

/** Freezes one closed week from the state's last good copies. */
export async function freezeWeek(stores: Stores, state: State, ledger: Ledger, id: string, now: Date): Promise<WeekData> {
  const period = weekRange(id);
  const dir = mkdtempSync(join(tmpdir(), `gt-week-${id}-`));
  try {
    const sources: Record<string, Record<string, Rec>> = {};
    const info: Record<string, { fetched: string; changed?: string }> = {};
    for (const ids of Object.values(CARD_SOURCES)) {
      for (const s of ids) {
        const st = state.sources[s];
        if (!st?.lastSuccess || !Object.keys(st.files ?? {}).length) continue;
        sources[s] = Object.fromEntries(Object.entries(st.files).map(([n, f]) => [n, { key: f.key, sha256: f.sha256 }]));
        info[s] = { fetched: st.lastSuccess, changed: st.lastChange };
      }
    }
    await unpack(stores, sources, join(dir, 'now'));
    // Only the week's own Monday: a later copy would make the counts cover fewer days than the week.
    const b = baselineFor(ledger, period.from, period.from);
    if (b) await unpack(stores, b.files, join(dir, 'base'));
    return computeWeek({
      raw: rawDir(join(dir, 'now')), period, sources: info, baseline: b ? { date: b.date, raw: rawDir(join(dir, 'base')) } : null,
      made: now.toISOString(), week: id, feedFrom: period.from,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface WeeksReport { baseline?: string; frozen?: string; skipped?: string }

/**
 * The archive's part of a run: record today's sanctions copies if this is the day's first run, then freeze the last
 * closed week if it is not frozen yet and closed at most FREEZE_DAYS ago. A frozen week is never overwritten.
 */
export async function weeks(stores: Stores, now: Date, log: (...a: unknown[]) => void = console.log): Promise<WeeksReport> {
  const state = await loadState(stores);
  const ledger = await loadLedger(stores);
  const today = now.toISOString().slice(0, 10);
  const report: WeeksReport = {};
  let dirty = false;
  if (!ledger.baselines[today]) {
    const copies = baselineCopies(state);
    if (Object.keys(copies).length) {
      ledger.baselines[today] = copies;
      report.baseline = today;
      dirty = true;
    }
  }
  for (const d of Object.keys(ledger.baselines)) {
    if (d < addDays(today, -BASELINE_DAYS)) {
      delete ledger.baselines[d];
      dirty = true;
    }
  }
  const id = lastClosedWeek(today);
  const closedFor = (Date.parse(today) - Date.parse(weekRange(id).to)) / 864e5;
  if (!ledger.weeks.includes(id)) {
    if (closedFor > FREEZE_DAYS) report.skipped = id;
    else if (await stores.snapshots.get(weekKey(id))) {
      ledger.weeks.push(id);
      dirty = true;
    } else {
      const w = await freezeWeek(stores, state, ledger, id, now);
      if (w.cards.length) {
        await stores.snapshots.put(weekKey(id), enc(w), 'application/json');
        ledger.weeks.push(id);
        report.frozen = id;
        dirty = true;
      } else report.skipped = id;
    }
  }
  if (dirty) {
    ledger.weeks.sort();
    await stores.snapshots.put(LEDGER_KEY, enc(ledger), 'application/json');
  }
  log('weeks', report.baseline ? `recorded the day's copies for ${report.baseline}` : 'copies already recorded today',
    report.frozen ? `; froze week ${report.frozen}` : report.skipped ? `; did not freeze week ${report.skipped}` : '');
  return report;
}
