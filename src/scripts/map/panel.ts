// The tooltip and the selected-country panel, as HTML built from a layer file (src/lib/map/types.ts). Every word
// and figure is already in the file; this only arranges them in the MapTooltip and CountryPanel designs. Pure
// functions, so they are tested without a browser.
import type { LayerFile, LayerYear } from '../../lib/map/types';
import { esc, fill } from './text';

const INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
const CLOSE = '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';

const nameOf = (f: LayerFile, id: string) => f.names[id] ?? id;
/** A year as the layer says it: the year, or a period's words. */
const when = (y: LayerYear) => y.label ?? y.year;

/** The tooltip for a place on a year: name, value with what it measures, detail and year, status, source, hint. */
export function tooltipHtml(f: LayerFile, y: LayerYear, id: string | null, fallbackName: string, touch = false): string {
  const name = id ? nameOf(f, id) : fallbackName;
  const e = id ? y.v[id] : undefined;
  const parts = [`<span class="gt-tip__name">${esc(name)}</span>`];
  if (!e) parts.push(`<span class="gt-tip__val gt-tip__val--word">${esc(fill(f.text.none, { year: when(y) }))}</span>`);
  else if (e[0] === 0) parts.push(`<span class="gt-tip__val gt-tip__val--word">${esc(f.text.withheld)}</span>`, `<span>${esc(f.text.withheldWhy)}</span>`);
  else {
    parts.push(`<span class="gt-tip__val">${esc(e[1])}<small>${esc(f.text.measure)}</small></span>`);
    if (e[2]) parts.push(`<span class="tnum">${esc(e[2])} · ${when(y)}</span>`);
    if (e[3]) parts.push(f.tags[e[3]]);
  }
  if (id && f.notes[id]) parts.push(`<span class="gt-tip__note">${INFO}${esc(f.notes[id])}</span>`);
  parts.push(`<span class="gt-tip__src">${esc(f.source)}</span>`);
  if (id) parts.push(`<span class="gt-tip__hint">${esc(touch ? f.text.tapHint : f.text.hint)}</span>`);
  return parts.join('');
}

/** The panel for a selected place: its figure, share and rank, the year before, notes and links on. */
export function countryPanelHtml(f: LayerFile, yearIndex: number, id: string, sheet = false): string {
  const y = f.data[yearIndex];
  // Periods count different alert levels, so a shorter one is no "before" to compare with.
  const prev = yearIndex > 0 && !f.axis ? f.data[yearIndex - 1] : null;
  const e = y.v[id];
  const name = nameOf(f, id);
  const body: string[] = [];
  if (!e) {
    body.push(`<div class="gt-pkf"><span class="gt-pkf__label">${esc(f.text.shareLabel)}</span><span class="gt-pkf__num gt-pkf__num--word">–</span><span class="gt-pkf__meta">${esc(fill(f.text.none, { year: when(y) }))}</span></div>`);
  } else if (e[0] === 0) {
    body.push(`<div class="gt-pkf"><span class="gt-pkf__label">${esc(f.text.shareLabel)}</span><span class="gt-pkf__num gt-pkf__num--word">${esc(f.text.withheld)}</span><span class="gt-pkf__meta">${esc(f.text.withheldWhy)}</span></div>`);
  } else {
    body.push(`<div class="gt-pkf"><span class="gt-pkf__label">${esc(f.text.shareLabel)}</span><span class="gt-pkf__num">${esc(e[1])}</span>`
      + `<span class="gt-pkf__meta">${e[2] ? `<span class="tnum">${esc(e[2])}</span>` : ''}${e[3] ? f.tags[e[3]] : ''}${e[4] ? `<span>${esc(fill(f.text.rank, { rank: e[4], of: y.order.length }))}</span>` : ''}</span></div>`);
  }
  const p = prev?.v[id];
  if (prev && p) body.push(`<p class="gt-ptrend">${esc(p[0] === 0 ? `${when(prev)}: ${f.text.withheld}` : fill(f.text.prev, { year: when(prev), detail: p[2], value: p[1] }))}</p>`);
  if (f.notes[id]) body.push(`<div class="gt-notice gt-notice--inline" role="note">${INFO}<div class="gt-notice__body"><p>${esc(f.notes[id])}</p></div></div>`);
  body.push(`<p class="gt-source"><span>${esc(f.source)}</span></p>`);
  const links: string[] = [];
  if (f.hrefs[id]) links.push(`<a class="gt-btn gt-btn--quiet" href="${esc(f.hrefs[id])}">${esc(f.dossiers.includes(id) ? f.text.dossier : f.text.countryPage)}</a>`);
  if (e) links.push(`<a class="gt-btn gt-btn--quiet" href="#table" data-show-row="${esc(id)}">${esc(f.text.inTable)}</a>`);
  return `${sheet ? `<button class="gt-sheet__grab" type="button" aria-label="${esc(f.text.close)}" data-sheet-grab></button>` : ''}`
    + `<div class="gt-panel__head"><div class="gt-panel__title"><span class="gt-kicker">${esc(fill(f.text.kicker, { year: when(y) }))}</span><h2 class="gt-h3" tabindex="-1">${esc(name)}</h2></div>`
    + `<button class="gt-iconbtn" type="button" aria-label="${esc(f.text.close)}" data-panel-close>${CLOSE}</button></div>`
    + `<div class="gt-panel__body">${body.join('')}</div>`
    + (links.length ? `<div class="gt-panel__foot gt-plinks">${links.join('')}</div>` : '');
}
