// The Supply chains tool's markup (SupplyChainPage and SankeyFlow designs), shared by the build, which draws the
// page with no country focused so it reads without scripts, and the browser script, which redraws for a focus.
// Every band is named at both ends with its amount, and the table below lists every flow, so nothing depends on
// reading the diagram.
import { CHAIN_TEXT, CHAINS_TEXT as T, COVERAGE, SIDES, chainTitle } from '../../i18n/supply-chains.en.ts';
import { SOURCE_TEXT } from '../../i18n/en.ts';
import { inSentence } from '../../i18n/pages.en.ts';
import { formatShare } from '../format.ts';
import { esc } from '../explorer/render.ts';
import {
  OTHERS, PHONE_FLOWS, SHOWN, TOP, X, amount, concentration, hhi, nameOf, pairsOf, sankey, sum, totals,
  type Chain, type State,
} from './model.ts';

const ICON = {
  close: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  download: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
  sort: '<svg class="gt-sort" viewBox="0 0 10 12" aria-hidden="true"><path class="up" d="M5 0 9 5H1z"/><path class="down" d="M5 12 1 7h8z"/></svg>',
};

const words = (c: Chain) => CHAIN_TEXT[c.key];
const sides = (c: Chain) => SIDES[c.kind];
const full = (c: Chain, v: number) => `${amount(v, c)} ${words(c).short}`;
const name = (c: Chain, id: string) => (id === OTHERS ? T.others : nameOf(c, id));

/** "2023, latest available", or SIPRI's "2021–2025, latest five years available". */
export const periodLabel = (c: Chain) => (c.period.includes('–') ? T.latestPeriod(c.period) : T.latestYear(c.period));

