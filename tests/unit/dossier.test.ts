import { describe, expect, it } from 'vitest';
import { dossierFor } from '../../src/lib/dossier.ts';

// The dossiers' People section on the sample files: the age pyramid's five-year steps and the year it opens on.
process.env.GT_DATA = 'sample';

describe('Dossier people', () => {
  it('gives the pyramid every fifth year and opens on the last one up to the build year', () => {
    const p = dossierFor('CHN', 2026).people!;
    expect(p.pyramid!.years[0]).toBe(1950);
    expect(p.pyramid!.years.at(-1)).toBe(2100);
    expect(p.pyramid!.years.every((y) => y % 5 === 0)).toBe(true);
    expect(p.pyramid!.year).toBe(2025);
    expect(p.oldYear).toBe(2025);
    expect(Object.keys(p.pyramid!.byYear).length).toBe(p.pyramid!.years.length);
  });

  it('shows the figures the design shows: births per woman and median age', () => {
    expect(dossierFor('CHN', 2026).people!.stats.map((f) => f.id)).toEqual(['tfr', 'median']);
  });
});
