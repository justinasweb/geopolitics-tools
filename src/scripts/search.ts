// Site search in the browser (SiteSearch, SearchDialog): fetches the index once, on first use, and searches it as you
// type (src/lib/search-match.ts). The input is an ARIA combobox over a listbox of grouped options: the arrow keys move
// through every result across the groups, Enter opens the one marked (the best when none is), Esc closes the dialog
// (focus goes back where it was) or, on the homepage, clears the box and closes its list. An empty dialog suggests a
// few pages; several words that match nothing together show the results of those that match ("No match for “ukraine
// war”. Showing results for Ukraine."); a typo shows the nearest name's results ("Showing results for India"); a query
// with no word that matches says so and suggests the same pages.
//
// `gt-search` (the header and Atlas search buttons, the "/" key) focuses the page's large box when it has one, and
// opens the dialog otherwise.
import { bindSearchKey } from './header';
import { decode, marks, search, type Index, type Result, type WireIndex } from '../lib/search-match';
import type { SearchClientText } from '../lib/search';

let loading: Promise<Index> | null = null;
function load(url: string): Promise<Index> {
  loading ??= fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`search index: ${r.status}`); return r.json() as Promise<WireIndex>; })
    .then(decode)
    .catch((e: unknown) => { loading = null; throw e; });
  return loading;
}

const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

interface Row { name: string; detail?: string; path: string; typed?: string }

