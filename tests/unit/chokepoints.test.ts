import { describe, expect, it } from 'vitest';
import { parseChokepoints, slugOf, usualRange, yearsBefore } from '../../src/adapters/portwatch.ts';
import { freshImport, FRESH_HOURS, lastWeek, months, statusLine, tankerShare } from '../../src/lib/chokepoints.ts';
import { dailyChartHtml, dailyTicks } from '../../src/lib/dailychart.ts';
import { changeCell, changeWords, ships, tonnes } from '../../src/i18n/chokepoints.en.ts';

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

  it('gives a place page its status line, last week by vessel type, and months with the usual level', () => {
    const daily = { features: rows('chokepoint1', 'Suez Canal', '2022-10-01', '2026-11-15', (d) => (d >= '2026-11-09' ? 44 : 40)) };
    const [c] = parseChokepoints(meta([['chokepoint1', 'Suez Canal']]), daily);
    expect(statusLine(c)).toBe('Traffic was 10% above its usual level in the week to 15 Nov 2026.');
    expect(lastWeek(c).find((r) => r.type === 'n_tanker')).toEqual({ type: 'n_tanker', ships: 22, cargo: 44_000 });
    expect(lastWeek(c).at(-1)).toEqual({ type: 'all', ships: 44, cargo: 66_000 });
    expect(tankerShare(c)).toBe(0.5);
    const m = months(c);
    // Twelve months newest first; November 2026 runs to the 15th; November 2025, begun mid-month, is left out.
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ month: '2026-11', to: '2026-11-15', transits: 8 * 40 + 7 * 44 });
    expect(m.at(-1)!.month).toBe('2025-12');
    expect(m[1]).toMatchObject({ month: '2026-10', transits: 31 * 40, perDay: 40 });
    expect(m[1].to).toBeUndefined();
  });

  it('words changes, ships and tonnes', () => {
    expect([changeWords(-0.124), changeWords(0.03), changeWords(0.004)]).toEqual(['12% below', '3% above', 'at']);
    expect([changeCell(-0.124), changeCell(0.03), changeCell(0)]).toEqual(['−12%', '+3%', '0%']);
    expect([ships(96.4), ships(4.32), ships(0)]).toEqual(['96', '4.3', '0']);
    expect([tonnes(1_234_567), tonnes(830_400), tonnes(486), tonnes(250_000_000)]).toEqual(['1.2 million tonnes', '830,000 tonnes', '486 tonnes', '250 million tonnes']);
  });

  it('draws the daily chart with a gap in the band where a day has no range', () => {
    expect(dailyTicks(230)).toEqual([0, 50, 100, 150, 200, 250]);
    const points = Array.from({ length: 10 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, value: 10 + i, range: i === 4 ? null : [8, 14] as [number, number] }));
    const html = dailyChartHtml({ label: 'Ships', points, format: ships });
    expect(html.match(/class="gt-tc__band"/g)).toHaveLength(2);
    expect(html.match(/class="gt-tc__line"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Ships"');
    expect(html).toContain('>2026</text>');
  });
});
