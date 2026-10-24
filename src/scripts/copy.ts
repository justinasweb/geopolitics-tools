// Copy buttons (Copy citation, Copy link): any button with data-gt-copy copies that text, shows "Copied" for two
// seconds and announces it in the page's live region (#gt-live, in the Base layout).
import { UI_TEXT } from '../i18n/en';

let bound = false;
export function initCopy(): void {
  if (bound) return;
  bound = true;
  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-gt-copy]');
    if (!btn || btn.disabled) return;
    const label = btn.querySelector<HTMLElement>('[data-label]');
    const idle = btn.dataset.idle ?? label?.textContent ?? '';
    btn.dataset.idle = idle;
    let ok = true;
    try {
      await navigator.clipboard.writeText(btn.dataset.gtCopy ?? '');
    } catch {
      ok = false;
    }
    btn.dataset.state = ok ? 'copied' : 'failed';
    if (label) label.textContent = ok ? UI_TEXT.copied : UI_TEXT.copyFailed;
    const live = document.getElementById('gt-live');
    if (live) live.textContent = ok ? UI_TEXT.copiedLive : UI_TEXT.copyFailedLive;
    setTimeout(() => {
      delete btn.dataset.state;
      if (label) label.textContent = idle;
    }, 2200);
  });
}