/** "A, B and C". */
export const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${T.and} ${xs.at(-1)}`);

/** The page's first sentence, from the three largest suppliers. */
export function ledeOf(c: Chain): string {
  const top = totals(c.pairs, 0).slice(0, 3).map(([id]) => inSentence(nameOf(c, id)));
  return T.lede[c.kind](listOf(top), words(c).noun, c.period, c.credit);
}

const sourceHtml = (c: Chain) => `<p class="gt-source"><span>${esc(SOURCE_TEXT.source)} <b>${esc(c.source)}</b></span>`
  + `<span class="gt-source__sep" aria-hidden="true">·</span><span>${esc(c.period)}</span></p>`;

// ---------- controls ----------

/** Flow switch (each option is another page), the year as a label, and the focus. */
export function controlsHtml(c: Chain, s: State, flows: { key: string; label: string; path: string }[]): string {
  const opts = flows.map((f) => `<option value="${esc(f.path)}"${f.key === c.key ? ' selected' : ''}>${esc(f.label)}</option>`).join('');
  const ids = [...new Set(c.pairs.flatMap(([f, t]) => [f, t]))].sort((a, b) => nameOf(c, a).localeCompare(nameOf(c, b), 'en'));
  const list = ids.map((id) => `<option value="${esc(nameOf(c, id))}"></option>`).join('');
  return '<div class="gt-expctl__row">'
    + `<div class="gt-field"><label for="sk-flow">${esc(T.flow)}</label><div class="gt-select"><select id="sk-flow" data-sk-flow>${opts}</select></div></div>`
    + `<div class="gt-field gt-skyear"><span class="gt-field__label" id="sk-year-l">${esc(T.year)}</span><span class="gt-skyear__v" aria-labelledby="sk-year-l">${esc(periodLabel(c))}</span></div>`
    + `<div class="gt-field gt-skfind"><label for="sk-c">${esc(T.focus)}</label><input class="gt-input" id="sk-c" type="search" autocomplete="off" list="sk-places" placeholder="${esc(T.focusHint)}" value="${esc(s.country ? nameOf(c, s.country) : '')}" data-sk-find><datalist id="sk-places">${list}</datalist></div>`
    + '</div>';
}

// ---------- diagram ----------

export function sankeyHtml(c: Chain, s: State): string {
  const sk = sankey(c, s);
  const w = words(c);
  const bands = sk.bands.map((b) => {
    const t = esc(T.bandTitle(name(c, b.from), name(c, b.to), full(c, b.value)));
    return `<path d="${b.d}" class="gt-sk__band gt-sk--${b.colour}" data-sk-band="${t}"><title>${t}</title></path>`;
  }).join('');
  // No viewBox: the SVG is as wide as its box and sk.height pixels tall, so labels stay 13px. Bands and nodes are
  // drawn in a nested SVG stretched over the space between the label margins; labels are placed outside it.
  const rects: string[] = [];
  const labs: string[] = [];
  for (const n of sk.nodes) {
    const left = n.side === 0;
    const label = n.id === OTHERS ? T.others : n.label;
    // Named places can be focused from the diagram too; the focus field below does the same from the keyboard.
    const pick = n.id === OTHERS || n.sel ? '' : ` data-sk-pick="${esc(n.id)}"`;
    rects.push(`<rect x="${n.x}" y="${n.y.toFixed(1)}" width="${X.node}" height="${Math.max(1, n.h).toFixed(1)}" class="gt-sk__node${n.sel ? ' is-sel' : ''}${pick ? ' gt-sk__pick' : ''}"${pick}/>`);
    labs.push(`<text x="${left ? 0 : '100%'}" dx="${left ? -8 : 8}" y="${(n.mid + 4.5).toFixed(1)}"${left ? ' text-anchor="end"' : ''} class="gt-sk__lab${pick ? ' gt-sk__pick' : ''}"${pick}><tspan class="gt-sk__n">${esc(label)}</tspan> ${esc(amount(n.value, c))}</text>`);
  }
  const plot = `<svg width="100%" height="${sk.height}" viewBox="${X.from} 0 ${X.to + X.node - X.from} ${sk.height}" preserveAspectRatio="none" overflow="visible">${bands}${rects.join('')}</svg>`;
  const axis = `<text x="0" y="${sk.height - 8}" class="gt-sk__ax">${esc(sides(c).froms)}</text>`
    + `<text x="100%" y="${sk.height - 8}" text-anchor="end" class="gt-sk__ax">${esc(sides(c).tos)}</text>`;
  const label = T.diagramLabel(chainTitle(c.key, c.label).full, c.period, sides(c).froms, sides(c).tos, w.unit, s.country ? nameOf(c, s.country) : undefined);
  const chip = s.country
    ? `<div class="gt-blocchip"><span>${T.focused(esc(nameOf(c, s.country)))}</span><button type="button" aria-label="${esc(T.clear)}" data-sk-clear>${ICON.close}</button></div>` : '';
  return `${chip}<div class="gt-skscroll"><svg class="gt-sk" height="${sk.height}" style="--h:${sk.height}px;--l:${X.from}px;--r:${sk.width - X.to - X.node}px" role="img" aria-label="${esc(label)}">${plot}${labs.join('')}${axis}</svg></div>`
    + `<p class="gt-caption gt-skread" data-sk-read aria-hidden="true">${esc(T.readout)}</p>`
    + `<p class="gt-caption">${esc(T.caption(SHOWN.from, SHOWN.to))} ${esc(COVERAGE[c.src] ?? '')}</p>`;
}

// ---------- panel ----------

function barsHtml(c: Chain, xs: [string, number][], label: string, share?: number): string {
  // Others, last, can be larger than the first bar.
  const max = Math.max(...xs.map(([, v]) => v)) || 1;
  const items = xs.map(([id, v]) => {
    const p = c.places[id];
    const who = id === OTHERS ? T.others : p?.h ? `<a href="${esc(p.h)}">${esc(nameOf(c, id))}</a>` : esc(nameOf(c, id));
    const val = share ? formatShare(v / share) : amount(v, c);
    return `<li${id === OTHERS ? ' class="gt-bars__other"' : ''}><span class="gt-bars__name">${who}</span><span class="gt-bars__track"><span class="gt-bars__fill" style="width:${((100 * v) / max).toFixed(1)}%"></span></span><span class="gt-bars__val">${esc(val)}</span></li>`;
  }).join('');
  return `<div class="gt-cpsub"><span class="gt-label">${esc(label)}</span><ol class="gt-bars gt-bars--tight gt-bars--wide" aria-label="${esc(label)}">${items}</ol></div>`;
}

function concHtml(h: number, note: string, method: string): string {
  const k = concentration(h);
  return `<div class="gt-conc"><div class="gt-conc__head"><span class="gt-label">${esc(T.concentration)}</span><span class="gt-conc__now">${esc(T.conc[k])}</span></div>`
    + `<ol class="gt-conc__scale" aria-label="${esc(`${T.concentration}: ${T.conc[k]}`)}">`
    + (['low', 'moderate', 'high'] as const).map((x) => `<li${x === k ? ' aria-current="true"' : ''}><span class="gt-conc__bar"></span><span class="gt-conc__lab">${esc(T.conc[x])}</span></li>`).join('')
    + `</ol><p class="gt-caption gt-conc__note">${esc(note)} <a href="${esc(method)}">${esc(T.how)}</a></p></div>`;
}

const stat = (c: Chain, label: string, v: number) => `<div class="gt-cpstat"><span class="gt-cpstat__l">${esc(label)}</span>`
  + `<span class="gt-cpstat__n">${esc(amount(v, c))}<small>${esc(words(c).short)}</small></span><span class="gt-caption">${esc(c.period)}</span></div>`;

/** The top few, and the rest as Others. */
const topAndRest = (xs: [string, number][]): [string, number][] => (xs.length > TOP + 1 ? [...xs.slice(0, TOP), [OTHERS, sum(xs.slice(TOP))]] : xs);

export function panelHtml(c: Chain, s: State): string {
  const w = words(c), sd = sides(c);
  const head = (title: string, clear: boolean) => `<div class="gt-mpanel__head"><span class="gt-kicker">${esc(c.label)} · ${esc(c.period)}</span><h2 class="gt-h3">${esc(title)}</h2>`
    + (clear ? `<button class="gt-iconbtn" type="button" aria-label="${esc(T.clear)}" data-sk-clear>${ICON.close}</button>` : '') + '</div>';
  if (!s.country) {
    const froms = totals(c.pairs, 0), tos = totals(c.pairs, 1);
    const all = sum(froms);
    const five = sum(froms.slice(0, TOP));
    const conc = c.kind === 'refugees' ? '' : concHtml(hhi(froms), T.concWorld(Math.min(TOP, froms.length), formatShare(five / all), w.noun, hhi(froms).toLocaleString('en')), c.method);
    return head(T.world, false) + stat(c, T.total, all) + conc
      + barsHtml(c, froms.slice(0, TOP), T.topFroms(sd.froms, w.short)) + barsHtml(c, tos.slice(0, TOP), T.topTos(sd.tos, w.short)) + sourceHtml(c);
  }
  const id = s.country;
  const ins = totals(c.pairs.filter((p) => p[1] === id), 0);
  const outs = totals(c.pairs.filter((p) => p[0] === id), 1);
  let body = '';
  if (ins.length) {
    const t = sum(ins);
    body += stat(c, sd.ins, t);
    if (c.kind !== 'refugees') body += concHtml(hhi(ins), T.concFocus(inSentence(nameOf(c, ins[0][0]), true), formatShare(ins[0][1] / t), inSentence(nameOf(c, id)), hhi(ins).toLocaleString('en')), c.method);
    body += barsHtml(c, topAndRest(ins), sd.inShare, t);
  }
  if (outs.length) {
    const t = sum(outs);
    body += stat(c, sd.outs, t) + barsHtml(c, topAndRest(outs), sd.outShare, t);
  }
  const p = c.places[id];
  const link = p?.h ? `<a class="gt-cpsec__link" href="${esc(p.h)}">${esc(T.countryPage(nameOf(c, id)))} <span aria-hidden="true">→</span></a>` : '';
  return head(nameOf(c, id), true) + body + sourceHtml(c) + link;
}

// ---------- phone list ----------

export function flowListHtml(c: Chain, s: State): string {
  const top = pairsOf(c, s).slice(0, PHONE_FLOWS);
  const max = top[0]?.[2] || 1;
  const items = top.map(([f, t, v]) => `<li><span class="gt-flowlist__ab"><b>${esc(nameOf(c, f))}</b> → <b>${esc(nameOf(c, t))}</b></span>`
    + `<span class="gt-bars__track"><span class="gt-bars__fill" style="width:${((100 * v) / max).toFixed(1)}%"></span></span><span class="gt-flowlist__v">${esc(amount(v, c))}</span></li>`).join('');
  return `<h2 class="gt-h2">${esc(T.topFlows(top.length, words(c).short))}</h2><ol class="gt-flowlist">${items}</ol>${sourceHtml(c)}`;
}

// ---------- table and download ----------

export function tableHtml(c: Chain, s: State): string {
  const w = words(c), sd = sides(c);
  const rows = pairsOf(c, s);
  const th = (key: string, label: string, num = false, sorted = false) =>
    `<th scope="col" data-key="${key}"${num ? ' data-type="num" class="n"' : ''}${sorted ? ' aria-sort="descending"' : ''}><button type="button">${esc(label)}${ICON.sort}</button></th>`;
  const cell = (id: string) => {
    const p = c.places[id];
    return p?.h ? `<a href="${esc(p.h)}">${esc(nameOf(c, id))}</a>` : esc(nameOf(c, id));
  };
  const body = rows.map(([f, t, v]) => `<tr><th scope="row">${cell(f)}</th><td>${cell(t)}</td><td class="n" data-v="${v}">${esc(amount(v, c))}</td></tr>`).join('');
  return `<div class="gt-tablewrap" style="--gt-table-h:360px" tabindex="0" role="region" aria-label="${esc(T.tableLabel(c.label))}">`
    + `<table class="gt-table" data-gt-sort><caption class="gt-caption">${esc(T.tableCaption(w.unit, c.period, rows.length))}</caption>`
    + `<thead><tr>${th('from', sd.from)}${th('to', sd.to)}${th('v', c.count ? w.amount : `${w.amount}, ${w.short}`, true, true)}</tr></thead><tbody>${body}</tbody></table></div>`
    + (c.csv ? `<button class="gt-btn gt-btn--quiet gt-showall" type="button" data-sk-csv>${ICON.download}${esc(T.download)}</button>` : `<p class="gt-caption">${esc(T.noDownload(c.credit))}</p>`);
}

/** The flows shown, as CSV: names, ISO codes, the amount in the flow's own unit and the period. */
export function chainCsv(c: Chain, s: State): string {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const sd = sides(c), w = words(c);
  const iso = (id: string) => c.places[id]?.c ?? id;
  const head = [sd.from, `${sd.from} iso3`, sd.to, `${sd.to} iso3`, `${T.csvAmount(w.amount, w.unit)} [${c.credit}, retrieved ${c.retrieved}]`, T.csvPeriod];
  const lines = [head.map(cell).join(',')];
  for (const [f, t, v] of pairsOf(c, s)) lines.push([nameOf(c, f), iso(f), nameOf(c, t), iso(t), Number((v / c.div).toPrecision(6)), c.period].map(cell).join(','));
  return `${lines.join('\n')}\n`;
}
