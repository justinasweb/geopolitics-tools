// FAOSTAT (faostat/QCL_production.json, TCL_trade.json, RFN_fertilizers.json, TM_matrix.json, the
// API's row format by ISO3 code) and the World Bank Pink Sheet food prices.
//
// Quantities are million tonnes. Use is apparent consumption, production + imports − exports (stock
// changes ignored), because FAOSTAT's food balances lag two years or more. Rice is counted in milled
// equivalent throughout: trade from FAOSTAT's own milled-equivalent total (item 30), production as
// paddy (item 27) × 0.67, so production and trade add up. (The prototype summed items 27, 30 and 31,
// which counts the same rice more than once.) Fertilisers are tonnes of nutrient; 3102 is nitrogen,
// 3103 phosphate (P2O5), 3104 potash (K2O); the prototype read 3102 as phosphate.
import { type Raw, type Series, matcher, num, put } from './core.ts';

export const CROPS = ['wheat', 'maize', 'rice', 'soy'] as const;
export const NUTRIENTS = ['nitrogen', 'phosphate', 'potash'] as const;
export type Crop = (typeof CROPS)[number];
export type Nutrient = (typeof NUTRIENTS)[number];

/** Milled rice from paddy: FAO's usual extraction rate. */
export const RICE_MILLED = 0.67;

const PRODUCTION: Record<number, { key: Crop; factor: number }> = { 15: { key: 'wheat', factor: 1 }, 56: { key: 'maize', factor: 1 }, 27: { key: 'rice', factor: RICE_MILLED }, 236: { key: 'soy', factor: 1 } };
const TRADE: Record<number, Crop> = { 15: 'wheat', 56: 'maize', 30: 'rice', 236: 'soy' };
const NUTRIENT: Record<number, Nutrient> = { 3102: 'nitrogen', 3103: 'phosphate', 3104: 'potash' };
const ELEMENT: Record<number, 'production' | 'imports' | 'exports' | 'use'> = { 5510: 'production', 5610: 'imports', 5910: 'exports', 5157: 'use' };
const TO_MT: Record<string, number> = { t: 1e-6, tonnes: 1e-6, '1000 t': 1e-3 };

type Row = Record<string, string | number | null>;
type File = { data?: Row[] };

export interface Balance {
  production: Series;
  imports: Series;
  exports: Series;
  /** Apparent consumption for crops; FAOSTAT's agricultural use for fertilisers. */
  use: Series;
  world: { production: Record<number, number> };
}

const empty = (): Balance => ({ production: {}, imports: {}, exports: {}, use: {}, world: { production: {} } });

function value(r: Row, factor = 1) {
  const v = num(r.Value);
  return v === null ? null : v * (TO_MT[String(r.Unit)] ?? 1e-6) * factor;
}

function collect(rows: Row[], pick: (code: number, el: string) => { key: string; factor: number } | null, out: Record<string, Balance>) {
  const m = matcher('faostat', 'iso3');
  for (const r of rows) {
    const el = ELEMENT[Number(r['Element Code'])];
    const hit = el && pick(Number(r['Item Code']), el);
    if (!hit) continue;
    const v = value(r, hit.factor);
    const y = Number(r.Year);
    const b = (out[hit.key] ??= empty());
    const iso = String(r['Area Code (ISO3)'] ?? '');
    if (!iso) {
      // The fetcher keeps World (with no ISO3 code) and drops other aggregates.
      if (el === 'production' && String(r.Area) === 'World' && v !== null) b.world.production[y] = v;
      continue;
    }
    const id = m.match(iso);
    if (id) put(b[el], id, y, v, true);
  }
}

export function parseFaoCrops(qcl: File, tcl: File): Record<Crop, Balance> {
  const out: Record<string, Balance> = Object.fromEntries(CROPS.map((c) => [c, empty()]));
  collect(qcl.data ?? [], (code, el) => (el === 'production' && PRODUCTION[code] ? PRODUCTION[code] : null), out);
  collect(tcl.data ?? [], (code, el) => ((el === 'imports' || el === 'exports') && TRADE[code] ? { key: TRADE[code], factor: 1 } : null), out);
  for (const b of Object.values(out)) {
    for (const [id, ys] of Object.entries(b.production)) {
      for (const [y, p] of Object.entries(ys)) {
        const i = b.imports[id]?.[Number(y)];
        const e = b.exports[id]?.[Number(y)];
        if (i !== undefined && e !== undefined) put(b.use, id, Number(y), Math.max(0, p + i - e));
      }
    }
  }
  return out as Record<Crop, Balance>;
}

export function parseFaoFertilisers(rfn: File): Record<Nutrient, Balance> {
  const out: Record<string, Balance> = Object.fromEntries(NUTRIENTS.map((n) => [n, empty()]));
  collect(rfn.data ?? [], (code) => (NUTRIENT[code] ? { key: NUTRIENT[code], factor: 1 } : null), out);
  return out as Record<Nutrient, Balance>;
}

export interface Flow { from: string; to: string; amount: number; year: number }

/** The trade matrix: importer-reported imports, exporter → importer, million tonnes. */
export function parseFaoMatrix(tm: File): Partial<Record<Crop, Flow[]>> {
  const m = matcher('faostat', 'iso3');
  const out: Partial<Record<Crop, Flow[]>> = {};
  for (const r of tm.data ?? []) {
    const key = TRADE[Number(r['Item Code'])];
    if (!key || ELEMENT[Number(r['Element Code'])] !== 'imports') continue;
    const from = m.match(String(r['Partner Country Code (ISO3)'] ?? ''));
    const to = m.match(String(r['Reporter Country Code (ISO3)'] ?? ''));
    const v = value(r);
    if (from && to && from !== to && v) (out[key] ??= []).push({ from, to, amount: v, year: Number(r.Year) });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.amount - a.amount);
  return out;
}

export function food(raw: Raw) {
  return {
    crops: parseFaoCrops(raw.json('faostat', 'QCL_production.json'), raw.json('faostat', 'TCL_trade.json')),
    fertilisers: parseFaoFertilisers(raw.json('faostat', 'RFN_fertilizers.json')),
    flows: parseFaoMatrix(raw.json('faostat', 'TM_matrix.json')),
  };
}

/** Pink Sheet monthly prices: { code: [{ date: "YYYY-MM", value }] }, US dollars (a tonne for food). */
export function parsePinkSheet(json: { columns?: Record<string, string>; data?: Record<string, string | number | null>[] }) {
  const out: Record<string, { date: string; value: number }[]> = {};
  for (const r of json.data ?? []) {
    const m = /^(\d{4})M(\d{2})$/.exec(String(r.period ?? ''));
    if (!m) continue;
    for (const col of Object.keys(json.columns ?? {})) {
      const v = num(r[col]);
      if (v !== null) (out[col] ??= []).push({ date: `${m[1]}-${m[2]}`, value: v });
    }
  }
  return out;
}
