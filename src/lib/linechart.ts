// The line chart (svg.gt-lc, CountryCharts design) as an HTML string, so the build (LineChart.astro) and browser
// scripts (Compare, src/scripts/compare.ts) draw the same markup: actual values solid, projections dashed after a
// dotted split line labelled "Projection" (and a line's own estimates dashed after its last actual year), an optional
// range band, and lines labelled at their ends so colour is never the only cue. The numbers are in the table or
// figures next to it.
// The SVG has no viewBox: it is as wide as its column and `height` pixels tall, so its text stays at the design
// sizes (12px ticks, 13px labels) at any width. Text is placed in percent of the plot's width; the lines and
// band are drawn in a nested SVG stretched over the plot, with strokes that do not stretch. The margins for the
// value ticks and end labels are padding around the SVG, sized from the labels. Under 440px the chart shows
// fewer year labels and shorter end labels (a container query in country.css). No Node imports.
import type { Format } from '../data/indicators.ts';
import { formatValue } from './format.ts';
import { CHART_LABEL_PX, CHART_TICK_PX, NARROWEST, NARROW_BELOW, clip, textWidth, yearTickIndexes } from './chart.ts';
import { DOSSIER_TEXT } from '../i18n/pages.en.ts';

export interface Line {
  label: string;
  values: (number | null)[];
  /** Colour class: gt-ser-1…6, gt-ser-med, or a Compare side (gt-cc--first, gt-cc--second). */
  cls?: string;
  dashed?: boolean;
  /** Hide the end label (the key says it). */
  noLabel?: boolean;
  /** The line's own last actual year, when earlier than the chart's (a country's WEO estimates): dashed after it. */
  actualTo?: number;
}
export interface LineChartProps {
  label: string;
  years: number[];
  lines: Line[];
  format: Format;
  /** Years after this are projections: dashed, behind a split line. */
  projectedAfter?: number;
  band?: { lo: (number | null)[]; hi: (number | null)[] };
  height?: number;
  /** Start the value axis at zero (amounts) rather than at the data's minimum (rates). */
  zero?: boolean;
}

