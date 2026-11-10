// Numbers as the registry's formats describe them, for any locale (Intl), so no template writes
// "$1.2 bn" by hand. "–" for no value.
import type { Format } from '../data/indicators.ts';

const MINUS = '−';
/** Any total under a million dollars, for money formats with `millions`. */
export const MONEY_SMALL = 'under $1 m';

export function formatValue(v: number | null | undefined, f: Format, locale = 'en'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const n = (x: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
  const a = Math.abs(v);
  // A small negative total (a net outflow) keeps its sign, in tenths of a million.
  const text = f.kind === 'money' && f.millions && v < 0 && a < 1e6 ? (a < 5e4 ? '$0' : `$${n(a / 1e6, 1)} m`) : formatAbs(a, f, n, locale);
  // A value that rounds to zero has no sign ("0%", not "−0%"; "<0.1%").
  return v < 0 && /[1-9]/.test(text) && !text.startsWith('<') ? `${MINUS}${text}` : text;
}

/** A plain number's decimals: its own, or for a `small` one below 1, those two significant figures need. */
function numberDigits(a: number, f: Extract<Format, { kind: 'number' }>): number {
  const d = f.digits ?? 0;
  return f.small && a > 0 && a < 1 ? Math.max(d, 1 - Math.floor(Math.log10(a))) : d;
}

/** A value's size as formatValue writes it, without its sign. Units are picked after rounding. */
function formatAbs(a: number, f: Format, n: (x: number, digits: number) => string, locale: string): string {
  switch (f.kind) {
    case 'money':
      if (a >= 999.5e9) return `$${n(a / 1e12, 2)} tn`;
      if (a >= 999.5e6) return `$${n(a / 1e9, a < 9.95e9 ? 1 : 0)} bn`;
      if (a >= 1e6) return `$${n(a / 1e6, 0)} m`;
      // Small totals are not written to the dollar: a source's figures are not that precise.
      return f.millions && a > 0 ? MONEY_SMALL : `$${n(a, 0)}`;
    case 'count':
      if (a >= 999.995e6) return `${n(a / 1e9, 2)} bn`;
      if (a >= 1e6) return `${n(a / 1e6, a < 9.95e6 ? 1 : 0)} m`;
      return n(a, 0);
    case 'percent':
      return `${n(a, f.digits ?? 1)}%`;
    case 'share':
      return formatShare(a, locale);
    case 'number':
      return `${n(a, numberDigits(a, f))}${f.unit ? ` ${f.unit}` : ''}`;
    case 'mt':
      if (a >= 100) return `${n(a, 0)} Mt`;
      if (a >= 1) return `${n(a, 1)} Mt`;
      return `${n(a >= 0.001 ? Math.round(a * 1000) * 1000 : Math.round(a * 1e6), 0)} t`;
  }
}

/**
 * A legend's band edges as text, together: each to at least two significant figures unless fewer write it exactly
 * ("2,000", "0.5 Mt"), never as zero ("under 0.02 Mt", not "under 0.0 Mt"), and with more decimals until neighbouring
 * edges read differently. Units as formatValue picks them, but an edge in Mt under 0.01 Mt is written in tonnes to two
 * significant figures ("under 790 t", "3,800 t–0.087 Mt").
 */
export function edgeTexts(edges: number[], f: Format, locale = 'en'): string[] {
  const n = (x: number, d: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
  // An edge's scaled value, its unit, and the decimals formatValue would give it.
  const parts = (a: number): [number, string, number] | null => {
    switch (f.kind) {
      case 'money':
        if (a >= 999.5e9) return [a / 1e12, ' tn', 0];
        if (a >= 999.5e6) return [a / 1e9, ' bn', 0];
        return a >= 1e6 ? [a / 1e6, ' m', 0] : null;
      case 'count':
        if (a >= 999.995e6) return [a / 1e9, ' bn', 0];
        return a >= 1e6 ? [a / 1e6, ' m', 0] : [a, '', 0];
      case 'percent': return [a, '%', f.digits ?? 1];
      case 'share': return [a * 100, '%', 0];
      case 'number': return [a, f.unit ? ` ${f.unit}` : '', f.digits ?? 0];
      case 'mt': return [a, ' Mt', 0];
    }
  };
  const inMt = f.kind === 'mt' || (f.kind === 'number' && f.unit === 'Mt');
  const text = (v: number, extra: number): string => {
    const a = Math.abs(v);
    if (inMt && a > 0 && a < 0.01) {
      const t = Number((a * 1e6).toPrecision(2 + extra));
      return `${v < 0 ? MINUS : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(t)} t`;
    }
    const p = parts(a);
    if (!p || a === 0) return formatValue(v, f, locale);
    const [x, unit, base] = p;
    // Decimals for two significant figures, unless fewer already write the value exactly.
    let d = base;
    while (d < 8 && (Number(n(x, d).replace(/,/g, '')) === 0 || (Math.abs(Number(n(x, d).replace(/,/g, '')) - x) > 1e-9 * x && Math.floor(Math.log10(x)) + 1 + d < 2))) d++;
    const body = `${f.kind === 'money' ? '$' : ''}${n(x, d + extra)}${unit}`;
    return v < 0 ? `${MINUS}${body}` : body;
  };
  for (let extra = 0; extra < 6; extra++) {
    const out = edges.map((v) => text(v, extra));
    if (new Set(out).size === out.length) return out;
  }
  return edges.map((v) => text(v, 6));
}

/** "21 Oct 2026": the date style of source lines and key figures, read in UTC so a build anywhere gives the same
 *  text. Day, short month, year in that order; en-US month names, because en-GB now writes "Sept". */
export function formatDate(d: string | Date, locale = 'en-US'): string {
  const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .formatToParts(typeof d === 'string' ? new Date(d) : d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}

/** A date as precise as its source gives it: "2023" for YYYY, "Jun 2023" for YYYY-MM, else formatDate ("6 Dec 2024"). */
export function formatPartialDate(d: string, locale = 'en-US'): string {
  if (/^\d{4}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return `${new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${d}-01`))} ${d.slice(0, 4)}`;
  return formatDate(d, locale);
}

/**
 * A value split into the number and the words after it, for key figures that set the unit smaller:
 * { num: 'US$1.44', unit: 'trillion' }, { num: '285', unit: 'million' }, { num: '0.8', unit: '% of GDP' }.
 * `unit` is the indicator's unit text for percentages and plain numbers. Each value picks its own scale.
 */
export function formatParts(v: number, f: Format, unit = '', locale = 'en'): { num: string; unit: string } {
  const n = (x: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
  const sign = v < 0 ? MINUS : '';
  const a = Math.abs(v);
  const scaled = (prefix: string) => {
    if (a >= 999.5e9) return { num: `${sign}${prefix}${n(a / 1e12, 2)}`, unit: 'trillion' };
    if (a >= 999.5e6) return { num: `${sign}${prefix}${n(a / 1e9, a < 9.995e9 ? 2 : a < 99.95e9 ? 1 : 0)}`, unit: 'billion' };
    if (a >= 1e6) return { num: `${sign}${prefix}${n(a / 1e6, a < 9.95e6 ? 1 : 0)}`, unit: 'million' };
    return { num: `${sign}${prefix}${n(a, 0)}`, unit: '' };
  };
  switch (f.kind) {
    case 'money': return scaled('US$');
    case 'count': return scaled('');
    case 'percent': return { num: `${sign}${n(a, f.digits ?? 1)}`, unit: unit.startsWith('%') ? unit : '%' };
    case 'share': return { num: formatShare(v, locale).replace('%', ''), unit: '%' };
    case 'number': return { num: `${sign}${n(a, numberDigits(a, f))}`, unit: f.unit ?? '' };
    case 'mt': return a >= 1 ? { num: `${sign}${n(a, a >= 100 ? 0 : 1)}`, unit: 'Mt' } : { num: formatValue(v, f).replace(' t', ''), unit: 't' };
  }
}

/**
 * A share (0.32) as a percentage rounded for reading, the one rule for every share on the site: whole percent from
 * 10%, one decimal below, "<0.1%" for a share above zero that would read as zero ("32%", "9.7%", "4%", "<0.1%"), and
 * one decimal for a share under 100% that would read as 100% ("99.7%").
 * Pass the share as the source gives it: a share rounded before this (0.495 for 0.49498) can read one point apart.
 */
export function formatShare(s: number, locale = 'en'): string {
  const p = Math.abs(s) * 100;
  if (p > 0 && p < 0.05) return '<0.1%';
  const text = `${new Intl.NumberFormat(locale, { maximumFractionDigits: p >= 9.95 && (p < 99.5 || p >= 100) ? 0 : 1 }).format(p)}%`;
  return s < 0 && /[1-9]/.test(text) ? `${MINUS}${text}` : text;
}

/** Search engines show about this many characters of a meta description. */
export const DESCRIPTION_MAX = 160;

/** Text cut at the last whole word that fits in `max` characters, ending "…"; unchanged when it fits. */
export function cutWords(s: string, max = DESCRIPTION_MAX): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const end = head.lastIndexOf(' ');
  return `${(end > 0 ? head.slice(0, end) : head.slice(0, max - 1)).replace(/[\s,;:–(]+$/, '')}…`;
}

/** Whole sentences, in order, for as long as they fit in `max` characters (one that does not fit is skipped); the
 *  first is cut at a whole word when it alone is too long. */
export function fitSentences(sentences: string[], max = DESCRIPTION_MAX): string {
  let out = cutWords(sentences[0] ?? '', max);
  for (const s of sentences.slice(1)) if (out.length + 1 + s.length <= max) out = `${out} ${s}`;
  return out;
}
