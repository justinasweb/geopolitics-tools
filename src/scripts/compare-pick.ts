// The Compare pickers (ComparePicker component): each country box writes its pick into the form's hidden a or b,
// and once both are set, and different, the page opens the pair: its static page when it is one of the three
// (/compare/united-states-vs-china), else /compare?a=…&b=….
import { COMPARE_TEXT as T } from '../i18n/pages.en';
import { pairHref, type Pair } from '../lib/compare/model';

function pick(form: HTMLFormElement) {
  const pairs = JSON.parse(form.dataset.pairs ?? '[]') as Pair[];
  const msg = form.querySelector<HTMLElement>('[data-cmp-msg]');
  const field = (side: string) => form.querySelector<HTMLInputElement>(`input[name="${side}"]`)!;
  const go = (explicit: boolean) => {
    const a = field('a').value;
    const b = field('b').value;
    if (!a || !b) { if (explicit && msg) msg.textContent = T.pickTwo; return; }
    if (a === b) { if (msg) msg.textContent = T.same; return; }
    location.assign(pairHref(pairs, form.getAttribute('action')!, a, b));
  };
  form.addEventListener('gt-pick', (e) => {
    const box = (e.target as HTMLElement).closest<HTMLElement>('[data-cmp-for]');
    const value = (e as CustomEvent<{ value?: string }>).detail.value;
    if (!box || !value) return;
    field(box.dataset.cmpFor!).value = value;
    if (msg) msg.textContent = '';
    go(false);
  });
  // Typing over a picked name clears the pick, so the form never sends a country the box no longer shows.
  form.addEventListener('input', (e) => {
    const box = (e.target as HTMLElement).closest<HTMLElement>('[data-cmp-for]');
    if (box) field(box.dataset.cmpFor!).value = '';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go(true);
  });
}

export function initComparePick(): void {
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-cmp-pick]')) {
    if (form.dataset.ready) continue;
    form.dataset.ready = '1';
    pick(form);
  }
}