const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function lineChartHtml({ label, years, lines, format, projectedAfter, band, height = 260, zero = true }: LineChartProps): string {
  const H = height, T = 14, B = 32, PW = 1000;
  const all = [...lines.flatMap((l) => l.values), ...(band ? [...band.lo, ...band.hi] : [])].filter((v): v is number => v !== null);
  let lo = zero ? Math.min(0, ...all) : Math.min(...all);
  let hi = Math.max(...all);
  if (!(hi > lo)) { hi = lo + 1; }
  // Round the axis to tidy steps.
  const span = hi - lo;
  const mag = 10 ** Math.floor(Math.log10(span / 4));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) ?? mag * 10;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  // A plain number's ticks get the decimals their step needs, up to four, so a small emitter's axis reads "0.0025 Mt",
  // not "0 Mt" on every line.
  let tickFormat = format;
  const rounds = (d: number) => ticks.some((t) => Math.abs(Number(t.toFixed(d)) - t) > step * 1e-6);
  while (tickFormat.kind === 'number' && (tickFormat.digits ?? 0) < 4 && rounds(tickFormat.digits ?? 0)) {
    tickFormat = { ...tickFormat, digits: (tickFormat.digits ?? 0) + 1 };
  }
  const short = (v: number) => formatValue(v, v === 0 ? format : tickFormat);
  // x: the plot's width, as a share (for text, in %) or in the nested SVG's 0–1000 units (for paths).
  const share = (i: number) => (years.length > 1 ? i / (years.length - 1) : 0);
  const pct = (i: number) => `${(share(i) * 100).toFixed(2)}%`;
  const x = (i: number) => share(i) * PW;
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const last = years.length - 1;
  const splitIndex = projectedAfter === undefined ? -1 : years.findIndex((yr) => yr > projectedAfter);
  // A line is solid up to the split, or up to its own last actual year when that is earlier, and dashed after.
  const solidTo = (l: Line) => {
    const own = l.actualTo === undefined ? -1 : years.findIndex((yr) => yr > l.actualTo!);
    const ends = [splitIndex > 0 ? splitIndex - 1 : last, own > 0 ? own - 1 : last];
    return Math.min(...ends);
  };
  const segs = (vals: (number | null)[], from: number, to: number) => {
    const out: string[] = [];
    let d = '';
    for (let i = from; i <= to; i++) {
      const v = vals[i];
      if (v === null || v === undefined) { if (d) out.push(d); d = ''; continue; }
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }
    if (d) out.push(d);
    return out;
  };
  const bandPath = band ? (() => {
    const top = band.hi.map((v, i) => (v === null ? null : `${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean);
    const bot = band.lo.map((v, i) => (v === null ? null : `${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean).reverse();
    return top.length ? `M${top.join('L')}L${bot.join('L')}Z` : '';
  })() : '';
  // End labels, nudged apart so they do not overlap.
  const ends = lines.filter((l) => !l.noLabel).map((l) => {
    const i = l.values.findLastIndex((v) => v !== null);
    return { l, i, yy: i >= 0 ? y(l.values[i]!) : -1, full: clip(l.label, 20), short: clip(l.label, 12) };
  }).filter((e) => e.i >= 0).sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 16) ends[k].yy = ends[k - 1].yy + 16;
  // Labels pushed below the plot move back up, keeping their spacing.
  const floor = H - B - 4;
  for (let k = ends.length - 1; k >= 0; k--) {
    const limit = k === ends.length - 1 ? floor : ends[k + 1].yy - 16;
    if (ends[k].yy > limit) ends[k].yy = limit;
  }
  // Margins: the widest value tick on the left; the widest end label (or half a year label) on the right.
  const L = Math.max(28, ...ticks.map((t) => textWidth(short(t), CHART_TICK_PX) + 10));
  const endW = (key: 'full' | 'short') => Math.max(18, ...ends.map((e) => textWidth(e[key], CHART_LABEL_PX, true) + 12));
  const R = endW('full'), Rn = endW('short');
  // Year labels for a wide and a narrow column; each one shown in only one layout carries a class that hides it in the other.
  const wide = new Set(yearTickIndexes(years.length, NARROW_BELOW - L - R));
  const narrow = new Set(yearTickIndexes(years.length, NARROWEST - L - Rn));
  const yearTicks = years.map((yr, i) => ({ yr, i, cls: wide.has(i) ? (narrow.has(i) ? undefined : 'gt-lc__wide') : narrow.has(i) ? 'gt-lc__narrow' : null }))
    .filter((t) => t.cls !== null);
  // The "Projection" note sits right of the split line, or left of it when the split is near the right edge.
  const noteLeft = splitIndex > 0 && share(splitIndex - 1) > 0.7;

  const grid = ticks.map((t) => `<g><line class="gt-lc__grid" x1="0" x2="100%" y1="${y(t)}" y2="${y(t)}"></line><text x="-8" y="${y(t) + 4}" text-anchor="end">${esc(short(t))}</text></g>`).join('');
  const xt = yearTicks.map((t) => `<text${t.cls ? ` class="${t.cls}"` : ''} x="${pct(t.i)}" y="${H - 8}" text-anchor="middle">${t.yr}</text>`).join('');
  const paths = lines.map((l) => {
    const to = solidTo(l);
    const solid = segs(l.values, 0, to).map((d) => `<path class="${cls('gt-lc__line', l.cls, l.dashed && 'gt-lc__line--dash')}" d="${d}"></path>`).join('');
    const proj = to < last ? segs(l.values, to, last).map((d) => `<path class="${cls('gt-lc__line', 'gt-lc__line--proj', l.cls)}" d="${d}"></path>`).join('') : '';
    return `<g>${solid}${proj}</g>`;
  }).join('');
  const split = splitIndex > 0
    ? `<g><line class="gt-lc__split" x1="${pct(splitIndex - 1)}" x2="${pct(splitIndex - 1)}" y1="${T}" y2="${H - B}"></line>`
      + `<text class="gt-lc__note" x="${pct(splitIndex - 1)}" dx="${noteLeft ? -6 : 6}" y="${T + 10}" text-anchor="${noteLeft ? 'end' : 'start'}">${esc(DOSSIER_TEXT.projection)}</text></g>`
    : '';
  const lab = (e: typeof ends[number], text: string, layout?: string) =>
    `<text class="${cls('gt-lc__lab', layout, e.l.cls)}" x="${pct(e.i)}" dx="8" y="${e.yy + 4}">${esc(text)}</text>`;
  const labels = ends.map((e) => (e.full === e.short ? lab(e, e.full) : lab(e, e.full, 'gt-lc__wide') + lab(e, e.short, 'gt-lc__narrow'))).join('');
  return `<div class="gt-lcw" style="--l:${L}px;--r:${R}px;--rn:${Rn}px;--h:${H}px">`
    + `<svg class="gt-lc" height="${H}" role="img" aria-label="${esc(label)}">${grid}${xt}`
    + `<svg width="100%" height="${H}" viewBox="0 0 ${PW} ${H}" preserveAspectRatio="none" overflow="visible" aria-hidden="true">`
    + `${bandPath ? `<path class="gt-lc__band" d="${bandPath}"></path>` : ''}${paths}</svg>${split}${labels}</svg></div>`;
}
