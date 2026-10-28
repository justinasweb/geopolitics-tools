// The Atlas page script (src/templates/AtlasPage.astro): draws the map with the map engine (./map/engine.ts) and
// switches its layer in place when the reader picks another, so the map, the zoom and the selected country stay.
// Overlays (trade flows, launch sites, disaster alerts, a bloc outline) are drawn from the layer files of the views
// that draw them, at the step nearest the map's year; the legend box stacks the shaded layer's legend and one
// section per overlay. Layer files are the map views' own (/map/<id>.json), fetched once each. The state is kept in
// the address with replaceState (./map/atlas-state.ts): ?layer=&year=&country=&overlays=, defaults left out.
import type { LayerFile, Overlay } from '../lib/map/types';
import type { AtlasOverlayVariant } from '../lib/atlas';
import type { Hit, MapController } from './map/engine';
import {
  carryYear, kindOf, overlayAt, overlayStep, readAtlasState, toggleOverlay, writeAtlasState, yearOn,
  type AtlasContext, type AtlasLayerRef,
} from './map/atlas-state';
import { legendHtml, markSvg } from './map/legend';
import { tooltipHtml } from './map/panel';
import { esc } from './map/text';

interface ManifestLayer extends AtlasLayerRef { id: string; file: string; family: string; name: string; path: string; title: string }
interface ManifestOverlay { id: string; label: string; variants: AtlasOverlayVariant[] }
interface Manifest { start: string; slugs: Record<string, string>; overlays: ManifestOverlay[]; layers: ManifestLayer[] }

const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const LEGEND_KEY = 'gt-atlas-legend';

