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
  /** Each figure is a total over this many years (arms, five), so it is compared with the period before, not the year before. */
  span?: number;
  /** The figures are shares of a country's own total (electricity), so changes are in percentage points. */
  points?: boolean;
  /** Fixed class edges, for scores with named bands (water stress); the layer's words give the ticks. */
  edges?: number[];
}

export interface ViewFamily {
  id: string;
  /** The topic hub it belongs to, for the breadcrumbs and the Atlas. */
  hub: string;
  /** The layer for the section's own address waits on a source (internet cables), so every layer has its own. */
  rootWaits?: boolean;
  layers: ViewLayer[];
}

export const VIEW_FAMILIES: ViewFamily[] = [
  {
    // Shares of each country's own generation, so they do not add up; the world figure is Ember's world mix (../lib/views.ts).
    id: 'electricity', hub: 'resources', layers: [
      { indicator: 'lowcarbon', scale: 'seq', sums: false, points: true, edges: [0.2, 0.4, 0.6, 0.8] },
      { indicator: 'windsolar', scale: 'seq', sums: false, points: true, edges: [0.05, 0.1, 0.2, 0.3] },
      { indicator: 'coalpower', scale: 'seq', sums: false, points: true, edges: [0.2, 0.4, 0.6, 0.8] },
      { indicator: 'gaspower', scale: 'seq', sums: false, points: true, edges: [0.2, 0.4, 0.6, 0.8] },
      { indicator: 'nuclearpower', scale: 'seq', sums: false, points: true, edges: [0.05, 0.15, 0.3, 0.5] },
    ],
  },
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
  {
    id: 'water', hub: 'climate', layers: [
      // Aqueduct's score bands: 0–1 low, 1–2 low to medium, 2–3 medium to high, 3–4 high, 4–5 extremely high.
      { indicator: 'waterstress', scale: 'seq', sums: false, edges: [1, 2, 3, 4] },
      { indicator: 'waterstress2050', scale: 'seq', sums: false, edges: [1, 2, 3, 4] },
      { indicator: 'waterdep', scale: 'seq', sums: false },
    ],
  },
  {
    id: 'chinese-lending', hub: 'power', layers: [
      { indicator: 'lendall', scale: 'seq', sums: true },
      { indicator: 'lendenergy', scale: 'seq', sums: true },
      { indicator: 'lendtransport', scale: 'seq', sums: true },
      { indicator: 'lendindustry', scale: 'seq', sums: true },
      { indicator: 'lendbanking', scale: 'seq', sums: true },
      { indicator: 'lendother', scale: 'seq', sums: true },
    ],
  },
  {
    // Five-year totals, as SIPRI compares them (../lib/arms.ts).
    id: 'arms', hub: 'security', layers: [
      { indicator: 'armsexp5', scale: 'seq', sums: true, span: 5 },
      { indicator: 'armsimp5', scale: 'seq', sums: true, span: 5 },
    ],
  },
  {
    // Cables, at /internet, wait on a source with fuller coverage than OpenStreetMap's.
    id: 'internet', hub: 'technology', rootWaits: true, layers: [
      { indicator: 'outages', scale: 'seq', sums: true },
    ],
  },
  {
    id: 'sanctions', hub: 'power', layers: [
      // A target on two lists counts once for each, so the all-lists layer is listings, not distinct targets.
      { indicator: 'sanctions', scale: 'seq', sums: true },
      { indicator: 'sanctionsus', scale: 'seq', sums: true },
      { indicator: 'sanctionseu', scale: 'seq', sums: true },
      { indicator: 'sanctionsuk', scale: 'seq', sums: true },
    ],
  },
];

/** Diverging class edges for a change relative to a country's own figure (co2trade): ±3%, ±10%, ±30%. */
export const DIV_EDGES = [-0.3, -0.1, -0.03, 0.03, 0.1, 0.3];
