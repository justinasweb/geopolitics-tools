// The Dependencies tool's markup (DependencyGrid design), shared by the build, which draws the default settings so
// the page reads without scripts, and the browser script, which redraws as the reader changes them. Every cell
// writes its value, so the tint and bar are never the only cue.
import { DEPS_TEXT as T } from '../../i18n/dependencies.en.ts';
import { formatShare } from '../format.ts';
import { esc } from '../explorer/render.ts';
import {
  CONCENTRATION, RESOURCE_IDS, SPOF_PHONE, SPOF_SHOWN, bandOf, foundRow, resIndex, rowsOf, spofs, sortValue,
  type Cell, type Grid, type ResourceId, type State,
} from './model.ts';

const ICON = {
  download: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
  sort: '<svg class="gt-sort" viewBox="0 0 10 12" aria-hidden="true"><path class="up" d="M5 0 9 5H1z"/><path class="down" d="M5 12 1 7h8z"/></svg>',
  most: '<svg viewBox="0 0 16 12" aria-hidden="true"><path d="M1 3h7M1 9h7" stroke="currentColor" stroke-width="1.6"/><path d="M7 1l3 2-3 2zM7 7l3 2-3 2z" fill="currentColor"/><rect x="11" y="1" width="4" height="10" fill="currentColor"/></svg>',
};

const MINUS = '−';
const pct = (v: number) => (v < 0 ? `${MINUS}${formatShare(-v)}` : formatShare(v));
const iso = (grid: Grid, id: string) => grid.places[id]?.c ?? id;
const label = (grid: Grid, r: string) => grid.resources[resIndex(r)]?.label ?? r;
const WHY: Record<NonNullable<Cell['why']>, string> = { p: T.noData, n: T.noRow, u: T.noUse, i: T.noImports };

/** A cell's two lines: the value, and under it the main supplier, the share of output or why there is none. */
export function cellText(grid: Grid, r: ResourceId, c: Cell): [string, string] {
  if (CONCENTRATION.includes(r)) return c.t ? [`${iso(grid, c.t[0])} ${formatShare(c.t[1])}`, T.topSupplier] : ['–', WHY[c.why ?? 'n']];
  if (c.v === undefined) return ['–', WHY[c.why ?? 'n']];
  const b = bandOf(r, c);
  if (b === 5 || b === 6) return [T.exports, c.x !== undefined ? T.ofOutput(formatShare(c.x)) : ''];
  if (c.v < 0) return [pct(c.v), T.netExporter];
  return [pct(c.v), c.t ? `${iso(grid, c.t[0])} ${formatShare(c.t[1])}` : ''];
}

function cellHtml(grid: Grid, r: ResourceId, c: Cell, tag: 'td' | 'span' = 'td'): string {
  const [v, s] = cellText(grid, r, c);
  // "Not reported" is most of the empty cells: a dash, with the words for screen readers and on hover.
  const quiet = v === '–' && (c.why ?? 'n') === 'n';
  const title = c.y ? ` title="${esc(T.year(c.y))}"` : quiet ? ` title="${esc(s)}"` : '';
  const sub = !s ? '' : quiet ? `<span class="gt-vh">${esc(s)}</span>` : `<span class="gt-dg__s">${esc(s)}</span>`;
  return `<${tag} class="gt-dg gt-dg--${bandOf(r, c)}"${title}><span class="gt-dg__v"${quiet ? ' aria-hidden="true"' : ''}>${esc(v)}</span>${sub}</${tag}>`;
}

const nameHtml = (grid: Grid, id: string) => {
  const p = grid.places[id];
  return p?.h ? `<a href="${esc(p.h)}">${esc(p.n)}</a>` : esc(p?.n ?? id);
};

// ---------- single points of failure ----------

