// A map view's state in the URL: ?year=2024&country=australia&bloc=nato (site map: "A country selected inside a
// map view is a view state too"). The canonical stays the path without the query, so states never compete with
// the page. Defaults are left out, so the plain view keeps its plain address. A layer over periods rather than years
// (disasters) keeps its period in ?days= instead.

export interface ViewState { year?: number; country?: string; bloc?: string }
export interface StateContext { years: number[]; latest: number; slugs: Record<string, string>; blocs: Record<string, unknown>; param?: 'year' | 'days' | 'month' }

/** A month as the URL writes it (2026-03), from its number on a months axis (year × 12 + month − 1), and back. */
export const monthCode = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
export const monthNumber = (s: string) => { const m = /^(\d{4})-(\d{2})$/.exec(s); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : NaN; };

/** The nearest year the layer has: a year the source does not cover moves to the closest one it does. */
export function nearestYear(years: number[], want: number): number {
  return years.reduce((best, y) => (Math.abs(y - want) < Math.abs(best - want) || (Math.abs(y - want) === Math.abs(best - want) && y > best) ? y : best), years[0]);
}

/** Reads ?year (or ?days), ?country (a place slug, or an id for old links) and ?bloc; unknown values are dropped. */
export function readState(search: string, ctx: StateContext): ViewState & { askedYear?: number } {
  const q = new URLSearchParams(search);
  const out: ViewState & { askedYear?: number } = {};
  const key = ctx.param ?? 'year';
  const y = key === 'month' ? monthNumber(q.get(key) ?? '') : Number(q.get(key));
  if (q.get(key) && Number.isInteger(y)) {
    out.year = nearestYear(ctx.years, y);
    if (out.year !== y) out.askedYear = y;
  }
  const c = (q.get('country') ?? '').toLowerCase();
  if (c) {
    const bySlug = Object.entries(ctx.slugs).find(([, s]) => s === c)?.[0];
    const byId = Object.keys(ctx.slugs).find((id) => id.toLowerCase() === c);
    out.country = bySlug ?? byId;
  }
  const b = (q.get('bloc') ?? '').toLowerCase();
  if (b && b in ctx.blocs) out.bloc = b;
  return out;
}

/** The URL for a state: the other query parameters are kept, defaults removed. */
export function writeState(url: URL, s: ViewState, ctx: StateContext): URL {
  const u = new URL(url.href);
  const set = (k: string, v: string | undefined) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  set(ctx.param ?? 'year', s.year !== undefined && s.year !== ctx.latest ? (ctx.param === 'month' ? monthCode(s.year) : String(s.year)) : undefined);
  set('country', s.country ? ctx.slugs[s.country] ?? s.country.toLowerCase() : undefined);
  set('bloc', s.bloc || undefined);
  return u;
}
