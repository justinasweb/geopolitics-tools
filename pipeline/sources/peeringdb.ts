// PeeringDB → peeringdb/ix.json, fac.json, ixfac.json: exchange points, facilities and which facilities each exchange
// is in, from the daily bootstrap files PeeringDB publishes for mirrors (docs.peeringdb.com/howto/mirror), one file per
// object type. Anonymous, once a day, one request per file a few seconds apart, never retried: the query limits allow
// 20 anonymous requests a minute and one repeat of the same large request an hour, so any error stops the run and the
// last good files stay. The network type field (net.info_type) is self-reported and goes in API v3: no net file is
// fetched. Kept in PeeringDB's own shape ({ meta, data }) with only the fields the adapter reads.
import { getText } from '../lib/http.ts';
import { type Source, DAY, check, guardShrink, json } from '../lib/source.ts';

export const BASE = 'https://public.peeringdb.com';

/** The fields kept for each object type. */
export const FIELDS = {
  ix: ['id', 'org_id', 'name', 'name_long', 'city', 'country', 'net_count', 'fac_count', 'status', 'updated'],
  fac: ['id', 'name', 'city', 'country', 'latitude', 'longitude', 'status'],
  ixfac: ['id', 'ix_id', 'fac_id', 'status'],
} as const;
type Kind = keyof typeof FIELDS;

/** Fewest records each file must have (11 Nov 2026: 1,328 exchanges, 5,889 facilities, 4,531 links). */
export const MIN = { ix: 800, fac: 3_000, ixfac: 2_500 } satisfies Record<Kind, number>;
/** A bootstrap file older than this (by its meta.generated) is refused: the daily export has stopped. */
const MAX_AGE_DAYS = 4;
/** Pause between the three files, in ms (PeeringDB asks for at least two seconds between queries). */
export const PAUSE_MS = 3_000;

interface Bootstrap { meta?: { generated?: number }; data?: Record<string, unknown>[] }

const source: Source = {
  id: 'peeringdb',
  name: 'PeeringDB',
  every: 1 * DAY,
  staleAfter: 4 * DAY,
  enabled: true,
  attribution: 'PeeringDB',
  licence: 'PeeringDB acceptable use policy (use confirmed by email, 11 Nov 2026)',
  async fetch(ctx) {
    const pause = Number(ctx.env.PEERINGDB_PAUSE_MS ?? PAUSE_MS);
    const files = [];
    const counts = {} as Record<Kind, number>;
    let generated = Infinity;
    for (const [i, kind] of (Object.keys(FIELDS) as Kind[]).entries()) {
      if (i && pause) await new Promise((s) => setTimeout(s, pause));
      const url = `${BASE}/${kind}-0.json`;
      let parsed: Bootstrap;
      try {
        parsed = JSON.parse(await getText(ctx.http, url, { timeout: 120_000, tries: 1 })) as Bootstrap;
      } catch (e) {
        throw e instanceof SyntaxError ? new Error(`${kind}-0.json is not JSON: ${e.message}`) : e;
      }
      check(Array.isArray(parsed.data), `${kind}-0.json has no data list`);
      const at = Number(parsed.meta?.generated);
      check(Number.isFinite(at) && at > 0, `${kind}-0.json has no meta.generated time`);
      const age = (ctx.now.getTime() / 1000 - at) / 86_400;
      check(age <= MAX_AGE_DAYS, `${kind}-0.json was generated ${Math.floor(age)} days ago (${new Date(at * 1000).toISOString().slice(0, 10)})`);
      generated = Math.min(generated, at);
      const fields = FIELDS[kind];
      const missing = fields.filter((f) => !(f in (parsed.data![0] ?? {})));
      check(!missing.length, `${kind}-0.json lacks ${missing.join(', ')}`);
      const data = parsed.data.map((r) => Object.fromEntries(fields.map((f) => [f, r[f] ?? null])));
      check(data.length >= MIN[kind], `only ${data.length} ${kind} records (over ${MIN[kind]} expected)`);
      guardShrink(ctx, `${kind}.json`, data.length, await ctx.previous(`${kind}.json`), (p) => ((JSON.parse(p) as Bootstrap).data ?? []).length, 0.9);
      counts[kind] = data.length;
      files.push(json(`${kind}.json`, { meta: { generated: at }, data }));
    }
    const day = new Date(generated * 1000).toISOString().slice(0, 10);
    ctx.log(`${counts.ix} exchange points, ${counts.fac} facilities, ${counts.ixfac} exchange–facility links, generated ${day}`);
    return { files, rows: counts.ix, dataTo: day };
  },
};
export default source;
