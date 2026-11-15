// Text that follows a map view's year control. The build writes each year's words into the page once (the latest
// year's as the element's own text, the no-JS default) and the map script swaps them when the reader picks a year
// (src/scripts/map/by-year.ts):
//  - data-by-year: a JSON object, year to text (or to paragraphs), for an element's text;
//  - data-label-by-year: the same for an aria-label (the map canvas);
//  - data-for-year: markup per year, the others hidden (source line parts and status tags).

/** Each year's text or paragraphs, as the JSON for data-by-year / data-label-by-year. Years with nothing are left out. */
export function byYear(years: readonly number[], text: (y: number) => string | string[] | null | undefined): string {
  return JSON.stringify(Object.fromEntries(years.flatMap((y) => {
    const t = text(y);
    return t == null || (Array.isArray(t) && !t.length) ? [] : [[y, t]];
  })));
}
