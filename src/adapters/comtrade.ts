// UN Comtrade (comtrade/<group>-<year>.json from pipeline/sources/comtrade.ts; the prototype's samples are
// comtrade/crude_flows_2024.json and the like, in the same row format): every file in the folder is read and its
// rows sorted by commodity code, so the adapter does not depend on file names. Places are matched by M49 code
// (Comtrade's own codes for the United States, France, India, Switzerland, Norway and Taiwan are in codes.csv), or
// by ISO3 in the samples, which carry no codes. World and "not elsewhere specified" partners drop out.
//
// Flows are as importers report them: from = the partner (exporter), to = the reporter (importer). Quantities are
// net weight in kilograms, converted with rules of thumb that are stated on the pages:
//   crude oil  about 7.33 barrels a tonne
//   pipeline gas  about 0.75 million tonnes per billion cubic metres; LNG  about 1,360 m³ of gas per tonne
//   fertilisers  million tonnes of product (not of nutrient, as FAOSTAT counts them)
// Gas is the exception: several reporters give it by volume only (the United States and Canada in cubic metres,
// Mexico in litres), and the net weight Comtrade estimates for them is far off (Canada → United States, 2024:
// 12.3 Mt estimated, about 16 bcm, against 86.1 bcm reported). A gas row's own volume is used when its weight is
// an estimate or unusable; an estimated weight alone is never used, so the flow takes the exporter's report or
// drops out. LNG by volume is in cubic metres of liquid (about 612 m³ of gas each) or of gas; which, by its size
// against the estimated weight.
import { type Raw, matcher, num } from './core.ts';

export interface TradeRow {
  year: number; reporter: string; partner: string; flow: 'M' | 'X'; cmd: string; kg: number | null; usd: number | null;
  /** Its quantity was dropped as not in kg (dropNonMass). */
  dropped?: true;
  /** The net weight is Comtrade's estimate, not the reporter's. */
  kgEst?: true;
  /** The reporter's own volume, in cubic metres (gas), and that volume per kg of the net weight before any drop. */
  m3?: number;
  m3PerKg?: number;
  /** No quantity of the reporter's own: the weight is Comtrade's estimate and there is no volume. Known only for rows
   *  that carry the second quantity (files fetched from 10 Nov 2026). */
  noQty?: true;
  /** The partner is Comtrade's 490, "Other Asia, not elsewhere specified": Taiwan, or buyers an exporter does not name. */
  asiaNes?: true;
}
/** `mirror`: the amount is the exporter's report of the flow, the importer's quantity being unusable or its row missing. */
export interface Flow { from: string; to: string; amount: number; year: number; mirror?: true }
export interface GasFlow extends Flow { kind: 'pipe' | 'lng' }

type Row = Record<string, unknown>;

export const BARRELS_PER_TONNE = 7.33;
export const KG_PER_BCM_PIPE = 0.75e9;
export const M3_PER_TONNE_LNG = 1360;
/** Cubic metres of gas per cubic metre of LNG: about 0.45 t a cubic metre at 1,360 m³ a tonne. */
export const GAS_PER_M3_LNG = 612;
/** Comtrade's volume units (QuantityUnits.json) in cubic metres: m³, thousand m³, litres. */
const M3_PER_UNIT: Record<string, number> = { 12: 1, 17: 1000, 7: 0.001 };
/** HS codes per commodity the site shows. */
export const CODES = {
  crude: ['2709'], pipe: ['271121'], lng: ['271111'], potash: ['3104'], phosphate: ['3103', '310530', '310540'],
  chips: ['8542'], equipment: ['8486'], total: ['TOTAL'],
} as const;
export type Commodity = keyof typeof CODES;

export function parseComtrade(files: { data?: Row[] }[]): TradeRow[] {
  const byCode = matcher('comtrade', 'm49');
  const byIso = matcher('comtrade', 'iso3');
  const id = (code: unknown, iso: unknown) => {
    if (code !== undefined && code !== null && code !== '') return byCode.match(String(code));
    const s = String(iso ?? '');
    return !s || s === 'W00' || /^[A-Z]\d\d$/.test(s) ? null : byIso.match(s);
  };
  const out: TradeRow[] = [];
  for (const f of files) {
    for (const r of f.data ?? []) {
      const flow = r.flowCode === 'X' ? 'X' : r.flowCode === 'M' ? 'M' : null;
      if (!flow) continue;
      const reporter = id(r.reporterCode, r.reporterISO);
      const partner = id(r.partnerCode, r.partnerISO);
      if (!reporter || !partner || reporter === partner) continue;
      const row: TradeRow = { year: Number(r.period), reporter, partner, flow, cmd: String(r.cmdCode), kg: num(r.netWgt), usd: num(r.primaryValue) };
      if (r.isNetWgtEstimated === true) row.kgEst = true;
      if (String(r.partnerCode) === '490') row.asiaNes = true;
      const m3 = volume(r);
      if (m3 !== null) {
        row.m3 = m3;
        if (row.kg) row.m3PerKg = m3 / row.kg;
      } else if (row.kgEst && 'altQtyUnitCode' in r) row.noQty = true;
      out.push(row);
    }
  }
  dropNonMass(out);
  return out;
}

