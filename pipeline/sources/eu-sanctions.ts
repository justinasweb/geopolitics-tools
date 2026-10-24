// EU consolidated financial sanctions list (FSF, CSV export) → eu-sanctions/sanctions.csv.
// The export repeats each entity once per name, address, birth date and document; it is trimmed
// to the columns the site counts (entity, type, programme, dates, countries) and duplicate rows
// are dropped. The token in the address is the public one the Commission publishes for this export.
import { getText } from '../lib/http.ts';
import { parseCsv, pickColumns, toCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

export const COLUMNS = [
  'fileGenerationDate', 'Entity_LogicalId', 'Entity_EU_ReferenceNumber', 'Entity_SubjectType_ClassificationCode',
  'Entity_Regulation_Programme', 'Entity_Regulation_PublicationDate', 'Entity_Regulation_EntryIntoForceDate',
  'NameAlias_WholeName', 'Address_CountryIso2Code', 'Citizenship_CountryIso2Code',
];

/** The export writes dates as 23/10/2026 (and has used 2026-10-23); both become 2026-10-23. */
export const isoDate = (d: string) => {
  const m = d.match(/^(\d\d)\/(\d\d)\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d.slice(0, 10);
};

const source: Source = {
  id: 'eu-sanctions',
  name: 'EU sanctions list',
  every: 1 * DAY,
  staleAfter: 10 * DAY,
  enabled: true,
  attribution: 'European Commission, Financial Sanctions Database (FSF)',
  licence: 'Reuse allowed with credit (Commission Decision 2011/833/EU)',
  async fetch(ctx) {
    const url = ctx.env.EU_FSF_URL ?? 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';
    const all = parseCsv(await getText(ctx.http, url, { timeout: 180_000 }), ';');
    const picked = pickColumns(all, COLUMNS, 'EU sanctions CSV');
    // The generation date changes daily; it is kept out of the file, so an unchanged list saves no new copy.
    const generated = isoDate(picked[1]?.[0] ?? '');
    const seen = new Set<string>();
    const rows = [picked[0].slice(1)];
    for (const r of picked.slice(1)) {
      const k = r.slice(1).join('\u0001');
      if (!seen.has(k)) { seen.add(k); rows.push(r.slice(1)); }
    }
    const entities = new Set(rows.slice(1).map((r) => r[0])).size;
    ctx.log(`${all.length - 1} export rows → ${rows.length - 1} after trimming, ${entities} entities`);
    check(entities >= 2_000, `only ${entities} listed entities`);
    const prev = await ctx.previous('sanctions.csv');
    guardShrink(ctx, 'sanctions.csv', entities, prev, (p) => new Set(parseCsv(p).slice(1).map((r) => r[0])).size, 0.8);
    return { files: [text('sanctions.csv', toCsv(rows), 'text/csv')], rows: entities, dataTo: generated };
  },
};
export default source;
