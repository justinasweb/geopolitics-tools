// The shape of a map layer file (/map/<layer>.json), written at build time by ./layers.ts and read by the map
// engine in the browser (src/scripts/map/). A layer is data, not code: the same file serves its map view page and
// the Atlas (spec, "Atlas" under Views), so a layer is defined once.
//
// Everything a reader sees is already formatted and worded in the page's language at build time; the engine only
// places it. Coordinates are map coordinates (Equal Earth drawn through Web Mercator, ./projection.ts).

import type { Format } from '../../data/indicators.ts';

export type Status = 'estimate' | 'projection' | 'preliminary';

/**
 * One place's entry for a year: [class, value, detail, status, rank].
 * Class: 1–5 on a sequential scale, 1–7 on a diverging one; 0 withheld by the source; -1 not yet reported.
 * Value is the figure the map shades by ("32%"), detail the absolute figure ("92,000 t"); rank is among places listed.
 */
export type Entry = [cls: number, value: string, detail: string, status: Status | 0, rank: number];

export interface LayerYear {
  /** The year, or for a layer over periods (axis "days") the period's length in days. */
  year: number;
  /** What the panel, tooltip and kicker say instead of the year ("Last 30 days"). */
  label?: string;
  /** The year's own tag on the slider: the source marks it estimated or preliminary. */
  status?: Status;
  legend: string;
  /** By internal place id. A place left out has no figure for the year ("No production listed"). */
  v: Record<string, Entry>;
  /** Places with a figure, in rank order: what N and P step through. */
  order: string[];
  /** Panel line for each bloc this year ("BRICS members mined 35%…"). */
  blocs: Record<string, string>;
  /** Blocks for a selected place that change with the year (a period's alerts). */
  more?: Record<string, PanelBlock[]>;
}

/** A short block in a selected place's panel: a label, optional caption, rows of name and value, a source line. */
export interface PanelBlock {
  label: string;
  caption?: string;
  rows: { name: string; value: string; href?: string; note?: string }[];
  /** A line under the rows ("and 12 more"). */
  more?: string;
  source?: string;
}

/** `m`, as on a point: the years (by bit of their index) the arc shows in; 0 or none for every year. */
export interface Arc { p: [number, number][]; w: number; tip: string; m?: number }
export interface Line { p: [number, number][][]; tip: string }
/** A point; `m` is a bit mask of the year indices it shows in (bit i for data[i]), 0 or none for all; `i` the one index it shows in, for layers with more steps than a mask can hold (conflict months). */
export interface Point { at: [number, number]; r?: number; tip: string; m?: number; i?: number }
export type Overlay =
  | { id: string; kind: 'arcs'; label: string; dashed?: boolean; items: Arc[] }
  | { id: string; kind: 'lines'; label: string; dashed?: boolean; items: Line[] }
  | { id: string; kind: 'points'; label: string; symbol: 'dot' | 'hollow' | 'triangle' | 'diamond' | 'square'; items: Point[] };

export interface LayerFile {
  id: string;
  /** The layer's own name, as its view's title and kicker say it ("Lithium", "Wheat production"): the Atlas lists it. */
  name: string;
  scale: 'seq' | 'div';
  /** What the slider steps through: years (the default), periods in days (?days= in the URL), or months, numbered
   *  year × 12 + month − 1 so they run on without gaps (?month=2026-03 in the URL). */
  axis?: 'days' | 'months';
  years: number[];
  /** The year shown when the URL names none: the latest. */
  year: number;
  ticks: string[];
  /** Diverging scales: what each end means. */
  ends?: [string, string];
  /** Legend words for the shapes without a class. */
  missing: { none: string; withheld?: string; notyet?: string };
  source: string;
  /** Words with {placeholders}, filled in by the engine. */
  text: {
    kicker: string;        // "Lithium · {year}"
    measure: string;       // "of world mine production"
    shareLabel: string;    // "Share of world mine production"
    none: string;          // "No production listed for {year}"
    withheld: string;      // "Withheld by source"
    withheldWhy: string;   // one sentence
    prev: string;          // "{year}: {detail} ({value})"
    rank: string;          // "{rank} of {of} listed"
    world: string; close: string; countryPage: string; dossier: string; inTable: string; hint: string; tapHint: string;
    note: string; disputed: string; selected: string; cleared: string; members: string; removeBloc: string;
    movedYear: string; keys: string;
    /** The selected place's panel: fact labels, the trend's title ({from}, {to}) and caption ({first}, {from}, {last}, {to}), the ranking's title ({year}). */
    detailLabel?: string; rankLabel?: string; rankOf?: string; statusLabel?: string;
    trend?: string; trendCaption?: string; ranking?: string;
  };
  /** Status tags as HTML (their glyph and word). */
  tags: Record<Status, string>;
  names: Record<string, string>;
  /** Country pages and dossiers that exist. */
  hrefs: Record<string, string>;
  dossiers: string[];
  /** URL slugs of places, for ?country= */
  slugs: Record<string, string>;
  /** One-line notes for disputed places (territories policy, section 4). */
  notes: Record<string, string>;
  blocs: Record<string, { name: string; members: string[] }>;
  data: LayerYear[];
  /**
   * Each place's figure as a number, one per entry of `data` (null where it has none): the panel's trend line and
   * its bars. Formatted in the browser with `format`.
   */
  series?: Record<string, (number | null)[]>;
  format?: Format;
  /** Blocks for a selected place that stay the same in every year (its other measures, its other minerals). */
  more?: Record<string, PanelBlock[]>;
  overlays?: Overlay[];
  /** Where the map starts and its reset button returns, in map coordinates; the whole world when left out. */
  bounds?: [[number, number], [number, number]];
}