/** The reporter's own volume in m³: the first quantity, else the second, in a volume unit and not estimated. */
function volume(r: Row): number | null {
  for (const [unit, qty, est] of [[r.qtyUnitCode, r.qty, r.isQtyEstimated], [r.altQtyUnitCode, r.altQty, r.isAltQtyEstimated]]) {
    const k = M3_PER_UNIT[String(unit)];
    const v = num(qty);
    if (k && est !== true && v !== null && v > 0) return v * k;
  }
  return null;
}

/**
 * Some reporters' net weight is not in kilograms (Mexico's pipeline gas from the United States: 68 billion "kg",
 * litres by its size, for $7.5 bn). A row whose price per kg is under a tenth of the median for its product and year
 * keeps its value but loses its quantity, so it drops out of every flow measured by weight. Rows that are dear per kg
 * (small shipments) are kept.
 */
function dropNonMass(rows: TradeRow[]) {
  const groups = new Map<string, TradeRow[]>();
  for (const r of rows) {
    if (!(r.kg && r.usd && r.kg > 0 && r.usd > 0)) continue;
    const k = `${r.cmd}|${r.year}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const g of groups.values()) {
    if (g.length < 3) continue;
    const prices = g.map((r) => r.usd! / r.kg!).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    for (const r of g) if (r.usd! / r.kg! < median / 10) { r.kg = null; r.dropped = true; }
  }
}

const filesOf = (raw: Raw) => raw.list('comtrade').filter((f) => f.endsWith('.json')).map((f) => raw.json<{ data?: Row[] }>('comtrade', f));

/** Every row in the snapshot; throws "is not in the snapshot" when the source has no files yet. */
export function comtrade(raw: Raw): TradeRow[] {
  const files = filesOf(raw);
  if (!files.length) throw new Error('comtrade/ is not in the snapshot');
  return parseComtrade(files);
}

const imports = (rows: TradeRow[], c: Commodity) => {
  const codes: readonly string[] = CODES[c];
  return rows.filter((r) => r.flow === 'M' && codes.includes(r.cmd));
};

/**
 * Importer-reported flows of one commodity, summed per pair and year, largest first. Where the importer's row has no
 * usable quantity (dropped as not in kg, an estimate the amount does not use, or none at all), the exporter's own
 * report of the same flow is used when it has a usable one (mirror data), and the flow is marked `mirror`. With
 * `fill` (oil and gas), so is the exporter's report of a flow the importer has no row for: Germany reports its
 * pipeline gas from "areas not specified" only, so Norway → Germany is Norway's report. An exporter's 490 is not
 * taken for Taiwan there: Saudi Arabia files most of its crude under it, as buyers in Asia it does not name.
 */
export function flowsOf(rows: TradeRow[], c: Commodity, amount: (r: TradeRow) => number | null, fill = false): Flow[] {
  const codes: readonly string[] = CODES[c];
  const key = (r: TradeRow, from: string, to: string) => `${r.year}|${r.cmd}|${from}>${to}`;
  const exported = new Map(rows.filter((r) => r.flow === 'X' && codes.includes(r.cmd)).map((r) => [key(r, r.reporter, r.partner), r]));
  const imported = new Set<string>();
  const by = new Map<string, Flow>();
  const add = (from: string, to: string, year: number, v: number | null, mirror: boolean) => {
    if (v === null || !(v > 0)) return;
    const k = `${year}|${from}>${to}`;
    const f = by.get(k);
    if (f) { f.amount += v; if (mirror) f.mirror = true; }
    else by.set(k, { from, to, amount: v, year, ...(mirror ? { mirror: true as const } : {}) });
  };
  for (const r of imports(rows, c)) {
    imported.add(key(r, r.partner, r.reporter));
    let v = amount(r);
    let mirror = false;
    if (v === null) {
      const x = exported.get(key(r, r.partner, r.reporter));
      if (x) { v = amount(x); mirror = true; }
    }
    add(r.partner, r.reporter, r.year, v, mirror);
  }
  if (fill) for (const [k, x] of exported) if (!imported.has(k) && !x.asiaNes) add(x.reporter, x.partner, x.year, amount(x), true);
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

/** A year counts as complete once the reporters with data for it cover this share of the year before's flows. */
export const COMPLETE_SHARE = 0.85;

/**
 * The year a product's flows are shown for: the latest, once it is reasonably complete, else the year before
 * (`partial`: a later year has started). Complete means the reporters with data for the latest year, the importer
 * of each flow or the exporter of one from its report, cover at least COMPLETE_SHARE of the year before's total.
 * Early in a year a few reporters are in, and their flows alone would rank as the year's largest.
 */
export function completeYear(rows: TradeRow[], cs: readonly Commodity[], flows: Flow[]): { year: number; partial: boolean } | null {
  if (!flows.length) return null;
  const codes: readonly string[] = cs.flatMap((c) => CODES[c]);
  const latest = Math.max(...flows.map((f) => f.year));
  const before = flows.filter((f) => f.year === latest - 1);
  const total = before.reduce((t, f) => t + f.amount, 0);
  if (!total) return { year: latest, partial: false };
  const reported = (flow: 'M' | 'X') => new Set(rows.filter((r) => r.year === latest && r.flow === flow && codes.includes(r.cmd)).map((r) => r.reporter));
  const m = reported('M'), x = reported('X');
  const covered = before.filter((f) => (f.mirror ? x.has(f.from) : m.has(f.to))).reduce((t, f) => t + f.amount, 0);
  return covered >= COMPLETE_SHARE * total ? { year: latest, partial: false } : { year: latest - 1, partial: true };
}

const mt = (r: TradeRow) => (r.kg === null ? null : r.kg / 1e9);

export const crudeFlows = (rows: TradeRow[]) => flowsOf(rows, 'crude', (r) => (r.kg === null ? null : ((r.kg / 1000) * BARRELS_PER_TONNE) / 365 / 1000), true);
/** Below this many m³ per estimated kg an LNG volume is of liquid (about 0.0022), above the next of gas (about 1.4). */
const LNG_LIQUID_MAX = 0.02;
const LNG_GAS_MIN = 0.3;

/** A gas row in bcm: its weight when reported; else its own volume; else nothing (see the head of this file). */
export function gasBcm(r: TradeRow, kind: 'pipe' | 'lng'): number | null {
  if (r.kg !== null && !r.kgEst) return kind === 'pipe' ? r.kg / KG_PER_BCM_PIPE : ((r.kg / 1000) * M3_PER_TONNE_LNG) / 1e9;
  if (r.m3 === undefined) return null;
  if (kind === 'pipe') return r.m3 / 1e9;
  if (r.m3PerKg === undefined) return null;
  if (r.m3PerKg < LNG_LIQUID_MAX) return (r.m3 * GAS_PER_M3_LNG) / 1e9;
  return r.m3PerKg > LNG_GAS_MIN ? r.m3 / 1e9 : null;
}

export const gasFlows = (rows: TradeRow[]): GasFlow[] => [
  ...flowsOf(rows, 'pipe', (r) => gasBcm(r, 'pipe'), true).map((f) => ({ ...f, kind: 'pipe' as const })),
  ...flowsOf(rows, 'lng', (r) => gasBcm(r, 'lng'), true).map((f) => ({ ...f, kind: 'lng' as const })),
].sort((a, b) => b.amount - a.amount);
/**
 * Gas flows left out because neither side reports a quantity: the importer's weight is Comtrade's estimate with no
 * volume of its own, and the exporter has no usable report of the flow (China's pipeline gas from Russia). Amounts are
 * the estimates, only to tell whether a flow would rank among those shown.
 */
export function gasUnreported(rows: TradeRow[]): GasFlow[] {
  const out: GasFlow[] = [];
  for (const kind of ['pipe', 'lng'] as const) {
    const codes: readonly string[] = CODES[kind];
    const reported = new Set(rows.filter((r) => r.flow === 'X' && codes.includes(r.cmd) && gasBcm(r, kind) !== null).map((r) => `${r.year}|${r.reporter}>${r.partner}`));
    const by = new Map<string, GasFlow>();
    for (const r of rows) {
      if (r.flow !== 'M' || !codes.includes(r.cmd) || !r.noQty || !r.kg || reported.has(`${r.year}|${r.partner}>${r.reporter}`)) continue;
      const v = kind === 'pipe' ? r.kg / KG_PER_BCM_PIPE : ((r.kg / 1000) * M3_PER_TONNE_LNG) / 1e9;
      const k = `${r.year}|${r.partner}>${r.reporter}`;
      const f = by.get(k);
      if (f) f.amount += v;
      else by.set(k, { from: r.partner, to: r.reporter, amount: v, year: r.year, kind });
    }
    out.push(...by.values());
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export const fertiliserFlows = (rows: TradeRow[], c: 'potash' | 'phosphate') => flowsOf(rows, c, mt);
/** Integrated circuits or chipmaking machines, in US dollars (weight says little for chips). */
export const chipFlows = (rows: TradeRow[], c: 'chips' | 'equipment') => flowsOf(rows, c, (r) => r.usd);

export interface Partners { year: number; exports: { id: string; usd: number }[]; imports: { id: string; usd: number }[] }

/** A reporter's trade partners for all goods in its latest reported year, largest first (dossier trade partners). */
export function partners(rows: TradeRow[], reporter: string): Partners | null {
  const own = rows.filter((r) => r.reporter === reporter && r.cmd === 'TOTAL' && r.usd !== null && r.usd > 0);
  if (!own.length) return null;
  const year = Math.max(...own.map((r) => r.year));
  const side = (flow: 'M' | 'X') => own.filter((r) => r.year === year && r.flow === flow).map((r) => ({ id: r.partner, usd: r.usd! })).sort((a, b) => b.usd - a.usd);
  return { year, exports: side('X'), imports: side('M') };
}
