// UCDP Georeferenced Event Dataset API (free token, by email) → ucdp/, one file per release in the API's own
// { TotalCount, Result } format, the format of the prototype's samples:
//   gedevents_<yy>.1.json    the yearly release (GED), events from FROM to the end of the year before the release
//   gedevents_<yy>.0.<m>.json the monthly Candidate releases for the months after it, newer but may be revised
// Events are trimmed to the fields the site uses. Releases do not change once out, so a release already in the
// last good snapshot is carried over, not fetched again; Candidate releases for a year the yearly release now
// covers are dropped. The token goes in the x-ucdp-access-token header; the API allows 5,000 requests a day.
import { HttpError, getJson } from '../lib/http.ts';
import { type FetchContext, type SourceFile, type Source, DAY, check } from '../lib/source.ts';

/** The first day the view shows (spec: "organised violence by month since 2023"). */
export const FROM = '2023-01-01';
const PAGE = 1000;
const MAX_PAGES = 400;

export const FIELDS = ['id', 'year', 'type_of_violence', 'conflict_new_id', 'conflict_name', 'side_a', 'side_b', 'where_prec', 'adm_1',
  'latitude', 'longitude', 'country', 'country_id', 'date_start', 'date_end', 'deaths_civilians', 'best', 'high', 'low'] as const;

type Row = Record<string, string | number | null>;
interface Page { TotalCount?: number; TotalPages?: number; NextPageUrl?: string; Result?: Row[] }

export const fileName = (version: string) => `gedevents_${version}.json`;
export const trim = (r: Row): Row => Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null]));

const missing = (e: unknown) => e instanceof HttpError && (e.status === 404 || e.status === 400);

/** Every page of one release, from FROM on; null when the release does not exist (yet). */
async function release(ctx: FetchContext, base: string, token: string, version: string): Promise<Row[] | null> {
  const headers = { 'x-ucdp-access-token': token };
  const rows: Row[] = [];
  let url = `${base}/gedevents/${version}?pagesize=${PAGE}&page=0&StartDate=${FROM}`;
  for (let n = 0; ; n++) {
    check(n < MAX_PAGES, `${version}: more than ${MAX_PAGES} pages`);
    let page: Page;
    try {
      page = await getJson<Page>(ctx.http, url, { headers, timeout: 120_000 });
    } catch (e) {
      if (n === 0 && missing(e)) return null;
      throw e;
    }
    check(Array.isArray(page.Result), `${version}: no Result array; the format changed`);
    if (n === 0 && !page.Result.length && !page.TotalCount) return null;
    rows.push(...page.Result.map(trim));
    if (!page.NextPageUrl) break;
    // The API's next link is plain http on some releases.
    url = page.NextPageUrl.replace(/^http:/, 'https:');
  }
  return rows;
}

const source: Source = {
  id: 'ucdp',
  name: 'Uppsala Conflict Data Program',
  every: 7 * DAY,
  staleAfter: 45 * DAY,
  enabled: process.env.UCDP_TOKEN ? true : 'waits for an API token (UCDP_TOKEN)',
  attribution: 'Uppsala Conflict Data Program (UCDP)',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const token = ctx.env.UCDP_TOKEN;
    check(token, 'UCDP_TOKEN is not set');
    const base = ctx.env.UCDP_BASE ?? 'https://ucdpapi.pcr.uu.se/api';
    const yy = ctx.now.getUTCFullYear() % 100;
    const files: SourceFile[] = [];
    let rows = 0;
    const keep = async (version: string, fetchIt: boolean) => {
      const name = fileName(version);
      const prev = await ctx.previous(name);
      if (prev && !fetchIt) {
        files.push({ name, body: prev, contentType: 'application/json' });
        rows += (JSON.parse(prev) as Page).TotalCount ?? 0;
        return true;
      }
      const got = await release(ctx, base, token, version);
      if (!got) return false;
      ctx.log(`${name}: ${got.length} events`);
      files.push({ name, body: JSON.stringify({ TotalCount: got.length, Result: got }), contentType: 'application/json' });
      rows += got.length;
      return true;
    };

    // The yearly release: this year's once it is out (usually June), else last year's.
    let ged: number | null = null;
    for (const y of [yy, yy - 1]) {
      const prev = await ctx.previous(fileName(`${y}.1`));
      if (await keep(`${y}.1`, !prev)) { ged = y; break; }
    }
    check(ged !== null, `no yearly release ${yy}.1 or ${yy - 1}.1`);
    const gedEvents = JSON.parse(files[0].body as string) as Page;
    check((gedEvents.TotalCount ?? 0) >= 1000, `${ged}.1: only ${gedEvents.TotalCount} events since ${FROM}`);

    // Candidate releases for each month after the yearly release covers, up to last month.
    let last = '';
    for (let y = ged; y <= yy; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === yy && m > ctx.now.getUTCMonth() + 1) break;
        const v = `${y}.0.${m}`;
        // The two newest are fetched again in case a release was corrected; older ones are carried over.
        const recent = y * 12 + m >= yy * 12 + ctx.now.getUTCMonth();
        if (!(await keep(v, recent))) break;
        last = v;
      }
    }
    check(last || ctx.now.getUTCMonth() < 2, 'no Candidate release found for this year');
    const latest = files.flatMap((f) => (JSON.parse(f.body as string) as Page).Result ?? []).reduce((mx, r) => (String(r.date_start) > mx ? String(r.date_start) : mx), '');
    ctx.log(`latest event ${latest.slice(0, 10)}, newest Candidate release ${last || 'none'}`);
    return { files, rows, dataTo: latest.slice(0, 7) };
  },
};
export default source;
