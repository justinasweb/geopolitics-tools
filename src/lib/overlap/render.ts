// The Bloc overlap tool's markup (BlocOverlap design), shared by the build, which draws the default settings so the
// page reads without scripts, and the browser script, which redraws as the reader chooses blocs. Every matrix cell
// writes its number and every membership a shape, so neither shade nor colour is the only cue.
import { OVERLAP_TEXT as T } from '../../i18n/overlap.en.ts';
import { esc } from '../explorer/render.ts';
import {
  OVERLAP_ORDER, PHONE_ROWS, SHAPES, blocOf, memberRows, phoneBlocs, shade, shapeOf, sharedMembers, topPairs, twoBlocs,
  type Data, type Shape, type State,
} from './model.ts';

const ICON = {
  download: '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
  sort: '<svg class="gt-sort" viewBox="0 0 10 12" aria-hidden="true"><path class="up" d="M5 0 9 5H1z"/><path class="down" d="M5 12 1 7h8z"/></svg>',
};

const nameHtml = (data: Data, id: string) => {
  const p = data.places[id];
  return p?.h ? `<a href="${esc(p.h)}">${esc(p.n)}</a>` : esc(p?.n ?? id);
};
const short = (data: Data, id: string) => blocOf(data, id).name;

// ---------- chips ----------

export function chipsHtml(s: State, data: Data): string {
  return `<span class="gt-label" id="o-chips-l">${esc(T.compare)}</span>`
    + data.blocs.map((b) => `<button class="gt-chip" type="button" data-o-bloc="${b.id}" aria-pressed="${s.blocs.includes(b.id)}">${esc(b.name)} <small>${b.members.length}</small></button>`).join('');
}

// ---------- matrix ----------

export function matrixHtml(s: State, data: Data): string {
  const pairs = topPairs(data, s.blocs).map(([a, b, n]): [string, string, number] => [blocOf(data, a).inText, blocOf(data, b).inText, n]);
  const head = `<th scope="col"><span class="gt-th">${esc(T.bloc)}</span></th>` + s.blocs.map((b) => `<th scope="col"><span class="gt-th">${esc(short(data, b))}</span></th>`).join('');
  const body = s.blocs.map((a) => `<tr><th scope="row">${esc(short(data, a))}</th>` + s.blocs.map((b) => {
    if (a === b) return `<td class="gt-mx gt-mx--self"><span>${blocOf(data, a).members.length}</span><small>${esc(T.members)}</small></td>`;
    const n = sharedMembers(data, a, b).length;
    return `<td class="gt-mx gt-mx--${shade(n)}"><span>${n || '–'}</span></td>`;
  }).join('') + '</tr>').join('');
  return `<h2 class="gt-h2">${esc(T.matrixTitle)}</h2><p class="gt-cpsec__find">${esc(pairs.length ? T.pairs(pairs) : T.noPairs)}</p>`
    + `<div class="gt-tablewrap gt-mxwrap" style="--gt-table-h:none" tabindex="0" role="region" aria-label="${esc(T.matrixLabel)}">`
    + `<table class="gt-table gt-mxtbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="gt-caption">${esc(T.matrixCaption)}</p>`;
}

// ---------- two blocs (phone) ----------

const select = (id: string, text: string, key: string, data: Data, value: string) =>
  `<div class="gt-field"><label for="${id}">${esc(text)}</label><div class="gt-select"><select id="${id}" data-o-set="${key}">`
  + data.blocs.map((b) => `<option value="${b.id}"${b.id === value ? ' selected' : ''}>${esc(b.name)}</option>`).join('') + '</select></div></div>';

export function twoHtml(s: State, data: Data): string {
  const pick = `<div class="gt-two__pick">${select('o-a', T.first, 'a', data, s.a)}${select('o-b', T.second, 'b', data, s.b)}</div>`;
  if (s.a === s.b) return `${pick}<p class="gt-cpsec__find">${esc(T.same)}</p>`;
  const { both, onlyA, onlyB } = twoBlocs(data, s.a, s.b);
  const box = (mod: string, title: string, ids: string[]) => `<section class="gt-two__c gt-two__c--${mod}"><h3 class="gt-h3">${esc(title)} <small>${ids.length}</small></h3>`
    + (ids.length ? `<ul>${ids.map((id) => `<li>${nameHtml(data, id)}</li>`).join('')}</ul>` : `<p class="gt-na">${esc(T.none)}</p>`) + '</section>';
  return pick + `<p class="gt-cpsec__find">${esc(T.share(blocOf(data, s.a).inText, blocOf(data, s.b).inText, both.length))}</p>`
    + box('both', T.inBoth, both) + box('a', T.only(short(data, s.a)), onlyA) + box('b', T.only(short(data, s.b)), onlyB);
}

// ---------- bridge countries ----------

export interface Bridges {
  /** Each bridge country, with its memberships in each bridge group. */
  list: { id: string; a: string[]; b: string[] }[];
  /** Partners and invitees: the place and its line. */
  partners: { id: string; text: string }[];
  /** The two bridge groups, and the default blocs in neither. */
  a: string[];
  b: string[];
  neither: string[];
}

