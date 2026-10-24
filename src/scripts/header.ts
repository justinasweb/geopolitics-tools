// Header behaviour: one mega-menu panel open at a time (Esc or a click elsewhere closes it and returns focus to
// its button), and the phone menu dialog. The search buttons and the "/" key dispatch `gt-search` on document;
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
      if (p) p.hidden = open;
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

  const dialog = header.querySelector<HTMLDialogElement>('dialog.gt-menudialog');
  const opener = header.querySelector<HTMLButtonElement>('[data-gt-menu-open]');
  if (dialog && opener) {
    opener.addEventListener('click', () => {
      dialog.showModal();
      opener.setAttribute('aria-expanded', 'true');
    });
    dialog.querySelector('[data-gt-menu-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      opener.setAttribute('aria-expanded', 'false');
      opener.focus();
    });
  }

  for (const b of header.querySelectorAll('[data-gt-search]')) {
    b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('gt-search')));
  }
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
