// The Dependencies tool in the browser: reads the settings from the address, redraws the single points of failure,
// the grid and the phone views with the shared markup (src/lib/dependencies/render.ts) as the reader filters,
// sorts or finds, and writes every setting back to the address with history.replaceState, so any view can be shared.
import { DEPS_TEXT as T } from '../i18n/dependencies.en';
import { foundRow, parseState, queryOf, rowsOf, type Grid, type Show, type State } from '../lib/dependencies/model';
import { controlsHtml, gridCsv, phoneHtml, spofHtml, tableHtml } from '../lib/dependencies/render';

export function initDependencies(): void {
  const found = document.querySelector<HTMLElement>('[data-d-out]');
  const bootEl = document.getElementById('d-grid');
  if (!found || !bootEl || found.dataset.ready) return;
  const out = found;
  out.dataset.ready = '1';
  const { grid } = JSON.parse(bootEl.textContent ?? '{}') as { grid: Grid };
  const ctl = document.querySelector<HTMLElement>('[data-d-ctl]')!;
  const spof = document.querySelector<HTMLElement>('[data-d-spof]')!;
  const phone = document.querySelector<HTMLElement>('[data-d-phone]')!;
  const note = document.querySelector<HTMLElement>('[data-d-note]')!;
  const live = document.getElementById('gt-live');
  const say = (text: string) => { if (live) live.textContent = text; };

  let s: State = parseState(new URLSearchParams(location.search), grid);

  /** Redraws everything but the desktop controls while the reader types in them, keeping focus where it was. */
  function draw(keepCtl = false) {
    if (!keepCtl) ctl.innerHTML = controlsHtml(s, grid);
    spof.innerHTML = spofHtml(s, grid);
    spof.classList.toggle('is-all', s.all);
    out.innerHTML = tableHtml(s, grid);
    const active = document.activeElement?.id;
    phone.innerHTML = phoneHtml(s, grid);
    if (active && phone.querySelector(`#${active}`)) document.getElementById(active)?.focus();
    const q = queryOf(s, grid);
    history.replaceState(history.state, '', q ? `${location.pathname}?${q}` : location.pathname);
    if (s.find) {
      const row = out.querySelector<HTMLTableRowElement>('tr.is-found');
      const wrap = out.querySelector<HTMLElement>('.gt-tablewrap');
      if (row && wrap) wrap.scrollTop = row.offsetTop - (wrap.querySelector('thead')?.getBoundingClientRect().height ?? 0) - 8;
    }
  }

  function update(change: Partial<State>, keepCtl = false) {
    s = parseState(new URLSearchParams(queryOf({ ...s, ...change }, grid)), grid);
    draw(keepCtl);
  }

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (!t.matches('select[data-d-set]')) return;
    const k = t.dataset.dSet!;
    if (k === 'sort') return update({ sort: t.value, dir: t.value === 'country' ? 'asc' : 'desc' });
    update({ [k]: t.value } as Partial<State>);
  });

  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.matches('[data-d-find]')) return;
    update({ find: t.value }, true);
    if (!t.value.trim()) return say('');
    const id = foundRow(grid, rowsOf(s, grid).map((r) => r.id), t.value);
    say(id ? T.found(grid.places[id].n) : T.notFound(t.value));
  });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const sort = t.closest<HTMLButtonElement>('[data-d-sort]');
    if (sort) {
      const k = sort.dataset.dSort!;
      const dir = s.sort === k ? (s.dir === 'desc' ? 'asc' : 'desc') : k === 'country' ? 'asc' : 'desc';
      update({ sort: k, dir });
      document.querySelector<HTMLButtonElement>(`[data-d-out] [data-d-sort="${k}"]`)?.focus();
      return;
    }
    const show = t.closest<HTMLButtonElement>('[data-d-show]');
    if (show) {
      update({ show: show.dataset.dShow as Show });
      phone.querySelector<HTMLButtonElement>(`[data-d-show="${show.dataset.dShow}"]`)?.focus();
      return;
    }
    if (t.closest('[data-d-all]')) {
      update({ all: !s.all });
      spof.querySelector<HTMLButtonElement>('[data-d-all]')?.focus();
      return;
    }
    if (t.closest('[data-d-csv]')) download();
  });

  function download() {
    const { csv, note: left } = gridCsv(s, grid);
    note.textContent = left;
    note.hidden = !left;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `dependencies-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // The address may carry settings the build did not draw.
  if (location.search) draw();
}
