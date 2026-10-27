// The Explorer's markup, as HTML strings, so the build draws the first view (readable without scripts) and the
// browser redraws it the same way as settings change: the controls of each view, the table, the line chart, the
// scatter with its key and correlation, the source line and the link to the view. No Node imports.
import { EXPLORER_TEXT as T, PRESET_TEXT } from '../../i18n/explorer.en.ts';
import { SOURCE_TEXT, STATUS_TEXT, YEAR_TEXT } from '../../i18n/en.ts';
import { formatDate, formatValue } from '../format.ts';
import { tagHtml } from '../tags.ts';
import {
  MAX_COUNTRIES, MAX_MEASURES, PRESETS, canLog, presetMeasures, correlation, inSentence, isPreset, lastActual, queryOf, seriesOf, sharedYears,
  ticks, valueAt, wantsLog, type MeasureData, type MeasureMeta, type Meta, type State,
} from './model.ts';

export type Data = Record<string, MeasureData | undefined>;

export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ICON = {
  close: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  link: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 0 0-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 0 0 5.7 5.7l1.5-1.5"/></svg>',
  download: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
  sort: '<svg class="gt-sort" viewBox="0 0 10 12" aria-hidden="true"><path class="up" d="M5 0 9 5H1z"/><path class="down" d="M5 12 1 7h8z"/></svg>',
};

const byId = (meta: Meta) => new Map(meta.measures.map((m) => [m.id, m]));
const nameOf = (meta: Meta, id: string) => meta.places[id]?.n ?? id;
const fmt = (m: MeasureMeta, v: number) => formatValue(v, m.format);
/** The unit under a column or after an axis title; "people" goes without saying. */
const unitText = (m: MeasureMeta) => (m.unit === 'people' ? '' : m.unit);
const projected = (m: MeasureMeta, y: number) => m.projectedAfter !== undefined && y > m.projectedAfter;

// ---------- shared parts ----------

