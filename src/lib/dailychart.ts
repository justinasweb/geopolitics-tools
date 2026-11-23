// The daily chart on place pages (svg.gt-tc, PlaceBlocks design): a value for each day of 12 months as a line, the
// usual range shaded behind it (with gaps where a day has none), the latest value marked and labelled, months along
// the bottom with the year under the first and under each January. Drawn as linechart.ts draws (no viewBox: as wide as its column and `height` pixels tall, text placed in
// percent of the plot, the line and band in a nested SVG stretched over the plot, strokes that do not stretch), so
// its text stays at the design sizes at any width. Under 440px fewer month labels show (place.css).
import { CHART_TICK_PX, NARROWEST, textWidth } from './chart.ts';

export interface DailyPoint { date: string; value: number | null; range: [number, number] | null }

const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Round value ticks from 0: steps of 1, 2 or 5 times a power of ten, at most five. */
export function dailyTicks(max: number): number[] {
  const top = Math.max(1, max);
  const mag = 10 ** Math.floor(Math.log10(top / 4));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => top / s <= 5) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= Math.ceil(top / step) * step + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Runs of consecutive indexes where `ok` holds, for drawing a line or band with gaps. */
function runs(n: number, ok: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && ok(i)) { if (start < 0) start = i; }
    else if (start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  return out;
}

export function dailyChartHtml({ label, points, format, height = 240 }: { label: string; points: DailyPoint[]; format: (v: number) => string; height?: number }): string {
  const H = height, T = 12, B = 44, PW = 1000;
  const n = points.length;
  const max = Math.max(0, ...points.flatMap((p) => [p.value ?? 0, p.range?.[1] ?? 0]));
  const ticks = dailyTicks(max);
  const hi = ticks.at(-1)!;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * PW : 0);
  const pct = (i: number) => `${(n > 1 ? (i / (n - 1)) * 100 : 0).toFixed(2)}%`;
  const y = (v: number) => T + (1 - v / hi) * (H - T - B);
  const L = Math.max(28, ...ticks.map((t) => textWidth(format(t), CHART_TICK_PX) + 10));
  const lastIndex = points.findLastIndex((p) => p.value !== null);
  const lastText = lastIndex >= 0 ? format(points[lastIndex].value!) : '';
  const R = Math.max(12, textWidth(lastText, 13, true) + 14);

  const bands = runs(n, (i) => points[i].range !== null).map(([a, b]) => {
    const top = [], bot = [];
    for (let i = a; i <= b; i++) top.push(`${x(i).toFixed(1)} ${y(points[i].range![1]).toFixed(1)}`);
    for (let i = b; i >= a; i--) bot.push(`${x(i).toFixed(1)} ${y(points[i].range![0]).toFixed(1)}`);
    // A one-day band is drawn as a sliver a day wide.
    return a === b ? `M${(x(a) - 1).toFixed(1)} ${y(points[a].range![1]).toFixed(1)}h2V${y(points[a].range![0]).toFixed(1)}h-2Z` : `M${top.join('L')}L${bot.join('L')}Z`;
  }).map((d) => `<path class="gt-tc__band" d="${d}"></path>`).join('');
  const line = runs(n, (i) => points[i].value !== null).map(([a, b]) => {
    let d = '';
    for (let i = a; i <= b; i++) d += `${i === a ? 'M' : 'L'}${x(i).toFixed(1)} ${y(points[i].value!).toFixed(1)}`;
    return `<path class="gt-tc__line" d="${d}"></path>`;
  }).join('');

  // A label at the first day of each month: its month, and on the first label and each January a second line with
  // that day's own year ("Dec / 2025", "Jan / 2026"). Those always show; in a narrow column every other month shows
  // (three months apart under 288px), counted from the last label with a year, leaving out one too close to the next.
  const firsts = points.map((p, i) => ({ p, i }))
    // Too close to the right edge for its words: left out.
    .filter(({ p, i }) => p.date.endsWith('-01') && i / Math.max(1, n - 1) <= 0.97);
  const narrowEvery = (NARROWEST - L - R) / Math.max(1, firsts.length) < 36 ? 3 : 2;
  const withYear = (k: number) => k === 0 || firsts[k].p.date.slice(5, 7) === '01';
  const always = firsts.map((_f, k) => k).filter(withYear);
  const months = firsts.map(({ p, i }, k) => {
    const m = Number(p.date.slice(5, 7)) - 1;
    const year = withYear(k) ? p.date.slice(0, 4) : '';
    const prev = Math.max(...always.filter((a) => a <= k));
    const next = Math.min(...always.filter((a) => a > k), Infinity);
    const narrow = year !== '' || ((k - prev) % narrowEvery === 0 && next - k >= narrowEvery);
    // Two labels with a year a month apart (the first in December, then January): in a narrow column they lean away
    // from each other (place.css), so the years do not run together.
    const lean = year && always.includes(k + 1) && k + 1 === always[always.indexOf(k) + 1] ? 'gt-tc__end' : year && always.includes(k - 1) ? 'gt-tc__start' : '';
    const cls = [narrow ? '' : 'gt-tc__wide', lean].filter(Boolean).join(' ');
    return `<g${cls ? ` class="${cls}"` : ''}><line class="gt-tc__grid" x1="${pct(i)}" x2="${pct(i)}" y1="${H - B}" y2="${H - B + 4}"></line>`
      + `<text x="${pct(i)}" y="${H - B + 18}" text-anchor="middle">${esc(MONTHS[m])}</text>`
      + (year ? `<text x="${pct(i)}" y="${H - B + 34}" text-anchor="middle" font-weight="600">${esc(year)}</text>` : '') + '</g>';
  }).join('');
  const grid = ticks.map((t) => `<g><line class="gt-tc__grid" x1="0" x2="100%" y1="${y(t)}" y2="${y(t)}"></line><text x="-8" y="${y(t) + 4}" text-anchor="end">${esc(format(t))}</text></g>`).join('');
  const dot = lastIndex >= 0
    ? `<circle class="gt-tc__dot" cx="${pct(lastIndex)}" cy="${y(points[lastIndex].value!)}" r="4"></circle><text class="gt-tc__lab" x="${pct(lastIndex)}" dx="8" y="${y(points[lastIndex].value!) + 4}">${esc(lastText)}</text>`
    : '';
  return `<div class="gt-tcw" style="--l:${L}px;--r:${R}px;--h:${H}px">`
    + `<svg class="gt-tc__svg" height="${H}" role="img" aria-label="${esc(label)}">${grid}${months}`
    + `<svg width="100%" height="${H}" viewBox="0 0 ${PW} ${H}" preserveAspectRatio="none" overflow="visible" aria-hidden="true">${bands}${line}</svg>${dot}</svg></div>`;
}
