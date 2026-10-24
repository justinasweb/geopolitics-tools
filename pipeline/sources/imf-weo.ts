// IMF World Economic Outlook, from the DataMapper API → imf-weo/<indicator>.json, in the API's
// own {"values": {indicator: {country: {year: value}}}} format, with country groups dropped
// (only codes in the API's own country list are kept). Includes the IMF's projections, which the
// site labels as such. Switched off: the IMF's terms ask for permission before scheduled
// downloads; until it answers, growth, inflation and unemployment come from the World Bank.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

/** The prototype's six, the files its sample and adapters use. */
export const INDICATORS: Record<string, string> = {
  NGDP_RPCH: 'Real GDP growth, %',
  PCPIPCH: 'Inflation, average consumer prices, %',
  GGXWDG_NGDP: 'General government gross debt, % of GDP',
  GGXCNL_NGDP: 'General government net lending/borrowing, % of GDP',
  LUR: 'Unemployment rate, %',
  BCA_NGDPD: 'Current account balance, % of GDP',
};

type Values = Record<string, Record<string, Record<string, number>>>;

const count = (byCountry: Record<string, Record<string, number>>) => Object.values(byCountry).reduce((s, y) => s + Object.keys(y).length, 0);

const source: Source = {
  id: 'imf-weo',
  name: 'IMF World Economic Outlook',
  every: 30 * DAY,
  staleAfter: 200 * DAY,
  enabled: 'waits for the IMF to allow scheduled downloads',
  attribution: 'International Monetary Fund, World Economic Outlook',
  licence: 'IMF terms of use (permission for scheduled downloads requested)',
  async fetch(ctx) {
    const base = ctx.env.IMF_DATAMAPPER_BASE ?? 'https://www.imf.org/external/datamapper/api/v1';
    const list = await getJson<{ countries?: Record<string, unknown> }>(ctx.http, `${base}/countries`);
    const countries = new Set(Object.keys(list?.countries ?? {}));
    check(countries.size >= 150, `country list: only ${countries.size} countries`);
    const files = [];
    let rows = 0;
    let dataTo = '';
    for (const code of Object.keys(INDICATORS)) {
      const res = await getJson<{ values?: Values }>(ctx.http, `${base}/${code}`);
      const all = res?.values?.[code];
      check(all, `${code}: no values in the answer`);
      const kept = Object.fromEntries(Object.entries(all).filter(([c]) => countries.has(c)));
      const n = count(kept);
      check(Object.keys(kept).length >= 100, `${code}: only ${Object.keys(kept).length} countries`);
      const prev = await ctx.previous(`${code}.json`);
      guardShrink(ctx, code, n, prev, (p) => count((JSON.parse(p) as { values: Values }).values[code] ?? {}));
      files.push(json(`${code}.json`, { values: { [code]: kept } }));
      rows += n;
      // The newest year with values for most countries: the WEO runs five years ahead.
      const years = Object.values(kept).flatMap((y) => Object.keys(y)).sort();
      if (years.at(-1)! > dataTo) dataTo = years.at(-1)!;
      ctx.log(`${code}: ${Object.keys(kept).length} countries, ${n} values`);
    }
    return { files, rows, dataTo };
  },
};
export default source;
