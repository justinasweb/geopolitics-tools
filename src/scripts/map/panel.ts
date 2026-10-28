// The tooltip and the selected-country panel, as HTML built from a layer file (src/lib/map/types.ts). Every word
// and figure is already in the file; this only arranges them in the MapTooltip and CountryPanel designs. Pure
// functions, so they are tested without a browser.
import type { LayerFile, LayerYear, PanelBlock } from '../../lib/map/types';
import { formatValue } from '../../lib/format';
import { CHART_TICK_PX, textWidth } from '../../lib/chart';
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
  // Not yet reported: the word, then the last figure and its year.
  else if (e[0] === -1) parts.push(`<span class="gt-tip__val gt-tip__val--word">${esc(e[1])}</span>`, `<span class="tnum">${esc(e[2])}</span>`);
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

/** A trend line for one place over the layer's years (CountryPanel design: a small line with three gridlines). */
export function sparkHtml(f: LayerFile, id: string, label: string): string {
  const vals = f.series?.[id];
  if (!vals || !f.format) return '';
  const pts = vals.map((v, i) => (v === null ? null : { x: i, v, year: when(f.data[i]) }));
  const have = pts.filter((p): p is { x: number; v: number; year: number | string } => p !== null);
  if (have.length < 3) return '';
  const fmt = (v: number) => (v === 0 ? '0' : formatValue(v, f.format!));
  const lo = Math.min(0, ...have.map((p) => p.v));
  const hi = Math.max(...have.map((p) => p.v));
  // No viewBox: the SVG fills the panel and is H pixels tall, so its text stays 12px. The line is drawn in a
  // nested SVG stretched over the plot (0–1000 across); text and the end dot are placed in percent.
  const H = 96, T = 10, B = 76, PW = 1000;
  const grid = [lo, (lo + hi) / 2, hi];
  const L = Math.max(...grid.map((g) => textWidth(fmt(g), CHART_TICK_PX) + 8));
  const share = (i: number) => i / Math.max(1, vals.length - 1);
  const pct = (i: number) => `${(share(i) * 100).toFixed(2)}%`;
  const Y = (v: number) => (hi === lo ? B : B - ((B - T) * (v - lo)) / (hi - lo));
  const lines = grid.map((g) => `<line x1="0" x2="100%" y1="${Y(g).toFixed(1)}" y2="${Y(g).toFixed(1)}" class="gt-spark__grid"/><text x="-6" y="${(Y(g) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(g))}</text>`).join('');
  // Gaps (years without a figure) break the line.
  let d = '';
  pts.forEach((p, i) => { if (p) d += `${d && pts[i - 1] ? 'L' : 'M'}${(share(p.x) * PW).toFixed(1)},${Y(p.v).toFixed(1)}`; });
  const first = have[0], last = have.at(-1)!;
  const tag = (y: LayerYear) => (y.status ? 'e' : '');
  const caption = fill(f.text.trendCaption ?? '{first} in {from}, {last} in {to}.', { first: fmt(first.v), from: first.year, last: fmt(last.v), to: last.year });
  return `<div class="gt-pblock"><div class="gt-pblock__head"><span class="gt-label">${esc(label)}</span></div>`
    + `<svg class="gt-spark" height="${H}" style="--l:${L}px" role="img" aria-label="${esc(`${label}: ${caption}`)}">${lines}`
    + `<svg width="100%" height="${H}" viewBox="0 0 ${PW} ${H}" preserveAspectRatio="none" overflow="visible" aria-hidden="true"><path d="${d}" class="gt-spark__line"/></svg>`
    + `<circle cx="${pct(last.x)}" cy="${Y(last.v).toFixed(1)}" r="3" class="gt-spark__dot"/>`
    + `<text x="${pct(first.x)}" y="92" text-anchor="start">${first.year}${tag(f.data[first.x])}</text><text x="${pct(last.x)}" y="92" text-anchor="end">${last.year}${tag(f.data[last.x])}</text></svg>`
    + `<p class="gt-caption gt-pblock__cap">${esc(caption)}</p></div>`;
}

/** The ranking around a place: the top three, then the place with its neighbours, as bars with the place marked. */
export function rankingHtml(f: LayerFile, yearIndex: number, id: string, label: string): string {
  const y = f.data[yearIndex];
  const at = y.order.indexOf(id);
  if (at < 0 || y.order.length < 2) return '';
  const pick = new Set([0, 1, 2, at - 1, at, at + 1].filter((i) => i >= 0 && i < y.order.length));
  const idx = [...pick].sort((a, b) => a - b);
  const num = (pid: string) => Math.abs(f.series?.[pid]?.[yearIndex] ?? 0);
  const max = Math.max(...idx.map((i) => num(y.order[i])));
  const rows: string[] = [];
  idx.forEach((i, k) => {
    if (k > 0 && i - idx[k - 1] > 1) rows.push('<li class="gt-bars__gap" aria-hidden="true"><span>…</span></li>');
    const pid = y.order[i];
    const w = max ? (100 * num(pid)) / max : 0;
    rows.push(`<li${pid === id ? ' data-selected="true"' : ''}><span class="gt-bars__name"><span class="gt-bars__rank">${i + 1}</span>${pid === id ? `<span class="gt-bars__sel">${esc(nameOf(f, pid))}</span>` : `<button type="button" data-select="${esc(pid)}">${esc(nameOf(f, pid))}</button>`}</span>`
      + `<span class="gt-bars__track"><span class="gt-bars__fill" style="width:${w.toFixed(1)}%"></span></span><span class="gt-bars__val">${esc(y.v[pid]?.[1] ?? '')}</span></li>`);
  });
  return `<div class="gt-pblock gt-pgroup"><span class="gt-label">${esc(label)}</span><ol class="gt-bars gt-bars--tight gt-bars--rank" aria-label="${esc(label)}">${rows.join('')}</ol></div>`;
}

