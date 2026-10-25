// FAOSTAT (faostat/QCL_production.json, TCL_trade.json, RFN_fertilizers.json, TM_matrix.json, the
// API's row format by ISO3 code) and the World Bank Pink Sheet food prices.
//
// Quantities are million tonnes. Use is apparent consumption, production + imports − exports (stock
// changes ignored), because FAOSTAT's food balances lag two years or more. Rice is counted in milled
// equivalent throughout: trade from FAOSTAT's own milled-equivalent total (item 30), production as
// paddy (item 27) × 0.67, so production and trade add up. (The prototype summed items 27, 30 and 31,
// which counts the same rice more than once.) Fertilisers are tonnes of nutrient; 3102 is nitrogen,
// 3103 phosphate (P2O5), 3104 potash (K2O); the prototype read 3102 as phosphate.
//
// Snapshots fetched before the fetcher took the API's row format hold FAOSTAT's own CSV columns instead
// (faostat/crops.csv, trade.csv, fertilizers.csv, matrix.csv), with places by UN M49 code and FAO's
// regional totals left in; `food` reads whichever the snapshot has, so both give the same figures.
import { parseCsv } from '../../pipeline/lib/csv.ts';
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
/** Where a row's figure belongs: a place id, 'world', or null to skip it. */
type AreaOf = (r: Row) => string | null;
const WORLD = 'world';

/** The API row format: ISO3 codes, World with none, other totals already dropped. */
function isoArea(r: Row): string | null {
  const iso = String(r['Area Code (ISO3)'] ?? '');
  if (!iso) return String(r.Area) === 'World' ? WORLD : null;
  return matcher('faostat', 'iso3').match(iso);
}

