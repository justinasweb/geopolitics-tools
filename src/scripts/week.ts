// This week's small behaviours, wired once per page by delegation: the week picker opens the chosen week, and the
// Latest feed shows its first items (data-limit, 10) with "Show older items" for the rest, counting only the items
// the kind chips leave visible (src/scripts/controls.ts hides the others and fires gt-change). Without this script
// every feed item shows and the previous-week link still works.
let wired = false;

function clip(wrap: HTMLElement) {
  const list = wrap.querySelector<HTMLOListElement>('.gt-feed');
  const more = wrap.querySelector<HTMLButtonElement>('[data-gt-more]');
  if (!list || !more) return;
  const limit = Number(wrap.dataset.limit) || 10;
  const open = wrap.dataset.open === 'true';
  let shown = 0;
  let cut = 0;
  for (const li of list.children as HTMLCollectionOf<HTMLElement>) {
    li.classList.remove('is-older');
    if (li.hidden) continue;
    if (!open && shown >= limit) {
      li.classList.add('is-older');
      cut++;
    } else shown++;
  }
  more.hidden = cut === 0;
}

export function initWeek() {
  if (wired) return;
  wired = true;
  const start = () => document.querySelectorAll<HTMLElement>('[data-gt-feed]').forEach(clip);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-gt-weekpick]');
    if (sel && sel.value && sel.value !== location.pathname) location.href = sel.value;
  });
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-gt-more]');
    const wrap = btn?.closest<HTMLElement>('[data-gt-feed]');
    if (!btn || !wrap) return;
    const first = wrap.querySelector<HTMLElement>('.gt-feed li.is-older');
    wrap.dataset.open = 'true';
    clip(wrap);
    // Focus moves to the first item that was hidden, so keyboard users land on the new items.
    first?.querySelector<HTMLElement>('a, .gt-feed__what')?.focus?.();
  });
  document.addEventListener('gt-change', (e) => {
    const wrap = (e.target as HTMLElement).closest<HTMLElement>('[data-gt-feed]');
    if (wrap) clip(wrap);
  });
}
