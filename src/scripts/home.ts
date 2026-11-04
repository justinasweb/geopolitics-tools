// The homepage's big search: the combobox over every live page (src/scripts/controls.ts) does the finding; Search
// opens the first match, as Enter does. Until site search exists (phase 8) it also answers `gt-search`, so the
// header's search button and the "/" key bring the reader to it.

export function initHomeSearch(): void {
  const form = document.querySelector<HTMLFormElement>('[data-home-search]');
  const input = form?.querySelector('input');
  if (!form || !input) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });
  document.addEventListener('gt-search', () => {
    input.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    input.focus({ preventScroll: true });
  });
}
