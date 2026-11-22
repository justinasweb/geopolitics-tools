// Map legends as HTML, from a layer file (src/lib/map/types.ts): the shaded layer's scale or named classes, its
// ticks, its ends and the shapes without a class (no data, withheld, not yet reported); and the mark shapes the
// engine draws (./engine.ts), for overlay legends and lists. Pure functions, so the page can draw a legend at build
// time and the Atlas redraw it in the browser from the same code.
import type { LayerFile } from '../../lib/map/types';
import { esc } from './text';
import { seqSteps } from '../../lib/map/steps';

export type MarkSymbol = 'dot' | 'hollow' | 'triangle' | 'diamond' | 'square' | 'arc' | 'arc-dashed' | 'outline' | StatusMark;
/** A chokepoint's status as a diamond: its fill by status and a glyph inside, so the status never rests on colour
 *  (none near usual, a down chevron below, two at 30% or more below, an up chevron above, a dashed edge with no data). */
export type StatusMark = 'cp-disrupted' | 'cp-below' | 'cp-normal' | 'cp-above' | 'cp-unknown';

/** Each status diamond: fill, glyph colour, glyph paths (16 × 16), dashed edge. The engine draws the same at 32 × 32. */
export const STATUS_MARKS: Record<StatusMark, { fill: string; ink: string; glyph: string[]; dashed?: boolean }> = {
  'cp-disrupted': { fill: '--div-1', ink: '--paper-raised', glyph: ['M5.2 4.9 8 7.5l2.8-2.6', 'M5.2 8.5 8 11.1l2.8-2.6'] },
  'cp-below': { fill: '--div-3', ink: '--ink', glyph: ['M5.2 6.7 8 9.3l2.8-2.6'] },
  'cp-normal': { fill: '--paper-raised', ink: '--ink', glyph: [] },
  'cp-above': { fill: '--div-6', ink: '--paper-raised', glyph: ['M5.2 9.3 8 6.7l2.8 2.6'] },
  'cp-unknown': { fill: '--map-nodata', ink: '--ink-muted', glyph: [], dashed: true },
};
const statusSvg = (k: StatusMark) => {
  const m = STATUS_MARKS[k];
  return `<path d="M8 1.2 14.8 8 8 14.8 1.2 8z" fill="var(${m.fill})" stroke="var(${m.dashed ? '--ink-muted' : '--ink'})" stroke-width="1.3"${m.dashed ? ' stroke-dasharray="2 1.5"' : ''}/>`
    + m.glyph.map((d) => `<path d="${d}" fill="none" stroke="var(${m.ink})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
};

const SHAPES: Record<MarkSymbol, string> = {
  triangle: '<path d="M8 2.5 14 13.5H2z" fill="var(--ink)" stroke="var(--paper-raised)" stroke-width="1.2"/>',
  diamond: '<path d="M8 1.8 14.2 8 8 14.2 1.8 8z" fill="var(--paper-raised)" stroke="var(--ink)" stroke-width="1.4"/>',
  square: '<rect x="3.5" y="3.5" width="9" height="9" fill="var(--paper-raised)" stroke="var(--ink)" stroke-width="1.4"/>',
  dot: '<circle cx="8" cy="8" r="3.6" fill="var(--accent)" stroke="var(--paper-raised)" stroke-width="1"/>',
  arc: '<path d="M1.5 12.5Q8 1 14.5 12.5" fill="none" stroke="var(--ink)" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>',
  'arc-dashed': '<path d="M1.5 12.5Q8 1 14.5 12.5" fill="none" stroke="var(--ink)" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="3 2"/>',
  hollow: '<circle cx="8" cy="8" r="5" fill="var(--paper-raised)" stroke="var(--accent)" stroke-width="1.8"/>',
  // A bloc's outline: the members' borders, drawn in ink.
  outline: '<rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="var(--ink)" stroke-width="2"/>',
  'cp-disrupted': statusSvg('cp-disrupted'), 'cp-below': statusSvg('cp-below'), 'cp-normal': statusSvg('cp-normal'), 'cp-above': statusSvg('cp-above'), 'cp-unknown': statusSvg('cp-unknown'),
};

/** A mark's shape alone (16 × 16), to place inside another SVG (a hub card's thumbnail). */
export const markShape = (s: MarkSymbol) => SHAPES[s];

/** A map mark's shape, drawn as the map draws it: a shape, so a mark never relies on colour alone. */
export const markSvg = (s: MarkSymbol) => `<svg class="gt-mark" viewBox="0 0 16 16" aria-hidden="true">${SHAPES[s]}</svg>`;

/** The shaded layer's legend for one of its years (by index): title, scale or classes, ticks, ends, missing shapes. */
export function legendHtml(f: LayerFile, yi: number): string {
  // One band per tick on a sequential scale (fewer than five when quantile edges merged), its steps spread (seqSteps).
  const steps = f.scale === 'seq' ? seqSteps(f.ticks.length || 5) : [1, 2, 3, 4, 5, 6, 7];
  const n = steps.length;
  const out = [`<span class="gt-legend__title">${esc(f.data[yi]?.legend ?? '')}</span>`];
  if (f.categories?.length) {
    const hatch = f.hatch ? `<span><i class="gt-sw gt-sw--hatch" style="--gt-hatch:var(--${f.palette ?? 'seq'}-${f.hatch.cls})"></i>${esc(f.hatch.label)}</span>` : '';
    out.push(`<div class="gt-legend__extra gt-legend__cats">${f.categories.map((c) => `<span><i class="gt-sw" style="background:var(--${f.palette ?? 'seq'}-${c.cls})"></i>${esc(c.label)}</span>`).join('')}${hatch}</div>`);
  } else {
    out.push(`<div class="gt-legend__scale" style="--n:${n}">${steps.map((k) => `<i style="background:var(--${f.scale}-${k})"></i>`).join('')}</div>`);
    if (f.ticks.length) out.push(`<div class="gt-legend__ticks${f.scale === 'div' ? ' gt-legend__ticks--dense' : ''}" style="--n:${n}">${f.ticks.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`);
  }
  if (f.ends) out.push(`<div class="gt-legend__ends"><span>← ${esc(f.ends[0])}</span><span>${esc(f.ends[1])} →</span></div>`);
  const extra = [`<span><i class="gt-sw gt-sw--nodata"></i>${esc(f.missing.none)}</span>`];
  if (f.missing.withheld) extra.push(`<span><i class="gt-sw gt-sw--withheld"></i>${esc(f.missing.withheld)}</span>`);
  if (f.missing.notyet) extra.push(`<span><i class="gt-sw gt-sw--notyet"></i>${esc(f.missing.notyet)}</span>`);
  out.push(`<div class="gt-legend__extra">${extra.join('')}</div>`);
  return out.join('');
}
