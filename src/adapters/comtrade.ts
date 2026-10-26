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
import { type Raw, matcher, num } from './core.ts';

export interface TradeRow { year: number; reporter: string; partner: string; flow: 'M' | 'X'; cmd: string; kg: number | null; usd: number | null }
export interface Flow { from: string; to: string; amount: number; year: number }
export interface GasFlow extends Flow { kind: 'pipe' | 'lng' }

type Row = Record<string, unknown>;

export const BARRELS_PER_TONNE = 7.33;
export const KG_PER_BCM_PIPE = 0.75e9;
export const M3_PER_TONNE_LNG = 1360;
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
      out.push({ year: Number(r.period), reporter, partner, flow, cmd: String(r.cmdCode), kg: num(r.netWgt), usd: num(r.primaryValue) });
    }
  }
  return out;
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

/** Importer-reported flows of one commodity, summed per pair and year, largest first. */
export function flowsOf(rows: TradeRow[], c: Commodity, amount: (r: TradeRow) => number | null): Flow[] {
  const by = new Map<string, Flow>();
  for (const r of imports(rows, c)) {
    const v = amount(r);
    if (v === null || !(v > 0)) continue;
    const k = `${r.year}|${r.partner}>${r.reporter}`;
    const f = by.get(k);
    if (f) f.amount += v;
    else by.set(k, { from: r.partner, to: r.reporter, amount: v, year: r.year });
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

const mt = (r: TradeRow) => (r.kg === null ? null : r.kg / 1e9);

export const crudeFlows = (rows: TradeRow[]) => flowsOf(rows, 'crude', (r) => (r.kg === null ? null : ((r.kg / 1000) * BARRELS_PER_TONNE) / 365 / 1000));
export const gasFlows = (rows: TradeRow[]): GasFlow[] => [
  ...flowsOf(rows, 'pipe', (r) => (r.kg === null ? null : r.kg / KG_PER_BCM_PIPE)).map((f) => ({ ...f, kind: 'pipe' as const })),
  ...flowsOf(rows, 'lng', (r) => (r.kg === null ? null : ((r.kg / 1000) * M3_PER_TONNE_LNG) / 1e9)).map((f) => ({ ...f, kind: 'lng' as const })),
].sort((a, b) => b.amount - a.amount);
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
