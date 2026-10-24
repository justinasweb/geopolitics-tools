// World Bank Indicators API → worldbank/<indicator>.json, in the API's own [pagination, rows] format.
// Traps kept from the prototype: aggregates (World, regions, income groups) are dropped so they
// never enter rankings; an error can arrive as HTTP 200 with a "message" object.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

/** Indicators the registry draws on. Growth, inflation and unemployment are here too, as the fallback while IMF fetching waits for permission. */
export const INDICATORS: Record<string, string> = {
  'NY.GDP.MKTP.CD': 'GDP, current US$',
  'NY.GDP.MKTP.KD.ZG': 'GDP growth, annual %',
  'FP.CPI.TOTL.ZG': 'Inflation, consumer prices, annual %',
  'SL.UEM.TOTL.ZS': 'Unemployment, % of labour force (ILO modelled)',
  'SP.POP.TOTL': 'Population',
  'SP.DYN.TFRT.IN': 'Births per woman',
  'SP.DYN.LE00.IN': 'Life expectancy at birth',
  'MS.MIL.XPND.GD.ZS': 'Military spending, % of GDP',
  'MS.MIL.XPND.CD': 'Military spending, current US$',
  'FI.RES.TOTL.CD': 'Reserves including gold',
  'FI.RES.XGLD.CD': 'Reserves excluding gold',
  'BX.KLT.DINV.CD.WD': 'Foreign direct investment, net inflows',
  'BX.TRF.PWKR.DT.GD.ZS': 'Remittances received, % of GDP',
  'NE.TRD.GNFS.ZS': 'Trade, % of GDP',
};
const FROM = 2000;

type Page = { page: number; pages: number; total: number; message?: { value: string }[] };
type Row = { countryiso3code: string; date: string; value: number | null };

const source: Source = {
  id: 'worldbank',
  name: 'World Bank Indicators',
  every: 7 * DAY,
  staleAfter: 45 * DAY,
  enabled: true,
  attribution: 'The World Bank, World Development Indicators',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const base = ctx.env.WORLDBANK_BASE ?? 'https://api.worldbank.org';
    const list = await getJson<[Page, { id: string; region: { value: string } }[]]>(ctx.http, `${base}/v2/country?format=json&per_page=500`);
    check(Array.isArray(list?.[1]), 'country list: unexpected response shape');
    const countries = new Set(list[1].filter((c) => c.id && c.region?.value !== 'Aggregates').map((c) => c.id));
    check(countries.size >= 180, `country list: only ${countries.size} countries`);
    ctx.log(`${countries.size} countries (aggregates dropped)`);

    const to = ctx.now.getUTCFullYear();
    const files = [];
    let rows = 0;
    let dataTo = 0;
    for (const [code, label] of Object.entries(INDICATORS)) {
      const res = await getJson<[Page, Row[] | null]>(ctx.http, `${base}/v2/country/all/indicator/${code}?format=json&date=${FROM}:${to}&per_page=20000`);
      check(Array.isArray(res?.[1]), `${code}: ${res?.[0]?.message?.[0]?.value ?? 'unexpected response shape'}`);
      check(res[0].pages <= 1, `${code}: more than one page; raise per_page`);
      const keep = res[1].filter((r) => countries.has(r.countryiso3code));
      for (const f of ['countryiso3code', 'date', 'value'] as const)
        check(!keep.length || f in keep[0], `${code}: field "${f}" is missing; the source format changed`);
      const withValue = keep.filter((r) => r.value !== null);
      check(withValue.length >= 100, `${code}: only ${withValue.length} values`);
      const prev = await ctx.previous(`${code}.json`);
      guardShrink(ctx, code, withValue.length, prev, (p) => (JSON.parse(p)[1] as Row[]).filter((r) => r.value !== null).length);
      files.push(json(`${code}.json`, [{ ...res[0], total: keep.length }, keep]));
      rows += withValue.length;
      const years = withValue.map((r) => Number(r.date));
      dataTo = Math.max(dataTo, ...years);
      ctx.log(`${code.padEnd(22)} ${String(withValue.length).padStart(5)} values, ${Math.min(...years)}–${Math.max(...years)} (${label})`);
    }
    return { files, rows, dataTo: String(dataTo) };
  },
};
export default source;
