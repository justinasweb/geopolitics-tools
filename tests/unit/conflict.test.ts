import { beforeAll, describe, expect, it } from 'vitest';
import { deathsByYear, parseGed } from '../../src/adapters/ucdp.ts';
import { monthCode, monthNumber, readState, writeState } from '../../src/scripts/map/state.ts';

// The conflict view and the UCDP adapter, built from the sample files.
process.env.GT_DATA = 'sample';
type Conflict = typeof import('../../src/lib/conflict.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let C: Conflict;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  C = await import('../../src/lib/conflict.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

const ev = (id: number, date: string, extra = {}) => ({ id, type_of_violence: 1, conflict_name: 'X', country_id: 369, adm_1: 'Donetsk', latitude: 48, longitude: 37, date_start: `${date} 00:00:00.000`, best: 10, deaths_civilians: 2, ...extra });

describe('UCDP adapter', () => {
  it('maps Gleditsch–Ward numbers, moves Gaza to Palestine, and lets the yearly release win over Candidate months', () => {
    const e = parseGed([
      { name: 'gedevents_26.0.2.json', json: { Result: [ev(3, '2026-02-01', { best: 7 }), ev(4, '2025-12-03')] } },
      { name: 'gedevents_26.0.1.json', json: { Result: [ev(3, '2026-02-01', { best: 5 })] } },
      { name: 'gedevents_26.1.json', json: { Result: [ev(1, '2025-12-01'), ev(2, '2025-11-01', { country_id: 666, adm_1: 'Gaza Strip' })] } },
    ]);
    expect(e.map((x) => [x.id, x.place, x.candidate])).toEqual([[2, 'PSE', false], [1, 'UKR', false], [3, 'UKR', true]]);
    // The newer Candidate release's figure.
    expect(e.at(-1)!.deaths).toBe(7);
    expect(deathsByYear(e)).toEqual({ PSE: { 2025: 10 }, UKR: { 2025: 10 } });
  });

  it('numbers months so they run on, and writes them as YYYY-MM in the URL', () => {
    expect(monthNumber('2026-03') - monthNumber('2025-12')).toBe(3);
    expect(monthCode(monthNumber('2026-03'))).toBe('2026-03');
    const ctx = { years: [monthNumber('2026-01'), monthNumber('2026-02'), monthNumber('2026-03')], latest: monthNumber('2026-03'), slugs: {}, blocs: {}, param: 'month' as const };
    expect(readState('?month=2026-02', ctx).year).toBe(monthNumber('2026-02'));
    expect(writeState(new URL('https://x/conflict'), { year: monthNumber('2026-01') }, ctx).search).toBe('?month=2026-01');
  });
});

describe('conflict view', () => {
  it('builds /conflict with every month to the latest, Candidate months preliminary', () => {
    const p = C.conflictPage()!;
    expect(R.live('view:conflict:events')?.path).toBe('/conflict');
    expect(C.monthCode(p.months[0].n)).toBe('2023-01');
    expect(C.monthCode(p.month)).toBe('2026-08');
    expect(p.months.length).toBe(44);
    expect(p.byMonth[p.month].preliminary).toBe(true);
    expect(p.byMonth[C.monthNumber('2025-12')].preliminary).toBe(false);
    expect(p.unplaced).toBe(0);
  });

  it('adds up deaths over 12 months by country and conflict', () => {
    const p = C.conflictPage()!;
    const m = p.byMonth[p.month];
    const window = p.months.filter((x) => x.n > p.month - 12);
    expect(m.deaths12).toBe(window.reduce((t, x) => t + x.deaths[1] + x.deaths[2] + x.deaths[3], 0));
    expect(m.rows[0].deaths).toBeGreaterThanOrEqual(m.rows[1].deaths);
    expect(m.conflicts.reduce((t, k) => t + k.deaths, 0)).toBe(m.deaths12);
  });

  it('marks each month’s events in that month only, one shape per kind', () => {
    const f = L.layerFile('conflict');
    expect(f.axis).toBe('months');
    expect(f.overlays!.map((o) => o.kind === 'points' && o.symbol)).toEqual(['dot', 'triangle', 'diamond']);
    const items = f.overlays!.flatMap((o) => (o.kind === 'points' ? o.items : []));
    expect(items.every((x) => x.i !== undefined && x.i >= 0 && x.i < f.years.length)).toBe(true);
    expect(f.data.at(-1)!.status).toBe('preliminary');
  });
});
