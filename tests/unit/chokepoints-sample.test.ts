import { describe, expect, it } from 'vitest';

// The chokepoints on the sample files (npm run build:sample, CI's builds): the Strait of Hormuz, the Suez Canal and the
// Taiwan Strait carry four years and 40 days of PortWatch's real counts to 13 Oct 2026, the other six one year, so the
// pages show every kind of comparison: 30% or more below, near usual, and no recent data.
process.env.GT_DATA = 'sample';

describe('chokepoints on the sample files', async () => {
  const { liveChokepoints, ranked, statusLine } = await import('../../src/lib/chokepoints.ts');
  const { layerFile } = await import('../../src/lib/map/layers.ts');
  const { CHOKEPOINTS_TEXT: X, changeCell } = await import('../../src/i18n/chokepoints.en.ts');
  const { live } = await import('../../src/lib/routes.ts');
  const by = (name: string) => liveChokepoints().find((c) => c.name === name)!;

  it('has one chokepoint 30% or more below, one near usual and one with no recent data', () => {
    const statuses = new Set(liveChokepoints().map((c) => c.status));
    for (const s of ['disrupted', 'normal', 'unknown'] as const) expect(statuses.has(s)).toBe(true);
    expect(by('Strait of Hormuz')).toMatchObject({ status: 'disrupted', baseYears: [2023, 2025] });
    expect(by('Taiwan Strait')).toMatchObject({ status: 'normal', baseYears: [2023, 2025] });
    expect(by('Suez Canal').status).toBe('normal');
    expect(by('Panama Canal')).toMatchObject({ status: 'unknown', baseline: null, change: null });
  });

  it('gives the status words, the change column and the status line for each kind', () => {
    const h = by('Strait of Hormuz');
    expect(X.statusShort[h.status]).toBe('30%+ below');
    expect(changeCell(h.change!)).toMatch(/^−\d+%$/);
    expect(statusLine(h)).toMatch(/^Traffic in the week to 13 Oct 2026 was \d+% below usual, compared with the same week in 2023–2025\.$/);
    expect(X.statusShort[by('Taiwan Strait').status]).toBe('Near usual');
    const p = by('Panama Canal');
    expect(X.statusShort[p.status]).toBe('No data');
    expect(statusLine(p)).toMatch(/fewer than two of the three years before have counts/);
    // Furthest below first, no data last.
    expect(ranked()[0].name).toBe('Strait of Hormuz');
    expect(ranked().at(-1)!.status).toBe('unknown');
  });

  it('draws the usual-range band for the four-year chokepoints only, and a diamond per status on the map', () => {
    expect(by('Strait of Hormuz').series.filter((d) => d.range)).toHaveLength(365);
    expect(by('Panama Canal').series.some((d) => d.range)).toBe(false);
    const marks = layerFile('chokepoints').overlays![0];
    const shapes = marks.kind === 'points' ? new Set(marks.items.map((p) => p.s)) : new Set();
    for (const s of ['cp-disrupted', 'cp-normal', 'cp-unknown']) expect(shapes.has(s)).toBe(true);
    expect(live('view:chokepoints:taiwan-strait')?.path).toBe('/chokepoints/taiwan-strait');
  });
});
