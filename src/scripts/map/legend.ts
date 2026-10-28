// Map legends as HTML, from a layer file (src/lib/map/types.ts): the shaded layer's scale or named classes, its
// ticks, its ends and the shapes without a class (no data, withheld, not yet reported); and the mark shapes the
// engine draws (./engine.ts), for overlay legends and lists. Pure functions, so the page can draw a legend at build
// time and the Atlas redraw it in the browser from the same code.
import type { LayerFile } from '../../lib/map/types';
import { esc } from './text';

export type MarkSymbol = 'dot' | 'hollow' | 'triangle' | 'diamond' | 'square' | 'arc' | 'arc-dashed' | 'outline';

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
};

/** A map mark's shape, drawn as the map draws it: a shape, so a mark never relies on colour alone. */
export const markSvg = (s: MarkSymbol) => `<svg class="gt-mark" viewBox="0 0 16 16" aria-hidden="true">${SHAPES[s]}</svg>`;

/** The shaded layer's legend for one of its years (by index): title, scale or classes, ticks, ends, missing shapes. */
export function legendHtml(f: LayerFile, yi: number): string {
  const n = f.scale === 'seq' ? 5 : 7;
  const out = [`<span class="gt-legend__title">${esc(f.data[yi]?.legend ?? '')}</span>`];
  if (f.categories?.length) {
    out.push(`<div class="gt-legend__extra gt-legend__cats">${f.categories.map((c) => `<span><i class="gt-sw" style="background:var(--seq-${c.cls})"></i>${esc(c.label)}</span>`).join('')}</div>`);
  } else {
    out.push(`<div class="gt-legend__scale" style="--n:${n}">${Array.from({ length: n }, (_, i) => `<i style="background:var(--${f.scale}-${i + 1})"></i>`).join('')}</div>`);
    if (f.ticks.length) out.push(`<div class="gt-legend__ticks${f.scale === 'div' ? ' gt-legend__ticks--dense' : ''}" style="--n:${n}">${f.ticks.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`);
  }
  if (f.ends) out.push(`<div class="gt-legend__ends"><span>← ${esc(f.ends[0])}</span><span>${esc(f.ends[1])} →</span></div>`);
  const extra = [`<span><i class="gt-sw gt-sw--nodata"></i>${esc(f.missing.none)}</span>`];
  if (f.missing.withheld) extra.push(`<span><i class="gt-sw gt-sw--withheld"></i>${esc(f.missing.withheld)}</span>`);
  if (f.missing.notyet) extra.push(`<span><i class="gt-sw gt-sw--notyet"></i>${esc(f.missing.notyet)}</span>`);
  out.push(`<div class="gt-legend__extra">${extra.join('')}</div>`);
  return out.join('');
}