export function spofHtml(s: State, grid: Grid): string {
  const all = spofs(rowsOf({ ...s, sort: 'country', dir: 'asc' }, grid));
  const shown = s.all ? all : all.slice(0, SPOF_SHOWN);
  const items = shown.map((x) => {
    const r = grid.resources[resIndex(x.r)];
    const supplier = grid.places[x.t[0]]?.n ?? x.t[0];
    return `<li><div class="gt-spof__h"><b>${nameHtml(grid, x.id)}</b><span class="gt-deptag gt-deptag--most">${ICON.most}${esc(r.label)}</span></div>`
      + `<p>${esc(T.spofItem(formatShare(x.v), r.noun, supplier, formatShare(x.t[1])))}</p></li>`;
  }).join('');
  const more = all.length > SPOF_PHONE
    ? `<button class="gt-btn gt-btn--quiet" type="button" data-d-all aria-expanded="${s.all}">${esc(s.all ? T.showFewer : T.showAll(all.length))}</button>` : '';
  return `<div class="gt-spof__head"><h2 class="gt-h2" id="spof-h">${esc(T.spofTitle)}</h2><p class="gt-caption">${esc(T.spofRule)}</p></div>`
    + (all.length ? `<ul class="gt-spof__list">${items}</ul>` : '')
    + `<p class="gt-spof__more">${all.length ? `<span class="gt-spof__n">${esc(T.spofCount(all.length, shown.length))}</span>`
      + (s.all ? '' : `<span class="gt-spof__n gt-spof__n--phone">${esc(T.spofCount(all.length, Math.min(all.length, SPOF_PHONE)))}</span>`) : `<span>${esc(T.spofNone)}</span>`}`
    + `${all.length > SPOF_PHONE && all.length <= SPOF_SHOWN ? more.replace('gt-btn--quiet', 'gt-btn--quiet gt-spof__phonebtn') : more}</p>`;
}

// ---------- controls ----------

const select = (id: string, text: string, key: string, opts: [string, string][], value: string, hide = false) =>
  `<div class="gt-field"><label for="${id}"${hide ? ' class="gt-vh"' : ''}>${esc(text)}</label><div class="gt-select"><select id="${id}" data-d-set="${key}">`
  + opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select></div></div>';

const blocOpts = (grid: Grid): [string, string][] => [['', T.allCountries], ...grid.blocs.map((b): [string, string] => [b.id, b.name])];
const resOpts = (grid: Grid): [string, string][] => grid.resources.map((r) => [r.id, r.label]);

/** The desktop controls: bloc, sort, find and the download. */
export function controlsHtml(s: State, grid: Grid): string {
  return '<div class="gt-expctl__row">'
    + select('d-bloc', T.bloc, 'bloc', blocOpts(grid), s.bloc)
    + select('d-sort', T.sort, 'sort', [['country', T.country], ...resOpts(grid)], s.sort)
    + `<div class="gt-field"><label for="d-find">${esc(T.find)}</label><input class="gt-input" id="d-find" type="search" autocomplete="off" value="${esc(s.find)}" data-d-find></div>`
    + `<button class="gt-btn gt-btn--quiet" type="button" data-d-csv>${ICON.download}${esc(T.download)}</button></div>`;
}

export function legendHtml(): string {
  const keys = T.bands.map((b, i) => `<span class="gt-dg gt-dg--${i + 1} gt-dglegend__k">${esc(b)}</span>`).join('')
    + `<span class="gt-dg gt-dg--c gt-dglegend__k">${esc(T.concentration)}</span>`;
  return `<span class="gt-legend__title">${esc(T.legendTitle)}</span><div class="gt-dglegend__row">${keys}</div><p class="gt-caption">${esc(T.legendNote)}</p>`;
}

// ---------- the grid ----------

export function tableHtml(s: State, grid: Grid): string {
  const rows = rowsOf(s, grid);
  if (!rows.length) return `<p class="gt-notice">${esc(T.noRows)}</p>`;
  const found = foundRow(grid, rows.map((r) => r.id), s.find);
  const sortAttr = (k: string) => (s.sort === k ? ` aria-sort="${s.dir === 'asc' ? 'ascending' : 'descending'}"` : '');
  const head = `<th scope="col"${sortAttr('country')}><button type="button" data-d-sort="country">${esc(T.country)}${ICON.sort}</button></th>`
    + grid.resources.map((r) => `<th scope="col"${sortAttr(r.id)}><button type="button" data-d-sort="${r.id}">${esc(r.label)}${ICON.sort}</button></th>`).join('');
  const body = rows.map((row) => `<tr data-id="${row.id}"${row.id === found ? ' class="is-found"' : ''}><th scope="row">${nameHtml(grid, row.id)}</th>`
    + RESOURCE_IDS.map((r, i) => cellHtml(grid, r, row.cells[i])).join('') + '</tr>').join('');
  const caption = T.caption(grid.years, s.sort === 'country' ? T.country.toLowerCase() : label(grid, s.sort).toLowerCase(), s.dir === 'asc' && s.sort !== 'country');
  return `<div class="gt-tablewrap gt-dgwrap" style="--gt-table-h:720px" tabindex="0" role="region" aria-label="${esc(T.tableLabel)}">`
    + `<table class="gt-table gt-dgtbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="gt-caption">${esc(caption)}</p>`;
}

// ---------- phone ----------

/** The commodity the phone list ranks: the sorted column, or the first with figures when sorted by name. */
const phoneRes = (s: State, grid: Grid): ResourceId => (s.sort === 'country' ? grid.resources[0].id : (s.sort as ResourceId));

