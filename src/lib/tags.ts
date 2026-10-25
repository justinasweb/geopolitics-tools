// The status tags' glyphs, shared by the StatusTag component and by HTML the map engine builds in the browser
// (tooltips and the country panel), so a tag looks the same wherever it is drawn.
import { STATUS_TEXT } from '../i18n/en.ts';

export type Status = 'estimate' | 'projection' | 'preliminary' | 'notyet' | 'sample';

export const GLYPH: Record<Status, string> = {
  estimate: '<path d="M1.5 5c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0M1.5 8.5c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  projection: '<path d="M1 6h6.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.5"/><path d="M7 3l3.5 3L7 9z" fill="currentColor"/>',
  preliminary: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor"/>',
  notyet: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6"/>',
  sample: '<rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.4"/>',
};

/** A small status tag as HTML, for markup built outside Astro components. */
export const tagHtml = (s: Status) =>
  `<span class="gt-tag gt-tag--${s} gt-tag--sm"><svg viewBox="0 0 12 12" aria-hidden="true">${GLYPH[s]}</svg>${STATUS_TEXT[s]}</span>`;
