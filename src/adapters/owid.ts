// Our World in Data CO2 (owid/owid-co2-data.csv; Global Carbon Budget). Emissions in million tonnes
// of CO2, per person in tonnes. The world row has no ISO code; continents and income groups have none
// either, or an OWID_ code, and are skipped.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

export const CO2_FIELDS = { co2: 'co2', pc: 'co2_per_capita', cum: 'cumulative_co2', cons: 'consumption_co2', coal: 'coal_co2', oil: 'oil_co2', gas: 'gas_co2', cement: 'cement_co2' } as const;
export type Co2Field = keyof typeof CO2_FIELDS;

export interface Emissions {
  byField: Record<Co2Field, Series>;
  /** The World row: totals include international aviation and shipping, which no country is given. */
  world: Record<number, { co2: number | null; cum: number | null; pc: number | null }>;
  /** Last year with consumption-based figures, which lag the territorial ones. */
  consumptionLast: number | null;
}

export function parseOwidCo2(text: string): Emissions {
  const m = matcher('owid', 'iso3');
  const out: Emissions = { byField: Object.fromEntries(Object.keys(CO2_FIELDS).map((k) => [k, {}])) as Record<Co2Field, Series>, world: {}, consumptionLast: null };
  for (const r of csvRecords(text)) {
    const y = Number(r.year);
    if (!y) continue;
    if (!r.iso_code) {
      if (r.country === 'World') out.world[y] = { co2: num(r.co2), cum: num(r.cumulative_co2), pc: num(r.co2_per_capita) };
      continue;
    }
    if (r.iso_code === 'OWID_WRL') { out.world[y] = { co2: num(r.co2), cum: num(r.cumulative_co2), pc: num(r.co2_per_capita) }; continue; }
    const id = m.match(r.iso_code);
    if (!id) continue;
    for (const [k, col] of Object.entries(CO2_FIELDS)) put(out.byField[k as Co2Field], id, y, num(r[col]));
    if (num(r.consumption_co2) !== null) out.consumptionLast = Math.max(out.consumptionLast ?? y, y);
  }
  return out;
}

export const emissions = (raw: Raw) => parseOwidCo2(raw.text('owid', 'owid-co2-data.csv'));
