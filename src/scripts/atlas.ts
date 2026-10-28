// The Atlas page script (src/templates/AtlasPage.astro): draws the map with the map engine (./map/engine.ts) and
// switches its layer in place when the reader picks another, so the map, the zoom and the selected country stay.
// Layer files are the map views' own (/map/<id>.json), fetched once each. The state is kept in the address with
// replaceState (./map/atlas-state.ts): ?layer=&year=&country=, defaults left out.
import type { LayerFile } from '../lib/map/types';
import type { Hit, MapController } from './map/engine';
import { carryYear, readAtlasState, writeAtlasState, yearOn, type AtlasContext, type AtlasLayerRef } from './map/atlas-state';
import { tooltipHtml } from './map/panel';
import { esc } from './map/text';

interface ManifestLayer extends AtlasLayerRef { id: string; file: string; family: string; name: string; path: string; title: string }
interface Manifest { start: string; slugs: Record<string, string>; overlays: string[]; layers: ManifestLayer[] }

export function initAtlas(root: HTMLElement): void {
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => from.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => [...from.querySelectorAll<T>(sel)];
  const m = JSON.parse(document.getElementById('at-data')!.textContent!) as Manifest;
  const ctx: AtlasContext = { layers: m.layers, start: m.start, slugs: m.slugs, overlays: m.overlays };
  const byKey = new Map(m.layers.map((l) => [l.key, l]));
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

  const { state } = readAtlasState(location.search, ctx);
  let file: LayerFile | null = null;
  let ctrl: MapController | null = null;
  let starting: Promise<void> | null = null;
  let kbd: string | null = null;

  const ref = () => byKey.get(state.layer)!;
  const yi = () => Math.max(0, file?.years.indexOf(yearOn(ref(), state.year)) ?? 0);

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
  const load = (key: string): Promise<LayerFile> => {
    let p = files.get(key);
    if (!p) {
      p = fetch(byKey.get(key)!.file).then((r) => {
        if (!r.ok) throw new Error(`layer ${r.status}`);
        return r.json() as Promise<LayerFile>;
      });
      // A failed fetch is tried again next time.
      p.catch(() => files.delete(key));
      files.set(key, p);
    }
    return p;
  };

  // ---------- the layer list ----------
  function renderList() {
    const l = ref();
    current.textContent = l.title;
    for (const row of $$('[data-at-row]')) {
      const on = row.dataset.atRow === l.family;
      if (on) row.dataset.atKey = l.key;
      row.classList.toggle('is-on', on);
      const radio = $<HTMLInputElement>('input[type="radio"]', row)!;
      radio.checked = on;
      const sel = $<HTMLSelectElement>('[data-at-variant]', row);
      if (sel) {
        sel.value = row.dataset.atKey!;
        sel.closest<HTMLElement>('.gt-lyr__sub')!.hidden = !on;
        const opt = sel.selectedOptions[0];
        $('[data-at-sub]', row)!.textContent = opt.dataset.sub ?? '';
        $('[data-at-src]', row)!.textContent = opt.dataset.src ?? '';
      }
    }
    for (const t of $$<HTMLDetailsElement>('[data-at-topic]')) {
      const on = !!$(`[data-at-row="${CSS.escape(l.family)}"]`, t);
      $('[data-at-on]', t)!.hidden = !on;
      if (on) t.open = true;
    }
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
      const f = await load(key);
      if (state.layer !== key) return;
      file = f;
      ctrl?.setLayer(f, []);
      ctrl?.setYear(yi());
      mapBox.classList.remove('is-loading');
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
          load(state.layer),
        ]);
        file = f;
        ctrl = engine.createMap(canvasEl, base, f, {
          ready() {
            loading.hidden = true;
            mapBox.classList.remove('is-loading');
            ctrl!.setYear(yi());
            ctrl!.select(state.country ?? null);
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

  // ---------- search: rows whose family, topic or layer names match ----------
  function filter() {
    const q = search.value.trim().toLowerCase();
    clear.hidden = !q;
    let n = 0;
    for (const t of $$<HTMLDetailsElement>('[data-at-topic]')) {
      let any = false;
      for (const row of $$('[data-at-row]', t)) {
        const hit = !q || row.dataset.atWords!.includes(q);
        row.hidden = !hit;
        if (hit) { any = true; n++; }
      }
      t.hidden = !any;
      if (q && any) t.open = true;
    }
    found.textContent = q ? foundText(n, search.value.trim()) : foundIdle;
  }
  const foundText = (n: number, q: string) =>
    ((n === 0 ? root.dataset.foundNone : n === 1 ? root.dataset.foundOne : root.dataset.foundMany) ?? '').replace('{n}', String(n)).replace('{q}', q);

  // ---------- controls ----------
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-at-row]');
    if (!row) return;
    if (t.matches('input[type="radio"]')) {
      // A row picked from a search: the first of its layers whose name matches, else the one it shows.
      const q = search.value.trim().toLowerCase();
      const opt = q ? $$<HTMLOptionElement>('[data-at-variant] option', row).find((o) => o.text.toLowerCase().includes(q)) : undefined;
      setLayer(opt?.value ?? row.dataset.atKey!);
    } else if (t.matches('[data-at-variant]')) {
      row.dataset.atKey = (t as HTMLSelectElement).value;
      setLayer(row.dataset.atKey);
    }
  });
  search.addEventListener('input', filter);
  clear.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; filter(); } });
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom], [data-map-retry]');
    if (!el) return;
    if (el.dataset.zoom) ctrl?.zoom(el.dataset.zoom as 'in' | 'out' | 'reset');
    else start();
  });

  renderList();
  saveUrl();
  start();
}
