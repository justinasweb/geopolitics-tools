// Shows a year's text everywhere on the page that follows the year control (src/lib/map/by-year.ts writes it).
// The header and the summary sit outside the map stage, so this reads the whole document.

const parsed = new WeakMap<HTMLElement, Record<string, string | string[]>>();
const read = (el: HTMLElement, attr: 'byYear' | 'labelByYear') => {
  let m = parsed.get(el);
  if (!m) { m = JSON.parse(el.dataset[attr] ?? '{}') as Record<string, string | string[]>; parsed.set(el, m); }
  return m;
};

export function showYear(y: number, from: ParentNode = document): void {
  const key = String(y);
  for (const el of from.querySelectorAll<HTMLElement>('[data-for-year]')) el.hidden = el.dataset.forYear !== key;
  for (const el of from.querySelectorAll<HTMLElement>('[data-by-year]')) {
    const t = read(el, 'byYear')[key];
    el.hidden = t === undefined;
    if (t === undefined) continue;
    if (Array.isArray(t)) el.replaceChildren(...t.map((s) => Object.assign(document.createElement('p'), { textContent: s })));
    else el.textContent = t;
  }
  for (const el of from.querySelectorAll<HTMLElement>('[data-label-by-year]')) {
    const t = read(el, 'labelByYear')[key];
    // The map engine moves the label from its container to the canvas it draws on.
    const target = el.hasAttribute('aria-label') ? el : el.querySelector('canvas') ?? el;
    if (typeof t === 'string') target.setAttribute('aria-label', t);
  }
}
