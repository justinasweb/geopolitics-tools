// UN Comtrade, the v1 data API (free key, about 500 calls a day) → comtrade/<group>-<year>.json, each in the API's
// own { count, data: [rows] } envelope, trimmed to the fields the adapters read. One call per group and year, every
// reporter at once, importer-reported (flowCode M; dossier totals also X), with the partner2, customs and transport
// breakdowns set to their totals so no row is counted twice:
//   crude-<y>       2709 crude oil
//   gas-<y>         271111 LNG, 271121 pipeline gas
//   fertiliser-<y>  3104 potash; 3103, 310530 (DAP) and 310540 (MAP) phosphate, all in product weight
//   chips-<y>       8542 integrated circuits, 8486 chipmaking machines
//   imports-<y>     all goods, imports by partner (dossier trade partners)
//   exports-<y>     all goods, exports by partner
// Countries report a year over the following 18 months or so, so the three latest years are fetched again on each
// run and older years only when missing. A run makes at most COMTRADE_MAX_CALLS calls (90 by default, enough for the whole
// backfill), a second apart; files not fetched in a run are carried over from the last good copy.
import { getJson } from '../lib/http.ts';
import { type Source, type SourceFile, DAY, check, json } from '../lib/source.ts';

const FROM = 2015;
/** Years fetched again on every run: countries keep adding and revising them. */
const RECENT = 3;
/** The API returns at most this many rows; a full answer may be cut off. */
const CAP = 100_000;

export const GROUPS: Record<string, { codes: string[]; flows: string; minReporters: number }> = {
  crude: { codes: ['2709'], flows: 'M', minReporters: 40 },
  gas: { codes: ['271111', '271121'], flows: 'M', minReporters: 40 },
  fertiliser: { codes: ['3103', '3104', '310530', '310540'], flows: 'M', minReporters: 60 },
  chips: { codes: ['8542', '8486'], flows: 'M', minReporters: 60 },
  imports: { codes: ['TOTAL'], flows: 'M', minReporters: 80 },
  exports: { codes: ['TOTAL'], flows: 'X', minReporters: 80 },
};

/** The fields kept from each row; descriptions and estimation flags the site does not use are dropped. */
export const FIELDS = ['period', 'reporterCode', 'reporterISO', 'flowCode', 'partnerCode', 'partnerISO', 'cmdCode', 'qtyUnitAbbr', 'qty', 'netWgt', 'isNetWgtEstimated', 'primaryValue', 'isReported'] as const;

type Row = Record<string, unknown>;
interface Answer { count?: number; data?: Row[]; error?: string }

export const fileName = (group: string, year: number) => `${group}-${year}.json`;

/** Every file the source has once backfilled, newest first, so a short run fetches the years that matter most. */
export function plan(now: Date): { group: string; year: number; recent: boolean }[] {
  const last = now.getUTCFullYear() - 1;
  const out = [];
  for (let y = last; y >= FROM; y--) for (const group of Object.keys(GROUPS)) out.push({ group, year: y, recent: y > last - RECENT });
  return out;
}

export function trim(rows: Row[]): Row[] {
  return rows.map((r) => Object.fromEntries(FIELDS.filter((f) => r[f] !== undefined).map((f) => [f, r[f]])));
}

const source: Source = {
  id: 'comtrade',
  name: 'UN Comtrade',
  every: 7 * DAY,
  staleAfter: 60 * DAY,
  enabled: process.env.COMTRADE_API_KEY ? true : 'waits for an API key (COMTRADE_API_KEY)',
  attribution: 'United Nations, UN Comtrade database',
  licence: 'UN Comtrade terms (free not-for-profit visualisation of figures; no bulk redistribution)',
  async fetch(ctx) {
    const key = ctx.env.COMTRADE_API_KEY;
    check(key, 'COMTRADE_API_KEY is not set');
    const base = ctx.env.COMTRADE_BASE ?? 'https://comtradeapi.un.org/data/v1';
    const max = Number(ctx.env.COMTRADE_MAX_CALLS ?? 90);
    let calls = max;
    const pause = Number(ctx.env.COMTRADE_PAUSE_MS ?? 1000);
    const files: SourceFile[] = [];
    let rows = 0;
    let fetched = 0;
    let carried = 0;
    let dataTo = 0;
    const carry = (name: string, prev: string) => {
      const body = JSON.parse(prev) as Answer;
      files.push(json(name, body));
      rows += body.data?.length ?? 0;
      carried++;
    };
    for (const { group, year, recent } of plan(ctx.now)) {
      const name = fileName(group, year);
      const prev = await ctx.previous(name);
      if ((prev && !recent) || calls <= 0) {
        if (prev) carry(name, prev);
        continue;
      }
      if (calls < max) await new Promise((r) => setTimeout(r, pause));
      calls--;
      const g = GROUPS[group];
      const url = `${base}/get/C/A/HS?period=${year}&cmdCode=${g.codes.join(',')}&flowCode=${g.flows}&partner2Code=0&customsCode=C00&motCode=0&includeDesc=true`;
      const res = await getJson<Answer>(ctx.http, url, { timeout: 180_000, headers: { 'Ocp-Apim-Subscription-Key': key } });
      check(Array.isArray(res?.data), `${name}: no "data" array${res?.error ? ` (${res.error})` : ''}; the format changed`);
      const data = res.data;
      check(data.length < CAP, `${name}: ${data.length} rows, the API's limit, so the answer may be cut off; split the call`);
      const reporters = new Set(data.map((r) => r.reporterCode));
      if (reporters.size < g.minReporters) {
        // A year that has only begun to come in: keep the last good copy, or nothing for a year not yet published.
        ctx.log(`${name}: ${reporters.size} reporters so far, not saved`);
        if (prev) carry(name, prev);
        continue;
      }
      check(data.every((r) => 'reporterCode' in r && 'partnerCode' in r && 'primaryValue' in r), `${name}: rows lack reporterCode, partnerCode or primaryValue; the format changed`);
      if (prev && !ctx.allowShrink) {
        const before = new Set(((JSON.parse(prev) as Answer).data ?? []).map((r) => r.reporterCode)).size;
        check(reporters.size >= before * 0.8, `${name}: ${reporters.size} reporters now against ${before} in the last good copy; kept the old file (run with --allow-shrink if the drop is real)`);
      }
      files.push(json(name, { count: data.length, data: trim(data) }));
      rows += data.length;
      fetched++;
      ctx.log(`${name}: ${data.length} rows, ${reporters.size} reporters`);
    }
    check(files.length, 'nothing fetched or kept');
    for (const f of files) dataTo = Math.max(dataTo, Number(/-(\d{4})\.json$/.exec(f.name)?.[1] ?? 0));
    ctx.log(`${fetched} files fetched, ${carried} carried over, ${plan(ctx.now).length - fetched - carried} still to backfill`);
    return { files, rows, dataTo: String(dataTo) };
  },
};
export default source;
