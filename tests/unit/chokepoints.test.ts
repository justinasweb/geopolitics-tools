import { describe, expect, it } from 'vitest';
import { parseChokepoints, slugOf, usualRange, yearsBefore } from '../../src/adapters/portwatch.ts';
import { freshImport, FRESH_HOURS } from '../../src/lib/chokepoints.ts';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Daily rows for one chokepoint from `from` to `to`, `n(date)` ships a day (null leaves the day out). */
function rows(id: string, name: string, from: string, to: string, n: (date: string) => number | null) {
  const out: { attributes: Record<string, unknown> }[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const date = iso(t);
    const v = n(date);
    if (v === null) continue;
    out.push({ attributes: { date, portid: id, portname: name, n_total: v, n_tanker: v / 2, n_container: v / 4, n_dry_bulk: v / 4, n_general_cargo: 0, n_roro: 0, capacity_tanker: v * 1000, capacity: v * 1500 } });
  }
  return out;
}
const meta = (list: [string, string][]) => ({ features: list.map(([portid, portname], i) => ({ attributes: { portid, portname, lat: 10 + i, lon: 20 + i } })) });

describe('chokepoints', () => {
  it('gives each day its usual range: the same day in each of the three years before, lowest to highest', () => {
    expect(yearsBefore('2026-11-15', 3)).toBe('2023-11-15');
    const by = new Map<string, number | null>([['2025-11-15', 90], ['2024-11-15', 110], ['2023-11-15', 100]]);
    expect(usualRange('2026-11-15', by)).toEqual([90, 110]);
    // A year missing (or reported as no count) leaves a gap in the band, not a range from two years.
    by.delete('2024-11-15');
    expect(usualRange('2026-11-15', by)).toBeNull();
    by.set('2024-11-15', null);
    expect(usualRange('2026-11-15', by)).toBeNull();
    // 29 February has no same day in the years before.
    expect(usualRange('2024-02-29', new Map([['2023-02-28', 1], ['2022-02-28', 1], ['2021-02-28', 1]]))).toBeNull();
  });

  it('reads 365 days with their ranges, a gap where a year is missing, cargo by type and the status against the year', () => {
    // Hormuz: 100 a day, 120 in 2024, 80 in 2023; nothing reported for March 2025; the last week at 60.
    const daily = { features: rows('chokepoint6', 'Strait of Hormuz', '2022-10-01', '2026-11-15', (d) => {
      if (d.startsWith('2025-03')) return null;
      if (d >= '2026-11-09') return 60;
      return d.startsWith('2024') ? 120 : d.startsWith('2023') ? 80 : 100;
    }) };
    const [h] = parseChokepoints(meta([['chokepoint6', 'Strait of Hormuz']]), daily);
    expect(h).toMatchObject({ id: 'chokepoint6', slug: 'strait-of-hormuz', name: 'Strait of Hormuz', lastDate: '2026-11-15' });
    expect(h.series).toHaveLength(365);
    expect(h.series[0].date).toBe('2025-11-16');
    const at = (d: string) => h.series.find((s) => s.date === d)!;
    // 15 Nov 2026 against 2025, 2024 and 2023: 100, 120, 80.
    expect(at('2026-11-15').range).toEqual([80, 120]);
    // March 2026 reads March 2025, which is missing: no band.
    expect(at('2026-03-10').range).toBeNull();
    expect(at('2026-04-10').range).toEqual([80, 120]);
    expect(at('2026-11-15').ships.n_tanker).toBe(30);
    expect(at('2026-11-15').cargo).toMatchObject({ n_tanker: 60_000, all: 90_000, n_roro: null });
    expect(h.avg7).toBe(60);
    expect(h.status).toBe('disrupted');
    // The caveat kept by hand for Hormuz, with its source and date.
    expect(h.caveat).toMatchObject({ source: 'IMF PortWatch, Strait of Hormuz page', checked: '2026-11-22' });
  });

  it('makes slugs from the name, never the id', () => {
    expect(['Strait of Hormuz', 'Suez Canal', 'Taiwan Strait', 'Oresund Strait', 'Øresund Strait', 'Bab el-Mandeb Strait', 'Cape of Good Hope'].map(slugOf))
      .toEqual(['strait-of-hormuz', 'suez-canal', 'taiwan-strait', 'oresund-strait', 'oresund-strait', 'bab-el-mandeb-strait', 'cape-of-good-hope']);
  });

  it('is live while the hand import is under 45 days old, hidden after', () => {
    expect(FRESH_HOURS).toBe(45 * 24);
    expect(freshImport('2026-11-22T10:00:00Z', '2027-01-06T10:00:00Z')).toBe(true);
    expect(freshImport('2026-11-22T10:00:00Z', '2027-01-06T11:00:00Z')).toBe(false);
    // A snapshot older than the import (a local build from an earlier pull) is fresh.
    expect(freshImport('2026-11-22T10:00:00Z', '2026-11-10T13:29:11Z')).toBe(true);
    expect(freshImport(undefined, '2026-11-22T10:00:00Z')).toBe(false);
  });
});