export function bridgeHtml(br: Bridges, data: Data): string {
  const names = (ids: string[]) => ids.map((b) => short(data, b));
  const inText = (ids: string[]) => ids.map((b) => blocOf(data, b).inText);
  const items = br.list.map((x) => `<li><b>${nameHtml(data, x.id)}</b><span class="gt-bridge__w">${esc(names(x.a).join(' · '))}</span>`
    + `<span class="gt-bridge__x" aria-hidden="true">↔</span><span class="gt-bridge__n">${esc(names(x.b).join(' · '))}</span></li>`).join('');
  const partners = br.partners.map((p) => `<li><b>${nameHtml(data, p.id)}</b><span>${esc(p.text)}</span></li>`).join('');
  return `<h2 class="gt-h2">${esc(T.bridgeTitle)}</h2><p class="gt-cpsec__find">${esc(T.bridgeFind(br.list.map((x) => data.places[x.id]?.n ?? x.id), inText(br.a), inText(br.b)))}</p>`
    + `<p class="gt-caption">${esc(T.bridgeRule(inText(br.neither)))}</p>`
    + (items ? `<ul class="gt-bridge__list">${items}</ul>` : '')
    + (partners ? `<h3 class="gt-h3">${esc(T.partnersTitle)}</h3><ul class="gt-bridge__list gt-bridge__list--p">${partners}</ul>` : '');
}

// ---------- membership table ----------

const mark = (shape: Shape, label = true) => `<span class="gt-mk gt-mk--${shape}"${label ? ` role="img" aria-label="${esc(T.member)}"` : ' aria-hidden="true"'}></span>`;
const notMark = `<span class="gt-na" role="img" aria-label="${esc(T.notMember)}">·</span>`;

/** The key above the table: one line per shape the shown blocs use. */
export function keyHtml(data: Data, blocs: string[]): string {
  const groups = (Object.keys(SHAPES) as Shape[]).map((sh) => [sh, OVERLAP_ORDER.filter((b) => blocs.includes(b) && shapeOf(b) === sh)] as const).filter(([, l]) => l.length);
  return '<p class="gt-memkey">' + groups.map(([sh, l]) => `<span>${mark(sh, false)}${esc(T.keyMember(l.map((b) => short(data, b))))}</span>`).join('')
    + `<span><span class="gt-na" aria-hidden="true">·</span>${esc(T.keyNot)}</span></p>`;
}

function table(data: Data, s: State, blocs: string[], limit?: number): string {
  const all = memberRows(data, blocs, s.sort, s.dir);
  const rows = limit ? all.slice(0, limit) : all;
  const sortAttr = (k: string) => (s.sort === k ? ` aria-sort="${s.dir === 'asc' ? 'ascending' : 'descending'}"` : '');
  const head = `<th scope="col"${sortAttr('country')}><button type="button" data-o-sort="country">${esc(T.country)}${ICON.sort}</button></th>`
    + blocs.map((b) => `<th scope="col"><span class="gt-th">${esc(short(data, b))}</span></th>`).join('')
    + `<th scope="col" class="n"${sortAttr('total')}><button type="button" data-o-sort="total">${esc(T.total)}${ICON.sort}</button></th>`;
  const body = rows.map((r) => `<tr><th scope="row">${nameHtml(data, r.id)}</th>`
    + r.in.map((on, i) => `<td class="gt-mem2">${on ? mark(shapeOf(blocs[i])) : notMark}</td>`).join('') + `<td class="n">${r.total}</td></tr>`).join('');
  return keyHtml(data, blocs)
    + `<div class="gt-tablewrap gt-memtbl" style="--gt-table-h:${limit ? 'none' : '560px'}" tabindex="0" role="region" aria-label="${esc(T.tableLabel)}">`
    + `<table class="gt-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    + `<p class="gt-caption">${esc(T.tableCaption(s.sort === 'country', s.dir === 'asc'))}</p>`
    + (limit && all.length > rows.length ? `<p class="gt-caption">${esc(T.phoneNote(all.length - rows.length))}</p>` : '');
}

export function tableHtml(s: State, data: Data): string {
  return `<h2 class="gt-h2">${esc(T.tableTitle)}</h2>${table(data, s, s.blocs)}`
    + `<button class="gt-btn gt-btn--quiet gt-showall" type="button" data-o-csv>${ICON.download}${esc(T.download)}</button>`;
}

/** On a phone: the picked pair and the blocs closest to it, the first rows, until "Show all countries and blocs". */
export function phoneTableHtml(s: State, data: Data): string {
  const blocs = s.all ? s.blocs : phoneBlocs(data, s);
  return `<h2 class="gt-h2">${esc(T.tableTitlePhone)}</h2>${table(data, s, blocs, s.all ? undefined : PHONE_ROWS)}`
    + `<button class="gt-btn gt-btn--quiet gt-showall" type="button" data-o-all aria-expanded="${s.all}">${esc(s.all ? T.showFewer : T.showAll)}</button>`;
}

// ---------- download ----------

/** The full table as CSV: each country's ISO code, a 1 or 0 per chosen bloc, and the date of the member lists. */
export function overlapCsv(s: State, data: Data): string {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [['country', 'iso3', ...s.blocs.map((b) => short(data, b)), 'total', T.csvAsOf].map(cell).join(',')];
  for (const r of memberRows(data, s.blocs, s.sort, s.dir)) {
    const p = data.places[r.id];
    lines.push([p?.n ?? r.id, p?.c ?? '', ...r.in.map((x) => (x ? 1 : 0)), r.total, data.checked].map(cell).join(','));
  }
  return `${lines.join('\n')}\n`;
}