export function initAtlas(root: HTMLElement): void {
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => from.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => [...from.querySelectorAll<T>(sel)];
  const m = JSON.parse(document.getElementById('at-data')!.textContent!) as Manifest;
  const tokens = m.overlays.flatMap((o) => o.variants.map((v) => v.token));
  const ctx: AtlasContext = { layers: m.layers, start: m.start, slugs: m.slugs, overlays: tokens };
  const byKey = new Map(m.layers.map((l) => [l.key, l]));
  const byFile = new Map(m.layers.map((l) => [l.file, l]));
  const variantOf = (token: string) => {
    const o = m.overlays.find((x) => x.id === kindOf(token))!;
    return { o, v: o.variants.find((x) => x.token === token)! };
  };
  const words = root.dataset;
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
  const legendToggle = $('[data-at-leghide]')!;
  const shadedLegend = $('[data-at-shaded]')!;
  const overlayLegends = $('[data-at-ovlegs]')!;

  const { state } = readAtlasState(location.search, ctx);
  let file: LayerFile | null = null;
  let ctrl: MapController | null = null;
  let starting: Promise<void> | null = null;
  let kbd: string | null = null;
  // The year each overlay is drawn for, when it is not the map's: said in its legend.
  let overlayYears: Record<string, string> = {};

  const ref = () => byKey.get(state.layer)!;
  const shownYear = () => yearOn(ref(), state.year);
  const yi = () => Math.max(0, file?.years.indexOf(shownYear()) ?? 0);

  const say = (text: string) => {
    const live = document.getElementById('gt-live');
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  };
  const saveUrl = () => {
    const u = writeAtlasState(new URL(location.href), state, ctx);
    if (u.href !== location.href) history.replaceState(history.state, '', u);
  };

  // ---------- layer files: fetched once each ----------
  const files = new Map<string, Promise<LayerFile>>();
  const load = (url: string): Promise<LayerFile> => {
    let p = files.get(url);
    if (!p) {
      p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`layer ${r.status}`);
        return r.json() as Promise<LayerFile>;
      });
      // A failed fetch is tried again next time.
      p.catch(() => files.delete(url));
      files.set(url, p);
    }
    return p;
  };

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
    current.textContent = l.title;
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
    for (const t of $$<HTMLDetailsElement>('[data-at-topic]')) {
      const n = $$('.gt-lyr.is-on', t).length;
      const badge = $('[data-at-on]', t)!;
      badge.hidden = !n;
      badge.textContent = (words.onWord ?? '').replace('{n}', String(n));
      if (n) t.open = true;
    }
  }

  // ---------- the legend box: the shaded layer, then one section per overlay ----------
  function renderLegend() {
    if (file) shadedLegend.innerHTML = legendHtml(file, yi());
    overlayLegends.innerHTML = state.overlays.map((t) => {
      const { o, v } = variantOf(t);
      const name = o.variants.length > 1 ? `${o.label}: ${v.label}` : o.label;
      let items = v.legend.map((x) => `<span>${markSvg(x.symbol)}${esc(x.label)}</span>`).join('');
      if (o.id === 'bloc' && file) {
        const b = file.blocs[t.slice('bloc-'.length)];
        if (b) items = `<span>${markSvg('outline')}${esc(file.text.members.replace('{n}', String(b.members.length)))}</span>`;
      }
      const when = overlayYears[t] ? `<p class="gt-caption">${esc((words.shownFor ?? '').replace('{year}', overlayYears[t]))}</p>` : '';
      return `<section class="gt-atleg__s"><div class="gt-atleg__h"><b>${esc(name)}</b>`
        + `<button class="gt-atleg__x" type="button" data-at-ovoff="${esc(t)}" aria-label="${esc((words.remove ?? '').replace('{name}', name))}">${X}</button></div>`
        + `<div class="gt-legend__extra gt-legend__marks">${items}</div>${when}</section>`;
    }).join('');
  }
  function setLegendOpen(open: boolean, remember = true) {
    legendBody.hidden = !open;
    legend.classList.toggle('is-folded', !open);
    legendToggle.setAttribute('aria-expanded', String(open));
    legendToggle.textContent = (open ? words.hide : words.show) ?? '';
    if (remember) try { sessionStorage.setItem(LEGEND_KEY, open ? '1' : '0'); } catch { /* storage blocked: the choice lasts this page */ }
  }

  // ---------- overlays: drawn from their own layers' files ----------
  let drawing = 0;
  async function drawOverlays() {
    const run = ++drawing;
    const map = ref();
    const shown = shownYear();
    const out: Overlay[] = [];
    const years: Record<string, string> = {};
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
      // Say the overlay's own year when it is not the one the map shows (a fixed period says itself).
      const own = f.data[step];
      if (own && v.step === undefined && (src.axis !== map.axis || own.year !== shown)) years[t] = own.label ?? String(own.year);
    }
    if (run !== drawing) return;
    overlayYears = years;
    ctrl?.setOverlays(out);
    ctrl?.setBloc(bloc);
    renderLegend();
  }
  function setOverlay(token: string, on: boolean) {
    state.overlays = toggleOverlay(state.overlays, token, on, tokens);
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
    const W = host.clientWidth, H = host.clientHeight, w = tip.offsetWidth, h = tip.offsetHeight, gap = 14;
    let x = at.x + gap, y = at.y + gap;
    if (x + w > W - 8) x = Math.max(8, at.x - gap - w);
    if (y + h > H - 8) y = Math.max(8, at.y - gap - h);
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
  function select(id: string | null) {
    if (id && !(id in m.slugs)) id = null;
    const was = state.country;
    state.country = id ?? undefined;
    ctrl?.select(id);
    if (id && id !== was && file) say(file.text.selected.replace('{name}', file.names[id] ?? id));
    else if (!id && was && file) say(file.text.cleared);
    saveUrl();
  }

  // ---------- switching layers ----------
  async function setLayer(key: string) {
    const next = byKey.get(key);
    if (!next || key === state.layer) return;
    state.year = carryYear(ref(), next, state.year);
    state.layer = key;
    kbd = null;
    hideTip();
    renderList();
    saveUrl();
    mapBox.classList.add('is-loading');
    try {
      const f = await load(next.file);
      if (state.layer !== key) return;
      file = f;
      ctrl?.setLayer(f, []);
      ctrl?.setYear(yi());
      mapBox.classList.remove('is-loading');
      renderLegend();
      drawOverlays();
      say(next.title);
    } catch (e) {
      if (state.layer === key) fail((e as Error).message);
    }
  }

  // ---------- the map ----------
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
        renderLegend();
        ctrl = engine.createMap(canvasEl, base, f, {
          ready() {
            loading.hidden = true;
            mapBox.classList.remove('is-loading');
            ctrl!.setYear(yi());
            ctrl!.select(state.country ?? null);
            drawOverlays();
          },
          error(message) { fail(message); },
          hover(hit, touch) { if (!hit || touch || !(hit.id || hit.name || hit.tip || hit.disputed)) hideTip(); else showTip(tipFor(hit, false), hit.point); },
          click(hit, touch) {
            if (hit?.tip) { if (touch) showTip(tipFor(hit, true), hit.point); return; }
            if (touch && hit?.id) showTip(tipFor(hit, true), hit.point); else hideTip();
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
              say(`${file.names[kbd]}: ${file.data[yi()].v[kbd]?.[1] ?? ''}`);
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
    ctrl?.remove();
    ctrl = null;
    starting = null;
  }
  new ResizeObserver(() => ctrl?.resize()).observe(canvasEl);

  // ---------- search: rows whose names match ----------
  const foundText = (n: number, q: string) =>
    ((n === 0 ? words.foundNone : n === 1 ? words.foundOne : words.foundMany) ?? '').replace('{n}', String(n)).replace('{q}', q);
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
    if (row && t.matches('input[type="radio"]')) setLayer(searched(row, '[data-at-variant]') ?? row.dataset.atKey!);
    else if (row && t.matches('[data-at-variant]')) {
      row.dataset.atKey = (t as HTMLSelectElement).value;
      setLayer(row.dataset.atKey);
    } else if (ov && t.matches('input[type="checkbox"]')) {
      const on = (t as HTMLInputElement).checked;
      // Trade flows open on the shaded layer's own flows when it has them.
      const own = `${ov.dataset.atOv}-${state.layer}`;
      const pick = searched(ov, '[data-at-ovvariant]') ?? (!state.overlays.includes(ov.dataset.atTok!) && tokens.includes(own) ? own : ov.dataset.atTok!);
      setOverlay(pick, on);
    } else if (ov && t.matches('[data-at-ovvariant]')) {
      ov.dataset.atTok = (t as HTMLSelectElement).value;
      setOverlay(ov.dataset.atTok, true);
    }
  });
  search.addEventListener('input', filter);
  clear.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; filter(); } });
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom], [data-map-retry], [data-at-ovoff], [data-at-leghide]');
    if (!el) return;
    if (el.dataset.zoom) ctrl?.zoom(el.dataset.zoom as 'in' | 'out' | 'reset');
    else if (el.dataset.atOvoff) {
      const kind = kindOf(el.dataset.atOvoff);
      setOverlay(el.dataset.atOvoff, false);
      // The X goes with its section: keep the keyboard in the list, on the overlay's own checkbox.
      $<HTMLInputElement>(`[data-at-ov="${CSS.escape(kind)}"] input[type="checkbox"]`)?.focus();
    } else if (el.hasAttribute('data-at-leghide')) setLegendOpen(!!legendBody.hidden);
    else start();
  });

  let folded = false;
  try { folded = sessionStorage.getItem(LEGEND_KEY) === '0'; } catch { /* storage blocked */ }
  setLegendOpen(!folded, false);
  renderList();
  renderLegend();
  saveUrl();
  start();
}