function initBox(form: HTMLFormElement): { show: () => void } {
  const input = form.querySelector('input')!;
  const panel = form.querySelector<HTMLElement>('.gt-ss__panel')!;
  const list = form.querySelector<HTMLElement>('[role=listbox]')!;
  const note = form.querySelector<HTMLElement>('.gt-ss__note')!;
  const status = form.querySelector<HTMLElement>('[role=status]')!;
  const T = JSON.parse(form.dataset.text ?? '{}') as SearchClientText;
  const url = form.dataset.index ?? '/search-index.json';
  const inDialog = form.dataset.gtSs === 'dialog';
  const id = list.id;
  let rows: Row[] = [];
  let active = -1;
  let index: Index | null = null;
  /** Whether the rows are results, not suggestions: Enter opens the best only then. */
  let matched = false;
  let said: ReturnType<typeof setTimeout> | undefined;

  const open = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const close = () => {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const say = (text: string) => { clearTimeout(said); said = setTimeout(() => { status.textContent = text; }, 500); };
  const setNote = (text?: string) => { note.hidden = !text; note.textContent = text ?? ''; };

  const mark = (i: number) => {
    active = i;
    list.querySelectorAll('[role=option]').forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
    if (active > -1) {
      input.setAttribute('aria-activedescendant', `${id}-o${active}`);
      document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  /** The listbox's groups: [label, count shown in the heading, rows]. */
  function draw(groups: [string, string, Row[]][]) {
    rows = [];
    list.replaceChildren(...groups.map(([label, count, items], g) => {
      const grp = el('div', 'gt-ss__grp');
      grp.setAttribute('role', 'group');
      grp.setAttribute('aria-labelledby', `${id}-g${g}`);
      const head = el('div', 'gt-ss__gh');
      head.id = `${id}-g${g}`;
      head.setAttribute('role', 'presentation');
      head.append(label);
      if (count) head.append(' ', el('small', '', count));
      grp.append(head);
      for (const r of items) {
        const o = el('div', 'gt-ss__opt');
        o.setAttribute('role', 'option');
        o.id = `${id}-o${rows.length}`;
        o.setAttribute('aria-selected', 'false');
        o.dataset.i = String(rows.length);
        const name = el('span', 'gt-ss__name');
        let at = 0;
        for (const [a, b] of r.typed ? marks(r.name, r.typed) : []) {
          name.append(r.name.slice(at, a), el('mark', '', r.name.slice(a, b)));
          at = b;
        }
        name.append(r.name.slice(at));
        o.append(name);
        if (r.detail) o.append(el('span', 'gt-ss__detail', r.detail));
        grp.append(o);
        rows.push(r);
      }
      return grp;
    }));
    mark(-1);
  }

  const suggest = (): [string, string, Row[]] => [T.try, '', (index?.suggestions ?? []).map((s) => ({ name: s.label, path: s.path }))];

  function render(r: Result, typed: string) {
    matched = r.total > 0;
    if (!r.total) {
      setNote(`${fill(T.none, { q: typed.trim() })} ${T.noneHelp}`);
      draw(index?.suggestions.length ? [suggest()] : []);
      say(fill(T.none, { q: typed.trim() }));
      return;
    }
    const line = r.partial ? fill(T.partial, { q: typed.trim(), name: r.partial }) : r.corrected ? fill(T.didYouMean, { name: r.corrected }) : '';
    setNote(line || undefined);
    const shown = r.partial ?? r.corrected ?? typed;
    draw(r.groups.map((g) => [
      T.groups[g.id] ?? g.id,
      g.entries.length < g.total ? fill(T.some, { n: g.entries.length, all: g.total }) : String(g.total),
      g.entries.map((e) => ({ name: e.name, detail: e.detail, path: e.path, typed: shown })),
    ]));
    say(`${line ? `${line} ` : ''}${r.total === 1 ? T.one : fill(T.many, { n: r.total })}`);
  }

  async function update() {
    const typed = input.value;
    if (!typed.trim()) {
      // The dialog suggests a few pages; the homepage has its own Try links under the box.
      if (!inDialog) return close();
      setNote();
      if (!index) { draw([]); open(); }
    }
    if (!index) {
      setNote(T.loading);
      open();
      try {
        index = await load(url);
      } catch {
        setNote(T.failed);
        draw([]);
        return;
      }
      if (input.value !== typed) return;
    }
    if (!typed.trim()) {
      setNote();
      matched = false;
      draw([suggest()]);
    } else render(search(index, typed, 5, (c) => fill(T.member, { country: c })), typed);
    open();
  }

  function go(i: number, newTab = false) {
    const r = rows[i];
    if (!r) return;
    if (newTab) { window.open(r.path, '_blank', 'noopener'); return; }
    location.href = r.path;
  }

  input.addEventListener('input', () => { void update(); });
  input.addEventListener('focus', () => { if (input.value.trim() || inDialog) void update(); });
  input.addEventListener('keydown', (e) => {
    const n = rows.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (panel.hidden) { void update(); return; }
      if (n) mark(Math.min(active + 1, n - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) mark(Math.max(active - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter with nothing marked opens the best result, never a suggestion shown for a query that matched nothing.
      if (active > -1) go(active, e.metaKey || e.ctrlKey);
      else if (matched && n) go(0, e.metaKey || e.ctrlKey);
    } else if (e.key === 'Escape') {
      // The dialog closes in one press, text or not; the homepage box clears its text and closes its list.
      e.preventDefault();
      if (inDialog) form.closest('dialog')?.close();
      else { input.value = ''; close(); }
    } else if (e.key === 'Tab' && !inDialog) close();
  });
  // Keep the focus in the box while a result is clicked; a click with Ctrl or Cmd, or the middle button, opens a tab.
  list.addEventListener('mousedown', (e) => { if ((e.target as Element).closest('[role=option]')) e.preventDefault(); });
  const pick = (e: MouseEvent) => {
    const o = (e.target as Element).closest<HTMLElement>('[role=option]');
    if (o) go(Number(o.dataset.i), e.metaKey || e.ctrlKey || e.button === 1);
  };
  list.addEventListener('click', pick);
  list.addEventListener('auxclick', (e) => { if (e.button === 1) pick(e); });
  list.addEventListener('mousemove', (e) => {
    const o = (e.target as Element).closest<HTMLElement>('[role=option]');
    if (o && Number(o.dataset.i) !== active) mark(Number(o.dataset.i));
  });
  // Focus moving elsewhere on the page closes the list; switching to another window or tab leaves it open.
  form.addEventListener('focusout', () => { setTimeout(() => { if (!inDialog && document.hasFocus() && !form.contains(document.activeElement)) close(); }); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });
  // Fetch the index as soon as the reader shows an interest, so it is usually there by the first keystroke.
  input.addEventListener('pointerenter', () => { void load(url).catch(() => undefined); }, { once: true });

  return {
    show: () => {
      input.focus({ preventScroll: true });
      input.select();
      void update();
    },
  };
}

let ready = false;
export function initSearch(): void {
  if (ready) return;
  ready = true;
  const big = document.querySelector<HTMLFormElement>('[data-gt-ss=big]');
  const bigBox = big ? initBox(big) : null;
  const dialog = document.querySelector<HTMLDialogElement>('dialog[data-gt-ss-dialog]');
  const dlgForm = dialog?.querySelector<HTMLFormElement>('[data-gt-ss=dialog]');
  const dlgBox = dlgForm ? initBox(dlgForm) : null;
  const url = (big ?? dlgForm)?.dataset.index;
  let trigger: HTMLElement | null = null;
  let back: HTMLElement | null = null;

  if (dialog && dlgBox && !bigBox) {
    for (const b of document.querySelectorAll('[data-gt-search]')) {
      b.setAttribute('aria-haspopup', 'dialog');
      // Fetch the index when a pointer reaches the button, before the click.
      b.addEventListener('pointerenter', () => { if (url) void load(url).catch(() => undefined); }, { once: true });
    }
    dialog.querySelector('[data-gt-ss-close]')?.addEventListener('click', () => dialog.close());
    // Focus goes back to what had it before the dialog opened: the button that opened it, or the element focused before
    // "/". Some browsers do not focus a button on click, so the button clicked is kept too.
    document.addEventListener('click', (e) => { trigger = (e.target as Element).closest<HTMLElement>('[data-gt-search]'); }, true);
    dialog.addEventListener('close', () => {
      if (back?.isConnected) back.focus({ preventScroll: true });
      back = null;
    });
    // A click on the backdrop (the dialog element itself, outside its content) closes it.
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }

  document.addEventListener('gt-search', () => {
    if (big && bigBox) {
      big.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      bigBox.show();
    } else if (dialog && dlgBox) {
      if (!dialog.open) {
        const at = document.activeElement;
        back = trigger ?? (at instanceof HTMLElement && at !== document.body ? at : null);
        trigger = null;
        dialog.showModal();
      }
      dlgBox.show();
    }
  });
  bindSearchKey();
}
