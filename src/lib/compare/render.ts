// Compare's markup (ComparePage and CompareParts designs), as HTML strings: the build draws the three static pairs
// with it and the browser draws /compare?a=…&b=… with it, from the same model (./model.ts). Key figures side by
// side with "Higher" on the larger value and, under the table, what could not be compared; both countries over time
// on one scale; shares of world mine production in pairs. Each side keeps its colour, marker and line style and is
// named next to every line and bar, so colour is never the only cue. No Node imports.
import { COMPARE_TEXT as T } from '../../i18n/pages.en.ts';
import { SOURCE_TEXT } from '../../i18n/en.ts';
import { CORRECTION_TEXT, correctionMailto } from '../../i18n/correction.en.ts';
import { formatParts, formatShare } from '../format.ts';
import { lineChartHtml } from '../linechart.ts';
import { tagHtml, type Status } from '../tags.ts';
import { MARK, SIDES, compareCharts, comparePairs, compareRows, gapGroups, type CountryData, type MeasureMeta, type Meta, type Row, type Side } from './model.ts';

export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Two = [CountryData, CountryData];

/** A country's chip: its marker, its name and, with `colour`, the colour's name. Linked to its page when `link`. */
export function chipHtml(side: Side, d: CountryData, opts: { colour?: boolean; link?: boolean } = {}): string {
  const tag = opts.link && d.href ? 'a' : 'span';
  return `<${tag} class="gt-cchip gt-cc--${side}"${tag === 'a' ? ` href="${esc(d.href!)}"` : ''}><svg viewBox="0 0 12 12" aria-hidden="true">${MARK[side]}</svg>`
    + `<b>${esc(d.name)}</b>${opts.colour ? `<span class="gt-cchip__col">${esc(T.colours[side])}</span>` : ''}</${tag}>`;
}

/** The source line (SourceLine component) with its Report a correction link. */
export function sourceLineHtml(source: string, parts: string[], page: string, status?: Status): string {
  const sep = '<span class="gt-source__sep" aria-hidden="true">·</span>';
  return `<p class="gt-source"><span>${esc(SOURCE_TEXT.source)} <b>${esc(source)}</b></span>${parts.map((p) => `${sep}<span>${esc(p)}</span>`).join('')}`
    + `${status ? `${sep}${tagHtml(status)}` : ''}`
    + `<a class="gt-corrlink" href="${esc(correctionMailto(page))}" data-gt-corr data-gt-corr-source="${esc(source)}" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>${esc(CORRECTION_TEXT.link)}</a></p>`;
}

/** One numbered section (CpSection component). */
function sectionHtml(n: number, id: string, heading: string, find: string, vis: string, foot = ''): string {
  return `<section class="gt-cpsec" id="${id}" aria-labelledby="${id}-h"><header class="gt-cpsec__head"><span class="gt-cpsec__n">${n}</span><h2 class="gt-h2" id="${id}-h">${esc(heading)}</h2></header>`
    + `${find ? `<p class="gt-cpsec__find">${esc(find)}</p>` : ''}<div class="gt-cpsec__vis">${vis}</div>${foot ? `<div class="gt-cpsec__foot">${foot}</div>` : ''}</section>`;
}

// ---------- key figures ----------

// One scale per row, picked from its larger value: "Population, billion: 0.34 and 1.41", never millions beside billions.
// When that scale would write a figure that is not zero as zero (Tuvalu's 9,492 people as "0.0 million"), each figure
// keeps its own scale and carries its unit: "9,492" and "25 million".
const scaleOf = (r: Row) => Math.max(...r.f.map((x) => Math.abs(x[0])));
const zeroed = (r: Row) => r.f.some(([v]) => v !== 0 && /^\D*0([.,]0+)?$/.test(formatParts(v, r.m.format, r.m.unit, undefined, scaleOf(r)).num));
const unitOf = (r: Row) => (zeroed(r) ? '' : formatParts(scaleOf(r), r.m.format, r.m.unit).unit);
const shown = (r: Row, v: number) => {
  if (!zeroed(r)) return formatParts(v, r.m.format, r.m.unit, undefined, scaleOf(r)).num;
  const own = formatParts(v, r.m.format, r.m.unit);
  return own.unit && !own.unit.startsWith('%') ? `${own.num} ${own.unit}` : own.num;
};
const srcYear = (r: Row, c: Two) => T.sourceYear(r.m.credit, r.f.map((x, i) => ({ name: c[i].name, year: x[1] })));
const label = (m: MeasureMeta) => (m.href ? `<a href="${esc(m.href)}">${esc(m.label)}</a>` : esc(m.label));
const higherHtml = `<span class="gt-higher">${esc(T.higher)}</span>`;

