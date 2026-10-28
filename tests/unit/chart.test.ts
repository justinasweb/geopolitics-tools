import { describe, expect, it } from 'vitest';
import { clip, textWidth, yearTickIndexes } from '../../src/lib/chart.ts';

describe('yearTickIndexes', () => {
  it('keeps the first and last year and steps evenly between', () => {
    expect(yearTickIndexes(26, 400)).toEqual([0, 5, 10, 15, 20, 25]);
  });
  it('drops a stepped label that would sit too close to the last one', () => {
    // 2000–2025 on 210px: one year is 8.4px, so a 10-year step; 2020 would be 42px from 2025.
    expect(yearTickIndexes(26, 210)).toEqual([0, 10, 25]);
  });
  it('keeps every label at least the gap apart', () => {
    for (const [n, w] of [[151, 160], [151, 600], [12, 120], [61, 300], [2, 60]]) {
      const ix = yearTickIndexes(n, w);
      const per = w / (n - 1);
      ix.slice(1).forEach((v, k) => expect((v - ix[k]) * per).toBeGreaterThanOrEqual(48));
      expect(ix[0]).toBe(0);
    }
  });
  it('handles one or no years', () => {
    expect(yearTickIndexes(1, 300)).toEqual([0]);
    expect(yearTickIndexes(0, 300)).toEqual([]);
  });
});

describe('labels', () => {
  it('clips long labels with an ellipsis', () => {
    expect(clip('United Kingdom', 12)).toBe('United King…');
    expect(clip('Japan', 12)).toBe('Japan');
  });
  it('estimates wider text for bold and larger sizes', () => {
    expect(textWidth('2025', 13, true)).toBeGreaterThan(textWidth('2025', 12));
  });
});
