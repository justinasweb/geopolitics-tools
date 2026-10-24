import { describe, expect, it } from 'vitest';
import { HOUR, DAY, type Source } from '../../../pipeline/lib/source.ts';
import { decideAlert, emptySource, isDue, isStale, runStamp, type SourceState } from '../../../pipeline/lib/state.ts';

const src = (every: number, staleAfter: number): Source => ({
  id: 't', name: 'Test', every, staleAfter, enabled: true, attribution: '', licence: '',
  fetch: async () => ({ files: [], rows: 0 }),
});
const at = (iso: string) => new Date(iso);
const st = (o: Partial<SourceState>): SourceState => ({ ...emptySource(), ...o });

describe('isDue', () => {
  it('runs a source that never ran', () => {
    expect(isDue(src(DAY, 10 * DAY), undefined, at('2026-10-24T12:00Z'))).toBe(true);
  });

  it('waits for the interval, with ten minutes of slack for late scheduled runs', () => {
    const s = st({ lastAttempt: '2026-10-24T11:05:00Z', lastSuccess: '2026-10-24T11:05:00Z' });
    expect(isDue(src(HOUR, 3 * DAY), s, at('2026-10-24T11:50:00Z'))).toBe(false);
    expect(isDue(src(HOUR, 3 * DAY), s, at('2026-10-24T11:57:00Z'))).toBe(true);
    expect(isDue(src(7 * DAY, 45 * DAY), s, at('2026-10-30T12:00:00Z'))).toBe(false);
    expect(isDue(src(7 * DAY, 45 * DAY), s, at('2026-10-31T11:00:00Z'))).toBe(true);
  });

  it('retries a failed weekly source on a growing backoff, not after a week', () => {
    const weekly = src(7 * DAY, 45 * DAY);
    const once = st({ lastAttempt: '2026-10-24T10:00:00Z', failures: 1 });
    expect(isDue(weekly, once, at('2026-10-24T11:00:00Z'))).toBe(true);
    const thrice = st({ lastAttempt: '2026-10-24T10:00:00Z', failures: 3 });
    expect(isDue(weekly, thrice, at('2026-10-24T13:00:00Z'))).toBe(false);
    expect(isDue(weekly, thrice, at('2026-10-24T14:00:00Z'))).toBe(true);
  });
});

describe('isStale', () => {
  it('counts from the last success, or from the first try if it never worked', () => {
    const s = src(DAY, 10 * DAY);
    expect(isStale(s, st({ lastSuccess: '2026-10-10T00:00Z' }), at('2026-10-24T00:00Z'))).toBe(true);
    expect(isStale(s, st({ lastSuccess: '2026-10-20T00:00Z' }), at('2026-10-24T00:00Z'))).toBe(false);
    expect(isStale(s, st({ firstAttempt: '2026-10-01T00:00Z' }), at('2026-10-24T00:00Z'))).toBe(true);
  });
});

describe('decideAlert', () => {
  const s = src(HOUR, 3 * DAY);

  it('stays quiet after one failure and alerts on the second', () => {
    const one = st({ lastSuccess: '2026-10-24T10:00Z', failures: 1 });
    expect(decideAlert(s, one, at('2026-10-24T11:00Z'))).toBeNull();
    one.failures = 2;
    expect(decideAlert(s, one, at('2026-10-24T12:00Z'))).toEqual({ kind: 'failing' });
  });

  it('repeats at most daily while the problem lasts, then says once that it recovered', () => {
    const f = st({ lastSuccess: '2026-10-24T10:00Z', failures: 2 });
    expect(decideAlert(s, f, at('2026-10-24T12:00Z'))).toEqual({ kind: 'failing' });
    f.failures = 3;
    expect(decideAlert(s, f, at('2026-10-24T13:00Z'))).toBeNull();
    f.failures = 26;
    expect(decideAlert(s, f, at('2026-10-25T12:00Z'))).toEqual({ kind: 'failing' });
    f.failures = 0;
    f.lastSuccess = '2026-10-25T13:00Z';
    expect(decideAlert(s, f, at('2026-10-25T13:00Z'))).toEqual({ kind: 'recovered' });
    expect(decideAlert(s, f, at('2026-10-25T14:00Z'))).toBeNull();
  });

  it('alerts when a source goes past its deadline, even without failures', () => {
    const quiet = st({ lastSuccess: '2026-10-20T00:00Z' });
    expect(decideAlert(s, quiet, at('2026-10-24T00:00Z'))).toEqual({ kind: 'stale' });
  });
});

it('stamps runs in a sortable, path-safe form', () => {
  expect(runStamp(at('2026-10-24T09:05:31Z'))).toBe('2026-10-24T0905Z');
});