export function phoneHtml(s: State, grid: Grid): string {
  const rows = rowsOf(s, grid);
  const seg = `<div class="gt-seg gt-dgsw" role="group" aria-label="${esc(T.show)}">`
    + (['country', 'commodity'] as const).map((v) => `<button type="button" data-d-show="${v}" aria-pressed="${s.show === v}">${esc(v === 'country' ? T.byCountry : T.byCommodity)}</button>`).join('') + '</div>';
  const bloc = select('dp-bloc', T.bloc, 'bloc', blocOpts(grid), s.bloc);
  if (!rows.length) return `${seg}${bloc}<p class="gt-notice">${esc(T.noRows)}</p>`;
  if (s.show === 'country') {
    const byName = [...rows].sort((a, b) => (grid.places[a.id]?.n ?? '').localeCompare(grid.places[b.id]?.n ?? '', 'en'));
    const id = rows.some((r) => r.id === s.c) ? s.c : rows[0].id;
    const row = rows.find((r) => r.id === id)!;
    const p = grid.places[id];
    const pick = select('dp-c', T.country, 'c', byName.map((r): [string, string] => [r.id, grid.places[r.id]?.n ?? r.id]), id, true);
    const list = RESOURCE_IDS.map((r, i) => `<li class="gt-dgcard__r"><span class="gt-dgcard__c">${esc(grid.resources[i].label)}</span>${cellHtml(grid, r, row.cells[i], 'span')}</li>`).join('');
    const link = p?.h ? `<a class="gt-cpsec__link" href="${esc(p.h)}">${esc(T.countryPage(p.n))} <span aria-hidden="true">→</span></a>` : '';
    return `${seg}${bloc}${pick}<article class="gt-dgcard"><h3 class="gt-h3">${esc(p?.n ?? id)}</h3><ul>${list}</ul>${link}</article>`;
  }
  const r = phoneRes(s, grid);
  const i = resIndex(r);
  const pick = select('dp-r', T.commodity, 'sort', resOpts(grid), r, true);
  const ranked = rowsOf({ ...s, sort: r }, grid).filter((row) => sortValue(r, row.cells[i]) !== undefined);
  const items = ranked.map((row, n) => `<li><span class="gt-dgrank__n">${n + 1}</span><span class="gt-dgrank__c">${nameHtml(grid, row.id)}</span>${cellHtml(grid, r, row.cells[i], 'span')}</li>`).join('');
  return `${seg}${bloc}${pick}<ol class="gt-dgrank" aria-label="${esc(T.rankLabel(label(grid, r).toLowerCase()))}">${items}</ol>`;
}

// ---------- download ----------

/** The rows shown as CSV, with the columns whose sources allow it, and a note naming what was left out. */
export function gridCsv(s: State, grid: Grid): { csv: string; note: string } {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const tag = (credit: string) => ` [${credit}, retrieved ${grid.retrieved}]`;
  const share = (v?: number) => (v === undefined ? '' : Number(v.toFixed(4)));
  const cols: { head: string; i: number; get: (c: Cell) => string | number }[] = [];
  const left: string[] = [];
  grid.resources.forEach((r, i) => {
    const conc = CONCENTRATION.includes(r.id);
    if (r.csv && !conc) {
      cols.push({ head: T.csvReliance(r.label) + tag(r.credit), i, get: (c) => share(c.v) });
      cols.push({ head: T.csvExports(r.label) + tag(r.credit), i, get: (c) => share(c.x) });
      cols.push({ head: T.csvYear(r.label), i, get: (c) => c.y ?? '' });
    }
    if (r.csvTop) {
      cols.push({ head: T.csvTop(r.label) + tag(r.flowCredit), i, get: (c) => (c.t ? iso(grid, c.t[0]) : '') });
      cols.push({ head: T.csvTopShare(r.label) + tag(r.flowCredit), i, get: (c) => share(c.t?.[1]) });
      if (conc) cols.push({ head: T.csvYear(r.label), i, get: (c) => c.y ?? '' });
    } else left.push(conc ? `${r.label.toLowerCase()} (${r.flowCredit})` : T.csvTopOf(r.label.toLowerCase(), r.flowCredit));
  });
  const lines = [['country', 'iso3', ...cols.map((c) => c.head)].map(cell).join(',')];
  for (const row of rowsOf(s, grid)) {
    const p = grid.places[row.id];
    lines.push([p.n, p.c, ...cols.map((col) => col.get(row.cells[col.i]))].map(cell).join(','));
  }
  return { csv: `${lines.join('\n')}\n`, note: left.length ? T.csvLeftOut(left.join('; ')) : '' };
}