/** A block of rows from the layer file (other measures, other minerals, a period's alerts). */
export function blockHtml(b: PanelBlock): string {
  const rows = b.rows.map((r) => `<li><span class="gt-prow__n">${r.href ? `<a href="${esc(r.href)}">${esc(r.name)}</a>` : esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span><span class="gt-prow__v">${esc(r.value)}</span></li>`).join('');
  return `<div class="gt-pblock"><div class="gt-pblock__head"><span class="gt-label">${esc(b.label)}</span>${b.caption ? `<span class="gt-caption">${esc(b.caption)}</span>` : ''}</div>`
    + `<ul class="gt-prows">${rows}</ul>${b.more ? `<p class="gt-caption gt-pblock__cap">${esc(b.more)}</p>` : ''}`
    + `${b.source ? `<p class="gt-source"><span>${esc(b.source)}</span></p>` : ''}</div>`;
}

/** The panel for a selected place: its facts (figure, detail, rank, the year before), its trend, the ranking around it, more blocks, notes and links on. */
export function countryPanelHtml(f: LayerFile, yearIndex: number, id: string, sheet = false): string {
  const y = f.data[yearIndex];
  // Periods count different alert levels, so a shorter one is no "before" to compare with.
  const prev = yearIndex > 0 && f.axis !== 'days' ? f.data[yearIndex - 1] : null;
  const e = y.v[id];
  const name = nameOf(f, id);
  const body: string[] = [];
  if (!e) {
    body.push(`<div class="gt-pkf"><span class="gt-pkf__label">${esc(f.text.shareLabel)}</span><span class="gt-pkf__num gt-pkf__num--word">–</span><span class="gt-pkf__meta">${esc(fill(f.text.none, { year: when(y) }))}</span></div>`);
  } else if (e[0] === 0) {
    body.push(`<div class="gt-pkf"><span class="gt-pkf__label">${esc(f.text.shareLabel)}</span><span class="gt-pkf__num gt-pkf__num--word">${esc(f.text.withheld)}</span><span class="gt-pkf__meta">${esc(f.text.withheldWhy)}</span></div>`);
  } else {
    const facts: [string, string][] = [[f.text.shareLabel, `<dd>${esc(e[1])}</dd>`]];
    if (e[2] && f.text.detailLabel) facts.push([f.text.detailLabel, `<dd class="gt-panel__dsmall">${esc(e[2])}</dd>`]);
    if (e[4]) facts.push([f.text.rankLabel ?? '', `<dd>${e[4]} <small>${esc(fill(f.text.rankOf ?? 'of {of}', { of: y.order.length }))}</small></dd>`]);
    const p = prev?.v[id];
    if (e[3]) facts.push([f.text.statusLabel ?? '', `<dd class="gt-panel__tagdd">${f.tags[e[3]]}</dd>`]);
    else if (prev && p) facts.push([String(when(prev)), `<dd class="gt-panel__dsmall">${esc(p[0] === 0 ? f.text.withheld : p[1])}</dd>`]);
    body.push(`<dl class="gt-panel__facts">${facts.map(([dt, dd]) => `<div><dt>${esc(dt)}</dt>${dd}</div>`).join('')}</dl>`);
    if (e[2] && !f.text.detailLabel) body.push(`<p class="gt-ptrend">${esc(e[2])}</p>`);
  }
  if (f.axis !== 'days') body.push(sparkHtml(f, id, fill(f.text.trend ?? f.text.shareLabel, { from: when(f.data[0]), to: when(f.data.at(-1)!) })));
  if (e && e[0] > 0 && f.series) body.push(rankingHtml(f, yearIndex, id, fill(f.text.ranking ?? '', { year: when(y) })));
  for (const b of y.more?.[id] ?? []) body.push(blockHtml(b));
  for (const b of f.more?.[id] ?? []) body.push(blockHtml(b));
  if (f.notes[id]) body.push(`<div class="gt-notice gt-notice--inline" role="note">${INFO}<div class="gt-notice__body"><p>${esc(f.notes[id])}</p></div></div>`);
  body.push(`<p class="gt-source"><span>${esc(f.source)}</span></p>`);
  const links: string[] = [];
  if (f.hrefs[id]) links.push(`<a class="gt-btn gt-btn--quiet" href="${esc(f.hrefs[id])}">${esc(f.dossiers.includes(id) ? f.text.dossier : f.text.countryPage)}</a>`);
  if (e) links.push(`<a class="gt-btn gt-btn--quiet" href="#table" data-show-row="${esc(id)}">${esc(f.text.inTable)}</a>`);
  return `${sheet ? `<button class="gt-sheet__grab" type="button" aria-label="${esc(f.text.close)}" data-sheet-grab></button>` : ''}`
    + `<div class="gt-panel__head"><div class="gt-panel__title"><span class="gt-kicker">${esc(fill(f.text.kicker, { year: when(y) }))}</span><h2 class="gt-h3" tabindex="-1">${esc(name)}</h2></div>`
    + `<button class="gt-iconbtn" type="button" aria-label="${esc(f.text.close)}" data-panel-close>${CLOSE}</button></div>`
    + `<div class="gt-panel__body">${body.filter(Boolean).join('')}</div>`
    + (links.length ? `<div class="gt-panel__foot gt-plinks">${links.join('')}</div>` : '');
}
