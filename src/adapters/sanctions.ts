// Sanctions lists, in the formats the fetchers save, turned into one shape: one listing per
// designated person, company, ship or aircraft, placed by the country of its first address, else
// its nationality. Counts measure how many targets a list names, not how severe the measures are.
//   US  csl/consolidated.json      the Consolidated Screening List; the SDN list counts as sanctions,
//                                  and the Entity List is kept apart for the AI and chips view
//   EU  eu-sanctions/sanctions.csv the FSF export, one row per name and address: grouped by entity
//   UK  uk-sanctions/sanctions.csv the UK Sanctions List, one row per name and address: grouped by
//                                  designation; countries are names
// Ported from the prototype's src/adapters/sanctions.js.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { isoDate } from '../../pipeline/sources/eu-sanctions.ts';
import { type Raw, type Series, matcher, put } from './core.ts';

export type List = 'US' | 'EU' | 'UK';
export const LISTS: List[] = ['US', 'EU', 'UK'];
export type Target = 'person' | 'entity' | 'vessel' | 'aircraft';

export interface Listing { list: List; place: string; programme: string; type: Target; year: number | null }

export const typeOf = (t: unknown): Target => {
  const s = String(t ?? '').toLowerCase();
  if (/individual|person|^p$/.test(s)) return 'person';
  if (/vessel|ship/.test(s)) return 'vessel';
  if (/aircraft/.test(s)) return 'aircraft';
  return 'entity';
};
const yearOf = (d: unknown) => {
  const m = /(\d{4})/.exec(isoDate(String(d ?? '')));
  return m ? Number(m[1]) : null;
};

/** A country given as an ISO alpha-2 code or a name, for one source. */
const country = (source: string) => {
  const iso2 = matcher(source, 'iso2');
  const name = matcher(source, 'name');
  return (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    return /^[A-Z]{2}$/i.test(s) ? iso2.match(s) : name.match(s);
  };
};

interface CslRecord { source?: string; type?: string; programs?: string[]; start_date?: string; addresses?: { country?: string | null }[]; nationalities?: string[]; citizenships?: string[] }

const SDN = /Specially Designated Nationals/i;
const ENTITY_LIST = /Entity List/i;

function cslListings(json: { results?: CslRecord[] }, which: RegExp): Listing[] {
  const at = country('csl');
  const out: Listing[] = [];
  for (const r of json.results ?? []) {
    if (!which.test(r.source ?? '')) continue;
    const place = at(r.addresses?.find((a) => a?.country)?.country) ?? at(r.nationalities?.[0]) ?? at(r.citizenships?.[0]);
    if (place) out.push({ list: 'US', place, programme: r.programs?.[0] ?? '', type: typeOf(r.type), year: yearOf(r.start_date) });
  }
  return out;
}

export const parseSdn = (json: { results?: CslRecord[] }) => cslListings(json, SDN);
/** The US Entity List (export controls, not sanctions), for the AI and chips view. */
export const parseEntityList = (json: { results?: CslRecord[] }) => cslListings(json, ENTITY_LIST);

/** Rows grouped by an id column, in file order. */
const groups = (rows: Record<string, string>[], id: string) => {
  const by = new Map<string, Record<string, string>[]>();
  for (const r of rows) if (r[id]) by.set(r[id], [...(by.get(r[id]) ?? []), r]);
  return [...by.values()];
};
const first = (rows: Record<string, string>[], col: string) => rows.map((r) => (r[col] ?? '').trim()).find(Boolean) ?? '';
const earliest = (rows: Record<string, string>[], col: string) => rows.map((r) => isoDate((r[col] ?? '').trim())).filter(Boolean).sort()[0] ?? '';

export function parseEu(text: string): Listing[] {
  const at = country('eu-sanctions');
  const out: Listing[] = [];
  for (const g of groups(csvRecords(text), 'Entity_LogicalId')) {
    const place = at(first(g, 'Address_CountryIso2Code')) ?? at(first(g, 'Citizenship_CountryIso2Code'));
    if (place) out.push({ list: 'EU', place, programme: first(g, 'Entity_Regulation_Programme'), type: typeOf(first(g, 'Entity_SubjectType_ClassificationCode')), year: yearOf(earliest(g, 'Entity_Regulation_PublicationDate')) });
  }
  return out;
}

export function parseUk(text: string): Listing[] {
  const at = country('uk-sanctions');
  // Several nationalities come in one cell; the first one counts.
  const firstOf = (v: string) => v.split(/[;|]|\s{2,}/)[0]?.trim() ?? '';
  const out: Listing[] = [];
  for (const g of groups(csvRecords(text), 'Unique ID')) {
    const place = at(first(g, 'Address Country')) ?? at(firstOf(first(g, 'Nationality(/ies)')));
    if (place) out.push({ list: 'UK', place, programme: first(g, 'Regime Name'), type: typeOf(first(g, 'Designation Type')), year: yearOf(earliest(g, 'Date Designated')) });
  }
  return out;
}

export interface PlaceListings { total: number; byList: Record<List, number>; byProgramme: Record<string, number>; byType: Partial<Record<Target, number>>; added: Record<List, Record<number, number>> }

export interface Sanctions {
  lists: Record<List, number>;
  byPlace: Record<string, PlaceListings>;
  /** Listings added each year, by list (of those still listed: the files hold current listings only). */
  added: Record<List, Record<number, number>>;
  /** Entity List entries by place, for the AI and chips view. */
  entityList: Record<string, number>;
}

export function aggregate(listings: Listing[], entityList: Listing[] = []): Sanctions {
  const out: Sanctions = { lists: { US: 0, EU: 0, UK: 0 }, byPlace: {}, added: { US: {}, EU: {}, UK: {} }, entityList: {} };
  for (const e of listings) {
    out.lists[e.list]++;
    const c = (out.byPlace[e.place] ??= { total: 0, byList: { US: 0, EU: 0, UK: 0 }, byProgramme: {}, byType: {}, added: { US: {}, EU: {}, UK: {} } });
    c.total++;
    c.byList[e.list]++;
    if (e.programme) c.byProgramme[`${e.list}|${e.programme}`] = (c.byProgramme[`${e.list}|${e.programme}`] ?? 0) + 1;
    c.byType[e.type] = (c.byType[e.type] ?? 0) + 1;
    if (e.year) {
      c.added[e.list][e.year] = (c.added[e.list][e.year] ?? 0) + 1;
      out.added[e.list][e.year] = (out.added[e.list][e.year] ?? 0) + 1;
    }
  }
  for (const e of entityList) out.entityList[e.place] = (out.entityList[e.place] ?? 0) + 1;
  return out;
}

export function sanctions(raw: Raw): Sanctions {
  const csl = raw.json<{ results?: CslRecord[] }>('csl', 'consolidated.json');
  return aggregate([...parseSdn(csl), ...parseEu(raw.text('eu-sanctions', 'sanctions.csv')), ...parseUk(raw.text('uk-sanctions', 'sanctions.csv'))], parseEntityList(csl));
}

/** Listings by place, as a one-year series at `year`. */
export const listingsAt = (s: Sanctions, year: number): Series => {
  const out: Series = {};
  for (const [id, c] of Object.entries(s.byPlace)) put(out, id, year, c.total);
  return out;
};