export function keyHtml(meta: Meta, c: Two): string {
  const { rows, gaps } = compareRows(meta, c);
  const groups = gapGroups(gaps, c);
  const gapLine = groups.length ? `<p class="gt-caption gt-cmpgaps">${esc(T.notCompared(groups))}</p>` : '';
  if (!rows.length) return sectionHtml(1, 'kf', T.keyHeading, '', gapLine);
  const head = `<th scope="col"><span class="gt-th">${esc(T.measure)}</span></th>`
    + SIDES.map((s, i) => `<th scope="col" class="n"><span class="gt-th">${chipHtml(s, c[i], { colour: true })}</span></th>`).join('')
    + `<th scope="col"><span class="gt-th">${esc(T.source)}</span></th>`;
  const body = rows.map((r) => {
    const unit = unitOf(r);
    return `<tr><th scope="row">${label(r.m)}${unit ? `<small>${esc(unit)}</small>` : ''}</th>`
      + r.f.map((f, i) => `<td class="n${r.higher === i ? ' is-high' : ''}">${esc(shown(r, f[0]))}${r.higher === i ? higherHtml : ''}</td>`).join('')
      + `<td class="gt-cmptbl__s">${esc(srcYear(r, c))}</td></tr>`;
  }).join('');
  const table = `<div class="gt-tablewrap gt-cmptblwrap" style="--gt-table-h:none" tabindex="0" role="region" aria-label="${esc(T.keyHeading)}">`
    + `<table class="gt-table gt-cmptbl"><caption class="gt-caption">${esc(T.higherNote)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  const phone = `<ul class="gt-cmprows" aria-label="${esc(T.keyHeading)}">` + rows.map((r) => `<li><div class="gt-cmprows__h"><b>${esc(r.m.label)}</b><span class="gt-caption">${esc(unitOf(r))}</span></div>`
    + `<ul>${r.f.map((f, i) => `<li class="gt-cc--${SIDES[i]}"><span class="gt-cmprows__n">${chipHtml(SIDES[i], c[i])}</span><span class="gt-cmprows__v">${esc(shown(r, f[0]))}</span>${r.higher === i ? higherHtml : ''}</li>`).join('')}</ul>`
    + `<span class="gt-caption">${esc(srcYear(r, c))}</span></li>`).join('') + '</ul>';
  return sectionHtml(1, 'kf', T.keyHeading, '', table + phone + gapLine);
}

// ---------- over time ----------

export function chartsHtml(meta: Meta, c: Two, page: string, first = 2): string {
  const charts = compareCharts(meta, c);
  if (!charts.length) return '';
  return '<div class="gt-cmp2">' + charts.map((ch, i) => {
    const span = `${ch.years[0]}–${ch.years.at(-1)}`;
    const svg = lineChartHtml({
      label: `${ch.m.label}, ${c[0].name} and ${c[1].name}, ${span}`, years: ch.years, format: ch.m.format, height: 280,
      lines: SIDES.map((s, k) => ({ label: c[k].name, cls: `gt-cc--${s}`, dashed: s === 'second', values: ch.values[k] })),
    });
    return sectionHtml(first + i, `over-${ch.m.id}`, `${ch.m.label}: ${T.overTime.toLowerCase()}`, T.sameScale, svg, sourceLineHtml(ch.m.source, [span], page));
  }).join('') + '</div>';
}

// ---------- minerals ----------

export function mineralsHtml(meta: Meta, c: Two, page: string, n: number): string {
  const pairs = comparePairs(meta, c);
  if (!pairs.length) return '';
  const year = pairs[0].m.year;
  const est = pairs.some((x) => x.m.estimated);
  const items = pairs.map((x) => `<li><span class="gt-pairs__m">${esc(x.m.name)}</span><ul>`
    + x.vals.map((v, i) => `<li class="gt-cc--${SIDES[i]}"><span class="gt-pairs__n">${esc(c[i].name)}</span><span class="gt-pairs__t"><span class="gt-pairs__f" style="width:${((v ?? 0) * 100).toFixed(1)}%"></span></span><span class="gt-pairs__v">${v === null ? '–' : esc(formatShare(v))}</span></li>`).join('')
    + '</ul></li>').join('');
  return sectionHtml(n, 'minerals', T.minerals, T.mineralsFind(year), `<ul class="gt-pairs">${items}</ul>`,
    sourceLineHtml(meta.mineralSource, [`${year}${est ? ', estimated' : ''}`], page, est ? 'estimate' : undefined));
}

/** Every section for two countries: key figures, the charts, the minerals, numbered in order. */
export function compareHtml(meta: Meta, c: Two, page: string): string {
  const charts = compareCharts(meta, c).length;
  return keyHtml(meta, c) + chartsHtml(meta, c, page) + mineralsHtml(meta, c, page, 2 + charts);
}

/** The chips under the heading, linked to each country's page. */
export const keyChipsHtml = (c: Two) => SIDES.map((s, i) => chipHtml(s, c[i], { colour: true, link: true })).join('');
