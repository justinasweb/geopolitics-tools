// A supply chain in the browser: reads the focused country from the address, redraws the diagram, the panel, the
// phone list and the table with the shared markup (src/lib/supply-chains/render.ts) as the reader focuses or clears
// one, and writes it back with history.replaceState, so a focused view can be shared. The flow switch opens the
// other flow's page, keeping the focus when that country is in it.
import { CHAINS_TEXT as T } from '../i18n/supply-chains.en';
import { foundPlace, nameOf, parseState, queryOf, type Chain, type State } from '../lib/supply-chains/model';
import { chainCsv, flowListHtml, panelHtml, sankeyHtml, tableHtml } from '../lib/supply-chains/render';
import { initSortable } from './table';

export function initSupplyChain(): void {
  const found = document.querySelector<HTMLElement>('[data-sk-d]');
  const bootEl = document.getElementById('sk-chain');
  if (!found || !bootEl || found.dataset.ready) return;
  const d = found;
  d.dataset.ready = '1';
  const { chain } = JSON.parse(bootEl.textContent ?? '{}') as { chain: Chain };
  const panel = document.querySelector<HTMLElement>('[data-sk-panel]')!;
  const list = document.querySelector<HTMLElement>('[data-sk-list]')!;
  const table = document.querySelector<HTMLElement>('[data-sk-table]')!;
  const find = document.querySelector<HTMLInputElement>('[data-sk-find]')!;
  const stage = document.getElementById('sk-stage')!;
  const live = document.getElementById('gt-live');
  const say = (text: string) => { if (live) live.textContent = text; };

  let s: State = parseState(new URLSearchParams(location.search), chain);

  function draw() {
    d.innerHTML = sankeyHtml(chain, s);
    panel.innerHTML = panelHtml(chain, s);
    list.innerHTML = flowListHtml(chain, s);
    table.innerHTML = tableHtml(chain, s);
    table.querySelectorAll<HTMLTableElement>('table[data-gt-sort]').forEach(initSortable);
    if (document.activeElement !== find) find.value = s.country ? nameOf(chain, s.country) : '';
    const q = queryOf(s);
    history.replaceState(history.state, '', q ? `${location.pathname}?${q}` : location.pathname);
  }

  function focus(country: string) {
    if (country === s.country) return;
    s = { country };
    draw();
    say(country ? T.nowFocused(nameOf(chain, country)) : T.cleared);
  }

  // A pick from the list, or Enter: the first country whose name matches.
  find.addEventListener('change', () => {
    const q = find.value.trim();
    if (!q) return focus('');
    const id = foundPlace(chain, q);
    if (id) {
      find.value = nameOf(chain, id);
      focus(id);
    } else say(T.notFound(q));
  });
  find.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase();
    if (!q) return focus('');
    // An exact name, as a pick from the list gives, focuses at once.
    const id = foundPlace(chain, q);
    if (id && nameOf(chain, id).toLowerCase() === q) focus(id);
  });

  document.querySelector<HTMLSelectElement>('[data-sk-flow]')?.addEventListener('change', (e) => {
    const path = (e.target as HTMLSelectElement).value;
    location.href = s.country ? `${path}?${queryOf(s)}` : path;
  });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-sk-clear]')) {
      focus('');
      find.focus();
      return;
    }
    const pick = t.closest<SVGGElement>('[data-sk-pick]');
    if (pick) return focus(pick.dataset.skPick!);
    const open = t.closest<HTMLButtonElement>('[data-sk-open]');
    if (open) {
      const on = !stage.classList.contains('is-open');
      stage.classList.toggle('is-open', on);
      open.setAttribute('aria-expanded', String(on));
      open.textContent = on ? T.hideDiagram : T.showDiagram;
      return;
    }
    if (t.closest('[data-sk-csv]')) download();
  });

  // The value of the band under the pointer, written under the diagram.
  d.addEventListener('pointerover', (e) => {
    const band = (e.target as Element).closest<SVGPathElement>('[data-sk-band]');
    const read = d.querySelector<HTMLElement>('[data-sk-read]');
    if (band && read) read.textContent = band.dataset.skBand!;
  });

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([chainCsv(chain, s)], { type: 'text/csv;charset=utf-8' }));
    a.download = `supply-chain-${chain.key}-${chain.period}${s.country ? `-${chain.places[s.country]?.c ?? s.country}` : ''}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  table.querySelectorAll<HTMLTableElement>('table[data-gt-sort]').forEach(initSortable);
  // The address may carry a focus the build did not draw.
  if (s.country) draw();
}
