// EuRepoC Global Dataset of Cyber Incidents, from its Zenodo record (spec D18): publicly known cyber incidents since
// 2000, coded by the European Repository of Cyber Incidents from public reports. CC BY-NC 4.0 since 2 April 2025.
//
// The site stays on one version (RECORD), since the version goes into the credit and a new one changes the counts.
// Each month the fetcher downloads that version's files and asks Zenodo for the newest version of the dataset; when a
// newer one exists it sends a notice once (the runner's `notice`) and keeps the pinned files. Switching is a pull
// request that changes RECORD and VERSION, so the new counts are reviewed like any change.
//
// Two of the record's CSVs are saved, trimmed to the columns the site reads (rows that the trim makes identical are
// dropped; the attribution file repeats an attribution once per attributing actor):
//
// - eurepoc/incidents.csv, from eurepoc_global_dataset_*.csv: one row per incident. receiver_country and
//   receiver_country_alpha_2_code are ";"-separated and aligned (one entry per receiver category, so countries
//   repeat); regions have longer codes (EUROPE, NATO) and unknown ones "#N/A". start_date is DD.MM.YYYY or
//   "Not available".
// - eurepoc/attributions.csv, from eurepoc_attribution_dataset_*.csv: one row per attribution and attributed
//   initiator. attribution_basis is who attributed it; initiator_alpha_2 can list several codes (", "-separated).
// - eurepoc/version.json: the record, version, publication date and DOI, for the credit.
//
// The receiver file (receiver names by category) and the dyadic file are not needed: the main file carries the
// receiver countries with their codes, and the pairs are built from the two files above.
import { getJson, getText } from '../lib/http.ts';
import { parseCsv, pickColumns, toCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, json, text } from '../lib/source.ts';

/** The pinned Zenodo record and its version. Change both together, in a pull request. */
export const RECORD = '14965395';
export const VERSION = '1.3.2';

export const INCIDENT_COLUMNS = ['incident_id', 'start_date', 'receiver_country', 'receiver_country_alpha_2_code'];
export const ATTRIBUTION_COLUMNS = ['incident_id', 'attribution_id', 'attribution_basis', 'settled_attribution', 'initiator_alpha_2', 'initiator_country', 'initiator_category', 'initiator_subcategory'];

interface ZenodoFile { key: string; size?: number; links: { self: string } }
interface ZenodoRecord {
  id: number | string;
  doi?: string;
  metadata: { title?: string; version?: string; publication_date?: string; license?: { id?: string } };
  files: ZenodoFile[];
  links: { latest?: string };
}

const base = (env: Record<string, string | undefined>) => env.ZENODO_BASE ?? 'https://zenodo.org/api';

/** The record's CSV whose name matches, the only one. */
function fileOf(rec: ZenodoRecord, re: RegExp): ZenodoFile {
  const hits = rec.files.filter((f) => re.test(f.key));
  check(hits.length === 1, `record ${rec.id}: expected one file matching ${re}, found ${hits.map((f) => f.key).join(', ') || 'none'}`);
  return hits[0];
}

/** Keeps the named columns, drops rows the trim made identical, and checks every row has an incident id. */
export function trim(body: string, columns: string[], what: string): string[][] {
  const [head, ...rows] = pickColumns(parseCsv(body), columns, what);
  const seen = new Set<string>();
  const out = [head];
  for (const r of rows) {
    const k = r.join('\u0000');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  check(out.slice(1).every((r) => /^\d+$/.test(r[0])), `${what}: rows without a numeric incident_id`);
  return out;
}

/** The latest start year among the incidents, for the status page. */
const lastYear = (rows: string[][]) => Math.max(...rows.slice(1).map((r) => Number(/(\d{4})$/.exec(r[1])?.[1] ?? 0)));

const source: Source = {
  id: 'eurepoc',
  name: 'EuRepoC cyber incidents',
  every: 30 * DAY,
  staleAfter: 400 * DAY,
  enabled: true,
  attribution: `EuRepoC, Global Dataset of Cyber Incidents ${VERSION} (Zenodo)`,
  licence: 'CC BY-NC 4.0',
  async fetch(ctx) {
    const api = base(ctx.env);
    const rec = await getJson<ZenodoRecord>(ctx.http, `${api}/records/${RECORD}`, { timeout: 60_000 });
    check(rec.metadata?.version === VERSION, `record ${RECORD} is version ${rec.metadata?.version}, not ${VERSION}`);
    check(rec.metadata.license?.id === 'cc-by-nc-4.0', `record ${RECORD}: licence is ${rec.metadata.license?.id}, not cc-by-nc-4.0; check the terms before using it`);

    const global = await getText(ctx.http, fileOf(rec, /^eurepoc_global_dataset_[\d_.]+\.csv$/).links.self, { timeout: 180_000 });
    const attrib = await getText(ctx.http, fileOf(rec, /^eurepoc_attribution_dataset_[\d_.]+\.csv$/).links.self, { timeout: 120_000 });
    const incidents = trim(global, INCIDENT_COLUMNS, 'incidents');
    const attributions = trim(attrib, ATTRIBUTION_COLUMNS, 'attributions');
    const ids = new Set(incidents.slice(1).map((r) => r[0]));
    check(ids.size === incidents.length - 1, `incidents: ${incidents.length - 1 - ids.size} incident ids appear twice`);
    check(ids.size >= 3000, `incidents: only ${ids.size}; version ${VERSION} has about 3,400`);
    check(attributions.length - 1 >= 3000, `attributions: only ${attributions.length - 1} rows`);
    const stray = attributions.slice(1).filter((r) => !ids.has(r[0])).length;
    check(stray < 0.01 * attributions.length, `attributions: ${stray} rows name incidents not in the main file`);
    guardShrink(ctx, 'incidents', ids.size, await ctx.previous('incidents.csv'), (p) => parseCsv(p).length - 1);

    // The newest version of the dataset. A newer one is announced, never switched to here.
    let notice: string | undefined;
    if (rec.links.latest) {
      const latest = await getJson<ZenodoRecord>(ctx.http, rec.links.latest.replace('https://zenodo.org/api', api), { timeout: 60_000 });
      ctx.log(`pinned ${VERSION} (record ${RECORD}); newest on Zenodo ${latest.metadata?.version} (record ${latest.id})`);
      if (String(latest.id) !== RECORD) {
        notice = `EuRepoC published version ${latest.metadata?.version ?? '?'} of the Global Dataset of Cyber Incidents (${latest.metadata?.publication_date ?? 'no date'}, https://zenodo.org/records/${latest.id}). The site stays on ${VERSION} until RECORD and VERSION in pipeline/sources/eurepoc.ts are changed in a pull request; the counts and the credit change with it.`;
      }
    }

    const version = { record: String(rec.id), version: VERSION, published: rec.metadata.publication_date ?? '', doi: rec.doi ?? '', title: rec.metadata.title ?? '' };
    return {
      files: [text('incidents.csv', toCsv(incidents), 'text/csv'), text('attributions.csv', toCsv(attributions), 'text/csv'), json('version.json', version)],
      rows: ids.size,
      dataTo: String(lastYear(incidents)),
      ...(notice ? { notice } : {}),
    };
  },
};
export default source;
