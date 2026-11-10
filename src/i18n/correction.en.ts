// English words for the correction form (src/components/CorrectionForm.astro): the "Report a correction" link in
// the footer, the dialog, its confirmation and the errors the Worker can return
// (worker/correction.ts sends short codes; ERRORS turns them into sentences).
import type { CorrectionError } from '../lib/correction';

export const CORRECTION_EMAIL = 'data@geopolitics.tools';

export const CORRECTION_TEXT = {
  link: 'Report a correction',
  title: 'Report a correction',
  close: 'Close',
  what: 'What is wrong?',
  whatHint: 'Which figure, and what you think it should be. A link to the source helps.',
  page: 'Page',
  pageHint: 'Filled in from the page you were on.',
  email: 'Your email',
  optional: 'optional',
  emailPlaceholder: 'Only if you want a reply',
  emailHint: 'Used only to reply to you. Reports are kept in the editor’s Telegram and deleted within 90 days.',
  send: 'Send report',
  sending: 'Sending…',
  orEmail: `Or email ${CORRECTION_EMAIL}`,
  /** Subject of the fallback email. */
  subject: (path: string) => `Correction: ${path}`,
  /** Read to screen readers in place of the honeypot field, which they skip. */
  honeypot: 'Leave this empty',
  doneTitle: 'Thank you, your report is in',
  doneBefore: 'We check every report against the source. If the figure is wrong we fix it and list it under',
  doneLink: 'Corrections on the Sources page',
  doneAfter: '. If you left an email, we will reply there.',
  sentLive: 'Report sent.',
};

export const CORRECTION_ERRORS: Record<CorrectionError | 'network', string> = {
  required: 'Say what is wrong before sending.',
  too_long: 'That is longer than the form takes (2,000 characters). Please shorten it, or send it by email.',
  email: 'That email address does not look complete. Check it, or leave the field empty.',
  page: 'The page link is not one of this site’s pages. Reload the page and try again.',
  too_fast: 'That was sent very quickly. Wait a moment, then send again.',
  rate_limited: 'Too many reports from your connection in the last minute. Wait a minute, then send again.',
  too_large: 'That report is too large to send. Please shorten it, or send it by email.',
  bad_request: 'The report could not be read. Reload the page and try again, or send it by email.',
  origin: 'Reports can only be sent from this site’s own pages.',
  method: 'The report could not be sent. Reload the page and try again, or send it by email.',
  unavailable: 'Reports cannot be sent from here right now. Please send it by email instead.',
  send_failed: 'The report could not be delivered. Please try again in a moment, or send it by email.',
  network: 'The report could not be sent: your connection may be down. Try again, or send it by email.',
};

/** The fallback email link, with the page in the subject. */
export const correctionMailto = (path: string) => `mailto:${CORRECTION_EMAIL}?subject=${encodeURIComponent(CORRECTION_TEXT.subject(path))}`;
