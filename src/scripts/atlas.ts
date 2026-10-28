// The Atlas page script (src/templates/AtlasPage.astro): draws the map with the map engine (./map/engine.ts) and
// switches its layer in place when the reader picks another, so the map, the zoom and the selected country stay.
// Overlays (trade flows, launch sites, disaster alerts, a bloc outline) are drawn from the layer files of the views
// that draw them, at the step nearest the map's year; the legend box stacks the shaded layer's legend and one section
// per overlay. The panel shows the world or the selected country with the map views' own panel (./map/panel.ts),
// plus a line on the layer before and "See full page". Layer files are the map views' own (/map/<id>.json), fetched
// once each. The state is kept in the address with replaceState (./map/atlas-state.ts). Under 760px the layer list
// and the panel are sheets, and the legend folds to one line (AtlasPhone design).
import type { LayerFile, Overlay } from '../lib/map/types';
import type { AtlasOverlayVariant } from '../lib/atlas';
import type { Hit, MapController } from './map/engine';
import {
  carryYear, kindOf, overlayAt, overlayStep, overlayTime, readAtlasState, toggleOverlay, viewHref, writeAtlasState,
  yearNote, yearOn, type AtlasContext, type AtlasLayerRef,
} from './map/atlas-state';
import { legendHtml, markSvg } from './map/legend';
import { countryPanelHtml, tooltipHtml, worldPanelHtml } from './map/panel';
import { esc, fill } from './map/text';
import { initControls } from './controls';
import { initCopy } from './copy';
import { bindSearchKey } from './header';

interface ManifestLayer extends AtlasLayerRef { id: string; file: string; family: string; name: string; path: string; title: string }
interface ManifestOverlay { id: string; label: string; variants: AtlasOverlayVariant[] }
interface Words {
  found: { none: string; one: string; many: string }; on: string; hide: string; show: string; showLegend: string; remove: string;
  drawnFor: string; withCountry: string; loading: string; loadingNote: string; loadingNoteNone: string; pickHint: string; top: string;
  seeFull: string; previous: string; greyMeans: string; otherLayers: string; shareText: string; borders: string;
  year: { years: string; months: string; days: string; kept: string; latest: string; earliest: string; nearest: string };
}
interface Manifest {
  start: string; slugs: Record<string, string>; overlays: ManifestOverlay[]; layers: ManifestLayer[]; words: Words;
  topics: { id: string; label: string; rows: { family: string; label: string; layers: string[] }[] }[];
}

const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const EMPTY = '<svg class="gt-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M8 14h8"/></svg>';
const SKEL = '<div class="gt-skel gt-skel--flat" aria-hidden="true"><i style="width:60%"></i><i></i><i style="width:80%"></i><i style="width:40%"></i></div>';
const LEGEND_KEY = 'gt-atlas-legend';
const HINT_KEY = 'gt-atlas-hint';
const PHONE = 760;

