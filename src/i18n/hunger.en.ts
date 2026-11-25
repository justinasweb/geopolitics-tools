// English words for the food crises views' extras (src/lib/hunger.ts) and the country page's food crisis block. Same
// rules as pages.en.ts. IPC's phase names are its own; Phase 5 counts people in catastrophe, not famine, which IPC
// classifies by area. Every figure keeps its analysis's period and the population analysed; a country with no
// analysis has none, which does not mean no hunger.
const n = (x: number) => new Intl.NumberFormat('en').format(x);
/** The one caption wherever Phase 5 figures are shown (the views, country pages, the map panel, This week). */
export const PHASE5_NOTE = 'These figures count people in households classified in Phase 5 (Catastrophe). IPC classifies areas separately.';
const SYSTEM = (s: string) => (s === 'CH' ? 'Cadre Harmonisé' : 'IPC');
// IPC's current period is an assessment; its projection and second projection (the API's P and A) are both projections.
// The API marks no revision, so nothing here says "revised".
const KIND: Record<string, string> = { current: 'assessment', projection: 'projection', update: 'projection' };
const kindOf = (kind: string) => KIND[kind] ?? 'analysis';
/** "IPC projection for Oct 2026 – Jan 2027", "Cadre Harmonisé assessment for Oct–Dec 2025". */
const labelOf = (system: string, kind: string, period: string) => `${SYSTEM(system)} ${kindOf(kind)} for ${period}`;

export const HUNGER_TEXT = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  phase: { 1: 'Phase 1, minimal', 2: 'Phase 2, stressed', 3: 'Phase 3, crisis', 4: 'Phase 4, emergency', 5: 'Phase 5, catastrophe' } as Record<1 | 2 | 3 | 4 | 5, string>,
  latest: 'Latest analysis',
  /** "IPC projection for Oct 2026 – Jan 2027: people by phase, of 8.3 m analysed (of 48 m in the country, by IPC's count)." */
  latestCaption: (system: string, kind: string, period: string, analysed: string, population: string | null) =>
    `${labelOf(system, kind, period)}: people by phase, of ${analysed} analysed${population ? ` (of ${population} in the country, by IPC’s count)` : ''}.`,
  /** An analysis named in full: "IPC projection for Oct 2026 – Jan 2027". */
  label: labelOf,
  /** The same after a figure in a ranked row: "Oct 2026 – Jan 2027 projection". */
  rowPeriod: (kind: string, period: string) => `${period} ${kindOf(kind)}`,
  /** What the analysis does with its people: an assessment estimates them, a projection projects them. */
  verb: (kind: string) => (kindOf(kind) === 'projection' ? 'projected' : 'estimated'),
  /** The map panel's label for the analysis behind a figure. */
  analysis: 'Analysis',
  /** Beside a count from an analysis of part of the country. */
  ofAnalysed: (analysed: string) => `(of ${analysed} people analysed)`,
  /** The same beside a figure that has its tags with it. */
  ofAnalysedShort: (analysed: string) => `of ${analysed} people analysed`,
  /** The map legend's words for the lines over such a figure. */
  partialLegend: 'Analysis of part of the country',
  /** The map's note on such a figure, starting with the place's possessive: "Sudan’s analysis covered 8.3 m of the 48 m
   *  people IPC counts in the country." */
  mapNote: (placeOf: string, analysed: string, population: string) => `${placeOf} analysis covered ${analysed} of the ${population} people IPC counts in the country.`,
  /** Beside every figure from an analysis of an area IPC's list of analyses names ("Palestine (Gaza Strip)"). */
  only: (area: string) => `${area} only`,
  /** In place of a change between two analyses that covered different populations. */
  coverageChanged: 'Coverage changed',
  /** The note on such a figure: the earlier analysis's people analysed and this one's. */
  coverageNote: (before: number, then: string, now: string) => `Coverage changed from ${before}: that analysis covered ${then} people, this one ${now}, so the figures do not compare.`,
  /** Under a trend chart with a break in a line, and in the map panel's trend. */
  coverageBreak: 'A break in a line marks a change in the population analysed: the figures either side do not compare.',
  catastrophe: 'People in catastrophe (Phase 5)',
  catastropheCaption: (day: string) => `Countries whose analysis in force on ${day} has people in Phase 5. ${PHASE5_NOTE}`,
  phase5Note: PHASE5_NOTE,
  country: 'Country',
  period: 'Analysis',
  people5: 'Phase 5',
  people3: 'Phase 3 or above',

  // The country page's block.
  block: 'Food crisis',
  /** Under the figure: what it counts, of how many, and the analysis with its period. */
  blockCaption: (system: string, kind: string, period: string, analysed: string, share: string) =>
    `people ${kindOf(kind) === 'projection' ? 'projected' : 'estimated'} to be in Phase 3 (crisis) or worse, ${share} of the ${analysed} analysed. ${labelOf(system, kind, period)}.`,
  blockPart: (analysed: string, population: string) => `The analysis covered ${analysed} of the ${population} people IPC counts in the country.`,
  blockPhase5: (x: number, kind: string, analysed: string | null) => `${n(x)} of them ${kindOf(kind) === 'projection' ? 'projected' : 'estimated'} to be in Phase 5 (catastrophe)${analysed ? `, of ${analysed} people analysed` : ''}.`,
  /** The latest analysis is no longer in force: its figure is still the one the maps show, tagged Period ended. */
  blockOld: (day: string) => `Its period has ended, and no newer IPC or Cadre Harmonisé analysis is in force on ${day}.`,
  /** The latest analysis is for a period that has not begun. */
  blockAhead: (month: string) => `Its period begins in ${month}.`,
  blockLink: 'Food crises map',
  /** A place IPC's data has no analysis of. */
  blockNone: (place: string) => `IPC and Cadre Harmonisé have no analysis for ${place}. These pages cover only places with an analysis.`,
  /** The source line's period part: "Covers Oct 2026 – Jan 2027 (projection)". */
  sourcePart: (kind: string, period: string) => `Covers ${period} (${kindOf(kind)})`,
  /** A view's or indicator page's period part: its figures are each country's latest analysis starting in the year. */
  covers: (year: number | string) => `Covers analyses starting in ${year}`,
  /** Before the day the site last fetched IPC's data, kept apart from the "updated" date IPC's terms ask for in the
   *  credit, which is the day its analyses last changed. */
  lastFetched: 'Last fetched',
  /** The credit's name for Cadre Harmonisé figures, which reach the site through IPC's API. */
  chCredit: 'Cadre Harmonisé, via the IPC API',
};
