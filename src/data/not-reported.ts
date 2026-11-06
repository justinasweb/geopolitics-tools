// Places a measure shows as "Not reported since <year>" from a year on, instead of the source's figure: the source
// still publishes one, but it stopped counting what most of it was, so shading or ranking by it would mislead
// (decided 6 Nov 2026, docs/open-questions.md). Maps hatch them like "withheld by source", with their own legend
// entry; rankings, totals and the tables' figures leave them out for those years. The reason's words are in
// src/i18n/views.en.ts (NOT_REPORTED_TEXT), by `reason`.
export interface NotReported {
  /** Registry indicator ids. */
  indicators: string[];
  /** Internal place id. */
  place: string;
  /** The first year not shown; the label names the year before ("Not reported since 2023"). */
  from: number;
  reason: string;
}

export const NOT_REPORTED: NotReported[] = [
  // UNHCR's figures stop counting Ukrainians in Russia from 2024: Russia falls from 1.23 million (2023) to 12,787 (2025).
  { indicators: ['refin', 'refinpc'], place: 'RUS', from: 2024, reason: 'ukrainians-in-russia' },
];

/** The case that hides a place's figure for an indicator in a year, if any. */
export const notReported = (indicator: string, place: string, year: number): NotReported | undefined =>
  NOT_REPORTED.find((n) => n.place === place && year >= n.from && n.indicators.includes(indicator));
