// Layout helpers for the build-time SVG charts (LineChart, Pyramid). Their text is set in CSS pixels, not
// scaled with the drawing, so margins and tick counts are worked out from estimated label widths here.

/** Chart text sizes from the design system: ticks 12px, labels 13px (600). */
export const CHART_TICK_PX = 12;
export const CHART_LABEL_PX = 13;

/** A rough rendered width in pixels; wide enough for the site's sans at these sizes. */
export function textWidth(s: string, size: number, bold = false): number {
  return Math.ceil(s.length * size * (bold ? 0.6 : 0.56));
}

/** Container widths (px) at which a chart switches to its narrow layout, and the narrowest it is laid out for. */
export const NARROW_BELOW = 440;
export const NARROWEST = 288;

/**
 * Indexes of the year labels to show on a plot `plotW` pixels wide: the first and last always, and evenly
 * stepped ones between, at least `gap` pixels apart centre to centre so 4-digit years never touch.
 */
export function yearTickIndexes(count: number, plotW: number, gap = 48): number[] {
  if (count < 1) return [];
  const last = count - 1;
  if (last === 0) return [0];
  const per = plotW / last;
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => s * per >= gap) ?? last;
  const out = [0];
  for (let i = step; i < last; i += step) if ((last - i) * per >= gap) out.push(i);
  if (last * per >= gap) out.push(last);
  return out;
}

/** Shortens a label to `n` characters with an ellipsis. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Formats whose axis labels drop decimals from 10 of a unit, so they take no 2.5 step (ticks' `halves`). */
export const wholeSteps = (f: { kind: string }) => f.kind === 'money' || f.kind === 'count';

/** Tidy axis ticks: a linear step of 1, 2, 2.5 or 5 × 10ⁿ, or powers of ten (with 2 and 5 between, when few). Without
 *  `halves` no 2.5 step: money and counts are written without decimals from 10 of a unit ("$13 bn" for 12.5 bn). */
export function ticks(lo: number, hi: number, log: boolean, count = 5, halves = true): { lo: number; hi: number; ticks: number[] } {
  if (log) {
    const a = Math.floor(Math.log10(lo));
    const b = Math.ceil(Math.log10(hi));
    const out: number[] = [];
    for (let e = a; e <= b; e++) {
      out.push(10 ** e);
      if (b - a <= 2 && e < b) out.push(2 * 10 ** e, 5 * 10 ** e);
    }
    const step = Math.max(1, Math.ceil((b - a + 1) / 7));
    return { lo: 10 ** a, hi: 10 ** b, ticks: b - a <= 2 ? out : out.filter((_, i) => i % step === 0) };
  }
  if (!(hi > lo)) hi = lo + 1;
  const span = hi - lo;
  const mag = 10 ** Math.floor(Math.log10(span / count));
  const step = (halves ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]).map((k) => k * mag).find((s) => span / s <= count) ?? mag * 10;
  const l = Math.floor(lo / step) * step;
  const h = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = l; v <= h + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return { lo: l, hi: h, ticks: out };
}
