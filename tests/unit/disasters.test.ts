import { beforeAll, describe, expect, it } from 'vitest';
import { readState, writeState, type StateContext } from '../../src/scripts/map/state.ts';
import { DISASTER_SLUGS } from '../../src/i18n/slugs.en.ts';
import { KIND_TEXT } from '../../src/i18n/disasters.en.ts';
import type { Hazard } from '../../src/adapters/hazards.ts';

// The disasters map view, built from the sample files.
process.env.GT_DATA = 'sample';
type Disasters = typeof import('../../src/lib/disasters.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
let D: Disasters;
let L: Layers;
beforeAll(async () => {
  D = await import('../../src/lib/disasters.ts');
  L = await import('../../src/lib/map/layers.ts');
});

const hz = (id: string, alert: Hazard['alert'], places: string[]): Hazard => ({
  id, kind: 'FL', name: id, alert, place: places[0] ?? null, places, lon: 0, lat: 0, from: '2026-10-01', to: '2026-10-02', current: false, severity: '',
});

describe('disasters', () => {
  it('counts orange and red alerts in every period, and keeps green ones (30 days only) apart', () => {
    expect(D.COUNTED).toEqual(['red', 'orange']);
    const all = D.disasterPage('all')!;
    for (const x of all.periods) {
      expect(x.alerts.every((h) => h.alert === 'orange' || h.alert === 'red')).toBe(true);
      expect(x.green.every((h) => h.alert === 'green')).toBe(true);
      if (x.days > D.GREEN_DAYS) expect(x.green).toHaveLength(0);
    }
    // A longer period never counts fewer alerts than a shorter one.
    const n = all.periods.map((x) => x.alerts.length);
    expect(n).toEqual([...n].sort((a, b) => a - b));
  });

  it('counts an alert once for each country it names', () => {
    const rows = D.countRows([hz('a', 'red', ['PHL', 'VNM']), hz('b', 'orange', ['PHL']), hz('c', 'green', [])]);
    expect(rows).toEqual([
      { id: 'PHL', n: 2, red: 1, orange: 1, green: 0 },
      { id: 'VNM', n: 1, red: 1, orange: 0, green: 0 },
    ]);
  });

  it('shades counts in fixed classes: 1, 2–4, 5–9, 10–24, 25+', () => {
    expect([1, 2, 4, 5, 9, 10, 24, 25, 300].map(D.countClass)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('has a page and words for every kind, with every kind together at /disasters', () => {
    const pages = D.disasterPages();
    expect(pages.map((p) => p.id)).toEqual(['all', ...D.KINDS]);
    for (const p of pages) {
      expect(KIND_TEXT[p.id]).toBeDefined();
      expect(DISASTER_SLUGS[p.id]).toBeDefined();
      expect(p.periods.map((x) => x.days)).toEqual([30, 90, 365]);
    }
    expect(DISASTER_SLUGS.all).toBe('');
  });

  it('keeps each period to its levels, and a kind page to its kind', () => {
    const all = D.disasterPage('all')!;
    // Orange and red alerts in a shorter period are all in the longer ones.
    const ids = (days: number) => new Set(all.byDays[days].alerts.map((h) => h.id));
    for (const id of ids(90)) expect(ids(365).has(id)).toBe(true);
    const tc = D.disasterPage('TC')!;
    for (const x of tc.periods) expect(x.alerts.every((h) => h.kind === 'TC')).toBe(true);
    expect(tc.periods.every((x) => x.quakes.length === 0)).toBe(true);
  });

  it('writes a layer over periods, with marks that show only in the periods that count them', () => {
    const f = L.layerFile('disasters-all');
    expect(f.axis).toBe('days');
    expect(f.years).toEqual([30, 90, 365]);
    expect(f.year).toBe(365);
    expect(f.data.map((d) => d.label)).toEqual(['Last 30 days', 'Last 90 days', 'Last 365 days']);
    const p = D.disasterPage('all')!;
    for (const [i, d] of f.data.entries()) expect(d.order).toEqual(p.periods[i].rows.map((r) => r.id));
    const green = f.overlays?.find((o) => o.id === 'alerts-green');
    if (green) for (const m of green.items) expect((m as { m: number }).m).toBe(1);
    const eq = L.layerFile('disasters-EQ');
    expect(eq.overlays?.map((o) => o.id)).toEqual(['quakes']);
  });

  it('keeps the period in ?days=, leaving the default out', () => {
    const ctx: StateContext = { years: [30, 90, 365], latest: 365, slugs: { PHL: 'philippines' }, blocs: {}, param: 'days' };
    expect(readState('?days=90&country=philippines', ctx)).toEqual({ year: 90, country: 'PHL' });
    expect(readState('?days=60', ctx)).toEqual({ year: 90, askedYear: 60 });
    expect(readState('?year=30', ctx)).toEqual({});
    expect(writeState(new URL('https://x.test/disasters'), { year: 30 }, ctx).search).toBe('?days=30');
    expect(writeState(new URL('https://x.test/disasters?days=30'), { year: 365 }, ctx).search).toBe('');
  });
});
