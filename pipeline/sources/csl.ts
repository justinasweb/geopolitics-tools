// US Consolidated Screening List (trade.gov download, no key) → csl/consolidated.json, the
// download's own records with fields trimmed to what the site counts: list, programmes, country,
// dates. The list combines several US lists (SDN, Entity List, …); the adapter keeps them apart.
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

const KEEP = ['id', 'source', 'entity_number', 'type', 'programs', 'name', 'citizenships', 'nationalities', 'start_date', 'end_date', 'federal_register_notice', 'source_list_url'];
type Rec = Record<string, unknown> & { source?: string; addresses?: { country?: string | null }[] };

const source: Source = {
  id: 'csl',
  name: 'US Consolidated Screening List',
  every: 1 * DAY,
  staleAfter: 10 * DAY,
  enabled: true,
  attribution: 'U.S. Department of Commerce, International Trade Administration, Consolidated Screening List',
  licence: 'Public domain (US government work)',
  async fetch(ctx) {
    const url = ctx.env.CSL_URL ?? 'https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json';
    const res = await getJson<Rec[] | { results?: Rec[] }>(ctx.http, url, { timeout: 180_000 });
    const all = Array.isArray(res) ? res : res?.results;
    check(Array.isArray(all), 'no list of records; the format changed');
    const results: Rec[] = all.map((r) => ({
      ...Object.fromEntries(KEEP.filter((k) => k in r).map((k) => [k, r[k]])),
      addresses: (r.addresses ?? []).map((a) => ({ country: a?.country ?? null })),
    }));
    const lists = new Map<string, number>();
    for (const r of results) lists.set(String(r.source), (lists.get(String(r.source)) ?? 0) + 1);
    ctx.log(`${results.length} records: ${[...lists].map(([k, n]) => `${k} ${n}`).join('; ')}`);
    check(results.length >= 5_000, `only ${results.length} records`);
    check([...lists.keys()].some((k) => /Entity List/i.test(k)), 'no Entity List records');
    check([...lists.keys()].some((k) => /Specially Designated Nationals/i.test(k)), 'no SDN records');
    const prev = await ctx.previous('consolidated.json');
    guardShrink(ctx, 'consolidated.json', results.length, prev, (p) => (JSON.parse(p) as { results: unknown[] }).results.length, 0.8);
    const newest = results.map((r) => String(r.start_date ?? '')).filter((d) => /^\d{4}-\d\d-\d\d/.test(d)).sort().at(-1);
    return { files: [json('consolidated.json', { total: results.length, results })], rows: results.length, dataTo: newest };
  },
};
export default source;
