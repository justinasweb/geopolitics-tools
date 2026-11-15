// A figure counted on one day rather than over a finished year: the latest year of CelesTrak's satellites in orbit
// counts what was in orbit on the day the catalogue was read (its latest launch date, `asOf` in
// src/adapters/celestrak.ts). Such a figure is "as of {date}", never "at the end of {year}". Other snapshot measures
// (Epoch AI's computing power, UNHCR's refugees hosted) end at a finished year, so they keep their year.
import { formatDate } from './format.ts';
import { spaceAsOf } from './space.ts';

/** The day a measure's figure for the year was counted ("7 Nov 2026"), when that year is still running; else null. */
export function asOfDate(indId: string, year: number): string | null {
  if (indId !== 'satellites') return null;
  const d = spaceAsOf();
  return d && Number(d.slice(0, 4)) === year ? formatDate(d) : null;
}

/** The year as a figure's caption says it: "as of 7 Nov 2026" for a running year, else the year. */
export const yearOrAsOf = (indId: string, year: number) => {
  const d = asOfDate(indId, year);
  return d ? `as of ${d}` : String(year);
};
