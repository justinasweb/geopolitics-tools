// Nuclear warhead estimates from the Federation of American Scientists (FAS), three files:
//
// - fas/nuclear-warhead-stockpiles.csv (fetched, pipeline/sources/fas.ts): Our World in Data's grapher CSV of FAS's
//   estimated stockpiles, one row per country and year since 1945 (Entity, Code, Year, then the figure). The map's
//   series. Columns are found by what they name, since OWID renames short names now and then.
// - fas/nuclear-warhead-inventories.csv (fetched too): OWID's chart of the latest estimate by status (deployed,
//   reserve, retired), which holds the latest year only. The split in the panel and table.
// - fas-forces/status-world-nuclear-forces.csv (imported by hand, kind `fas-forces`, optional): FAS's own table, with
//   its date and link. When it is as new as OWID's split or newer, it replaces it.
//
// Every figure is an estimate: governments keep them secret. When FAS revises a past year, the new figure replaces the
// old one, since OWID's files are replaced whole on each fetch. The series and the split are kept apart: the series is
// one measure across every year, and a split's total is never written into it.
import { csvRecords, parseCsv } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

export const FAS_FILE = 'nuclear-warhead-stockpiles.csv';
export const STATUS_FILE = 'nuclear-warhead-inventories.csv';
export const FORCES_FILE = 'status-world-nuclear-forces.csv';

/** The current split for one country, as FAS's table gives it. */
export interface Forces {
  place: string;
  /** Deployed strategic plus deployed nonstrategic. */
  deployed: number;
  deployedStrategic: number;
  deployedNonstrategic: number;
  /** Warheads in the military stockpile that are not deployed (FAS: reserve/nondeployed). */
  reserve: number;
  /** Deployed plus reserve: the warheads assigned to the military. */
  stockpile: number;
  /** Retired, still intact, awaiting dismantlement: total inventory less the military stockpile. */
  retired: number;
  inventory: number;
}

export interface NuclearData {
  /** Estimated warheads by place and year (the year of the estimate: FAS dates them "early" in the year). */
  inventory: Series;
  /** The latest split by place: FAS's own table when imported and as new, else OWID's status chart; null when neither. */
  forces: { year: number; asOf: string; url: string; rows: Record<string, Forces> } | null;
}

type Pick = { total?: number; parts: number[] };

/** Which columns hold what, from the grapher CSV's header. */
export function columnsOf(head: string[]): Pick {
  const lower = head.map((h) => h.toLowerCase());
  const total = lower.findIndex((h, i) => i > 2 && /total|inventor|stockpile/.test(h) && !/retired|deployed|reserve/.test(h));
  const parts = lower.map((h, i) => (i > 2 && /retired|deployed|reserve/.test(h) ? i : -1)).filter((i) => i >= 0);
  return { total: total >= 0 ? total : undefined, parts };
}

export function parseInventory(text: string): Series {
  const [head, ...rows] = parseCsv(text);
  const at = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k);
  const [ci, yi] = [at('code'), at('year')];
  if (ci < 0 || yi < 0) throw new Error(`fas/${FAS_FILE}: no Code or Year column (columns: ${head.join(', ')})`);
  const cols = columnsOf(head);
  if (cols.total === undefined && !cols.parts.length) throw new Error(`fas/${FAS_FILE}: no warhead column (columns: ${head.join(', ')})`);
  const m = matcher('fas', 'iso3');
  const out: Series = {};
  for (const r of rows) {
    const code = r[ci]?.trim();
    const year = Number(r[yi]);
    // The World row and other aggregates have no code (or OWID's own, OWID_WRL).
    if (!code || code.startsWith('OWID_') || !year) continue;
    const id = m.match(code);
    if (!id) continue;
    const parts = cols.parts.map((i) => num(r[i])).filter((v): v is number => v !== null);
    const v = cols.total !== undefined ? num(r[cols.total]) : parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    // OWID writes 0 for the years before a state's first weapon; those are not estimates of anything.
    if (v !== null && v > 0) put(out, id, year, v);
  }
  return out;
}

