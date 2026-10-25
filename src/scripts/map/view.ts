// The map view page script: wires the controls (MapControls), the stage (MapStage) and the URL to the map engine
// (./engine.ts). The page reads without it: the panel, legend and table are HTML. This script
//  - fetches the layer file (small) at once, so the year, the bloc and a selected country work before the map;
//  - loads MapLibre and the basemap only when the map is shown: on desktop when the stage nears the screen, on a
//    phone when "Show map" opens it full screen;
//  - keeps ?year=&country=&bloc= in the address bar (replaceState, so Back leaves the page as usual).
import type { LayerFile } from '../../lib/map/types';
import type { Hit, MapController } from './engine';
import { countryPanelHtml, tooltipHtml } from './panel';
import { readState, writeState, type StateContext } from './state';
import { esc, fill } from './text';

export function initMapView(root: HTMLElement): void {
  const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => from.querySelector<T>(sel);
  const host = $('.gt-maphost')!;
  const canvasEl = $('.gt-mapcanvas')!;
  const stageMap = $('.gt-stage__map')!;
  const full = $<HTMLDialogElement>('[data-mapfull]')!;
  const fullMap = $('.gt-mapfull__map', full)!;
  const world = $('[data-panel="world"]')!;
  const country = $('[data-panel="country"]')!;
  const sheet = $('[data-map-sheet]')!;
  const tip = $('.gt-world__tip')!;
  const loading = $('[data-map-state="loading"]')!;
  const failed = $('[data-map-state="error"]')!;
  const chip = $('[data-bloc-chip]')!;
  const blocLine = $('.gt-blocline');
  // The controls sit above the stage, outside it; one map view per page.
  const slider = document.querySelector<HTMLInputElement>('#mv-year');
  const blocSelect = document.querySelector<HTMLSelectElement>('#mv-bloc');
  const filters = document.querySelector<HTMLDialogElement>('[data-filters]');
  const fBloc = document.querySelector<HTMLSelectElement>('#mv-fbloc');
  const summary = document.querySelector('[data-filters-summary]');

  // The layer file is small and comes first: the panel, the URL state and the map all read it.
  const layer: Promise<LayerFile> = fetch(root.dataset.layer!).then((r) => {
    if (!r.ok) throw new Error(`layer ${r.status}`);
    return r.json() as Promise<LayerFile>;
  });
  const yearsInPage = [...root.querySelectorAll<HTMLElement>('.gt-pyear[data-year]')].map((e) => Number(e.dataset.year));
  let file: LayerFile | null = null;
  let ctrl: MapController | null = null;
  let starting: Promise<void> | null = null;
  let year = Number(slider?.value ?? yearsInPage.at(-1));
  let selected: string | null = null;
  let bloc: string | null = null;
  let kbd: string | null = null;

  const isPhone = () => getComputedStyle(stageMap).display === 'none';
  const yi = () => Math.max(0, file?.years.indexOf(year) ?? 0);
  const ctx = (): StateContext => ({ years: file!.years, latest: file!.year, slugs: file!.slugs, blocs: file!.blocs, param: file!.axis ?? 'year' });
  // What the page says for a year: the year itself, or a period's words ("Last 30 days").
  const yearText = (y: number) => file?.data.find((d) => d.year === y)?.label ?? String(y);

  const say = (text: string) => {
    const live = document.getElementById('gt-live');
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  };
  const saveUrl = () => {
    if (!file) return;
    const u = writeState(new URL(location.href), { year, country: selected ?? undefined, bloc: bloc ?? undefined }, ctx());
    if (u.href !== location.href) history.replaceState(history.state, '', u);
  };

  // ---------- the tooltip ----------
  const hideTip = () => { tip.hidden = true; };
  function showTip(html: string, at: { x: number; y: number }) {
    tip.innerHTML = html;
    tip.hidden = false;
    const W = host.clientWidth, H = host.clientHeight, w = tip.offsetWidth, h = tip.offsetHeight, gap = 14;
    // Right and below the pointer; flipped at the edges so it never leaves the map.
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

  // ---------- year, bloc, selection ----------
  function setYear(y: number, from: 'slider' | 'other' = 'other') {
    if (!(yearsInPage.length ? yearsInPage : file?.years ?? []).includes(y)) return;
    const changed = y !== year;
    year = y;
    for (const b of root.querySelectorAll<HTMLElement>('.gt-pyear[data-year]')) b.hidden = Number(b.dataset.year) !== y;
    for (const t of root.querySelectorAll('[data-year-text]')) t.textContent = yearText(y);
    if (file) for (const t of root.querySelectorAll('[data-legend-title]')) t.textContent = file.data[yi()].legend;
    if (slider && from !== 'slider' && slider.value !== String(y)) {
      slider.value = String(y);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mv-fyear"]')) r.checked = Number(r.value) === y;
    ctrl?.setYear(yi());
    if (selected && file) renderSelected();
    renderBloc();
    renderSummary();
    if (changed) { saveUrl(); say(fill(file?.text.kicker ?? '{year}', { year: yearText(y) })); }
  }

  function setBloc(id: string | null) {
    bloc = id && file?.blocs[id] ? id : null;
    if (blocSelect) blocSelect.value = bloc ?? '';
    ctrl?.setBloc(bloc ? file!.blocs[bloc].members : null);
    renderBloc();
    renderSummary();
    saveUrl();
  }
  function renderBloc() {
    const b = bloc && file ? file.blocs[bloc] : null;
    chip.hidden = !b;
    if (blocLine) blocLine.hidden = !b;
    if (!b || !file) return;
    $('[data-bloc-name]', chip)!.textContent = b.name;
    $('[data-bloc-count]', chip)!.textContent = fill(file.text.members, { n: b.members.length });
    $('[data-bloc-remove]', chip)!.setAttribute('aria-label', fill(file.text.removeBloc, { bloc: b.name }));
    if (blocLine) $('p', blocLine)!.textContent = file.data[yi()].blocs[bloc!] ?? '';
  }
  function renderSummary() {
    if (summary) summary.textContent = [yearText(year), bloc && file ? file.blocs[bloc].name : ''].filter(Boolean).join(' · ');
  }

  const inFull = () => full.open;
  // On the full-screen phone map, the world sits between the legend and the country sheet.
  function frame() {
    if (!ctrl || !inFull()) return;
    const box = host.getBoundingClientRect();
    const leg = $('.gt-stage__leg', host)!.getBoundingClientRect();
    ctrl.frame({ top: Math.max(12, leg.bottom - box.top + 8), bottom: sheet.hidden ? 12 : sheet.offsetHeight + 8 });
  }
  function renderSelected() {
    const f = file!, id = selected!;
    if (inFull()) {
      sheet.innerHTML = countryPanelHtml(f, yi(), id, true);
      const opening = sheet.hidden;
      sheet.hidden = false;
      sheet.classList.remove('is-full');
      if (opening) frame();
    } else {
      country.innerHTML = countryPanelHtml(f, yi(), id);
      country.hidden = false;
      world.hidden = true;
    }
  }
  function select(id: string | null, focus = false) {
    if (!file) return;
    if (id && !file.names[id]) id = null;
    const was = selected;
    selected = id;
    ctrl?.select(id);
    if (id) {
      renderSelected();
      if (focus) $<HTMLElement>(inFull() ? '[data-map-sheet] h2' : '[data-panel="country"] h2')?.focus();
      if (id !== was) say(fill(file.text.selected, { name: file.names[id] }));
    } else {
      country.hidden = true;
      country.innerHTML = '';
      world.hidden = false;
      const closing = !sheet.hidden;
      sheet.hidden = true;
      sheet.innerHTML = '';
      if (closing) frame();
      if (was) say(file.text.cleared);
      if (focus) (ctrl ? host.querySelector<HTMLElement>('canvas') : world.querySelector<HTMLElement>('h2'))?.focus();
    }
    saveUrl();
  }

  // ---------- the map ----------
  function start(): Promise<void> {
    if (starting) return starting;
    loading.hidden = false;
    failed.hidden = true;
    starting = (async () => {
      try {
        const [engine, base, f] = await Promise.all([
          import('./engine'),
          fetch(root.dataset.basemap!).then((r) => { if (!r.ok) throw new Error(`basemap ${r.status}`); return r.json(); }),
          layer,
        ]);
        ctrl = engine.createMap(canvasEl, base, f, {
          ready() {
            loading.hidden = true;
            ctrl!.setYear(yi());
            ctrl!.select(selected);
            ctrl!.setBloc(bloc ? f.blocs[bloc].members : null);
          },
          error(message) { fail(message); },
          hover(hit, touch) { if (!hit || touch || !(hit.id || hit.name || hit.tip || hit.disputed)) hideTip(); else showTip(tipFor(hit, false), hit.point); },
          click(hit, touch) {
            if (hit?.tip) { if (touch) showTip(tipFor(hit, true), hit.point); return; }
            if (touch) hideTip();
            select(hit?.id ?? null);
          },
          key(k) {
            const order = f.data[yi()].order;
            if (k === 'next' || k === 'prev') {
              if (!order.length) return;
              const at = order.indexOf(kbd ?? selected ?? '');
              kbd = at < 0 ? (k === 'next' ? order[0] : order.at(-1)!) : order[(at + (k === 'next' ? 1 : order.length - 1)) % order.length];
              const p = ctrl!.pointOf(kbd);
              if (p) showTip(tipFor({ id: kbd, point: p }, false), p);
              say(`${f.names[kbd]}: ${f.data[yi()].v[kbd]?.[1] ?? ''}`);
            } else if (k === 'open') { if (kbd) select(kbd); }
            else { kbd = null; hideTip(); select(null); }
          },
        });
      } catch (e) {
        fail((e as Error).message);
      }
    })();
    return starting;
  }
  function fail(message: string) {
    console.warn(`map: ${message}`);
    loading.hidden = true;
    failed.hidden = false;
    ctrl?.remove();
    ctrl = null;
    starting = null;
  }

  // Desktop: start when the stage nears the screen. Phone: the stage map is hidden, so this never fires there.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !isPhone()) { start(); io.disconnect(); }
  }, { rootMargin: '200px' });
  io.observe(stageMap);
  new ResizeObserver(() => ctrl?.resize()).observe(canvasEl);

  function openFull() {
    fullMap.append(host);
    full.showModal();
    if (selected) renderSelected();
    start().then(() => { ctrl?.resize(); frame(); });
  }
  function closeFull() { if (full.open) full.close(); }
  full.addEventListener('close', () => {
    stageMap.append(host);
    hideTip();
    sheet.hidden = true;
    // A country picked on the full-screen map is shown in the inline panel when the map closes.
    if (selected) renderSelected();
    ctrl?.resize();
    ctrl?.frame({ top: 16, bottom: 16 });
    root.querySelector<HTMLElement>('[data-show-map]')?.focus();
  });
  // Escape closes the country sheet first, then the map.
  full.addEventListener('cancel', (e) => { if (!sheet.hidden) { e.preventDefault(); select(null); } });

  function showRow(id: string) {
    closeFull();
    const row = document.querySelector<HTMLTableRowElement>(`tr[data-place="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.add('is-flash');
    row.querySelector<HTMLElement>('a, th')?.focus({ preventScroll: true });
    setTimeout(() => row.classList.remove('is-flash'), 2000);
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-select], [data-panel-close], [data-show-row], [data-sheet-grab], [data-zoom], [data-bloc-remove], [data-map-retry], [data-show-map], [data-close-map]');
    if (!el) return;
    if (el.dataset.select) select(el.dataset.select, true);
    else if (el.hasAttribute('data-panel-close')) select(null, true);
    else if (el.dataset.showRow) { e.preventDefault(); showRow(el.dataset.showRow); }
    else if (el.hasAttribute('data-sheet-grab')) sheet.classList.toggle('is-full');
    else if (el.dataset.zoom) ctrl?.zoom(el.dataset.zoom as 'in' | 'out' | 'reset');
    else if (el.hasAttribute('data-bloc-remove')) setBloc(null);
    else if (el.hasAttribute('data-map-retry')) start();
    else if (el.hasAttribute('data-show-map')) openFull();
    else if (el.hasAttribute('data-close-map')) closeFull();
  });

  // ---------- controls ----------
  slider?.closest('[data-gt-years], [data-gt-periods]')?.addEventListener('gt-change', (e) => setYear((e as CustomEvent<{ year: number }>).detail.year, 'slider'));
  blocSelect?.addEventListener('change', () => setBloc(blocSelect.value || null));
  // Another mineral keeps the year, the country and the bloc (the year moves to the nearest one that page has).
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-keep-state]')) {
    a.addEventListener('click', () => { a.search = location.search; });
  }
  document.querySelector<HTMLSelectElement>('[data-picker-select]')?.addEventListener('change', (e) => {
    location.href = (e.target as HTMLSelectElement).value + location.search;
  });
  if (filters) {
    document.querySelector('[data-open-filters]')?.addEventListener('click', () => {
      for (const r of filters.querySelectorAll<HTMLInputElement>('input[name="mv-fyear"]')) r.checked = Number(r.value) === year;
      if (fBloc) fBloc.value = bloc ?? '';
      filters.showModal();
    });
    filters.querySelector('[data-close-filters]')?.addEventListener('click', () => filters.close());
    filters.querySelector('[data-reset-filters]')?.addEventListener('click', () => {
      for (const r of filters.querySelectorAll<HTMLInputElement>('input[name="mv-fyear"]')) r.checked = Number(r.value) === yearsInPage.at(-1);
      if (fBloc) fBloc.value = '';
    });
    filters.querySelector('[data-apply-filters]')?.addEventListener('click', () => {
      const r = filters.querySelector<HTMLInputElement>('input[name="mv-fyear"]:checked');
      if (r) setYear(Number(r.value));
      setBloc(fBloc?.value || null);
      filters.close();
    });
    // A tap on the backdrop closes the sheet.
    filters.addEventListener('click', (e) => { if (e.target === filters) filters.close(); });
  }

  // ---------- the state in the URL, once the layer file is in ----------
  layer.then((f) => {
    file = f;
    // A page without a year control (the engine's test page) shows the layer's latest year.
    if (!f.years.includes(year)) year = f.year;
    const s = readState(location.search, ctx());
    if (s.year !== undefined) setYear(s.year);
    else setYear(year);
    if (s.bloc) setBloc(s.bloc);
    if (s.country) select(s.country);
    if (s.askedYear !== undefined && s.year !== undefined) {
      const moved = fill(f.text.movedYear, { want: s.askedYear, got: s.year });
      const note = document.createElement('p');
      note.className = 'gt-years__note';
      note.setAttribute('role', 'status');
      note.textContent = moved;
      (slider?.closest('[data-gt-years], [data-gt-periods]') ?? world).append(note);
    }
  }, (e) => fail((e as Error).message));
}
