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
