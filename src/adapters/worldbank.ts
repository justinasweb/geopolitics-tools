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

export function parseDataMapper(json: { values?: Record<string, Record<string, Record<string, number | null>>> }): Series {
  const m = matcher('imf-weo', 'iso3');
  const out: Series = {};
  for (const byCountry of Object.values(json.values ?? {})) {
    for (const [code, years] of Object.entries(byCountry)) {
      const id = m.match(code);
      if (id) for (const [y, v] of Object.entries(years)) put(out, id, Number(y), num(v));
    }
  }
  return out;
}

/** The WEO release the files come from, or null for files without one (the API's, the samples). */
export const weoRelease = (raw: Raw): WeoRelease | null => (raw.has('imf-weo', 'release.json') ? raw.json<WeoRelease>('imf-weo', 'release.json') : null);

export const weo = (raw: Raw, indicator: string) => parseDataMapper(raw.json('imf-weo', `${indicator}.json`));

/** Each place's own last actual year for one WEO indicator, by internal place id; later years are estimates or projections. */
export function weoOwnLastActual(raw: Raw, indicator: string): Record<string, number> | undefined {
  const by = weoRelease(raw)?.byCountry[indicator];
  if (!by) return undefined;
  const m = matcher('imf-weo', 'iso3');
  const out: Record<string, number> = {};
  for (const [code, y] of Object.entries(by)) {
    const id = m.match(code);
    if (id) out[id] = y;
  }
  return out;
}
