// The Explorer in the browser: reads the settings from the address, loads the measures they need
// (/explorer/data/<id>.json, once each), redraws the view with the shared markup (src/lib/explorer/render.ts) as
// the reader changes anything, and writes every setting back to the address with history.replaceState, so any
// view can be shared. The desktop controls and the phone sheet are the same markup; both follow the settings.
import { initControls } from './controls';
import { initCopy } from './copy';
import { EXPLORER_TEXT as T } from '../i18n/explorer.en';
import { MAX_COUNTRIES, MAX_MEASURES, PRESETS, parseState, presetState, queryOf, type Meta, type State, type View } from '../lib/explorer/model';
import { controlsHtml, foundRow, needed, outputHtml, presetsHtml, tableCsv, tableRows, urlbarHtml, viewSource, type Data } from '../lib/explorer/render';

interface Boot { meta: Meta; paths: Record<View, string>; site: string }

export function initExplorer(): void {
  const found = document.querySelector<HTMLElement>('[data-x-out]');
  const bootEl = document.getElementById('x-meta');
  if (!found || !bootEl || found.dataset.ready) return;
  const out = found;
  out.dataset.ready = '1';
  initCopy();
  const { meta, paths, site } = JSON.parse(bootEl.textContent ?? '{}') as Boot;
  const view = out.dataset.view as View;
  const ctls = [...document.querySelectorAll<HTMLElement>('[data-x-ctl]')];
  const src = document.querySelector<HTMLElement>('[data-x-src]')!;
  const urlbar = document.querySelector<HTMLElement>('[data-x-url]')!;
  const presets = document.querySelector<HTMLElement>('[data-x-presets]')!;
  const note = document.querySelector<HTMLElement>('[data-x-note]')!;
  const sheet = document.querySelector<HTMLDialogElement>('[data-x-sheet]');
  const live = document.getElementById('gt-live');

  let s: State = parseState(view, new URLSearchParams(location.search), meta);
  const data: Data = {};
  const pending = new Map<string, Promise<void>>();
  const load = (ids: string[]) => Promise.all(ids.filter((id) => !data[id]).map((id) => {
    if (!pending.has(id)) {
      pending.set(id, fetch(`${meta.base}${id}.json`).then((r) => {
        if (!r.ok) throw new Error(`${id}: ${r.status}`);
        return r.json();
      }).then((d) => { data[id] = d; }).finally(() => pending.delete(id)));
    }
    return pending.get(id)!;
  }));

  const say = (text: string) => { if (live) live.textContent = text; };
  const showNote = (text: string) => { note.textContent = text; note.hidden = !text; };

  // Redraws one control block, keeping focus, an open measure picker and its search where they were.
  function drawControls(c: HTMLElement) {
    const active = document.activeElement as HTMLInputElement | null;
    const focus = active && c.contains(active) && active.id ? { id: active.id, at: active.selectionStart } : null;
    const picker = c.querySelector<HTMLDetailsElement>('[data-x-picker]');
    const open = picker?.open ?? false;
    const q = c.querySelector<HTMLInputElement>('[data-x-msearch]')?.value ?? '';
    c.innerHTML = controlsHtml(s, meta, data, c.dataset.xCtl!);
    const p2 = c.querySelector<HTMLDetailsElement>('[data-x-picker]');
    if (p2 && open) p2.open = true;
    const search = c.querySelector<HTMLInputElement>('[data-x-msearch]');
    if (search && q) { search.value = q; filterPicker(search); }
    if (focus) {
      const el = document.getElementById(focus.id) as HTMLInputElement | null;
      el?.focus();
      if (el && focus.at !== null && 'setSelectionRange' in el && el.type === 'search') el.setSelectionRange(focus.at, focus.at);
    }
  }

  const width = () => Math.round(out.getBoundingClientRect().width) || 900;

  /** Draws everything from the settings; `keep` is a control block not to redraw (the one being used). */
  function draw(keep?: HTMLElement | 'all') {
    if (keep !== 'all') for (const c of ctls) if (c !== keep) drawControls(c);
    out.innerHTML = outputHtml(s, meta, data, width());
    src.innerHTML = viewSource(s, meta, data);
    presets.innerHTML = presetsHtml(s, meta, paths);
    const path = `${location.pathname}?${queryOf(s)}`;
    history.replaceState(history.state, '', path);
    urlbar.innerHTML = urlbarHtml(new URL(path, site || location.origin).href);
    initControls();
    if (s.view === 'table' && s.find) {
      const row = out.querySelector<HTMLTableRowElement>('tr.is-found');
      const wrap = out.querySelector<HTMLElement>('.gt-tablewrap');
      if (row && wrap) wrap.scrollTop = row.offsetTop - (wrap.querySelector('thead')?.getBoundingClientRect().height ?? 0) - 8;
    }
  }

  async function update(change: Partial<State>, keep?: HTMLElement | 'all') {
    s = parseState(view, new URLSearchParams(queryOf({ ...s, ...change })), meta);
    out.classList.add('is-loading');
    try {
      await load(needed(s));
      showNote('');
    } catch {
      showNote(T.failed);
      return;
    } finally {
      out.classList.remove('is-loading');
    }
    draw(keep);
  }

  function filterPicker(input: HTMLInputElement) {
    const q = input.value.trim().toLowerCase();
    const picker = input.closest('.gt-picker')!;
    for (const l of picker.querySelectorAll<HTMLElement>('[data-x-name]')) l.hidden = Boolean(q) && !(l.dataset.xName ?? '').includes(q);
    for (const f of picker.querySelectorAll<HTMLFieldSetElement>('fieldset')) f.hidden = ![...f.querySelectorAll<HTMLElement>('[data-x-name]')].some((l) => !l.hidden);
  }

  const blockOf = (el: Element) => el.closest<HTMLElement>('[data-x-ctl]') ?? undefined;
  const num = (v: string) => (v ? Number(v) : null);

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const block = blockOf(t);
    if (!block) return;
    if (t.matches('select[data-x-set]')) {
      const k = (t as HTMLSelectElement).dataset.xSet!;
      const v = t.value;
      if (k === 'm') return void update({ m: [v], index: null });
      if (k === 'year' || k === 'index') return void update({ [k]: num(v) });
      return void update({ [k]: v } as Partial<State>);
    }
    if (t.matches('input[data-x-pick]')) {
      const id = t.value;
      const m = (t as HTMLInputElement).checked ? [...s.m, id].slice(0, MAX_MEASURES) : s.m.filter((x) => x !== id);
      if (!m.length) { (t as HTMLInputElement).checked = true; return; }
      return void update({ m });
    }
    if (t.matches('select[data-x-addc]') && t.value) return void update({ c: [...s.c, t.value].slice(0, MAX_COUNTRIES) });
    if (t.matches('input[data-x-log]')) return void update({ log: (t as HTMLInputElement).checked });
  });

  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-x-msearch]')) return filterPicker(t);
    if (t.matches('[data-x-find]')) {
      void update({ find: t.value }, blockOf(t)).then(() => {
        if (!t.value.trim()) return say('');
        const id = foundRow(meta, tableRows(s, meta, data).rows.map((r) => r.id), t.value);
        say(id ? T.found(meta.places[id].n) : T.notFound(t.value));
      });
    }
  });

  // The year slider (src/scripts/controls.ts) announces its moves, Play included.
  document.addEventListener('gt-change', (e) => {
    const el = e.target as HTMLElement;
    const year = (e as CustomEvent<{ year?: number }>).detail?.year;
    if (!el.matches('[data-gt-years]') || !blockOf(el) || year === undefined || year === s.year) return;
    void update({ year }, blockOf(el));
  });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const rm = t.closest<HTMLButtonElement>('[data-x-remove]');
    if (rm) return void update({ m: s.m.filter((x) => x !== rm.dataset.xRemove) });
    const rc = t.closest<HTMLButtonElement>('[data-x-remove-c]');
    if (rc) return void update({ c: s.c.filter((x) => x !== rc.dataset.xRemoveC) });
    const sort = t.closest<HTMLButtonElement>('[data-x-sort]');
    if (sort) {
      const k = sort.dataset.xSort!;
      const dir = s.sort === k ? (s.dir === 'desc' ? 'asc' : 'desc') : k === 'country' ? 'asc' : 'desc';
      return void update({ sort: k, dir }, 'all');
    }
    const pin = t.closest<SVGElement>('[data-x-pin]');
    if (pin) {
      const id = pin.dataset.xPin!;
      return void update({ pin: s.pin.includes(id) ? s.pin.filter((x) => x !== id) : [...s.pin, id] }, 'all');
    }
    if (t.closest('[data-x-csv]')) return download();
    if (t.closest('[data-x-open]')) return sheet?.showModal();
    if (t.closest('[data-x-close]')) return sheet?.close();
    // A starting point for this same view changes the settings in place; one for another view is a link.
    const chip = t.closest<HTMLAnchorElement>('a[data-x-preset]');
    if (chip) {
      const p = PRESETS.find((x) => x.id === chip.dataset.xPreset);
      if (p && p.view === view && !(e as MouseEvent).metaKey && !(e as MouseEvent).ctrlKey) {
        e.preventDefault();
        const next = presetState(p, meta);
        void update(next);
      }
    }
    // Closes an open measure picker on a click outside it.
    for (const d of document.querySelectorAll<HTMLDetailsElement>('[data-x-picker][open]')) if (!d.contains(t) && !sheet?.contains(d)) d.open = false;
  });

  // The measure picker opens under its button, flipped to end at the button's right edge if it would run off screen.
  document.addEventListener('toggle', (e) => {
    const d = e.target as HTMLElement;
    if (!d.matches?.('[data-x-picker]') || !(d as HTMLDetailsElement).open) return;
    const panel = d.querySelector<HTMLElement>('.gt-picker')!;
    panel.classList.remove('is-end');
    if (panel.getBoundingClientRect().right > document.documentElement.clientWidth - 8) panel.classList.add('is-end');
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const d of document.querySelectorAll<HTMLDetailsElement>('[data-x-picker][open]')) {
      d.open = false;
      d.querySelector('summary')?.focus();
    }
  });

  function download() {
    const { csv, left } = tableCsv(s, meta, data);
    showNote(left.length ? (left.length === s.m.length ? T.csvNone : T.csvLeftOut(left.map((m) => m.label).join(', '))) : '');
    if (left.length === s.m.length) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `explorer-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Charts are drawn at the width they are shown, so their words stay readable on a phone.
  let shown = width();
  let timer: ReturnType<typeof setTimeout> | undefined;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = width();
      if (Math.abs(w - shown) < 8 || s.view === 'table') return;
      shown = w;
      out.innerHTML = outputHtml(s, meta, data, w);
    }, 120);
  }).observe(out);

  void update({}, undefined);
}
