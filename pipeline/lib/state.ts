// The runner's memory between runs (state/status.json in the raw bucket): per source, when it
// last ran and succeeded, failures in a row, and which raw files are its last good copy.
// Everything here is pure, so the scheduling and alert rules are easy to test.
import type { Source } from './source.ts';

export interface FileRecord {
  /** Key in the raw bucket. */
  key: string;
  sha256: string;
  bytes: number;
  contentType: string;
}

export interface SourceState {
  firstAttempt?: string;
  lastAttempt?: string;
  lastSuccess?: string;
  /** Last run whose files differed from the copy before. */
  lastChange?: string;
  failures: number;
  lastError?: string;
  files: Record<string, FileRecord>;
  rows?: number;
  dataTo?: string;
  /** The open alert, so it is sent once and then at most daily, not every hour. */
  alert?: { kind: Problem; at: string };
}

export interface State {
  version: 1;
  updated: string;
  sources: Record<string, SourceState>;
}

export type Problem = 'failing' | 'stale';

const H = 3_600_000;
const hoursSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / H : Infinity);

export const emptyState = (): State => ({ version: 1, updated: new Date(0).toISOString(), sources: {} });
export const emptySource = (): SourceState => ({ failures: 0, files: {} });

/**
 * Due when it has never run, when its interval has passed (with 10 minutes' slack, because
 * scheduled runs start a little late), or, after a failure, on a backoff of 1, 2, 4… hours
 * capped at the interval.
 */
export function isDue(src: Source, st: SourceState | undefined, now: Date): boolean {
  if (!st?.lastAttempt) return true;
  const wait = st.failures > 0 ? Math.min(src.every, 2 ** (st.failures - 1)) : src.every;
  return hoursSince(st.lastAttempt, now) >= wait - 1 / 6;
}

/** Past its freshness deadline: no good fetch for longer than staleAfter (counted from the first try if it never worked). */
export function isStale(src: Source, st: SourceState | undefined, now: Date): boolean {
  if (!st) return false;
  return hoursSince(st.lastSuccess ?? st.firstAttempt, now) > src.staleAfter;
}

export function problemOf(src: Source, st: SourceState, now: Date): Problem | null {
  if (st.failures >= 2) return 'failing';
  if (isStale(src, st, now)) return 'stale';
  return null;
}

export type AlertDecision = { kind: Problem | 'recovered' } | null;

/**
 * Whether to alert now, updating st.alert. Alerts on a source failing twice in a row or going
 * past its deadline, repeats daily while the problem lasts, and says once when it is fixed.
 */
export function decideAlert(src: Source, st: SourceState, now: Date): AlertDecision {
  const problem = problemOf(src, st, now);
  if (problem) {
    if (!st.alert || st.alert.kind !== problem || hoursSince(st.alert.at, now) >= 24 - 1 / 6) {
      st.alert = { kind: problem, at: now.toISOString() };
      return { kind: problem };
    }
    return null;
  }
  if (st.alert) {
    delete st.alert;
    return { kind: 'recovered' };
  }
  return null;
}

export const runStamp = (now: Date) => now.toISOString().slice(0, 16).replace(/:/g, '') + 'Z';
