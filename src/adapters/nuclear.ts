// Nuclear warhead estimates from the Federation of American Scientists (FAS), two files:
//
// - fas/nuclear-warhead-inventories.csv (fetched, pipeline/sources/fas.ts): Our World in Data's grapher CSV of FAS's
//   estimates, one row per country and year since 1945 (Entity, Code, Year, then one column per figure). The adapter
//   finds its columns by what they name rather than by exact header, since OWID renames short names now and then:
//   a total inventory column if there is one, else the sum of the status columns (deployed, reserve, retired) it has.
// - fas-forces/status-world-nuclear-forces.csv (imported by hand, kind `fas-forces`): FAS's current table, which
//   only FAS's own page has (deployed strategic and nonstrategic, reserve, military stockpile, total inventory), with
//   the date FAS gives and a link to the page.
//
// Every figure is an estimate: governments keep them secret. When FAS revises a past year, the newer file's figure
// replaces the old one: OWID's file is replaced whole on each fetch, and the hand-kept table's year wins over OWID's.
import { csvRecords, parseCsv } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, num, put } from './core.ts';

export const FAS_FILE = 'nuclear-warhead-inventories.csv';
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
  /** Total warhead inventory by place and year (the year of the estimate: FAS dates them "early" in the year). */
  inventory: Series;
  /** The current split, by place, from the hand-kept table; null when it has not been imported. */
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

export function nuclear(raw: Raw): NuclearData {
  const inventory = parseInventory(raw.text('fas', FAS_FILE));
  const forces = raw.has('fas-forces', FORCES_FILE) ? parseForces(raw.text('fas-forces', FORCES_FILE)) : null;
  // FAS's own table is newer than OWID's copy of it: its year replaces OWID's figure for that year.
  if (forces) for (const f of Object.values(forces.rows)) put(inventory, f.place, forces.year, f.inventory);
  return { inventory, forces };
}
