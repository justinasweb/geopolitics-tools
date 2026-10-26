// U.S. Energy Information Administration (eia/oil_international.json, gas_international.json, oil_spot_prices.json,
// from pipeline/sources/eia.ts; the prototype's samples have the same names and format). EIA names countries by
// ISO3 code. Units as EIA reports them: oil in thousand barrels a day (reserves in billion barrels), gas in billion
// cubic metres a year (reserves in trillion cubic metres); rows in cubic feet are converted.
//
// Oil's net trade uses total petroleum and other liquids (crude plus natural gas liquids and other liquids), not
// crude alone: the United States buys crude but is a net exporter of petroleum overall.
import { type Raw, type Series, matcher, num, put } from './core.ts';

type Row = Record<string, string | number | null>;
interface File { response?: { data?: Row[] } }

export interface Fuel {
  production: Series;
  consumption: Series;
  reserves: Series;
  /** Output minus use: total liquids minus consumption for oil, dry gas production minus consumption for gas. */
  net: Series;
}
export interface Oil extends Fuel { liquids: Series }
export interface Prices { brent: { date: string; value: number }[]; wti: { date: string; value: number }[] }

const BCF_TO_BCM = 0.0283168;
const metric = (v: number, unit: unknown) => (/^(BCF|TCF)$/i.test(String(unit)) ? v * BCF_TO_BCM : v);

function series(file: File, pick: (r: Row) => keyof Oil | null): Record<string, Series> {
  const m = matcher('eia', 'iso3');
  const out: Record<string, Series> = {};
  for (const r of file.response?.data ?? []) {
    const k = pick(r);
    const v = num(r.value);
    if (!k || v === null) continue;
    const id = m.match(String(r.countryRegionId ?? ''));
    if (!id) continue;
    put((out[k] ??= {}), id, Number(r.period), metric(v, r.unit));
  }
  return out;
}

function minus(a: Series, b: Series): Series {
  const out: Series = {};
  for (const [id, ys] of Object.entries(a)) for (const [y, v] of Object.entries(ys)) {
    const w = b[id]?.[Number(y)];
    if (w !== undefined) put(out, id, Number(y), v - w);
  }
  return out;
}

const ACT: Record<string, 'production' | 'consumption' | 'reserves'> = { Production: 'production', Consumption: 'consumption', Reserves: 'reserves' };

export function parseOil(file: File): Oil {
  const s = series(file, (r) => {
    const a = ACT[String(r.activityName)];
    if (!a) return null;
    // Production comes twice: crude including lease condensate, and all liquids (product 53).
    if (a === 'production' && (String(r.productId) === '53' || /^total petroleum/i.test(String(r.productName)))) return 'liquids';
    return a;
  });
  const o = { production: s.production ?? {}, liquids: s.liquids ?? {}, consumption: s.consumption ?? {}, reserves: s.reserves ?? {} };
  return { ...o, net: minus(o.liquids, o.consumption) };
}

export function parseGas(file: File): Fuel {
  const s = series(file, (r) => (/natural gas/i.test(String(r.productName)) ? ACT[String(r.activityName)] ?? null : null));
  const g = { production: s.production ?? {}, consumption: s.consumption ?? {}, reserves: s.reserves ?? {} };
  return { ...g, net: minus(g.production, g.consumption) };
}

export function parsePrices(file: File): Prices {
  const out: Prices = { brent: [], wti: [] };
  const key: Record<string, keyof Prices> = { RBRTE: 'brent', RWTC: 'wti' };
  for (const r of file.response?.data ?? []) {
    const k = key[String(r.series)];
    const v = num(r.value);
    if (k && v !== null) out[k].push({ date: String(r.period), value: v });
  }
  for (const k of Object.keys(out) as (keyof Prices)[]) out[k].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export const oil = (raw: Raw) => parseOil(raw.json<File>('eia', 'oil_international.json'));
export const gas = (raw: Raw) => parseGas(raw.json<File>('eia', 'gas_international.json'));
export const oilPrices = (raw: Raw) => parsePrices(raw.json<File>('eia', 'oil_spot_prices.json'));
