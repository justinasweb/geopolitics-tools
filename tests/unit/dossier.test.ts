import { describe, expect, it } from 'vitest';
import { dossierFor, peopleSection } from '../../src/lib/dossier.ts';

// A country page's money, people, technology and climate sections (every country page has them, spec D20) on the
// sample files, which only cover the United States, China and Russia: the age pyramid's five-year steps and the year it
// opens on, and no section for a place no source covers.
process.env.GT_DATA = 'sample';

describe('Country page sections', () => {
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

  it('builds the same People section on its own', () => {
    expect(peopleSection('CHN', 2026)).toEqual(dossierFor('CHN', 2026).people);
  });

  it('builds the sections for any place, and leaves out each one with no figure', () => {
    const chn = dossierFor('CHN', 2026);
    expect(chn.money && chn.tech && chn.climate).toBeTruthy();
    expect(dossierFor('TUV', 2026)).toEqual({ money: null, people: null, tech: null, climate: null });
  });
});