/** FAOSTAT's CSV columns: M49 codes ('004), FAO's own codes 5000 and up for World and regional totals. */
const m49 = (v: unknown) => String(v ?? '').trim().replace(/^'/, '');
function m49Area(r: Row): string | null {
  const fao = Number(r['Area Code']);
  if (fao === 5000) return WORLD;
  const code = m49(r['Area Code (M49)']);
  // 351 is FAO's "China", mainland plus Hong Kong, Macao and Taiwan, each also listed on its own.
  if (fao >= 5000 || fao === 351 || !code || code.includes('.')) return null;
  return matcher('faostat', 'm49').match(code);
}

const ELEMENT_NAMES: Record<string, number> = { Production: 5510, 'Import quantity': 5610, 'Export quantity': 5910, 'Agricultural Use': 5157 };

/** A CSV file as rows of its own columns, with an element code where the file gives only the name (the matrix). */
function csvFile(text: string): File {
  const [head, ...rest] = parseCsv(text);
  return {
    data: rest.filter((r) => r.length === head.length).map((r) => {
      const row: Row = Object.fromEntries(head.map((h, i) => [h, r[i]]));
      row['Element Code'] ??= ELEMENT_NAMES[String(row.Element)] ?? null;
      return row;
    }),
  };
}

export interface Balance {
  production: Series;
  imports: Series;
  exports: Series;
  /** Apparent consumption for crops; FAOSTAT's agricultural use for fertilisers. */
  use: Series;
  world: { production: Record<number, number> };
  /** Figures FAOSTAT flags as its own estimate or imputation (flags E and I), by element: 1 by place and year. */
  estimated: Record<'production' | 'imports' | 'exports' | 'use', Series>;
}

const empty = (): Balance => ({ production: {}, imports: {}, exports: {}, use: {}, world: { production: {} }, estimated: { production: {}, imports: {}, exports: {}, use: {} } });
const ESTIMATED = new Set(['E', 'I']);

function value(r: Row, factor = 1) {
  const v = num(r.Value);
  return v === null ? null : v * (TO_MT[String(r.Unit)] ?? 1e-6) * factor;
}

function collect(rows: Row[], pick: (code: number, el: string) => { key: string; factor: number } | null, out: Record<string, Balance>, areaOf: AreaOf) {
  for (const r of rows) {
    const el = ELEMENT[Number(r['Element Code'])];
    const hit = el && pick(Number(r['Item Code']), el);
    if (!hit) continue;
    const v = value(r, hit.factor);
    const y = Number(r.Year);
    const b = (out[hit.key] ??= empty());
    const id = areaOf(r);
    if (id === WORLD) {
      if (el === 'production' && v !== null) b.world.production[y] = v;
    } else if (id) {
      put(b[el], id, y, v, true);
      if (v !== null && ESTIMATED.has(String(r.Flag ?? ''))) put(b.estimated[el], id, y, 1);
    }
  }
}

export function parseFaoCrops(qcl: File, tcl: File, areaOf: AreaOf = isoArea): Record<Crop, Balance> {
  const out: Record<string, Balance> = Object.fromEntries(CROPS.map((c) => [c, empty()]));
  collect(qcl.data ?? [], (code, el) => (el === 'production' && PRODUCTION[code] ? PRODUCTION[code] : null), out, areaOf);
  collect(tcl.data ?? [], (code, el) => ((el === 'imports' || el === 'exports') && TRADE[code] ? { key: TRADE[code], factor: 1 } : null), out, areaOf);
  // A place FAOSTAT never lists for production (no wheat grown in Singapore) produces none; one listed in other
  // years but not this one has not reported yet, so it gets no use that year. FAOSTAT leaves out years with no
  // exports rather than writing zero, so a missing export figure counts as none.
  const at = (s: Series, id: string, y: number) => (s[id] ? s[id][y] : 0);
  const out_ = (s: Series, id: string, y: number) => s[id]?.[y] ?? 0;
  for (const b of Object.values(out)) {
    const ids = new Set([...Object.keys(b.production), ...Object.keys(b.imports)]);
    const years = new Set([b.production, b.imports, b.exports].flatMap((s) => Object.values(s).flatMap((ys) => Object.keys(ys).map(Number))));
    for (const id of ids) {
      for (const y of years) {
        const [p, i, e] = [at(b.production, id, y), at(b.imports, id, y), out_(b.exports, id, y)];
        if (p !== undefined && i !== undefined && e !== undefined && p + i > 0) {
          put(b.use, id, y, Math.max(0, p + i - e));
          if ((['production', 'imports', 'exports'] as const).some((k) => b.estimated[k][id]?.[y])) put(b.estimated.use, id, y, 1);
        }
      }
    }
  }
  return out as Record<Crop, Balance>;
}

export function parseFaoFertilisers(rfn: File, areaOf: AreaOf = isoArea): Record<Nutrient, Balance> {
  const out: Record<string, Balance> = Object.fromEntries(NUTRIENTS.map((n) => [n, empty()]));
  collect(rfn.data ?? [], (code) => (NUTRIENT[code] ? { key: NUTRIENT[code], factor: 1 } : null), out, areaOf);
  return out as Record<Nutrient, Balance>;
}

export interface Flow { from: string; to: string; amount: number; year: number }

/** The trade matrix: importer-reported imports, exporter → importer, million tonnes. */
export function parseFaoMatrix(tm: File, codes: 'iso3' | 'm49' = 'iso3'): Partial<Record<Crop, Flow[]>> {
  const m = matcher('faostat', codes);
  const code = (r: Row, who: 'Partner' | 'Reporter') => (codes === 'iso3' ? String(r[`${who} Country Code (ISO3)`] ?? '') : m49(r[`${who} Country Code (M49)`]));
  const out: Partial<Record<Crop, Flow[]>> = {};
  for (const r of tm.data ?? []) {
    const key = TRADE[Number(r['Item Code'])];
    if (!key || ELEMENT[Number(r['Element Code'])] !== 'imports') continue;
    // The CSV's remainder rows ("Other partners (3)") have no partner code.
    const p = code(r, 'Partner');
    if (!p) continue;
    const from = m.match(p);
    const to = m.match(code(r, 'Reporter'));
    const v = value(r);
    if (from && to && from !== to && v) (out[key] ??= []).push({ from, to, amount: v, year: Number(r.Year) });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.amount - a.amount);
  return out;
}

export function food(raw: Raw) {
  if (!raw.has('faostat', 'QCL_production.json') && raw.has('faostat', 'crops.csv')) {
    const csv = (f: string) => csvFile(raw.text('faostat', f));
    return {
      crops: parseFaoCrops(csv('crops.csv'), csv('trade.csv'), m49Area),
      fertilisers: parseFaoFertilisers(csv('fertilizers.csv'), m49Area),
      flows: parseFaoMatrix(csv('matrix.csv'), 'm49'),
    };
  }
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
