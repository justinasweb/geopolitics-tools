// The correction form's behaviour (src/components/CorrectionForm.astro). Any link with data-gt-corr (CorrectionLink:
// source lines and the footer) opens the dialog instead of the email client; with modifier keys, or on a page without
// the dialog, the link stays an email link. The dialog is a native modal <dialog>: focus moves into it and stays there,
// Esc and the Close button close it, and focus goes back to the link that opened it.
import { CORRECTION_ERRORS, CORRECTION_TEXT as T, correctionMailto } from '../i18n/correction.en';
import { CORRECTION_PATH, type CorrectionError } from '../lib/correction';

type Field = 'message' | 'email';
interface Answer { ok: boolean; error?: CorrectionError; field?: string }

let bound = false;
export function initCorrection(): void {
  if (bound) return;
  bound = true;
  const dialog = document.querySelector<HTMLDialogElement>('dialog[data-gt-corr-dialog]');
  if (!dialog) return;
  const form = dialog.querySelector<HTMLFormElement>('[data-gt-corr-form]')!;
  const done = dialog.querySelector<HTMLElement>('[data-gt-corr-done]')!;
  const send = form.querySelector<HTMLButtonElement>('[data-gt-corr-send]')!;
  const field = (name: Field) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-gt-corr-field="${name}"]`)!;
  const err = (name: Field | 'form') => form.querySelector<HTMLElement>(`[data-gt-corr-err="${name}"]`)!;
  let opener: HTMLElement | null = null;
  let openedAt = 0;
  let source = '';

  for (const a of document.querySelectorAll('a[data-gt-corr]')) a.setAttribute('aria-haspopup', 'dialog');

  const clearErrors = () => {
    for (const name of ['message', 'email', 'form'] as const) err(name).textContent = '';
    for (const name of ['message', 'email'] as const) field(name).removeAttribute('aria-invalid');
  };
  const showError = (code: CorrectionError | 'network', name?: string) => {
    const at: Field | 'form' = name === 'message' || name === 'email' ? name : 'form';
    err(at).textContent = CORRECTION_ERRORS[code];
    if (at !== 'form') {
      field(at).setAttribute('aria-invalid', 'true');
      field(at).focus();
    }
  };
  const path = () => location.pathname + location.search;

  const open = (from: HTMLElement) => {
    opener = from;
    source = from.dataset.gtCorrSource ?? '';
    form.hidden = false;
    done.hidden = true;
    clearErrors();
    form.querySelector<HTMLInputElement>('[data-gt-corr-page]')!.value = `geopolitics.tools${path()}`;
    form.querySelector<HTMLAnchorElement>('[data-gt-corr-mail]')!.href = correctionMailto(path());
    openedAt = Date.now();
    dialog.showModal();
    field('message').focus();
  };

  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-gt-corr]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(a);
  });
  for (const b of dialog.querySelectorAll('[data-gt-corr-close]')) b.addEventListener('click', () => dialog.close());
  // A click on the backdrop (the dialog element itself, outside its content) closes it.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    opener?.focus();
    opener = null;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const message = field('message').value.trim();
    if (!message) return showError('required', 'message');
    if (!field('email').checkValidity()) return showError('email', 'email');
    const data = new FormData(form);
    send.disabled = true;
    send.textContent = T.sending;
    let answer: Answer;
    try {
      const res = await fetch(CORRECTION_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          page: path(),
          email: field('email').value.trim(),
          source,
          website: data.get('website') ?? '',
          elapsed: Date.now() - openedAt,
        }),
      });
      answer = await res.json().catch(() => ({ ok: false, error: 'send_failed' as const }));
    } catch {
      answer = { ok: false };
    } finally {
      send.disabled = false;
      send.textContent = T.send;
    }
    if (!answer.ok) return showError(answer.error && answer.error in CORRECTION_ERRORS ? answer.error : 'network', answer.field);
    form.reset();
    form.hidden = true;
    done.hidden = false;
    done.querySelector<HTMLElement>('h2')!.focus();
    const live = document.getElementById('gt-live');
    if (live) live.textContent = T.sentLive;
  });
}