/** A <select> of measures, grouped as the registry groups them. */
function measureSelect(meta: Meta, id: string, label: string, value: string, key: string, extra = '') {
  const groups = meta.groups.map(([g, gl]) => {
    const opts = meta.measures.filter((m) => m.group === g).map((m) => `<option value="${m.id}"${m.id === value ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
    return opts ? `<optgroup label="${esc(gl)}">${opts}</optgroup>` : '';
  }).join('');
  return `<div class="gt-field"><label for="${id}">${esc(label)}</label><div class="gt-select"><select id="${id}" data-x-set="${key}">${extra}${groups}</select></div></div>`;
}

function blocSelect(meta: Meta, id: string, label: string, none: string, value: string) {
  const members = label === T.bloc;
  const opts = meta.blocs.map((b) => `<option value="${b.id}"${b.id === value ? ' selected' : ''}>${esc(members ? T.membersOf(b.name) : b.name)}</option>`).join('');
  return `<div class="gt-field"><label for="${id}">${esc(label)}</label><div class="gt-select"><select id="${id}" data-x-set="bloc"><option value="">${esc(none)}</option>${opts}</select></div></div>`;
}

const toggle = (id: string, label: string, on: boolean, disabled: boolean) =>
  `<label class="gt-toggle"${disabled ? ' aria-disabled="true"' : ''}><input id="${id}" type="checkbox" role="switch" data-x-log${on ? ' checked' : ''}${disabled ? ' disabled' : ''}><span class="gt-toggle__ui" aria-hidden="true"></span>${esc(label)}</label>`;

/** The starting points, a pressed one marked. */
export function presetsHtml(s: State, meta: Meta, paths: Record<string, string>): string {
  const known = new Set(meta.measures.map((m) => m.id));
  const chips = PRESETS.filter((p) => presetMeasures(p).every((id) => known.has(id))).map((p) => {
    const on = isPreset(s, p, meta);
    const q = queryOf({ ...s, ...p.state, view: p.view } as State);
    return `<a class="gt-chip" href="${esc(`${paths[p.view]}?${q}`)}" data-x-preset="${p.id}"${on ? ' aria-current="true"' : ''}>${esc(PRESET_TEXT[p.id])}</a>`;
  }).join('');
  return `<span class="gt-label">${esc(T.startFrom)}</span>${chips}`;
}

/** "Link to this view" with Copy link. */
export function urlbarHtml(url: string): string {
  const shown = url.replace(/^https?:\/\//, '');
  return `<span class="gt-label">${esc(T.linkLabel)}</span><code>${esc(shown)}</code><button class="gt-cite" type="button" data-gt-copy="${esc(url)}">${ICON.link}<span data-label>${esc(T.copyLink)}</span></button>`;
}

/** The source line for the measures shown: each credit once, the years shown, and when each was updated. */
export function sourceHtml(ms: MeasureMeta[], years: string): string {
  const seen = new Map<string, string | undefined>();
  for (const m of ms) if (!seen.has(m.credit)) seen.set(m.credit, m.updated);
  const dates = new Set([...seen.values()].filter(Boolean));
  const credits = [...seen].map(([c, u]) => (dates.size > 1 && u ? `${esc(c)} <span class="gt-source__d">(${esc(SOURCE_TEXT.updated.toLowerCase())} ${esc(formatDate(u))})</span>` : esc(c))).join('; ');
  const parts = [years, dates.size === 1 ? `${SOURCE_TEXT.updated} ${formatDate([...dates][0]!)}` : ''].filter(Boolean);
  return `<p class="gt-source"><span>${esc(SOURCE_TEXT.source)} <b>${credits}</b></span>${parts.map((p) => `<span class="gt-source__sep" aria-hidden="true">·</span><span>${esc(p)}</span>`).join('')}</p>`;
}

// ---------- table ----------

/** The years a table can show: every year of the chosen measures that is not a projection, newest first. */
function tableYears(ms: MeasureMeta[]): number[] {
  const series = ms.filter((m) => !m.static);
  if (!series.length) return [];
  const lo = Math.min(...series.map((m) => m.from));
  const hi = Math.max(...series.map(lastActual));
  return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).slice(0, 60);
}

function pickerHtml(s: State, meta: Meta, p: string): string {
  const full = s.m.length >= MAX_MEASURES;
  const groups = meta.groups.map(([g, gl]) => {
    const items = meta.measures.filter((m) => m.group === g).map((m) => {
      const on = s.m.includes(m.id);
      return `<label class="gt-check" data-x-name="${esc(m.label.toLowerCase())}"><input type="checkbox" value="${m.id}" data-x-pick${on ? ' checked' : ''}${!on && full ? ' disabled' : ''}><span>${esc(m.label)}</span></label>`;
    }).join('');
    return items ? `<fieldset><legend>${esc(gl)}</legend>${items}</fieldset>` : '';
  }).join('');
  return `<details class="gt-picker-wrap" data-x-picker><summary class="gt-btn gt-btn--quiet">${esc(T.pickMeasures)}</summary>`
    + `<div class="gt-picker" role="group" aria-label="${esc(T.pickMeasures)}"><div class="gt-picker__head"><div class="gt-field"><label class="gt-vh" for="${p}-ms">${esc(T.searchMeasures(meta.measures.length))}</label>`
    + `<input class="gt-input" id="${p}-ms" type="search" placeholder="${esc(T.searchMeasures(meta.measures.length))}" data-x-msearch></div><span class="gt-picker__n">${T.chosen(s.m.length, MAX_MEASURES)}</span></div>`
    + `<div class="gt-picker__groups">${groups}</div></div></details>`;
}

function tableControls(s: State, meta: Meta, p: string): string {
  const M = byId(meta);
  const chips = s.m.map((id) => M.get(id)!).map((m) => `<span class="gt-mchip">${esc(m.short ?? m.label)}<button type="button" data-x-remove="${m.id}" aria-label="${esc(T.remove(m.label))}"${s.m.length < 2 ? ' disabled' : ''}>${ICON.close}</button></span>`).join('');
  const years = tableYears(s.m.map((id) => M.get(id)!));
  const yearSel = years.length ? `<div class="gt-field"><label for="${p}-yr">${esc(T.year)}</label><div class="gt-select"><select id="${p}-yr" data-x-set="year"><option value="">${esc(T.latestEach)}</option>${years.map((y) => `<option${y === s.year ? ' selected' : ''}>${y}</option>`).join('')}</select></div></div>` : '';
  return `<div class="gt-expctl__row"><div class="gt-expctl__cols"><span class="gt-label">${esc(T.measures)}</span>${chips}${pickerHtml(s, meta, p)}</div></div>`
    + `<div class="gt-expctl__row">${blocSelect(meta, `${p}-bl`, T.bloc, T.allCountries, s.bloc)}${yearSel}`
    + `<div class="gt-field gt-expctl__find"><label for="${p}-find">${esc(T.find)}</label><input class="gt-input" id="${p}-find" type="search" value="${esc(s.find)}" data-x-find autocomplete="off"></div>`
    + `<button class="gt-btn gt-btn--quiet" type="button" data-x-csv>${ICON.download}${esc(T.download)}</button></div>`;
}

export interface TableRow { id: string; cells: ({ value: number; year: number } | null)[] }

/** The table's rows: places in the bloc with at least one figure, sorted by the chosen column (blanks last). */
export function tableRows(s: State, meta: Meta, data: Data): { ms: MeasureMeta[]; years: number[]; rows: TableRow[] } {
  const M = byId(meta);
  const ms = s.m.map((id) => M.get(id)).filter((m): m is MeasureMeta => Boolean(m));
  const years = ms.map((m) => (m.static ? m.year : s.year ?? m.year));
  const members = s.bloc ? new Set(meta.blocs.find((b) => b.id === s.bloc)?.members ?? []) : null;
  const rows: TableRow[] = [];
  for (const id of Object.keys(meta.places)) {
    if (members && !members.has(id)) continue;
    const cells = ms.map((m, i) => valueAt(data[m.id], m, id, years[i]));
    if (cells.some(Boolean)) rows.push({ id, cells });
  }
  const k = ms.findIndex((m) => m.id === s.sort);
  const sign = s.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (k < 0) return sign * nameOf(meta, a.id).localeCompare(nameOf(meta, b.id), 'en');
    const x = a.cells[k], y = b.cells[k];
    if (!x || !y) return x === y ? nameOf(meta, a.id).localeCompare(nameOf(meta, b.id), 'en') : x ? -1 : 1;
    return sign * (x.value - y.value) || nameOf(meta, a.id).localeCompare(nameOf(meta, b.id), 'en');
  });
  return { ms, years, rows };
}

/** The row a search finds: a name starting with the text, else containing it. */
export function foundRow(meta: Meta, ids: string[], q: string): string | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  return ids.find((id) => nameOf(meta, id).toLowerCase().startsWith(t)) ?? ids.find((id) => nameOf(meta, id).toLowerCase().includes(t)) ?? null;
}

export function tableHtml(s: State, meta: Meta, data: Data): string {
  const { ms, years, rows } = tableRows(s, meta, data);
  if (!rows.length) return `<p class="gt-notice">${esc(T.noRows)}</p>`;
  const found = foundRow(meta, rows.map((r) => r.id), s.find);
  const sortAttr = (k: string) => (s.sort === k ? ` aria-sort="${s.dir === 'asc' ? 'ascending' : 'descending'}"` : '');
  const head = `<th scope="col"${sortAttr('country')}><button type="button" data-x-sort="country">${esc(T.country)}${ICON.sort}</button></th>`
    + ms.map((m, i) => {
      const sub = [unitText(m), String(years[i])].filter(Boolean).join(' · ');
      return `<th scope="col" class="n"${sortAttr(m.id)}><button type="button" data-x-sort="${m.id}">${esc(m.short ?? m.label)}${ICON.sort}</button><small>${esc(sub)}</small></th>`;
    }).join('');
  const body = rows.map((r) => {
    const p = meta.places[r.id];
    const name = p.h ? `<a href="${esc(p.h)}">${esc(p.n)}</a>` : esc(p.n);
    const cells = r.cells.map((c, i) => {
      if (!c) return '<td class="n gt-na">–</td>';
      const m = ms[i];
      const old = !m.static && c.year !== years[i] ? `<span class="gt-oldyr" title="${esc(T.year)} ${c.year}">${c.year}</span> ` : '';
      return `<td class="n" data-v="${c.value}">${old}${esc(fmt(m, c.value))}${projected(m, c.year) ? ` ${tagHtml('projection')}` : ''}</td>`;
    }).join('');
    return `<tr data-id="${r.id}"${r.id === found ? ' class="is-found"' : ''}><th scope="row">${name}</th>${cells}</tr>`;
  }).join('');
  const caption = s.year ? T.captionYear(s.year) : T.captionLatest;
  return `<div class="gt-tablewrap gt-exptbl" style="--gt-table-h:640px" tabindex="0" role="region" aria-label="${esc(T.tableLabel)}">`
    + `<table class="gt-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="gt-caption gt-exptbl__cap">${esc(caption)}</p>`;
}

/** The table as CSV: country, ISO3, then each downloadable measure's value and year. */
export function tableCsv(s: State, meta: Meta, data: Data): { csv: string; left: MeasureMeta[] } {
  const { ms, rows } = tableRows(s, meta, data);
  const ok = ms.map((m, i) => [m, i] as const).filter(([m]) => m.csv);
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ['country', 'iso3', ...ok.flatMap(([m]) => {
    const u = unitText(m) || m.unit;
    return [`${m.label}${u ? ` (${u})` : ''} [${m.credit}, retrieved ${meta.retrieved[m.id] ?? ''}]`, `${m.label} year`];
  })];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    const p = meta.places[r.id];
    lines.push([p.n, p.c, ...ok.flatMap(([, i]): (string | number)[] => (r.cells[i] ? [r.cells[i]!.value, r.cells[i]!.year] : ['', '']))].map(cell).join(','));
  }
  return { csv: `${lines.join('\n')}\n`, left: ms.filter((m) => !m.csv) };
}

// ---------- over time ----------

function linesControls(s: State, meta: Meta, p: string, data: Data): string {
  const M = byId(meta);
  const m = M.get(s.m[0])!;
  const d = data[m.id];
  const chips = s.c.map((id, i) => `<span class="gt-mchip gt-mchip--c"><span class="gt-ser-dot gt-ser-${i + 1}" aria-hidden="true"></span>${esc(nameOf(meta, id))}<button type="button" data-x-remove-c="${id}" aria-label="${esc(T.remove(nameOf(meta, id)))}">${ICON.close}</button></span>`).join('');
  const others = Object.entries(meta.places).filter(([id]) => !s.c.includes(id) && (!d || d.v[id])).sort((a, b) => a[1].n.localeCompare(b[1].n, 'en'));
  const add = `<div class="gt-field"><label class="gt-vh" for="${p}-addc">${esc(T.addCountry)}</label><div class="gt-select"><select id="${p}-addc" data-x-addc${s.c.length >= MAX_COUNTRIES ? ' disabled' : ''}><option value="">${esc(s.c.length >= MAX_COUNTRIES ? T.upTo(MAX_COUNTRIES) : T.addCountry)}</option>${others.map(([id, x]) => `<option value="${id}">${esc(x.n)}</option>`).join('')}</select></div></div>`;
  const ch = linesChart(s, meta, data);
  const idx = m.static ? '' : `<div class="gt-field"><label for="${p}-ix">${esc(T.indexTo)}</label><div class="gt-select"><select id="${p}-ix" data-x-set="index"><option value="">${esc(T.noIndex)}</option>${ch.years.filter((y) => !projected(m, y)).map((y) => `<option${y === s.index ? ' selected' : ''}>${y}</option>`).join('')}</select></div></div>`;
  return `<div class="gt-expctl__row">${measureSelect(meta, `${p}-m`, T.measure, m.id, 'm')}${idx}<div class="gt-expctl__sw">${toggle(`${p}-log`, T.log, ch.log, !ch.logPossible)}</div></div>`
    + `<div class="gt-expctl__row"><div class="gt-expctl__cols"><span class="gt-label">${esc(T.countries)}</span>${chips}${add}</div></div>`;
}

interface LineSet { years: number[]; lines: { id: string; values: (number | null)[] }[]; missing: string[]; log: boolean; logPossible: boolean; indexed: boolean }

/** The lines to draw: each country's values over the years any of them has, indexed to 100 if asked. */
export function linesChart(s: State, meta: Meta, data: Data): LineSet {
  const m = byId(meta).get(s.m[0])!;
  const d = data[m.id];
  const series = s.c.map((id) => ({ id, pts: seriesOf(d, id) }));
  const all = series.flatMap((x) => x.pts.map((p) => p[0]));
  const years = all.length ? Array.from({ length: Math.max(...all) - Math.min(...all) + 1 }, (_, i) => Math.min(...all) + i) : [];
  const indexed = s.index !== null && years.includes(s.index);
  const lines = series.filter((x) => x.pts.length).map((x) => {
    const by = new Map(x.pts);
    const base = indexed ? by.get(s.index!) : undefined;
    return { id: x.id, values: years.map((y) => { const v = by.get(y); return v === undefined ? null : indexed ? (base ? (v / base) * 100 : null) : v; }) };
  }).filter((l) => l.values.some((v) => v !== null));
  const values = lines.flatMap((l) => l.values.filter((v): v is number => v !== null));
  const logPossible = canLog(values);
  const log = logPossible && (s.log ?? wantsLog(values));
  return { years, lines, missing: s.c.filter((id) => !lines.some((l) => l.id === id)), log, logPossible, indexed };
}

export function linesHtml(s: State, meta: Meta, data: Data, width = 900): string {
  const m = byId(meta).get(s.m[0])!;
  const ch = linesChart(s, meta, data);
  if (!s.c.length) return `<p class="gt-notice">${esc(T.noCountries)}</p>`;
  if (!ch.lines.length || ch.years.length < 2) return `<p class="gt-notice">${esc(T.noLine(s.c.map((id) => nameOf(meta, id)).join(', ')))}</p>`;
  const W = Math.max(320, Math.round(width)), H = Math.round(Math.min(460, Math.max(280, W * 0.5)));
  const phone = W < 560;
  const L = phone ? 52 : 70, R = phone ? 96 : 150, Tp = 16, B = 30;
  const vals = ch.lines.flatMap((l) => l.values.filter((v): v is number => v !== null));
  const t = ticks(ch.log ? Math.min(...vals) : Math.min(0, ...vals), Math.max(...vals), ch.log, phone ? 4 : 5);
  const tr = (v: number) => (ch.log ? Math.log10(v) : v);
  const x = (i: number) => L + (i / (ch.years.length - 1)) * (W - L - R);
  const y = (v: number) => Tp + (1 - (tr(v) - tr(t.lo)) / (tr(t.hi) - tr(t.lo))) * (H - Tp - B);
  const tick = (v: number) => (ch.indexed ? formatValue(v, { kind: 'number' }) : fmt(m, v));
  const split = m.projectedAfter === undefined ? -1 : ch.years.findIndex((yr) => yr > m.projectedAfter!);
  const last = ch.years.length - 1;
  const seg = (vals: (number | null)[], a: number, b: number) => {
    const out: string[] = [];
    let dd = '';
    for (let i = a; i <= b; i++) {
      const v = vals[i];
      if (v === null) { if (dd) out.push(dd); dd = ''; continue; }
      dd += `${dd ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }
    if (dd) out.push(dd);
    return out;
  };
  const step = Math.ceil(ch.years.length / (phone ? 4 : 7));
  const yearTicks = ch.years.map((yr, i) => [yr, i] as const).filter(([, i]) => i === 0 || i === last || (i % step === 0 && last - i >= step / 2));
  const cls = (id: string) => `gt-ser-${s.c.indexOf(id) + 1}`;
  const ends = ch.lines.map((l) => {
    const i = l.values.findLastIndex((v) => v !== null);
    return { l, i, yy: y(l.values[i]!) };
  }).sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 15) ends[k].yy = ends[k - 1].yy + 15;
  for (let k = ends.length - 1; k >= 0; k--) {
    const limit = k === ends.length - 1 ? H - B - 4 : ends[k + 1].yy - 15;
    if (ends[k].yy > limit) ends[k].yy = limit;
  }
  const grid = t.ticks.filter((v) => v >= t.lo && v <= t.hi).map((v) => `<g><line class="gt-lc__grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(tick(v))}</text></g>`).join('');
  const xt = yearTicks.map(([yr, i]) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${yr}</text>`).join('');
  const splitMark = split > 0 ? `<g><line class="gt-lc__split" x1="${x(split - 1).toFixed(1)}" x2="${x(split - 1).toFixed(1)}" y1="${Tp}" y2="${H - B}"/><text class="gt-lc__note" x="${(x(split - 1) + 6).toFixed(1)}" y="${Tp + 10}">${esc(STATUS_TEXT.projection)}</text></g>` : '';
  const paths = ch.lines.map((l) => {
    const solid = seg(l.values, 0, split > 0 ? split - 1 : last).map((dd) => `<path class="gt-lc__line ${cls(l.id)}" d="${dd}"/>`).join('');
    const dash = split > 0 ? seg(l.values, split - 1, last).map((dd) => `<path class="gt-lc__line gt-lc__line--proj ${cls(l.id)}" d="${dd}"/>`).join('') : '';
    return `<g>${solid}${dash}</g>`;
  }).join('');
  const labels = ends.map((e) => `<text class="gt-lc__lab ${cls(e.l.id)}" x="${(x(e.i) + 8).toFixed(1)}" y="${(e.yy + 4).toFixed(1)}">${esc(short(nameOf(meta, e.l.id), phone ? 12 : 20))}</text>`).join('');
  const label = T.linesLabel(m.label, ch.years[0], ch.years[last]);
  const notes = [
    ch.indexed ? T.indexed(s.index!) : '',
    ch.log ? `${T.log}: ${T.logAuto}` : '',
    ch.missing.length ? T.noLine(ch.missing.map((id) => nameOf(meta, id)).join(', ')) : '',
  ].filter(Boolean);
  return `<figure class="gt-expfig"><svg class="gt-lc gt-lc--x" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${grid}${xt}${splitMark}${paths}${labels}</svg>`
    + `${notes.length ? `<figcaption class="gt-caption">${notes.map(esc).join(' ')}</figcaption>` : ''}</figure>`;
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- scatter ----------

function scatterControls(s: State, meta: Meta, p: string, data: Data): string {
  const sc = scatterModel(s, meta, data);
  const yrs = sc.years;
  const year = sc.year;
  const slider = yrs.length > 1
    ? `<div class="gt-years gt-scyr" data-gt-years><button class="gt-play" type="button" aria-label="${esc(YEAR_TEXT.play)}"></button><div class="gt-years__head"><label class="gt-label" for="${p}-yr">${esc(T.year)}</label><span class="gt-years__now" aria-hidden="true">${year}</span></div>`
      + `<input id="${p}-yr" type="range" min="${yrs[0]}" max="${yrs.at(-1)}" step="1" value="${year}" data-x-year><div class="gt-years__ticks">${yearTicks(yrs[0], yrs.at(-1)!).map((t) => `<span>${t}</span>`).join('')}</div></div>`
    : '';
  return `<div class="gt-expctl__row">${measureSelect(meta, `${p}-x`, T.xAxis, s.x, 'x')}${measureSelect(meta, `${p}-y`, T.yAxis, s.y, 'y')}`
    + `${measureSelect(meta, `${p}-s`, T.size, s.size, 'size', `<option value=""${s.size ? '' : ' selected'}>${esc(T.none)}</option>`)}${blocSelect(meta, `${p}-bl`, T.highlight, T.noBloc, s.bloc)}</div>`
    + `<div class="gt-expctl__row">${slider}<div class="gt-expctl__sw">${toggle(`${p}-log`, T.logs, sc.logx || sc.logy, !sc.logxPossible && !sc.logyPossible)}</div></div>`;
}

function yearTicks(a: number, b: number): number[] {
  const step = Math.max(1, Math.ceil((b - a) / 4));
  const out: number[] = [];
  for (let v = b; v >= a; v -= step) out.unshift(v);
  if (out[0] !== a && out[0] - a >= step / 2) out.unshift(a);
  return out;
}

interface Point { id: string; x: number; y: number; size: number | null }
export interface ScatterModel {
  mx: MeasureMeta; my: MeasureMeta; ms?: MeasureMeta;
  years: number[]; year: number; points: Point[]; dropped: number;
  logx: boolean; logy: boolean; logxPossible: boolean; logyPossible: boolean; r: number | null;
}

/** The points of a year, the axes' scales and the correlation. */
export function scatterModel(s: State, meta: Meta, data: Data): ScatterModel {
  const M = byId(meta);
  const mx = M.get(s.x)!, my = M.get(s.y)!, ms = s.size ? M.get(s.size) : undefined;
  const ids = Object.keys(meta.places);
  const years = sharedYears(data[mx.id], mx, data[my.id], my, ids);
  const common = Math.min(mx.static ? Infinity : mx.year, my.static ? Infinity : my.year);
  const fallbackYear = years.filter((y) => y <= common).at(-1) ?? years.at(-1) ?? (Number.isFinite(common) ? common : mx.year);
  const year = s.year !== null && years.includes(s.year) ? s.year : fallbackYear;
  const raw: Point[] = [];
  for (const id of ids) {
    const a = valueAt(data[mx.id], mx, id, year, 0), b = valueAt(data[my.id], my, id, year, 0);
    if (!a || !b) continue;
    const z = ms ? valueAt(data[ms.id], ms, id, year) : null;
    raw.push({ id, x: a.value, y: b.value, size: z ? z.value : null });
  }
  const logxPossible = raw.some((p) => p.x > 0), logyPossible = raw.some((p) => p.y > 0);
  const logx = logxPossible && (s.log === null ? wantsLog(raw.map((p) => p.x).filter((v) => v > 0)) : s.log);
  const logy = logyPossible && (s.log === null ? wantsLog(raw.map((p) => p.y).filter((v) => v > 0)) : s.log);
  const points = raw.filter((p) => (!logx || p.x > 0) && (!logy || p.y > 0));
  const t = (v: number, log: boolean) => (log ? Math.log10(v) : v);
  const r = correlation(points.map((p) => [t(p.x, logx), t(p.y, logy)]));
  return { mx, my, ms, years, year, points, dropped: raw.length - points.length, logx, logy, logxPossible, logyPossible, r };
}

export function scatterHtml(s: State, meta: Meta, data: Data, width = 900): string {
  const sc = scatterModel(s, meta, data);
  const { mx, my, ms, points } = sc;
  if (points.length < 3) return `<p class="gt-notice">${esc(T.noPoints(sc.year))}</p>`;
  const W = Math.max(320, Math.round(width)), H = Math.round(Math.min(560, Math.max(320, W * 0.6)));
  const phone = W < 560;
  const L = phone ? 56 : 76, R = phone ? 12 : 24, Tp = 14, B = 46;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const tx = ticks(sc.logx ? Math.min(...xs) : Math.min(0, ...xs), Math.max(...xs), sc.logx, phone ? 3 : 6);
  const ty = ticks(sc.logy ? Math.min(...ys) : Math.min(0, ...ys), Math.max(...ys), sc.logy, phone ? 4 : 5);
  const tr = (v: number, log: boolean) => (log ? Math.log10(v) : v);
  const X = (v: number) => L + ((tr(v, sc.logx) - tr(tx.lo, sc.logx)) / (tr(tx.hi, sc.logx) - tr(tx.lo, sc.logx))) * (W - L - R);
  const Y = (v: number) => Tp + (1 - (tr(v, sc.logy) - tr(ty.lo, sc.logy)) / (tr(ty.hi, sc.logy) - tr(ty.lo, sc.logy))) * (H - Tp - B);
  const maxSize = Math.max(0, ...points.map((p) => p.size ?? 0));
  const rMax = Math.min(32, Math.max(12, W / 32));
  const rad = (p: Point) => (ms ? (p.size && maxSize > 0 ? Math.max(2.5, Math.sqrt(p.size / maxSize) * rMax) : 2.5) : phone ? 4 : 5);
  const members = new Set(s.bloc ? meta.blocs.find((b) => b.id === s.bloc)?.members ?? [] : []);
  const order = [...points].sort((a, b) => Number(members.has(a.id)) - Number(members.has(b.id)) || rad(b) - rad(a));
  const tip = (p: Point) => [nameOf(meta, p.id), `${mx.label}: ${fmt(mx, p.x)}`, `${my.label}: ${fmt(my, p.y)}`, ms && p.size !== null ? `${ms.label}: ${fmt(ms, p.size)}` : ''].filter(Boolean).join('\n');
  const dots = order.map((p) => {
    const cls = ['gt-sc__pt', members.has(p.id) ? 'is-hi' : '', s.pin.includes(p.id) ? 'is-pinned' : ''].filter(Boolean).join(' ');
    return `<circle class="${cls}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${rad(p).toFixed(1)}" data-x-pin="${p.id}"><title>${esc(tip(p))}</title></circle>`;
  }).join('');
  // Labels: kept ones first, then the biggest and the extremes, skipping any that would overlap one already placed.
  const bySize = [...points].sort((a, b) => (ms ? (b.size ?? 0) - (a.size ?? 0) : b.y - a.y));
  const ext = [
    points.reduce((a, b) => (b.x > a.x ? b : a)), points.reduce((a, b) => (b.x < a.x ? b : a)),
    points.reduce((a, b) => (b.y > a.y ? b : a)), points.reduce((a, b) => (b.y < a.y ? b : a)),
  ];
  const want = [...points.filter((p) => s.pin.includes(p.id)), ...bySize.slice(0, phone ? 3 : 6), ...ext];
  const boxes: [number, number, number, number][] = [];
  const labs: string[] = [];
  const seen = new Set<string>();
  for (const p of want) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const pinned = s.pin.includes(p.id);
    const text = `${pinned ? '✕ ' : ''}${short(nameOf(meta, p.id), 18)}`;
    const w = text.length * 7.2, h = 14;
    let lx = X(p.x) + rad(p) + 4;
    const ly = Y(p.y) + 4;
    let anchor = 'start';
    if (lx + w > W - R) { lx = X(p.x) - rad(p) - 4; anchor = 'end'; }
    const box: [number, number, number, number] = anchor === 'start' ? [lx, ly - h + 2, lx + w, ly + 2] : [lx - w, ly - h + 2, lx, ly + 2];
    if (!pinned && boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    labs.push(`<text class="gt-sc__lab${pinned ? ' gt-sc__lab--pin' : ''}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${esc(text)}</text>`);
  }
  // X labels that would touch the one before are left off (their grid line stays).
  let right = -Infinity;
  const gx = tx.ticks.filter((v) => v >= tx.lo && v <= tx.hi).map((v) => {
    const text = fmt(mx, v), half = text.length * 3.4, at = X(v);
    const show = at - half > right + 6;
    if (show) right = at + half;
    return `<g><line class="gt-lc__grid" x1="${at.toFixed(1)}" x2="${at.toFixed(1)}" y1="${Tp}" y2="${H - B}"/>${show ? `<text x="${at.toFixed(1)}" y="${H - B + 16}" text-anchor="middle">${esc(text)}</text>` : ''}</g>`;
  }).join('');
  const gy = ty.ticks.filter((v) => v >= ty.lo && v <= ty.hi).map((v) => `<g><line class="gt-lc__grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(my, v))}</text></g>`).join('');
  const axTitle = (m: MeasureMeta, log: boolean) => `${m.label}${unitText(m) ? ` (${unitText(m)})` : ''}${log ? `, ${T.logNote}` : ''}`;
  const axes = `<text class="gt-sc__ax" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(axTitle(mx, sc.logx))} →</text>`
    + `<text class="gt-sc__ax" x="${-Tp}" y="14" transform="rotate(-90)" text-anchor="end">${esc(axTitle(my, sc.logy))} →</text>`;
  const bloc = meta.blocs.find((b) => b.id === s.bloc);
  const keyItems = [
    bloc ? `<span><svg class="gt-sw" viewBox="0 0 16 12" aria-hidden="true"><circle cx="8" cy="6" r="5" class="gt-sc__pt is-hi"/></svg>${esc(T.keyMembers(bloc.name))}</span><span><svg class="gt-sw" viewBox="0 0 16 12" aria-hidden="true"><circle cx="8" cy="6" r="5" class="gt-sc__pt"/></svg>${esc(T.keyOthers)}</span>` : '',
    ms ? `<span>${esc(T.keyArea(inSentence(ms.label)))}</span>` : '',
    `<span><b>✕</b> ${esc(T.keyPin)}</span>`,
  ].join('');
  const svg = `<svg class="gt-lc gt-sc" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(T.scatterLabel(mx.label, my.label, sc.year))}">${gy}${gx}${axes}<g>${dots}</g><g>${labs.join('')}</g></svg>`;
  return `<figure class="gt-expfig"><div class="gt-legend__extra gt-sckey">${keyItems}</div>${svg}</figure>${corrHtml(sc)}`;
}

/** The correlation, in words, with the warning that it is not a cause. */
export function corrHtml(sc: ScatterModel): string {
  if (sc.r === null) return '';
  const x = inSentence(sc.mx.label), y = inSentence(sc.my.label);
  const said = sc.r >= 0.3 ? T.higher(x, y) : sc.r <= -0.3 ? T.lower(x, y) : T.little(x, y);
  const n = T.points(sc.points.length, sc.year) + (sc.dropped ? T.dropped(sc.dropped) : '');
  const r = formatValue(sc.r, { kind: 'number', digits: 2 });
  return `<div class="gt-corr"><span class="gt-corr__n"><span class="gt-label">${esc(sc.logx || sc.logy ? T.correlationLog : T.correlation)}</span><b>${esc(r)}</b></span><p>${esc(said)} ${esc(T.notCause)} <span class="gt-caption">${esc(n)}</span></p></div>`;
}

// ---------- by view ----------

/** The controls of a view; `p` prefixes ids, so the desktop row and the phone sheet can both be on the page. */
export function controlsHtml(s: State, meta: Meta, data: Data, p: string): string {
  if (s.view === 'table') return tableControls(s, meta, p);
  if (s.view === 'lines') return linesControls(s, meta, p, data);
  return scatterControls(s, meta, p, data);
}

export function outputHtml(s: State, meta: Meta, data: Data, width?: number): string {
  if (s.view === 'table') return tableHtml(s, meta, data);
  if (s.view === 'lines') return linesHtml(s, meta, data, width);
  return scatterHtml(s, meta, data, width);
}

/** The measures a view needs loaded. */
export const needed = (s: State) => [...new Set(s.view === 'scatter' ? [s.x, s.y, s.size].filter(Boolean) : s.view === 'lines' ? s.m.slice(0, 1) : s.m)];

/** The source line for a view. */
export function viewSource(s: State, meta: Meta, data: Data): string {
  const M = byId(meta);
  const ms = needed(s).map((id) => M.get(id)).filter((m): m is MeasureMeta => Boolean(m));
  let years: string;
  if (s.view === 'scatter') years = String(scatterModel(s, meta, data).year);
  else if (s.view === 'lines') { const c = linesChart(s, meta, data); years = c.years.length ? `${c.years[0]}–${c.years.at(-1)}` : ''; }
  else years = s.year ? String(s.year) : [...new Set(ms.map((m) => m.year))].sort().join(', ');
  return sourceHtml(ms, years);
}
