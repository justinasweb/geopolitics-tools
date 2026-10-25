// The map views drawn from the indicator registry (src/data/indicators.ts, plus ./view-measures.ts): each family is one section of the site
// (/emissions, /refugees, /space) and each of its layers one page, the first at the section's own address. A layer names
// the registry measure it maps, so its figures are the same ones the indicator and country pages show. Words are in
// src/i18n/views.en.ts and slugs in src/i18n/slugs.en.ts; this file holds no text.

export interface ViewLayer {
  /** The registry measure. */
  indicator: string;
  /** Diverging layers (co2trade) colour both directions from a neutral middle; the rest are sequential. */
  scale: 'seq' | 'div';
  /** Countries' values add up to a world total, so the page can give shares of it (not true of per-person values). */
  sums: boolean;
  /** The source's latest year is still running (launches): the view stops at the last full year. */
  fullYears?: boolean;
}

export interface ViewFamily {
  id: string;
  /** The topic hub it belongs to, for the breadcrumbs and the Atlas. */
  hub: string;
  layers: ViewLayer[];
}

export const VIEW_FAMILIES: ViewFamily[] = [
  {
    id: 'emissions', hub: 'climate', layers: [
      { indicator: 'co2', scale: 'seq', sums: true },
      { indicator: 'co2pc', scale: 'seq', sums: false },
      { indicator: 'co2cum', scale: 'seq', sums: true },
      { indicator: 'co2trade', scale: 'div', sums: false },
    ],
  },
  {
    id: 'refugees', hub: 'security', layers: [
      { indicator: 'refout', scale: 'seq', sums: true },
      { indicator: 'refin', scale: 'seq', sums: true },
      { indicator: 'refinpc', scale: 'seq', sums: false },
      { indicator: 'idps', scale: 'seq', sums: true },
    ],
  },
  {
    id: 'space', hub: 'technology', layers: [
      { indicator: 'satellites', scale: 'seq', sums: true },
      { indicator: 'launches', scale: 'seq', sums: true, fullYears: true },
    ],
  },
  {
    id: 'ai', hub: 'technology', layers: [
      { indicator: 'aicompute', scale: 'seq', sums: false },
      // A model from labs in two countries counts for each, so countries' figures do not add up to a world total.
      { indicator: 'aimodels', scale: 'seq', sums: false, fullYears: true },
      { indicator: 'entitylist', scale: 'seq', sums: true },
    ],
  },
];

/** Diverging class edges for a change relative to a country's own figure (co2trade): ±3%, ±10%, ±30%. */
export const DIV_EDGES = [-0.3, -0.1, -0.03, 0.03, 0.1, 0.3];