/** The hand-kept FAS table: one row per country, its date ("As of", ISO) and the page it was copied from. */
export function parseForces(text: string): NonNullable<NuclearData['forces']> {
  const m = matcher('fas', 'name');
  const rows: Record<string, Forces> = {};
  let asOf = '', url = '';
  for (const r of csvRecords(text)) {
    // FAS's own total row: the site adds up the countries instead.
    if (/^total$/i.test(r.Country.trim())) continue;
    const id = m.match(r.Country);
    if (!id) continue;
    const n = (k: string) => num(r[k]) ?? 0;
    const stockpile = n('Military stockpile');
    const inventory = n('Total inventory');
    const [ds, dn] = [n('Deployed strategic'), n('Deployed nonstrategic')];
    if (!inventory || stockpile > inventory || ds + dn > stockpile) throw new Error(`fas-forces/${FORCES_FILE}: ${r.Country}'s figures do not add up (deployed ≤ military stockpile ≤ total inventory)`);
    rows[id] = {
      place: id, deployedStrategic: ds, deployedNonstrategic: dn, deployed: ds + dn,
      reserve: stockpile - ds - dn, stockpile, retired: inventory - stockpile, inventory,
    };
    asOf ||= r['As of']?.trim() ?? '';
    url ||= r.Source?.trim() ?? '';
  }
  const year = Number(asOf.slice(0, 4));
  if (!year || !Object.keys(rows).length) throw new Error(`fas-forces/${FORCES_FILE}: no rows, or no "As of" date`);
  return { year, asOf, url, rows };
}

/** Which status column is which, by name; "reserve" before "deployed", since "nondeployed" contains it. */
export function statusColumns(head: string[]): Partial<Record<'ds' | 'dn' | 'reserve' | 'retired' | 'deployed', number>> {
  const out: Partial<Record<'ds' | 'dn' | 'reserve' | 'retired' | 'deployed', number>> = {};
  head.forEach((h, i) => {
    if (i < 3) return;
    const l = h.toLowerCase();
    if (/retired/.test(l)) out.retired = i;
    else if (/reserve|non.?deployed/.test(l)) out.reserve = i;
    else if (/deployed/.test(l) && /non.?strategic/.test(l)) out.dn = i;
    else if (/deployed/.test(l) && /strategic/.test(l)) out.ds = i;
    else if (/deployed/.test(l)) out.deployed = i;
  });
  return out;
}

/** OWID's status chart: the split for its latest year, by place. */
export function parseStatus(text: string): NonNullable<NuclearData['forces']> | null {
  const [head, ...rows] = parseCsv(text);
  const c = statusColumns(head);
  if (c.reserve === undefined && c.retired === undefined) return null;
  const m = matcher('fas', 'iso3');
  const at = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k);
  const [ci, yi] = [at('code'), at('year')];
  const n = (r: string[], i?: number) => (i === undefined ? 0 : num(r[i]) ?? 0);
  const valid = rows.filter((r) => r[ci] && !r[ci].startsWith('OWID_') && Number(r[yi]));
  const year = Math.max(...valid.map((r) => Number(r[yi])));
  const out: Record<string, Forces> = {};
  for (const r of valid.filter((x) => Number(x[yi]) === year)) {
    const id = m.match(r[ci]);
    if (!id) continue;
    const ds = n(r, c.ds) + n(r, c.deployed), dn = n(r, c.dn), reserve = n(r, c.reserve), retired = n(r, c.retired);
    const stockpile = ds + dn + reserve;
    if (stockpile + retired > 0) out[id] = { place: id, deployedStrategic: ds, deployedNonstrategic: dn, deployed: ds + dn, reserve, stockpile, retired, inventory: stockpile + retired };
  }
  return Object.keys(out).length ? { year, asOf: String(year), url: 'https://ourworldindata.org/grapher/nuclear-warhead-inventories', rows: out } : null;
}

export function nuclear(raw: Raw): NuclearData {
  const inventory = parseInventory(raw.text('fas', FAS_FILE));
  const owid = raw.has('fas', STATUS_FILE) ? parseStatus(raw.text('fas', STATUS_FILE)) : null;
  const hand = raw.has('fas-forces', FORCES_FILE) ? parseForces(raw.text('fas-forces', FORCES_FILE)) : null;
  // FAS's own table wins when it is at least as new as OWID's copy of it.
  const forces = hand && (!owid || hand.year >= owid.year) ? hand : owid;
  return { inventory, forces };
}
