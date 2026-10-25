import { beforeAll, describe, expect, it } from 'vitest';
import { HISTORY_BLOCS, LAST_YEAR, historyPage, historySpans, spanText, statusIn } from '../../src/lib/history.ts';
import { blocs } from '../../src/lib/blocs.ts';

// The alliance history views, built from src/data/bloc-history.csv.
process.env.GT_DATA = 'sample';
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let L: Layers;
let R: Routes;
beforeAll(async () => {
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

describe('alliance history', () => {
  it('agrees with the membership table: the spans still open are today’s members', () => {
    const now = blocs();
    for (const b of HISTORY_BLOCS) {
      const open = historySpans().get(b)!.filter((s) => s.to === null).map((s) => s.place).sort();
      expect(open, b).toEqual([...now.get(b)!].sort());
      expect(historyPage(b)!.byYear[LAST_YEAR].members.sort(), b).toEqual([...now.get(b)!].sort());
    }
  });

  it('gives each place one standing a year', () => {
    const ss = [{ place: 'QAT', from: 1961, to: 2019 }, { place: 'IDN', from: 1962, to: 2009 }, { place: 'IDN', from: 2016, to: 2016 }];
    expect(statusIn(ss, 'QAT', 1960)).toBeNull();
    expect(statusIn(ss, 'QAT', 1961)).toBe('joined');
    expect(statusIn(ss, 'QAT', 2000)).toBe('member');
    expect(statusIn(ss, 'QAT', 2019)).toBe('left');
    expect(statusIn(ss, 'QAT', 2020)).toBe('former');
    expect(statusIn(ss, 'IDN', 2016)).toBe('left');
    expect(spanText(ss, 'IDN')).toBe('1962–2009, 2016');
  });

  it('counts the founding members and the changes', () => {
    const nato = historyPage('nato')!;
    expect(nato.years[0]).toBe(1949);
    expect(nato.byYear[1949].members).toHaveLength(12);
    expect(nato.byYear[2023].joined).toEqual(['FIN']);
    expect(nato.byYear[2024].joined).toEqual(['SWE']);
    const g7 = historyPage('g7')!;
    expect(g7.byYear[2014].left).toEqual(['RUS']);
    expect(historyPage('opec')!.byYear[2016].joined).toContain('IDN');
  });

  it('has a route, a layer and an image for each grouping', () => {
    for (const b of HISTORY_BLOCS) {
      const r = R.route(`view:alliance-history:${b}`)!;
      expect(r.live).toBe(true);
      expect(r.path).toMatch(/^\/blocs\/[a-z0-9-]+\/history$/);
      expect(L.layerFile(`history-${b}`).data.at(-1)!.order).toHaveLength(blocs().get(b)!.length);
    }
    const nato = L.layerFile('history-nato');
    expect(nato.data.find((d) => d.year === 2023)!.v.FIN[0]).toBe(5);
    expect(nato.data.find((d) => d.year === 1950)!.v.FIN).toBeUndefined();
    expect(R.route('view:alliance-history:nato')!.path).toBe('/blocs/nato/history');
  });
});
