// U.S. Energy Information Administration, API v2 (free key) → eia/, each in the API's own { response: { data } }
// format, the format of the prototype's samples:
//   oil_international.json  crude oil including lease condensate (production, reserves), total petroleum and
//                           other liquids (production: crude plus NGLs, the figure net trade must use) and
//                           petroleum consumption; thousand barrels a day, reserves in billion barrels
//   gas_international.json  dry natural gas production, consumption (bcm) and reserves (tcm)
//   oil_spot_prices.json    Brent and WTI spot prices, monthly, dollars a barrel
// Countries only (EIA's regions and groups are left out); rows without a number ("--", "NA") are dropped.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

const FROM = 2000;
const PAGE = 5000;

type Row = Record<string, string | number | null>;
interface Answer { response?: { total?: number | string; data?: Row[]; dateFormat?: string; frequency?: string }; request?: unknown; apiVersion?: string }

/** The series kept: product id, activity id and unit, as the API names them. */
export const SERIES = {
  oil: [['57', '1', 'TBPD'], ['53', '1', 'TBPD'], ['5', '2', 'TBPD'], ['57', '6', 'BB']],
  gas: [['26', '1', 'BCM'], ['26', '2', 'BCM'], ['26', '6', 'TCM']],
} as const;

const hasNumber = (r: Row) => r.value !== null && r.value !== '' && Number.isFinite(Number(r.value));
const keep = (kind: keyof typeof SERIES) => (r: Row) => SERIES[kind].some(([p, a, u]) => String(r.productId) === p && String(r.activityId) === a && r.unit === u);

const source: Source = {
  id: 'eia',
  name: 'U.S. Energy Information Administration',
  every: 7 * DAY,
  staleAfter: 60 * DAY,
  enabled: process.env.EIA_API_KEY ? true : 'waits for an API key (EIA_API_KEY)',
  attribution: 'U.S. Energy Information Administration (EIA)',
  licence: 'Public domain (US government work)',
  async fetch(ctx) {
    const key = ctx.env.EIA_API_KEY;
    check(key, 'EIA_API_KEY is not set');
    const base = ctx.env.EIA_BASE ?? 'https://api.eia.gov/v2';
    const all = async (what: string, path: string, params: string) => {
      const rows: Row[] = [];
      let last: Answer;
      for (let offset = 0; ; offset += PAGE) {
        last = await getJson<Answer>(ctx.http, `${base}/${path}/data/?api_key=${key}&data[0]=value&${params}&sort[0][column]=period&sort[0][direction]=asc&offset=${offset}&length=${PAGE}`, { timeout: 120_000 });
        const data = last.response?.data;
        check(Array.isArray(data), `${what}: no response.data array; the format changed`);
        rows.push(...data);
        const total = Number(last.response?.total ?? 0);
        if (data.length < PAGE || rows.length >= total) break;
        check(offset < 40 * PAGE, `${what}: more than 40 pages`);
      }
      return { rows, last };
    };
    // One call per series: asking for several products, activities and units at once returns their cross product,
    // and the live API left some series out of such answers.
    const facets = ([p, a, u]: readonly string[], unit = true) =>
      `frequency=annual&start=${FROM}&facets[productId][]=${p}&facets[activityId][]=${a}${unit ? `&facets[unit][]=${u}` : ''}&facets[countryRegionTypeId][]=c`;

    const files = [];
    let rows = 0;
    let dataTo = '';
    for (const kind of ['oil', 'gas'] as const) {
      const name = `${kind}_international.json`;
      const got: Row[] = [];
      let last: Answer = {};
      for (const series of SERIES[kind]) {
        const [p, a, u] = series;
        const answer = await all(name, 'international', facets(series));
        const n = new Set(answer.rows.filter(hasNumber).map((r) => r.countryRegionId)).size;
        if (n < 80) {
          // Say which units the API has for it, so a renamed unit shows in the log.
          const any = await all(name, 'international', `${facets(series, false)}&facets[countryRegionId][]=SAU&facets[countryRegionId][]=USA`);
          const units = [...new Set(any.rows.map((r) => `${r.unit} (${r.unitName ?? ''})`))].join(', ') || 'none';
          check(false, `${name}: product ${p}, activity ${a} (${u}) has only ${n} countries; for Saudi Arabia and the US the API has units ${units}`);
        }
        got.push(...answer.rows);
        last = answer.last;
      }
      const data = got.filter(keep(kind)).filter(hasNumber);
      check(data.every((r) => 'period' in r && 'countryRegionId' in r && 'activityName' in r), `${name}: rows lack period, countryRegionId or activityName; the format changed`);
      guardShrink(ctx, name, data.length, await ctx.previous(name), (prev) => (JSON.parse(prev) as Answer).response?.data?.length ?? 0, 0.8);
      const latest = data.reduce((m, r) => (String(r.period) > m ? String(r.period) : m), '');
      if (latest > dataTo) dataTo = latest;
      ctx.log(`${name}: ${data.length} values, ${new Set(data.map((r) => r.countryRegionId)).size} countries, to ${latest}`);
      files.push(json(name, { response: { total: data.length, dateFormat: last.response?.dateFormat, frequency: last.response?.frequency, data }, request: { command: '/v2/international/data/' }, apiVersion: last.apiVersion }));
      rows += data.length;
    }

    const prices = await all('spot prices', 'petroleum/pri/spt', 'frequency=monthly&start=2010-01&facets[series][]=RBRTE&facets[series][]=RWTC');
    const p = prices.rows.filter(hasNumber);
    for (const s of ['RBRTE', 'RWTC']) {
      const months = p.filter((r) => r.series === s).map((r) => String(r.period)).sort();
      check(months.length >= 100, `spot prices: only ${months.length} months for ${s}`);
      // A monthly series more than four months behind has stopped updating.
      const behind = (ctx.now.getUTCFullYear() * 12 + ctx.now.getUTCMonth()) - (Number(months.at(-1)!.slice(0, 4)) * 12 + Number(months.at(-1)!.slice(5, 7)) - 1);
      check(behind <= 4, `spot prices: ${s} ends in ${months.at(-1)}`);
    }
    ctx.log(`oil_spot_prices.json: ${p.length} months`);
    files.push(json('oil_spot_prices.json', { response: { total: p.length, dateFormat: prices.last.response?.dateFormat, frequency: 'monthly', data: p }, request: { command: '/v2/petroleum/pri/spt/data/' }, apiVersion: prices.last.apiVersion }));
    rows += p.length;
    return { files, rows, dataTo };
  },
};
export default source;