export function initAtlas(root: HTMLElement): void {
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => from.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => [...from.querySelectorAll<T>(sel)];
  const m = JSON.parse(document.getElementById('at-data')!.textContent!) as Manifest;
  const W = m.words;
  const tokens = m.overlays.flatMap((o) => o.variants.map((v) => v.token));
  const ctx: AtlasContext = { layers: m.layers, start: m.start, slugs: m.slugs, overlays: tokens };
  const byKey = new Map(m.layers.map((l) => [l.key, l]));
  const byFile = new Map(m.layers.map((l) => [l.file, l]));
  const variantOf = (token: string) => {
    const o = m.overlays.find((x) => x.id === kindOf(token))!;
    return { o, v: o.variants.find((x) => x.token === token)! };
  };
  const mapBox = $('.gt-atmap')!;
  const host = $('.gt-maphost')!;
  const canvasEl = $('.gt-mapcanvas')!;
  const tip = $('.gt-world__tip')!;
  const loading = $('[data-map-state="loading"]')!;
  const failed = $('[data-map-state="error"]')!;
  const current = $('[data-at-current]')!;
  const search = $<HTMLInputElement>('[data-at-search]')!;
  const clear = $('[data-at-clear]')!;
  const found = $('[data-at-found]')!;
  const foundIdle = found.textContent ?? '';
  const legend = $('[data-at-legend]')!;
  const legendBody = $('#at-leg-body')!;
  const shadedLegend = $('[data-at-shaded]')!;
  const overlayLegends = $('[data-at-ovlegs]')!;
  const panel = $('[data-at-panel]')!;
  const yearCard = $('[data-at-year]')!;
  const loadCard = $('[data-at-loading]')!;
  const shareBtn = $('[data-at-share]')!;
  const share = $('#at-share')!;
  const menuBtn = $('[data-at-menu]');
  const menu = $('#at-menu');
  const dockBtn = $('[data-at-layersopen]')!;

  const { state, askedYear } = readAtlasState(location.search, ctx);
  let file: LayerFile | null = null;
  let ctrl: MapController | null = null;
  let starting: Promise<void> | null = null;
  let kbd: string | null = null;
  // The layer before the current one, and the year it showed: the panel's "On the layer you had before".
  let prev: { key: string; index: number } | null = null;
  // What the year card says under the slider (a year kept or moved), until the reader moves it.
  let yearMsg = '';
  let switching = false;
  // When each overlay's drawn marks are from, and whether that differs from the map's year: said in its legend.
  let overlayTimes: Record<string, { text: string; differs: boolean }> = {};

  const ref = () => byKey.get(state.layer)!;
  const shownYear = () => yearOn(ref(), state.year);
  const yi = () => Math.max(0, file?.years.indexOf(shownYear()) ?? 0);
  const isPhone = () => root.clientWidth < PHONE;
  let phone = isPhone();
  const nameOf = (id: string) => file?.names[id] ?? id;
  const whenOf = (f: LayerFile, i: number) => f.data[i]?.label ?? String(f.data[i]?.year ?? '');

  const say = (text: string) => {
    const live = document.getElementById('gt-live');
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  };
  const saveUrl = () => {
    const u = writeAtlasState(new URL(location.href), state, ctx);
    if (u.href !== location.href) history.replaceState(history.state, '', u);
    renderShare();
  };

  // ---------- layer files: fetched once each ----------
  const files = new Map<string, Promise<LayerFile>>();
  const loaded = new Map<string, LayerFile>();
  const load = (url: string): Promise<LayerFile> => {
    let p = files.get(url);
    if (!p) {
      p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`layer ${r.status}`);
        return r.json() as Promise<LayerFile>;
      }).then((f) => { loaded.set(url, f); return f; });
      // A failed fetch is tried again next time.
      p.catch(() => files.delete(url));
      files.set(url, p);
    }
    return p;
  };

  // ---------- the bar and the dock ----------
  function renderBar() {
    const l = ref();
    current.textContent = state.country ? fill(W.withCountry, { layer: l.title, country: nameOf(state.country) }) : l.title;
    const ov = state.overlays[0] ? variantOf(state.overlays[0]).o.label : '';
    $('[data-at-dock]')!.textContent = phone && ov ? `${l.name} · ${ov}` : l.name;
  }

  // ---------- the layer list ----------
  /** A row's words under its name follow the choice in its select. */
  function syncSub(row: HTMLElement, sel: HTMLSelectElement | null) {
    if (!sel) return;
    const opt = sel.selectedOptions[0];
    $('[data-at-sub]', row)!.textContent = opt?.dataset.sub ?? '';
    const src = $('[data-at-src]', row);
    if (src) src.textContent = opt?.dataset.src ?? '';
  }
  function renderList() {
    const l = ref();
    for (const row of $$('[data-at-row]')) {
      const on = row.dataset.atRow === l.family;
      if (on) row.dataset.atKey = l.key;
      row.classList.toggle('is-on', on);
      $<HTMLInputElement>('input[type="radio"]', row)!.checked = on;
      const sel = $<HTMLSelectElement>('[data-at-variant]', row);
      if (sel) {
        sel.value = row.dataset.atKey!;
        sel.closest<HTMLElement>('.gt-lyr__sub')!.hidden = !on;
        syncSub(row, sel);
      }
    }
    for (const row of $$('[data-at-ov]')) {
      const tok = state.overlays.find((t) => kindOf(t) === row.dataset.atOv);
      if (tok) row.dataset.atTok = tok;
      row.classList.toggle('is-on', !!tok);
      $<HTMLInputElement>('input[type="checkbox"]', row)!.checked = !!tok;
      const sel = $<HTMLSelectElement>('[data-at-ovvariant]', row);
      if (sel) {
        sel.value = row.dataset.atTok!;
        sel.closest<HTMLElement>('.gt-lyr__sub')!.hidden = !tok;
        syncSub(row, sel);
      }
    }
    // Phone: one overlay at a time, as radio buttons above the layers.
    const one = state.overlays[0];
    for (const r of $$<HTMLInputElement>('input[name="at-ovp"]')) r.checked = r.value === (one ? kindOf(one) : '');
    for (const s of $$('[data-at-ovp-sub]')) {
      s.hidden = !one || kindOf(one) !== s.dataset.atOvpSub;
      if (!s.hidden) $<HTMLSelectElement>('select', s)!.value = one;
    }
    for (const t of $$<HTMLDetailsElement>('[data-at-topic]')) {
      const n = $$('.gt-lyr.is-on', t).length;
      const badge = $('[data-at-on]', t)!;
      badge.hidden = !n;
      badge.textContent = W.on.replace('{n}', String(n));
      if (n) t.open = true;
    }
    renderBar();
  }

  // ---------- the legend box: the shaded layer, then one section per overlay ----------
  function renderLegend() {
    if (!file) return;
    shadedLegend.innerHTML = legendHtml(file, yi());
    $('[data-at-legname]')!.textContent = file.data[yi()].legend;
    $('[data-at-ramp]')!.innerHTML = Array.from({ length: file.scale === 'seq' ? 5 : 7 }, (_, i) => `<i style="background:var(--${file!.scale}-${i + 1})"></i>`).join('');
    overlayLegends.innerHTML = state.overlays.map((t) => {
      const { o, v } = variantOf(t);
      const name = o.variants.length > 1 ? `${o.label}: ${v.label}` : o.label;
      const time = overlayTimes[t];
      // The title says the time drawn ("Trade flows: Wheat trade, 2023"; "Disaster alerts, last 30 days").
      const title = time ? `${name}, ${/^\d/.test(time.text) ? time.text : time.text[0].toLowerCase() + time.text.slice(1)}` : name;
      let items = v.legend.map((x) => `<span>${markSvg(x.symbol)}${esc(x.label)}</span>`).join('');
      if (o.id === 'bloc') {
        const b = file!.blocs[t.slice('bloc-'.length)];
        if (b) items = `<span>${markSvg('outline')}${esc(file!.text.members.replace('{n}', String(b.members.length)))}</span>`;
      }
      const when = time?.differs ? `<p class="gt-caption">${esc(fill(W.drawnFor, { drawn: time.text, map: whenOf(file!, yi()) }))}</p>` : '';
      return `<section class="gt-atleg__s"><div class="gt-atleg__h"><b>${esc(title)}</b>`
        + `<button class="gt-atleg__x" type="button" data-at-ovoff="${esc(t)}" aria-label="${esc(W.remove.replace('{name}', name))}">${X}</button></div>`
        + `<div class="gt-legend__extra gt-legend__marks">${items}</div>${when}</section>`;
    }).join('');
  }
  const legendKey = () => LEGEND_KEY + (phone ? '-phone' : '');
  function setLegendOpen(open: boolean, remember = true) {
    legendBody.hidden = !open;
    legend.classList.toggle('is-folded', !open);
    for (const b of $$('[data-at-leghide]', legend)) b.setAttribute('aria-expanded', String(open));
    $('.gt-atleg__bar [data-at-leghide]', legend)!.textContent = open ? W.hide : W.show;
    $('[data-at-legact]')!.textContent = open ? W.hide : W.showLegend;
    if (remember) try { sessionStorage.setItem(legendKey(), open ? '1' : '0'); } catch { /* storage blocked: the choice lasts this page */ }
    frame();
  }
  /** Desktop opens the legend; a phone folds it to one line. A choice made this session wins. */
  function restoreLegend() {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(legendKey()); } catch { /* storage blocked */ }
    setLegendOpen(saved === null ? !phone : saved === '1', false);
  }

  // ---------- the year card ----------
  function renderYear() {
    const f = file;
    if (!f || f.years.length < 2) { yearCard.hidden = true; yearCard.innerHTML = ''; sizeYear(); return; }
    yearCard.hidden = false;
    const n = f.years.length;
    const labels = Object.fromEntries(f.data.map((d, i) => [i, d.label ?? String(d.year)]));
    const est = f.data.flatMap((d, i) => (d.status ? [i] : []));
    // Up to six ticks (three on a phone), evenly spread, the first and the last always.
    const k = Math.min(n, phone ? 3 : 6);
    const ticks = [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, k - 1))))];
    const word = f.axis === 'months' ? W.year.months : f.axis === 'days' ? W.year.days : W.year.years;
    const play = f.axis !== 'days';
    yearCard.innerHTML = `<div class="gt-years${play ? '' : ' gt-years--noplay'}${n === 2 ? ' gt-years--two' : ''}" data-gt-years data-est="${est.join(' ')}" data-labels="${esc(JSON.stringify(labels))}">`
      + (play ? '<button class="gt-play" type="button"></button>' : '')
      + `<div class="gt-years__head"><label class="gt-label" for="at-year">${esc(word)}</label><span class="gt-years__now" aria-hidden="true">${esc(labels[yi()])}</span></div>`
      + `<input id="at-year" type="range" min="0" max="${n - 1}" step="1" value="${yi()}" aria-valuetext="${esc(labels[yi()])}">`
      + `<div class="gt-years__ticks">${ticks.map((i) => `<span>${esc(labels[i])}</span>`).join('')}</div></div>`
      + `<p class="gt-caption gt-atyear__note" aria-live="polite"${yearMsg ? '' : ' hidden'}>${esc(yearMsg)}</p>`;
    initControls();
    sizeYear();
  }
  /** The card's height, for the legend above it where the two share the map's foot (narrower desktops). */
  function sizeYear() { mapBox.style.setProperty('--at-yearh', yearCard.hidden ? '0px' : `${yearCard.offsetHeight}px`); }
  new ResizeObserver(sizeYear).observe(yearCard);
  function setYearIndex(i: number) {
    if (!file || i < 0 || i >= file.years.length || file.years[i] === shownYear()) return;
    state.year = file.years[i];
    yearMsg = '';
    const note = $('.gt-atyear__note', yearCard);
    if (note) note.hidden = true;
    ctrl?.setYear(i);
    renderLegend();
    renderPanel();
    drawOverlays();
    saveUrl();
  }
  /** The note under the slider after a layer change, or for a year in the address the layer lacks. */
  function noteFor(asked?: number): string {
    const n = yearNote(ref(), asked ?? state.year);
    if (!n) return '';
    if (n.kind === 'kept') return asked === undefined ? W.year.kept : '';
    return fill(W.year[n.kind], { got: n.got, want: n.want });
  }

  // ---------- the panel: the world, or the selected country ----------
  /** The selected place on another layer, in a line: "32% of world mine production (92,000 t), 2025". */
  function lineOn(f: LayerFile, i: number, id: string): string {
    const e = f.data[i]?.v[id];
    const when = whenOf(f, i);
    if (!e) return fill(f.text.none, { year: when });
    if (e[0] === 0) return f.text.withheld;
    if (e[0] === -1) return `${e[1]} (${e[2]})`;
    return `${e[1]}${f.text.measure ? ` ${f.text.measure}` : ''}${e[2] ? ` (${e[2]})` : ''}, ${when}`;
  }
  function renderPanel() {
    const f = file;
    if (!f) return;
    const l = ref();
    const first = { href: viewHref(l.path, l, state, m.slugs), label: fill(W.seeFull, { layer: l.name }) };
    const id = state.country;
    if (!id) {
      panel.innerHTML = worldPanelHtml(f, yi(), { hint: W.pickHint, top: W.top, first });
      root.classList.remove('is-country');
      frame();
      return;
    }
    const p = prev && loaded.get(byKey.get(prev.key)!.file);
    const after = p
      ? `<div class="gt-atprev"><span class="gt-label">${esc(W.previous)}</span><p><b>${esc(byKey.get(prev!.key)!.title)}:</b> ${esc(lineOn(p, prev!.index, id))}</p></div>`
      : '';
    const empty = `<div class="gt-atempty">${EMPTY}<p class="gt-atempty__t">${esc(fill(f.text.none, { year: whenOf(f, yi()) }))}</p>`
      + `<p>${esc(fill(W.greyMeans, { none: f.missing.none.charAt(0).toLowerCase() + f.missing.none.slice(1) }))}</p></div><div class="gt-pblock" data-at-other hidden></div>`;
    panel.innerHTML = countryPanelHtml(f, yi(), id, { sheet: phone, empty, after, first, table: false });
    root.classList.add('is-country');
    if (!f.data[yi()].v[id]) otherLayers(id);
    frame();
  }
  /** For a place with no figure on this layer: its figures on the current layers of the other rows, nearest topic first. */
  let othersRun = 0;
  async function otherLayers(id: string) {
    const run = ++othersRun;
    const here = m.topics.findIndex((t) => t.rows.some((r) => r.family === ref().family));
    const order = [...m.topics.slice(here), ...m.topics.slice(0, here)].flatMap((t) => t.rows)
      .filter((r) => r.family !== ref().family)
      .map((r) => byKey.get($(`[data-at-row="${CSS.escape(r.family)}"]`)?.dataset.atKey ?? r.layers[0])!);
    const out: { key: string; title: string; value: string }[] = [];
    for (let i = 0; i < order.length && out.length < 5; i += 4) {
      const batch = await Promise.all(order.slice(i, i + 4).map((l) => load(l.file).then((f) => ({ l, f }), () => null)));
      if (run !== othersRun) return;
      for (const b of batch) {
        if (!b) continue;
        const e = b.f.data[b.f.years.indexOf(b.l.year)]?.v[id];
        // Each figure with what it counts, as the tooltip says it ("222 outages", "58% of its electricity").
        if (e && e[0] > 0 && out.length < 5) out.push({ key: b.l.key, title: b.l.title, value: b.f.text.measure ? `${e[1]} ${b.f.text.measure}` : e[1] });
      }
    }
    const box = $('[data-at-other]', panel);
    if (run !== othersRun || !box || state.country !== id || !out.length) return;
    box.hidden = false;
    box.innerHTML = `<div class="gt-pblock__head"><span class="gt-label">${esc(fill(W.otherLayers, { country: nameOf(id) }))}</span></div>`
      + `<ul class="gt-prows">${out.map((x) => `<li><span class="gt-prow__n"><button class="gt-linkbtn" type="button" data-at-go="${esc(x.key)}">${esc(x.title)}</button></span><span class="gt-prow__v">${esc(x.value)}</span></li>`).join('')}</ul>`;
  }

  // ---------- overlays: drawn from their own layers' files ----------
  let drawing = 0;
  async function drawOverlays() {
    const run = ++drawing;
    const map = ref();
    const shown = shownYear();
    const out: Overlay[] = [];
    const times: typeof overlayTimes = {};
    let bloc: string[] | null = null;
    for (const t of state.overlays) {
      const { v } = variantOf(t);
      if (kindOf(t) === 'bloc') {
        bloc = file?.blocs[t.slice('bloc-'.length)]?.members ?? null;
        continue;
      }
      if (!v.file || !v.parts) continue;
      let f: LayerFile;
      try { f = await load(v.file); } catch { continue; }
      const src = byFile.get(v.file)!;
      const parts = v.parts.map((id) => f.overlays?.find((o) => o.id === id)).filter((o): o is Overlay => !!o);
      const step = overlayStep(src, v.step, map, shown, (i) => parts.some((o) => overlayAt(o, i).items.length > 0));
      out.push(...parts.map((o) => overlayAt(o, step)));
      const time = overlayTime(parts, f.data[step]);
      // A fixed period (the alerts' last 30 days) is part of the overlay, not a year to compare.
      if (time) times[t] = { text: time.text, differs: v.step === undefined && (!!map.axis || time.year !== shown) };
    }
    if (run !== drawing) return;
    overlayTimes = times;
    ctrl?.setOverlays(out);
    ctrl?.setBloc(bloc);
    renderLegend();
  }
  function setOverlays(next: string[]) {
    state.overlays = next;
    hideTip();
    renderList();
    saveUrl();
    drawOverlays();
  }

  // ---------- the tooltip ----------
  const hideTip = () => { tip.hidden = true; };
  function showTip(html: string, at: { x: number; y: number }) {
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, gap = 14;
    let x = at.x + gap, y = at.y + gap;
    if (x + w > host.clientWidth - 8) x = Math.max(8, at.x - gap - w);
    if (y + h > host.clientHeight - 8) y = Math.max(8, at.y - gap - h);
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function tipFor(hit: Hit, touch: boolean): string {
    if (hit.tip) return `<span>${esc(hit.tip)}</span>`;
    const f = file!;
    const fallback = hit.name ?? (hit.disputed && !hit.code ? f.text.disputed : '');
    let html = tooltipHtml(f, f.data[yi()], hit.id, fallback, touch);
    if (hit.disputed) html += `<span class="gt-tip__note">${esc(`${f.text.disputed}: ${hit.disputed}`)}</span>`;
    return html;
  }

  // ---------- selection: kept across layers ----------
  function select(id: string | null, focus = false) {
    if (id && !(id in m.slugs)) id = null;
    const was = state.country;
    state.country = id ?? undefined;
    ctrl?.select(id);
    if (id !== (was ?? null)) {
      renderPanel();
      renderBar();
      if (id && file) say(file.text.selected.replace('{name}', nameOf(id)));
      else if (!id && was && file) say(file.text.cleared);
    }
    if (focus) (id ? $('[data-at-panel] h2') : canvasEl.querySelector<HTMLElement>('canvas'))?.focus();
    saveUrl();
  }

  // ---------- switching layers ----------
  async function setLayer(key: string) {
    const next = byKey.get(key);
    if (!next || key === state.layer) return;
    if (file) prev = { key: state.layer, index: yi() };
    state.year = carryYear(ref(), next, state.year);
    state.layer = key;
    yearMsg = noteFor();
    kbd = null;
    hideTip();
    renderList();
    saveUrl();
    // Loading: the old layer fades and stays, the country stays, the legend and panel show placeholders.
    switching = true;
    const slow = setTimeout(() => {
      if (!switching) return;
      mapBox.classList.add('is-loading');
      $('[data-at-loading-t]', loadCard)!.textContent = fill(W.loading, { layer: next.title });
      $('[data-at-loading-n]', loadCard)!.textContent = state.country ? fill(W.loadingNote, { country: nameOf(state.country) }) : W.loadingNoteNone;
      loadCard.hidden = false;
      shadedLegend.innerHTML = SKEL;
      const body = $('.gt-panel__body', panel);
      if (body) body.innerHTML = SKEL;
    }, loaded.has(next.file) ? 0 : 120);
    try {
      const f = await load(next.file);
      if (state.layer !== key) return;
      file = f;
      ctrl?.setLayer(f, []);
      ctrl?.setYear(yi());
      say(next.title);
    } catch (e) {
      if (state.layer === key) fail((e as Error).message);
      return;
    } finally {
      if (state.layer === key) {
        switching = false;
        clearTimeout(slow);
        mapBox.classList.remove('is-loading');
        loadCard.hidden = true;
      }
    }
    renderYear();
    renderLegend();
    renderPanel();
    drawOverlays();
  }

  // ---------- the map ----------
  /** Fits the world into what the legend, the year card and the sheets leave free (a phone), or the whole map. */
  function frame() {
    if (!ctrl) return;
    if (!phone) { ctrl.frame({ top: 16, bottom: 16 }); return; }
    const box = host.getBoundingClientRect();
    const top = legend.getBoundingClientRect().bottom - box.top + 8;
    const sheetUp = root.classList.contains('is-country') ? panel.offsetHeight : 0;
    const bottom = Math.max(sheetUp, $('.gt-atdock')!.offsetHeight + (yearCard.hidden ? 0 : yearCard.offsetHeight)) + 24;
    ctrl.frame({ top: Math.max(12, top), bottom });
  }
  function start(): Promise<void> {
    if (starting) return starting;
    loading.hidden = false;
    failed.hidden = true;
    starting = (async () => {
      try {
        const [engine, base, f] = await Promise.all([
          import('./map/engine'),
          fetch(root.dataset.basemap!).then((r) => { if (!r.ok) throw new Error(`basemap ${r.status}`); return r.json(); }),
          load(ref().file),
        ]);
        file = f;
        if (askedYear !== undefined) yearMsg = noteFor(askedYear);
        renderYear();
        renderLegend();
        renderPanel();
        renderBar();
        ctrl = engine.createMap(canvasEl, base, f, {
          ready() {
            loading.hidden = true;
            ctrl!.setAttribution(phone ? W.borders : null);
            ctrl!.setYear(yi());
            ctrl!.select(state.country ?? null);
            frame();
            drawOverlays();
          },
          error(message) { fail(message); },
          hover(hit, touch) { if (!hit || touch || !(hit.id || hit.name || hit.tip || hit.disputed)) hideTip(); else showTip(tipFor(hit, false), hit.point); },
          click(hit, touch) {
            if (hit?.tip) { if (touch) showTip(tipFor(hit, true), hit.point); return; }
            // On a phone the sheet shows the place; the tooltip would sit under it.
            if (touch && hit?.id && !phone) showTip(tipFor(hit, true), hit.point); else hideTip();
            select(hit?.id ?? null);
          },
          key(k) {
            if (!file) return;
            const order = file.data[yi()].order;
            if (k === 'next' || k === 'prev') {
              if (!order.length) return;
              const at = order.indexOf(kbd ?? state.country ?? '');
              kbd = at < 0 ? (k === 'next' ? order[0] : order.at(-1)!) : order[(at + (k === 'next' ? 1 : order.length - 1)) % order.length];
              const p = ctrl!.pointOf(kbd);
              if (p) showTip(tipFor({ id: kbd, point: p }, false), p);
              say(`${nameOf(kbd)}: ${file.data[yi()].v[kbd]?.[1] ?? ''}`);
            } else if (k === 'open') { if (kbd) select(kbd); }
            else { kbd = null; hideTip(); select(null); }
          },
        }, { dim: false, overlays: [] });
      } catch (e) {
        fail((e as Error).message);
      }
    })();
    return starting;
  }
  function fail(message: string) {
    console.warn(`atlas: ${message}`);
    loading.hidden = true;
    failed.hidden = false;
    mapBox.classList.remove('is-loading');
    loadCard.hidden = true;
    ctrl?.remove();
    ctrl = null;
    starting = null;
  }
  new ResizeObserver(() => ctrl?.resize()).observe(canvasEl);

  // ---------- share ----------
  function renderShare() {
    const url = location.href;
    $('[data-at-url]', share)!.textContent = url;
    $('[data-gt-copy]', share)!.dataset.gtCopy = url;
    const q = `url=${encodeURIComponent(url)}&text=${encodeURIComponent(W.shareText)}`;
    $<HTMLAnchorElement>('[data-at-sharex]', share)!.href = `https://x.com/intent/post?${q}`;
    $<HTMLAnchorElement>('[data-at-sharetg]', share)!.href = `https://t.me/share/url?${q}`;
  }
  // ---------- Menu: the main menu's topics and Tools ----------
  function setMenu(open: boolean) {
    if (!menu || !menuBtn) return;
    if (open) setShare(false);
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLElement>('a')?.focus();
  }
  function setShare(open: boolean) {
    if (open) setMenu(false);
    share.hidden = !open;
    shareBtn.setAttribute('aria-expanded', String(open));
    if (open) { renderShare(); $<HTMLElement>('[data-gt-copy]', share)!.focus(); }
  }

  // ---------- phone: the layers sheet ----------
  function setLayersOpen(open: boolean) {
    const was = root.classList.contains('is-layers');
    root.classList.toggle('is-layers', open);
    dockBtn.setAttribute('aria-expanded', String(open));
    const head = $<HTMLElement>('#at-layers-t')!;
    head.tabIndex = -1;
    if (open) head.focus();
    else if (was && phone) dockBtn.focus();
  }

  // ---------- first visit ----------
  const hints = $$('[data-at-hint]');
  let dismissed = false;
  try { dismissed = localStorage.getItem(HINT_KEY) === '1'; } catch { /* storage blocked: the hint shows each visit */ }
  for (const h of hints) h.hidden = dismissed;
  function dismissHint() {
    for (const h of hints) h.hidden = true;
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* storage blocked */ }
  }

  // ---------- desktop and phone ----------
  function applyMode() {
    phone = isPhone();
    root.classList.toggle('is-phone', phone);
    // Phone: one overlay at a time.
    if (phone && state.overlays.length > 1) setOverlays(state.overlays.slice(0, 1));
    if (!phone) setLayersOpen(false);
    restoreLegend();
    renderYear();
    renderPanel();
    renderBar();
    ctrl?.setAttribution(phone ? W.borders : null);
    ctrl?.resize();
  }
  new ResizeObserver(() => { if (isPhone() !== phone) applyMode(); }).observe(root);

  // ---------- search: rows whose names match ----------
  const foundText = (n: number, q: string) =>
    (n === 0 ? W.found.none : n === 1 ? W.found.one : W.found.many).replace('{n}', String(n)).replace('{q}', q);
  function filter() {
    const q = search.value.trim().toLowerCase();
    clear.hidden = !q;
    let n = 0;
    for (const t of $$<HTMLDetailsElement>('[data-at-topic]')) {
      let any = false;
      for (const row of $$('[data-at-row], [data-at-ov]', t)) {
        const hit = !q || row.dataset.atWords!.includes(q);
        row.hidden = !hit;
        if (hit) { any = true; n++; }
      }
      // The Overlays heading only when an overlay is left.
      const ovHead = $('.gt-lgroup__ov', t);
      if (ovHead) ovHead.hidden = !$$('[data-at-ov]', t).some((r) => !r.hidden);
      t.hidden = !any;
      if (q && any) t.open = true;
    }
    found.textContent = q ? foundText(n, search.value.trim()) : foundIdle;
  }
  /** A row picked from a search: its first choice whose name matches, if any. */
  const searched = (row: HTMLElement, sel: string) => {
    const q = search.value.trim().toLowerCase();
    return q ? $$<HTMLOptionElement>(`${sel} option`, row).find((o) => o.text.toLowerCase().includes(q))?.value : undefined;
  };

  // ---------- controls ----------
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-at-row]');
    const ov = t.closest<HTMLElement>('[data-at-ov]');
    if (row && t.matches('input[type="radio"]')) {
      setLayer(searched(row, '[data-at-variant]') ?? row.dataset.atKey!);
      if (phone) setLayersOpen(false);
    } else if (row && t.matches('[data-at-variant]')) {
      row.dataset.atKey = (t as HTMLSelectElement).value;
      setLayer(row.dataset.atKey);
    } else if (ov && t.matches('input[type="checkbox"]')) {
      const on = (t as HTMLInputElement).checked;
      // Trade flows open on the shaded layer's own flows when it has them.
      const own = `${ov.dataset.atOv}-${state.layer}`;
      const pick = searched(ov, '[data-at-ovvariant]') ?? (!state.overlays.includes(ov.dataset.atTok!) && tokens.includes(own) ? own : ov.dataset.atTok!);
      setOverlays(toggleOverlay(state.overlays, pick, on, tokens));
    } else if (ov && t.matches('[data-at-ovvariant]')) {
      ov.dataset.atTok = (t as HTMLSelectElement).value;
      setOverlays(toggleOverlay(state.overlays, ov.dataset.atTok, true, tokens));
    } else if (t.matches('input[name="at-ovp"]')) {
      // Phone: one overlay, or none.
      const kind = (t as HTMLInputElement).value;
      const ovRow = kind ? $(`[data-at-ov="${CSS.escape(kind)}"]`) : null;
      const own = `${kind}-${state.layer}`;
      setOverlays(!ovRow ? [] : [tokens.includes(own) ? own : ovRow.dataset.atTok!]);
    } else if (t.matches('[data-at-ovp-variant]')) {
      const v = (t as HTMLSelectElement).value;
      const ovRow = $(`[data-at-ov="${CSS.escape(kindOf(v))}"]`);
      if (ovRow) ovRow.dataset.atTok = v;
      setOverlays([v]);
    }
  });
  root.addEventListener('gt-change', (e) => {
    const d = (e as CustomEvent<{ year?: number }>).detail;
    if (yearCard.contains(e.target as Node) && d.year !== undefined) setYearIndex(d.year);
  });
  search.addEventListener('input', filter);
  clear.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ''; filter(); } });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-zoom], [data-map-retry], [data-at-ovoff], [data-at-leghide], [data-select], [data-panel-close], [data-sheet-grab], [data-at-go], [data-at-share], [data-at-shareclose], [data-at-layersopen], [data-at-layersclose], [data-at-hintok], [data-at-menu], [data-gt-search]');
    if (!share.hidden && !t.closest('#at-share, [data-at-share]')) setShare(false);
    if (menu && !menu.hidden && !t.closest('#at-menu, [data-at-menu]')) setMenu(false);
    if (!el) return;
    if (el.hasAttribute('data-at-menu')) { setMenu(!!menu?.hidden); return; }
    // The site search (phase 8) answers the same event as the header's search button and the "/" key.
    if (el.hasAttribute('data-gt-search')) { document.dispatchEvent(new CustomEvent('gt-search')); return; }
    if (el.dataset.zoom) ctrl?.zoom(el.dataset.zoom as 'in' | 'out' | 'reset');
    else if (el.dataset.atOvoff) {
      const kind = kindOf(el.dataset.atOvoff);
      setOverlays(toggleOverlay(state.overlays, el.dataset.atOvoff, false, tokens));
      // The X goes with its section: keep the keyboard on the overlay's own control.
      $<HTMLInputElement>(phone ? 'input[name="at-ovp"][value=""]' : `[data-at-ov="${CSS.escape(kind)}"] input[type="checkbox"]`)?.focus();
    } else if (el.hasAttribute('data-at-leghide')) setLegendOpen(!!legendBody.hidden);
    else if (el.dataset.select) select(el.dataset.select, true);
    else if (el.hasAttribute('data-panel-close')) select(null, true);
    else if (el.hasAttribute('data-sheet-grab')) { panel.classList.toggle('is-full'); frame(); }
    else if (el.dataset.atGo) setLayer(el.dataset.atGo);
    else if (el.hasAttribute('data-at-share')) setShare(!!share.hidden);
    else if (el.hasAttribute('data-at-shareclose')) { setShare(false); shareBtn.focus(); }
    else if (el.hasAttribute('data-at-layersopen')) setLayersOpen(!root.classList.contains('is-layers'));
    else if (el.hasAttribute('data-at-layersclose')) setLayersOpen(false);
    else if (el.hasAttribute('data-at-hintok')) dismissHint();
    else start();
  });
  // Escape closes what is on top: Share, then the layers sheet, then the country sheet on a phone.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (!share.hidden) { setShare(false); shareBtn.focus(); }
    else if (menu && !menu.hidden) { setMenu(false); menuBtn?.focus(); }
    else if (root.classList.contains('is-layers')) setLayersOpen(false);
    else if (phone && state.country && !canvasEl.contains(document.activeElement)) select(null, true);
    else return;
    e.preventDefault();
  });

  initCopy();
  bindSearchKey();
  root.classList.toggle('is-phone', phone);
  restoreLegend();
  renderList();
  saveUrl();
  start();
}
