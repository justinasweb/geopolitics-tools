// UNHCR Refugee Data Finder API → unhcr/*.json, each in the API's own { items: [...] } format:
//   by-origin.json  totals per country of origin and year (exact)
//   by-host.json    totals per country of asylum and year (exact; includes internally displaced)
//   pairs.json      origin → host pairs for the flow arcs. Pairs under 1,000 people are folded into
//                   one "other countries" row per origin and year, so the file fits a browser and
//                   origin totals stay exact (61,256 rows → about 13,000 in the prototype).
import { getJson } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

const FROM = 2015;
const MIN_PAIR = 1000;
const LIMIT = 10_000;
export const COUNTS = ['refugees', 'asylum_seekers', 'returned_refugees', 'idps', 'returned_idps', 'stateless', 'ooc', 'oip', 'hst'] as const;

type Item = Record<string, string | number | null | undefined> & { year: number; coo_iso?: string | null; coa_iso?: string | null };
type Page = { page: number; maxPages: number; items: Item[] };

export const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0);
const people = (r: Item) => num(r.refugees) + num(r.asylum_seekers) + num(r.oip);

export function foldPairs(items: Item[]): Item[] {
  const keep: Item[] = [];
  const rest = new Map<string, Item>();
  for (const r of items) {
    if (r.coo_iso === r.coa_iso || people(r) >= MIN_PAIR) { keep.push(r); continue; }
    const k = `${r.year}|${r.coo_iso}`;
    let o = rest.get(k);
    if (!o) {
      o = { year: r.year, coo_id: r.coo_id, coo_name: r.coo_name, coo: r.coo, coo_iso: r.coo_iso, coa_id: null, coa_name: `Other countries (pairs under ${MIN_PAIR.toLocaleString('en')} people)`, coa: null, coa_iso: null, folded_pairs: 0 };
      for (const c of COUNTS) o[c] = 0;
      rest.set(k, o);
    }
    const sum: Item = o;
    for (const c of COUNTS) sum[c] = num(sum[c]) + num(r[c]);
    sum.folded_pairs = num(sum.folded_pairs) + 1;
  }
  return [...keep, ...rest.values()];
}

const source: Source = {
  id: 'unhcr',
  name: 'UNHCR Refugee Data Finder',
  every: 30 * DAY,
  staleAfter: 200 * DAY,
  enabled: true,
  attribution: 'UNHCR Refugee Data Finder',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const base = ctx.env.UNHCR_BASE ?? 'https://api.unhcr.org';
    const to = ctx.now.getUTCFullYear();
    const all = async (what: string, params: string) => {
      const items: Item[] = [];
      for (let page = 1; ; page++) {
        const res = await getJson<Page>(ctx.http, `${base}/population/v1/population/?limit=${LIMIT}&page=${page}&yearFrom=${FROM}&yearTo=${to}&${params}`, { timeout: 180_000 });
        check(Array.isArray(res?.items), `${what} page ${page}: no "items" array; the format changed`);
        items.push(...res.items);
        if (page >= (res.maxPages ?? 1) || res.items.length < LIMIT) break;
        check(page < 50, `${what}: more than 50 pages`);
      }
      check(items.every((r) => 'year' in r && 'refugees' in r), `${what}: rows lack "year" or "refugees"; the format changed`);
      return items;
    };

    const byOrigin = await all('by origin', 'coo_all=true');
    const byHost = await all('by host', 'coa_all=true');
    const rawPairs = await all('pairs', 'coo_all=true&coa_all=true');
    const pairs = foldPairs(rawPairs);
    const years = byOrigin.map((r) => num(r.year));
    const dataTo = Math.max(...years);
    ctx.log(`${byOrigin.length} origin rows, ${byHost.length} host rows, ${rawPairs.length} pairs → ${pairs.length} after folding, ${Math.min(...years)}–${dataTo}`);

    check(new Set(byOrigin.map((r) => r.coo_iso)).size >= 150, 'fewer than 150 countries of origin');
    check(new Set(byHost.map((r) => r.coa_iso)).size >= 150, 'fewer than 150 host countries');
    // Folding must not lose anyone: refugee totals per origin are the same before and after.
    const sum = (rows: Item[]) => rows.reduce((s, r) => s + num(r.refugees), 0);
    check(sum(pairs) === sum(rawPairs), 'folding changed the refugee total');
    const prev = await ctx.previous('pairs.json');
    guardShrink(ctx, 'pairs.json', pairs.length, prev, (p) => (JSON.parse(p) as Page).items.length);

    const wrap = (items: Item[]) => ({ page: 1, maxPages: 1, total: items.length, items });
    return {
      files: [json('by-origin.json', wrap(byOrigin)), json('by-host.json', wrap(byHost)), json('pairs.json', wrap(pairs))],
      rows: byOrigin.length + byHost.length + pairs.length,
      dataTo: String(dataTo),
    };
  },
};
export default source;
