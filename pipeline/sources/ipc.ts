// IPC public API (free key, per implementation) → ipc/country.json: every country-level acute food insecurity
// analysis, IPC and Cadre Harmonisé, in the API's own format (an array of analyses; the prototype's sample has the
// same name and format). The country endpoint gives each analysis's current period only, with the population
// analysed and the people in each phase.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

type Row = Record<string, string | number | null>;

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
    const rows = await getJson<Row[]>(ctx.http, `${base}/country?format=json&type=A&key=${key}`, { timeout: 120_000 });
    check(Array.isArray(rows), 'country: not an array of analyses; the format changed');
    const data = rows.filter((r) => r.condition === 'A' || r.condition === undefined);
    check(data.every((r) => 'country' in r && 'from' in r && 'phase3plus_population' in r), 'country: analyses lack country, from or phase3plus_population; the format changed');
    const countries = new Set(data.map((r) => r.country));
    check(countries.size >= 20, `country: only ${countries.size} countries`);
    const name = 'country.json';
    guardShrink(ctx, name, data.length, await ctx.previous(name), (prev) => (JSON.parse(prev) as Row[]).length, 0.8);
    const latest = data.reduce((m, r) => (String(r.from ?? '') > m ? String(r.from) : m), '');
    ctx.log(`${name}: ${data.length} analyses, ${countries.size} countries, latest from ${latest}`);
    return { files: [json(name, data)], rows: data.length, dataTo: latest };
  },
};
export default source;
