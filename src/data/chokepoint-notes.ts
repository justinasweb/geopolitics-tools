// Caveats on a chokepoint's figures, kept by hand: what the source itself says limits them, with where it says so and
// when that was checked. Shown beside the figures they qualify on the chokepoint's page and in the map's panel. Keyed
// by the page's slug (from PortWatch's full name, never its portid). Check them when importing PortWatch each month,
// and drop a note once the source drops its warning.

export interface ChokepointNote {
  slug: string;
  text: string;
  /** The same warning in one short sentence, for a line that names the chokepoint with a figure (the chokepoints
   *  view's summary, share cards, descriptions). */
  short: string;
  source: string;
  url: string;
  /** When the source was last seen to say so (YYYY-MM-DD). */
  checked: string;
}

export const CHOKEPOINT_NOTES: ChokepointNote[] = [
  {
    slug: 'strait-of-hormuz',
    text: 'IMF PortWatch warns that, because of the conflict in the region, GPS jamming, AIS spoofing and ships switching off their transponders affect the ship counts and cargo estimates for the strait.',
    short: 'PortWatch warns that jammed, faked or switched-off ship signals affect this count.',
    source: 'IMF PortWatch, Strait of Hormuz page',
    url: 'https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730',
    checked: '2026-11-22',
  },
];
