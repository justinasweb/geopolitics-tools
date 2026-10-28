// Header behaviour: one mega-menu panel open at a time, hubs and Tools alike (Esc or a click elsewhere closes it and
// returns focus to its button), and the phone menu. The search buttons and the "/" key dispatch `gt-search` on document;
// site search (phase 8) listens for it.

export function initHeader(header: HTMLElement): void {
  const buttons = [...header.querySelectorAll<HTMLButtonElement>('.gt-nav__btn[aria-controls]')];
  const panel = (b: HTMLButtonElement) => document.getElementById(b.getAttribute('aria-controls') ?? '');
  const closeAll = (except?: HTMLButtonElement) => {
    for (const b of buttons) {
      if (b === except) continue;
      b.setAttribute('aria-expanded', 'false');
      const p = panel(b);
      if (p) p.hidden = true;
    }
  };
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') === 'true';
      closeAll(b);
      b.setAttribute('aria-expanded', String(!open));
      const p = panel(b);
      if (!p) return;
      p.hidden = open;
      // A panel that would run off the right of the screen opens aligned to its button's right edge instead.
      p.classList.remove('gt-mega--end');
      if (!open && p.getBoundingClientRect().right > document.documentElement.clientWidth) p.classList.add('gt-mega--end');
    });
  }
  header.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = buttons.find((b) => b.getAttribute('aria-expanded') === 'true');
    if (open) {
      closeAll();
      open.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!header.querySelector('.gt-nav')?.contains(e.target as Node)) closeAll();
  });

  const opener = header.querySelector<HTMLButtonElement>('[data-gt-menu-open]');
  const menu = document.getElementById(opener?.getAttribute('aria-controls') ?? '');
  if (opener && menu && menu.hidden) initPhoneMenu(header, opener, menu);

  for (const b of header.querySelectorAll('[data-gt-search]')) {
    b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('gt-search')));
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The phone menu: a panel under the header bar, which stays where it is (the same button opens and closes it).
 *  While it is open the rest of the page is inert and does not scroll, and Tab stays in the bar and the panel. */
function initPhoneMenu(header: HTMLElement, opener: HTMLButtonElement, menu: HTMLElement): void {
  const root = document.documentElement;
  let inerted: HTMLElement[] = [];
  let scrollY = 0;
  const isOpen = () => !menu.hidden;

  const place = () => {
    const r = header.getBoundingClientRect();
    menu.style.setProperty('--gt-menu-top', `${Math.max(0, r.bottom)}px`);
  };

  function open() {
    scrollY = window.scrollY;
    place();
    // The scrollbar's width, made up so the page does not change width when it goes.
    root.style.setProperty('--gt-menu-gutter', `${window.innerWidth - root.clientWidth}px`);
    root.classList.add('gt-menu-open');
    // Everything after the header, at every level up to <body>, except the panel itself.
    inerted = [];
    for (let el: HTMLElement | null = header; el && el !== document.body; el = el.parentElement) {
      for (let n = el.nextElementSibling; n; n = n.nextElementSibling) {
        if (n instanceof HTMLElement && n !== menu && !n.contains(menu) && !n.inert) {
          n.inert = true;
          inerted.push(n);
        }
      }
    }
    menu.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    opener.setAttribute('aria-label', opener.dataset.closeLabel ?? '');
    menu.focus({ preventScroll: true });
  }

  function close(returnFocus = true) {
    if (!isOpen()) return;
    menu.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    opener.setAttribute('aria-label', opener.dataset.openLabel ?? '');
    for (const n of inerted) n.inert = false;
    inerted = [];
    root.classList.remove('gt-menu-open');
    root.style.removeProperty('--gt-menu-gutter');
    if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
    if (returnFocus) opener.focus({ preventScroll: true });
  }

  opener.addEventListener('click', () => (isOpen() ? close() : open()));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a[href]')) close(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Tab cycles through the bar and the panel.
    const items = [...header.querySelectorAll<HTMLElement>(FOCUSABLE), ...menu.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === menu)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  });
  // Rotating a tablet past the phone width closes it; a smaller change moves it to the bar's new bottom.
  new ResizeObserver(() => {
    if (!isOpen()) return;
    if (header.clientWidth >= 760) close(false);
    else place();
  }).observe(header);
}

let slashBound = false;
export function bindSearchKey(): void {
  if (slashBound) return;
  slashBound = true;
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('gt-search'));
  });
}
