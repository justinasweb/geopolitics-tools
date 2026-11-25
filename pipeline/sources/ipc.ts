// IPC public API (free key, per implementation) → ipc/country.json: every country-level acute food insecurity
// analysis, IPC and Cadre Harmonisé, in the API's own format (an array of analyses). The country endpoint gives each
// analysis once, for its latest period (`ipc_period`: C current, P projection, A projection update), with months as
// "Nov 2026", the population analysed (`estimated_population`) and the people in each phase (`phases`).
// → ipc/analyses.json: the list of analyses (id, title, link, created, modified), whose titles name an area when the
// analysis covers only part of a place ("Palestine (Gaza Strip) - …"); the country endpoint's titles do not.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

type Row = Record<string, unknown>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 2026" → "2026-11"; null for anything else. */
const ym = (s: unknown) => {
  const m = String(s ?? '').match(/^([A-Z][a-z]{2}) (\d{4})$/);
  const i = m ? MONTHS.indexOf(m[1]) : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}` : null;
};

const source: Source = {
  id: 'ipc',
  name: 'Integrated Food Security Phase Classification',
  every: DAY,
  staleAfter: 14 * DAY,
  enabled: process.env.IPC_API_KEY ? true : 'waits for an API key (IPC_API_KEY)',
  attribution: 'IPC CC BY-NC-SA 3.0 IGO',
  licence: 'CC BY-NC-SA 3.0 IGO',
  async fetch(ctx) {
    const key = ctx.env.IPC_API_KEY;
    check(key, 'IPC_API_KEY is not set');
    const base = ctx.env.IPC_BASE ?? 'https://api.ipcinfo.org';
    // The key travels in the query, which error messages and logs never show (redact in ../lib/http.ts).
    const rows = await getJson<Row[]>(ctx.http, `${base}/country?format=json&type=A&key=${key}`, { timeout: 120_000 });
    check(Array.isArray(rows), 'country: not an array of analyses; the format changed');
    const data = rows.filter((r) => r.condition === 'A' || r.condition === undefined);
    check(
      data.every((r) => typeof r.country === 'string' && ym(r.from) && ym(r.to) && Array.isArray(r.phases) && r.phases.length === 5 && 'estimated_population' in r),
      'country: analyses lack country, from/to as "Mon YYYY", five phases or estimated_population; the format changed',
    );
    const countries = new Set(data.map((r) => r.country));
    check(countries.size >= 20, `country: only ${countries.size} countries`);
    const name = 'country.json';
    guardShrink(ctx, name, data.length, await ctx.previous(name), (prev) => (JSON.parse(prev) as Row[]).length, 0.8);
    const latest = data.reduce((m, r) => (ym(r.from)! > m ? ym(r.from)! : m), '');
    ctx.log(`${name}: ${data.length} analyses, ${countries.size} countries, latest from ${latest}`);
    const list = await getJson<Row[]>(ctx.http, `${base}/analyses?format=json&type=A&key=${key}`, { timeout: 120_000 });
    check(Array.isArray(list) && list.every((r) => r.id && typeof r.title === 'string'), 'analyses: not a list of analyses with id and title; the format changed');
    const ids = new Set(list.map((r) => String(r.id)));
    const missing = data.filter((r) => !ids.has(String(r.id))).length;
    check(missing <= data.length * 0.1, `analyses: ${missing} of the country endpoint's analyses are not in the list`);
    ctx.log(`analyses.json: ${list.length} analyses`);
    return { files: [json(name, data), json('analyses.json', list)], rows: data.length, dataTo: latest };
  },
};
export default source;
