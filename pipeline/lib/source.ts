// What a source is to the runner. Each file in pipeline/sources/ exports one of these.
// A fetcher downloads, checks and trims the source's own format (it never reshapes it: that is
// the adapters' job at build time) and returns the files. Throwing anywhere means nothing is
// saved and the last good files stay in use.
import type { Http } from './http.ts';

export const HOUR = 1;
export const DAY = 24;

export interface SourceFile {
  /** File name inside the source's folder, e.g. "SP.POP.TOTL.json". */
  name: string;
  body: string | Uint8Array;
  contentType?: string;
}

export interface FetchResult {
  files: SourceFile[];
  /** Number of values or records saved, for the status page and the shrink check. */
  rows: number;
  /** Latest period with data, as the source states it ("2025", "2026-08", "2026-10-24"). */
  dataTo?: string;
}

export interface FetchContext {
  http: Http;
  now: Date;
  log: (...a: unknown[]) => void;
  /** The last good copy of one of this source's files, or null if there is none. */
  previous(name: string): Promise<string | null>;
  /** Set by --allow-shrink, when a sharp drop is expected (a source removing a series, say). */
  allowShrink: boolean;
  env: Record<string, string | undefined>;
}

export interface Source {
  id: string;
  name: string;
  /** How often to fetch, in hours. */
  every: number;
  /** Alert when the last good fetch is older than this, in hours (the source's freshness deadline). */
  staleAfter: number;
  /** false, or a reason string, keeps the source out of scheduled runs (missing key, terms not cleared). */
  enabled: true | string;
  /** Credit line shown with every figure and download. */
  attribution: string;
  licence: string;
  /** Raw copies of sources that change every hour are only kept this many days (R2 lifecycle rule). */
  keepDays?: number;
  fetch(ctx: FetchContext): Promise<FetchResult>;
}

/** A failed check on the data itself (as opposed to a network error). */
export class CheckError extends Error {}

export function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new CheckError(message);
}

/**
 * Refuse a result with far fewer values than the last good copy: a partial download or a changed
 * filter, not a real change. Skipped with --allow-shrink.
 */
export function guardShrink(ctx: Pick<FetchContext, 'allowShrink'>, what: string, now: number, previous: string | null, count: (previous: string) => number, minRatio = 0.5) {
  if (!previous || ctx.allowShrink) return;
  const before = count(previous);
  if (before <= 50) return;
  check(now >= before * minRatio, `${what}: ${now} values now against ${before} in the last good copy; kept the old file (run with --allow-shrink if the drop is real)`);
}

export const json = (name: string, data: unknown): SourceFile => ({ name, body: JSON.stringify(data), contentType: 'application/json' });
export const text = (name: string, body: string, contentType = 'text/plain'): SourceFile => ({ name, body, contentType });
