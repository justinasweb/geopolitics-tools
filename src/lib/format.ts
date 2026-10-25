// Numbers as the registry's formats describe them, for any locale (Intl), so no template writes
// "$1.2 bn" by hand. "–" for no value.
import type { Format } from '../data/indicators.ts';

const MINUS = '−';

export function formatValue(v: number | null | undefined, f: Format, locale = 'en'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const n = (x: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
  const sign = v < 0 ? MINUS : '';
  const a = Math.abs(v);
  switch (f.kind) {
    case 'money':
      if (a >= 1e12) return `${sign}$${n(a / 1e12, 2)} tn`;
      if (a >= 1e9) return `${sign}$${n(a / 1e9, a < 1e10 ? 1 : 0)} bn`;
      if (a >= 1e6) return `${sign}$${n(a / 1e6, 0)} m`;
      return `${sign}$${n(a, 0)}`;
    case 'count':
      if (a >= 1e9) return `${sign}${n(a / 1e9, 2)} bn`;
      if (a >= 1e6) return `${sign}${n(a / 1e6, a < 1e7 ? 1 : 0)} m`;
      return `${sign}${n(a, 0)}`;
    case 'percent':
      return `${sign}${n(a, f.digits ?? 1)}%`;
    case 'share':
      return `${sign}${n(a * 100, a < 0.1 ? 1 : 0)}%`;
    case 'number':
      return `${sign}${n(a, f.digits ?? 0)}${f.unit ? ` ${f.unit}` : ''}`;
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
