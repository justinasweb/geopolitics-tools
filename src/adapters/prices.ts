// World Bank Pink Sheet (pinksheet/cmo_{food,metals,gas}_prices.json): monthly prices by the
// Pink Sheet's own series code (WHEAT_US_HRW, COPPER, NGAS_EUR), in US dollars per the unit the
// file's column label gives.
import type { Raw } from './core.ts';
import { parsePinkSheet } from './faostat.ts';

export const PINK_SHEET_FILES = ['cmo_food_prices.json', 'cmo_metals_prices.json', 'cmo_gas_prices.json'];

/** Every series in the three files: { code: [{ date: "YYYY-MM", value }] }, with each file's column labels. */
export function prices(raw: Raw) {
  const series: ReturnType<typeof parsePinkSheet> = {};
  const labels: Record<string, string> = {};
  for (const f of PINK_SHEET_FILES) {
    const json = raw.json<{ columns?: Record<string, string> }>('pinksheet', f);
    Object.assign(series, parsePinkSheet(json));
    Object.assign(labels, json.columns);
  }
  return { series, labels };
}
