// Ember electricity data API (free key) → ember/, in the API's own { stats, data } format, the format of the
// prototype's sample:
//   electricity_generation_yearly.json  every country's generation by source (Ember's nine series), 2000 on, TWh
//   electricity_generation_world.json   the same for Ember's World total, so the world mix is Ember's own figure
// Aggregate series (Fossil, Clean, Total and so on) are left out; the adapter adds the nine up itself.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

const FROM = 2000;
/** Ember's nine generation series, as the API names them. */
export const SERIES = ['Coal', 'Gas', 'Other fossil', 'Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other renewables'];

type Row = Record<string, string | number | boolean | null>;
interface Answer { stats?: Record<string, unknown>; data?: Row[] }

const source: Source = {
  id: 'ember',
  name: 'Ember',
  every: 7 * DAY,
  staleAfter: 60 * DAY,
  enabled: process.env.EMBER_API_KEY ? true : 'waits for an API key (EMBER_API_KEY)',
  attribution: 'Ember',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const key = ctx.env.EMBER_API_KEY;
    check(key, 'EMBER_API_KEY is not set');
    const base = ctx.env.EMBER_BASE ?? 'https://api.ember-energy.org/v1';
    const get = async (what: string, params: string) => {
      const a = await getJson<Answer>(ctx.http, `${base}/electricity-generation/yearly?${params}&is_aggregate_series=false&start_date=${FROM}&api_key=${key}`, { timeout: 180_000 });
      check(Array.isArray(a.data), `${what}: no data array; the format changed`);
      const data = a.data.filter((r) => SERIES.includes(String(r.series)));
      check(data.every((r) => 'entity' in r && 'date' in r && 'generation_twh' in r), `${what}: rows lack entity, date or generation_twh; the format changed`);
      return data;
    };

    const countries = await get('countries', 'is_aggregate_entity=false');
    const codes = new Set(countries.map((r) => r.entity_code).filter(Boolean));
    check(codes.size >= 150, `countries: only ${codes.size} countries`);
    const years = countries.map((r) => Number(r.date)).filter(Number.isFinite);
    const last = Math.max(...years);
    check(last >= ctx.now.getUTCFullYear() - 2, `countries: the latest year is ${last}`);
    const name = 'electricity_generation_yearly.json';
    guardShrink(ctx, name, countries.length, await ctx.previous(name), (prev) => (JSON.parse(prev) as Answer).data?.length ?? 0, 0.8);
    ctx.log(`${name}: ${countries.length} values, ${codes.size} countries, ${Math.min(...years)}–${last}`);

    const world = await get('world', 'entity=World');
    check(world.length >= SERIES.length * 10, `world: only ${world.length} values`);
    ctx.log(`electricity_generation_world.json: ${world.length} values`);

    return {
      files: [
        json(name, { stats: { number_of_records: countries.length }, data: countries }),
        json('electricity_generation_world.json', { stats: { number_of_records: world.length }, data: world }),
      ],
      rows: countries.length + world.length,
      dataTo: String(last),
    };
  },
};
export default source;
