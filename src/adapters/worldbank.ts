// World Bank Indicators (worldbank/<indicator>.json, the API's [pagination, rows] format) and IMF
// World Economic Outlook (imf-weo/<indicator>.json, DataMapper's {values: {indicator: {country: {year: v}}}}, and
// release.json from the hand import: the release and each country's last actual year).
import { type Raw, type Series, matcher, num, put } from './core.ts';

type WbRow = { countryiso3code: string; date: string; value: number | null };

export function parseWorldBank(json: unknown): Series {
  if (!Array.isArray(json) || json.length < 2) {
    const msg = (json as { message?: { value?: string }[] }[] | undefined)?.[0]?.message?.[0]?.value;
    throw new Error(msg ?? 'unexpected World Bank response');
  }
  const m = matcher('worldbank', 'iso3');
  const out: Series = {};
  for (const r of (json[1] ?? []) as WbRow[]) {
    const id = m.match(r.countryiso3code);
    if (id) put(out, id, Number(r.date), num(r.value));
  }
  return out;
}

export const worldBank = (raw: Raw, indicator: string) => parseWorldBank(raw.json('worldbank', `${indicator}.json`));

export interface WeoRelease {
  /** "October 2026". */
  release: string;
  /** The last actual year most countries have; later years are projections. */
  lastActual: number;
  /** Each country's own last actual year, by indicator and IMF code. */
  byCountry: Record<string, Record<string, number>>;
}

/**
 * With the release file, a country's years after its own last actual year and up to the release's are left out:
 * they are the IMF's projections, and the site labels projections only by the release's year.
 */
export function parseDataMapper(json: { values?: Record<string, Record<string, Record<string, number | null>>> }, release: WeoRelease | null = null): Series {
  const m = matcher('imf-weo', 'iso3');
  const out: Series = {};
  for (const [indicator, byCountry] of Object.entries(json.values ?? {})) {
    for (const [code, years] of Object.entries(byCountry)) {
      const id = m.match(code);
      const own = release?.byCountry[indicator]?.[code];
      const projected = (y: number) => own !== undefined && y > own && y <= release!.lastActual;
      if (id) for (const [y, v] of Object.entries(years)) if (!projected(Number(y))) put(out, id, Number(y), num(v));
    }
  }
  return out;
}

/** The WEO release the files come from, or null for files without one (the API's, the samples). */
export const weoRelease = (raw: Raw): WeoRelease | null => (raw.has('imf-weo', 'release.json') ? raw.json<WeoRelease>('imf-weo', 'release.json') : null);

export const weo = (raw: Raw, indicator: string) => parseDataMapper(raw.json('imf-weo', `${indicator}.json`), weoRelease(raw));
