// English words for the food crises views' extras (src/lib/hunger.ts) and the country page's food crisis block. Same
// rules as pages.en.ts. IPC's phase names are its own; Phase 5 counts people in catastrophe, not famine, which IPC
// classifies by area. Every figure keeps its analysis's period and the population analysed; a country with no
// analysis has none, which does not mean no hunger.
const n = (x: number) => new Intl.NumberFormat('en').format(x);
const SYSTEM = (s: string) => (s === 'CH' ? 'Cadre Harmonisé' : 'IPC');
const PERIOD: Record<string, string> = { current: 'current situation', projection: 'projection', update: 'projection update' };

export const HUNGER_TEXT = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  phase: { 1: 'Phase 1, minimal', 2: 'Phase 2, stressed', 3: 'Phase 3, crisis', 4: 'Phase 4, emergency', 5: 'Phase 5, catastrophe' } as Record<1 | 2 | 3 | 4 | 5, string>,
  latest: 'Latest analysis',
  /** "IPC projection, Oct 2026 – Jan 2027: people by phase, of 8,289,603 analysed (of 50,448,963 in the country)." */
  latestCaption: (system: string, kind: string, period: string, analysed: string, population: string | null) =>
    `${SYSTEM(system)} ${PERIOD[kind] ?? 'analysis'}, ${period}: people by phase, of ${analysed} analysed${population ? ` (of ${population} in the country, by IPC’s count)` : ''}.`,
  /** Beside a count from an analysis of part of the country. */
  ofAnalysed: (analysed: string) => `(of ${analysed} people analysed)`,
  /** The map's note on such a figure. */
  mapNote: (analysed: string, population: string) => `The analysis covered ${analysed} people, part of the ${population} IPC counts in the country.`,
  /** Beside every figure from an analysis of an area IPC's list of analyses names ("Palestine (Gaza Strip)"). */
  only: (area: string) => `${area} only`,
  catastrophe: 'People in catastrophe (Phase 5)',
  catastropheCaption: (day: string) => `Countries whose analysis in force on ${day} counts people in IPC Phase 5. Phase 5 counts households facing catastrophe; famine is a classification of an area, made only when several thresholds are met.`,
  country: 'Country',
  period: 'Period',
  people5: 'Phase 5',
  people3: 'Phase 3 or above',

  // The country page's block.
  block: 'Food crisis',
  /** Under the figure: what it counts, for which period, of how many. */
  blockCaption: (system: string, kind: string, period: string, analysed: string, share: string) =>
    `people in ${SYSTEM(system)} Phase 3 (crisis) or worse, ${period} (${PERIOD[kind] ?? 'analysis'}): ${share} of the ${analysed} analysed`,
  blockPart: (analysed: string, population: string) => `The analysis covered ${analysed} of the ${population} people IPC counts in the country.`,
  blockPhase5: (x: number, analysed: string | null) => `${n(x)} of them in Phase 5 (catastrophe)${analysed ? `, of ${analysed} people analysed` : ''}.`,
  /** The latest analysis is no longer in force: its figure is still the one the maps show, tagged Period ended. */
  blockOld: (day: string) => `Its period has ended, and no newer IPC or Cadre Harmonisé analysis is in force on ${day}.`,
  /** The latest analysis is for a period that has not begun. */
  blockAhead: (month: string) => `Its period begins in ${month}.`,
  blockLink: 'Food crises map',
  /** The source line's period part. */
  sourcePart: (kind: string, period: string) => `${period}, ${PERIOD[kind] ?? 'analysis'}`,
};
