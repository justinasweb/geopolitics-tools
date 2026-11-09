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
  const text = f.kind === 'money' && f.millions && v < 0 && a < 1e6 ? (a < 5e4 ? '$0' : `$${n(a / 1e6, 1)} m`) : formatAbs(a, f, n);
  // A value that rounds to zero has no sign ("0%", not "−0%").
  return v < 0 && /[1-9]/.test(text) ? `${MINUS}${text}` : text;
}

/** A plain number's decimals: its own, or for a `small` one below 1, those two significant figures need. */
function numberDigits(a: number, f: Extract<Format, { kind: 'number' }>): number {
  const d = f.digits ?? 0;
  return f.small && a > 0 && a < 1 ? Math.max(d, 1 - Math.floor(Math.log10(a))) : d;
}

/** A value's size as formatValue writes it, without its sign. Units are picked after rounding. */
function formatAbs(a: number, f: Format, n: (x: number, digits: number) => string): string {
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
      return `${n(a * 100, a < 0.1 ? 1 : 0)}%`;
    case 'number':
      return `${n(a, numberDigits(a, f))}${f.unit ? ` ${f.unit}` : ''}`;
    case 'mt':
      if (a >= 100) return `${n(a, 0)} Mt`;
      if (a >= 1) return `${n(a, 1)} Mt`;
      return `${n(a >= 0.001 ? Math.round(a * 1000) * 1000 : Math.round(a * 1e6), 0)} t`;
  }
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
 * `unit` is the indicator's unit text for percentages and plain numbers. `scaleOf`, for figures shown side by side,
 * is the value whose size picks the scale (the larger of the row), so both read in billions: "0.34" and "1.41".
 */
export function formatParts(v: number, f: Format, unit = '', locale = 'en', scaleOf?: number): { num: string; unit: string } {
  const n = (x: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
  const sign = v < 0 ? MINUS : '';
  const a = Math.abs(v);
  const s = scaleOf === undefined ? a : Math.max(a, Math.abs(scaleOf));
  const scaled = (prefix: string) => {
    if (s >= 999.5e9) return { num: `${sign}${prefix}${n(a / 1e12, 2)}`, unit: 'trillion' };
    if (s >= 999.5e6) return { num: `${sign}${prefix}${n(a / 1e9, a < 9.995e9 ? 2 : a < 99.95e9 ? 1 : 0)}`, unit: 'billion' };
    if (s >= 1e6) return { num: `${sign}${prefix}${n(a / 1e6, a < 9.95e6 ? 1 : 0)}`, unit: 'million' };
    return { num: `${sign}${prefix}${n(a, 0)}`, unit: '' };
  };
  switch (f.kind) {
    case 'money': return scaled('US$');
    case 'count': return scaled('');
    case 'percent': return { num: `${sign}${n(a, f.digits ?? 1)}`, unit: unit.startsWith('%') ? unit : '%' };
    case 'share': return { num: `${sign}${n(a * 100, a < 0.1 ? 1 : 0)}`, unit: '%' };
    case 'number': return { num: `${sign}${n(a, numberDigits(a, f))}`, unit: f.unit ?? '' };
    case 'mt': return a >= 1 ? { num: `${sign}${n(a, a >= 100 ? 0 : 1)}`, unit: 'Mt' } : { num: formatValue(v, f).replace(' t', ''), unit: 't' };
  }
}

/** A share (0.32) as a percentage rounded for reading: "32%", "0.4%". */
export function formatShare(s: number, locale = 'en'): string {
  const p = s * 100;
  const digits = p < 1 && p > 0 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(p)}%`;
}
