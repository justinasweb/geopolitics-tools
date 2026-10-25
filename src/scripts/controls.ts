// Behaviour for the filter controls, wired once per page by delegation, so markup added later also works:
// segmented control, chips (with optional list filtering), country search (combobox) and the year slider.
// Each fires a bubbling CustomEvent the page's own script listens to: `gt-change` or `gt-pick`.
import { YEAR_TEXT } from '../i18n/en';

const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';

const emit = (el: Element, name: string, detail: unknown) => el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const segBtn = t.closest<HTMLButtonElement>('[data-gt-seg] button');
  if (segBtn && !segBtn.disabled) {
    const group = segBtn.closest('[data-gt-seg]')!;
    for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === segBtn));
    emit(group, 'gt-change', { value: segBtn.value });
    return;
  }
  const chip = t.closest<HTMLButtonElement>('[data-gt-chips] .gt-chip');
  if (chip && !chip.disabled) toggleChip(chip);
}

function toggleChip(chip: HTMLButtonElement) {
  const group = chip.closest<HTMLElement>('[data-gt-chips]')!;
  const chips = [...group.querySelectorAll<HTMLButtonElement>('.gt-chip')];
  const isAll = chip.dataset.kind === 'all';
  const hasAll = chips.some((c) => c.dataset.kind === 'all');
  if (isAll) for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
  else {
    chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
    if (hasAll) chips.find((c) => c.dataset.kind === 'all')?.setAttribute('aria-pressed', 'false');
  }
  let on = chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.kind ?? '');
  if (!on.length && hasAll) {
    chips.find((c) => c.dataset.kind === 'all')?.setAttribute('aria-pressed', 'true');
    on = ['all'];
  }
  const list = group.dataset.gtFilter ? document.getElementById(group.dataset.gtFilter) : null;
  if (list) for (const li of list.children as HTMLCollectionOf<HTMLElement>) li.hidden = on[0] !== 'all' && !on.includes(li.dataset.kind ?? '');
  emit(group, 'gt-change', { values: on });
}

interface Option { name: string; value?: string; note?: string; href?: string }

function combo(el: HTMLElement) {
  const input = el.querySelector('input')!;
  const list = el.querySelector<HTMLUListElement>('.gt-combo__list')!;
  const opts: Option[] = JSON.parse(el.dataset.options ?? '[]');
  let active = -1;
  let shown: Option[] = [];
  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = opts.filter((o) => !q || o.name.toLowerCase().includes(q)).slice(0, 8);
    list.replaceChildren(...(shown.length ? shown.map((o, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `${el.id}-o${i}`;
      li.setAttribute('aria-selected', String(i === active));
      const k = q ? o.name.toLowerCase().indexOf(q) : -1;
      if (k > -1) {
        const m = document.createElement('mark');
        m.textContent = o.name.slice(k, k + q.length);
        li.append(o.name.slice(0, k), m, o.name.slice(k + q.length));
      } else li.append(o.name);
      if (o.note) {
        const s = document.createElement('span');
        s.textContent = o.note;
        li.append(s);
      }
      return li;
    }) : [Object.assign(document.createElement('li'), {
      className: 'gt-combo__empty',
      textContent: (el.dataset.empty ?? '').replace('{q}', input.value),
    })]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active > -1) input.setAttribute('aria-activedescendant', `${el.id}-o${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const pick = (i: number) => {
    const o = shown[i];
    if (!o) return;
    input.value = o.name;
    close();
    emit(el, 'gt-pick', o);
    if (o.href) location.href = o.href;
  };
  input.addEventListener('input', () => { active = -1; render(); });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(active > -1 ? active : 0); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest('li[role=option]');
    if (!li) return;
    e.preventDefault();
    pick([...list.children].indexOf(li));
  });
}

function years(el: HTMLElement) {
  const r = el.querySelector<HTMLInputElement>('input[type=range]')!;
  const now = el.querySelector('.gt-years__now');
  const btn = el.querySelector<HTMLButtonElement>('.gt-play');
  const est = (el.dataset.est ?? '').split(' ');
  let timer: ReturnType<typeof setInterval> | undefined;
  const update = () => {
    r.style.setProperty('--p', `${((+r.value - +r.min) / (+r.max - +r.min)) * 100}%`);
    if (now) now.textContent = r.value;
    for (const t of el.querySelectorAll<HTMLElement>('[data-tag-year]')) t.hidden = t.dataset.tagYear !== r.value;
    r.setAttribute('aria-valuetext', r.value + (est.includes(r.value) ? `, ${YEAR_TEXT.estimate}` : ''));
    emit(el, 'gt-change', { year: +r.value });
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    if (btn) { btn.innerHTML = PLAY; btn.setAttribute('aria-label', YEAR_TEXT.play); }
  };
  r.addEventListener('input', () => { stop(); update(); });
  if (btn) {
    btn.innerHTML = PLAY;
    btn.addEventListener('click', () => {
      if (timer) return stop();
      if (+r.value >= +r.max) r.value = r.min;
      btn.innerHTML = PAUSE;
      btn.setAttribute('aria-label', YEAR_TEXT.pause);
      update();
      const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer = setInterval(() => {
        if (+r.value >= +r.max) return stop();
        r.value = String(+r.value + 1);
        update();
      }, slow ? 1600 : 900);
    });
  }
  r.style.setProperty('--p', `${((+r.value - +r.min) / (+r.max - +r.min)) * 100}%`);
}

function initOnce<T extends HTMLElement>(sel: string, fn: (el: T) => void) {
  for (const el of document.querySelectorAll<T>(sel)) {
    if (el.dataset.ready) continue;
    el.dataset.ready = '1';
    fn(el);
  }
}

let bound = false;
export function initControls(): void {
  if (!bound) {
    bound = true;
    document.addEventListener('click', onClick);
  }
  initOnce('[data-gt-combo]', combo);
  initOnce('[data-gt-years]', years);
}
