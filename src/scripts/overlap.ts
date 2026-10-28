// The Bloc overlap tool in the browser: reads the settings from the address, redraws the matrix, the two-bloc view
// and the membership tables with the shared markup (src/lib/overlap/render.ts) as the reader chooses blocs or sorts,
// and writes every setting back to the address with history.replaceState, so any view can be shared.
import { OVERLAP_TEXT as T } from '../i18n/overlap.en';
import { parseState, queryOf, type Data, type Sort, type State } from '../lib/overlap/model';
import { chipsHtml, matrixHtml, overlapCsv, phoneTableHtml, tableHtml, twoHtml } from '../lib/overlap/render';

export function initOverlap(): void {
  const found = document.querySelector<HTMLElement>('[data-o-matrix]');
  const bootEl = document.getElementById('o-data');
  if (!found || !bootEl || found.dataset.ready) return;
  const matrix = found;
  matrix.dataset.ready = '1';
  const { data } = JSON.parse(bootEl.textContent ?? '{}') as { data: Data };
  const chips = document.querySelector<HTMLElement>('[data-o-chips]')!;
  const two = document.querySelector<HTMLElement>('[data-o-two]')!;
  const table = document.querySelector<HTMLElement>('[data-o-table]')!;
  const ptable = document.querySelector<HTMLElement>('[data-o-ptable]')!;
  const grid = document.querySelector<HTMLElement>('[data-o-grid]')!;
  const live = document.getElementById('gt-live');
  const say = (text: string) => { if (live) live.textContent = text; };

  let s: State = parseState(new URLSearchParams(location.search), data);

  /** The matrix takes the full width, bridge countries under it, when it would scroll sideways in its half. */
  function fit() {
    grid.classList.remove('is-wide');
    const wrap = matrix.querySelector<HTMLElement>('.gt-mxwrap');
    if (wrap?.offsetParent && wrap.scrollWidth > wrap.clientWidth + 1) grid.classList.add('is-wide');
  }

  /** Redraws, then puts focus back on the control the reader used (the markup under it is new). */
  function draw(focus?: string) {
    chips.innerHTML = chipsHtml(s, data);
    matrix.innerHTML = matrixHtml(s, data);
    two.innerHTML = twoHtml(s, data);
    table.innerHTML = tableHtml(s, data);
    ptable.innerHTML = phoneTableHtml(s, data);
    fit();
    const q = queryOf(s);
    history.replaceState(history.state, '', q ? `${location.pathname}?${q}` : location.pathname);
    if (focus) document.querySelector<HTMLElement>(focus)?.focus();
  }

  function update(change: Partial<State>, focus?: string) {
    s = parseState(new URLSearchParams(queryOf({ ...s, ...change })), data);
    draw(focus);
  }

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (!t.matches('select[data-o-set]')) return;
    update({ [t.dataset.oSet!]: t.value } as Partial<State>, `#${t.id}`);
  });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const chip = t.closest<HTMLButtonElement>('[data-o-bloc]');
    if (chip) {
      const id = chip.dataset.oBloc!;
      const on = s.blocs.includes(id);
      if (on && s.blocs.length <= 2) return say(T.atLeastTwo);
      update({ blocs: on ? s.blocs.filter((b) => b !== id) : [...s.blocs, id] }, `[data-o-bloc="${id}"]`);
      return say(T.chosen(s.blocs.length));
    }
    const sort = t.closest<HTMLButtonElement>('[data-o-sort]');
    if (sort) {
      const k = sort.dataset.oSort as Sort;
      const box = sort.closest('[data-o-table]') ? '[data-o-table]' : '[data-o-ptable]';
      const dir = s.sort === k ? (s.dir === 'desc' ? 'asc' : 'desc') : k === 'country' ? 'asc' : 'desc';
      return update({ sort: k, dir }, `${box} [data-o-sort="${k}"]`);
    }
    if (t.closest('[data-o-all]')) return update({ all: !s.all }, '[data-o-all]');
    if (t.closest('[data-o-csv]')) download();
  });

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([overlapCsv(s, data)], { type: 'text/csv;charset=utf-8' }));
    a.download = `bloc-overlap-${data.checked}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // The address may carry settings the build did not draw.
  if (location.search) draw();
  else fit();
  let frame = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });
}
