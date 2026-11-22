import { describe, expect, it } from 'vitest';
import { parseChokepoints, sameDaysBefore, slugOf, statusFor, usualRange, yearsBefore } from '../../src/adapters/portwatch.ts';
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
    // Usual: the median of the same 7 days in 2025, 2024 and 2023 (100, 120, 80), not the last 365 days' average.
    expect(h.baseline).toBe(100);
    expect(h.baseYears).toEqual([2023, 2025]);
    expect(h.change).toBeCloseTo(-0.4);
    expect(h.status).toBe('disrupted');
    // The caveat kept by hand for Hormuz, with its source and date.
    expect(h.caveat).toMatchObject({ source: 'IMF PortWatch, Strait of Hormuz page', checked: '2026-11-22' });
  });

  it('compares a week with the same days in each of the three years before: their median, from two years at least', () => {
    const dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    const by = new Map<string, number | null>();
    for (const d of dates) { by.set(yearsBefore(d, 1), 50); by.set(yearsBefore(d, 2), 70); by.set(yearsBefore(d, 3), 90); }
    expect(sameDaysBefore(dates, by)).toEqual({ median: 70, years: [2023, 2025] });
    // A year with fewer than 5 of the 7 days counted is left out; two years give the median of two (their mean).
    for (const d of dates.slice(0, 3)) by.delete(yearsBefore(d, 3));
    expect(sameDaysBefore(dates, by)).toEqual({ median: 60, years: [2024, 2025] });
    // Fewer than two years: no usual level, so no status.
    for (const d of dates) by.delete(yearsBefore(d, 2));
    expect(sameDaysBefore(dates, by)).toBeNull();
  });

  it('says no recent data when fewer than two of the three years before have the week', () => {
    // Counted only since mid-2025: November 2025 alone is earlier, one year.
    const daily = { features: rows('chokepoint1', 'Suez Canal', '2025-06-01', '2026-11-15', () => 40) };
    const [c] = parseChokepoints(meta([['chokepoint1', 'Suez Canal']]), daily);
    expect(c).toMatchObject({ baseline: null, change: null, status: 'unknown' });
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
    expect(statusLine(c)).toBe('Traffic in the week to 15 Nov 2026 was 10% above usual, compared with the same week in 2023–2025.');
    expect(lastWeek(c).find((r) => r.type === 'n_tanker')).toEqual({ type: 'n_tanker', ships: 22, cargo: 44_000 });
    expect(lastWeek(c).at(-1)).toEqual({ type: 'all', ships: 44, cargo: 66_000 });
    expect(tankerShare(c)).toBe(0.5);
    const m = months(c);
    // Twelve months newest first; November 2026 runs to the 15th; November 2025, begun mid-month, is left out.
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ month: '2026-11', to: '2026-11-15', transits: 8 * 40 + 7 * 44 });
    expect(m.at(-1)!.month).toBe('2025-12');
    // Each month against the same days of the month in the three years before (40 a day then too).
    expect(m[1]).toMatchObject({ month: '2026-10', transits: 31 * 40, perDay: 40, against: 0 });
    expect(m[0].against).toBeCloseTo((8 * 40 + 7 * 44) / 15 / 40 - 1);
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

  it('reads the status from the change as shown, so the two never disagree', () => {
    // −9.7% shows as −10%, so it is 10% to 30% below; −9.4% shows as −9%, near usual.
    expect([changeCell(-0.097), statusFor(-0.097)]).toEqual(['−10%', 'below']);
    expect([changeCell(-0.094), statusFor(-0.094)]).toEqual(['−9%', 'normal']);
    expect([changeCell(0.146), statusFor(0.146)]).toEqual(['+15%', 'above']);
    expect([changeCell(0.144), statusFor(0.144)]).toEqual(['+14%', 'normal']);
    expect([changeCell(-0.297), statusFor(-0.297)]).toEqual(['−30%', 'disrupted']);
    // At a half the shown number and the status still agree, whichever way it rounds.
    for (const c of [-0.295, -0.095, 0.145, -0.3, -0.1, 0.15]) {
      const shown = Number(changeCell(c).replace('−', '-').replace('%', ''));
      const want = shown <= -30 ? 'disrupted' : shown <= -10 ? 'below' : shown >= 15 ? 'above' : 'normal';
      expect(statusFor(c)).toBe(want);
      expect(changeWords(c)).toBe(shown === 0 ? 'at' : `${Math.abs(shown)}% ${shown < 0 ? 'below' : 'above'}`);
    }
  });
});
