// The territory and code table (docs/territories.md): one row per place the site can show, with
// its internal id, names and codes, and the per-source code mappings and coverage notes. Adapters
// turn each source's country codes or names into internal ids with a Matcher, which also counts
// what it could not match so the build can report it. Data stays with the unit the source reports:
// nothing here moves figures between places.
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../pipeline/lib/csv.ts';

export type Kind = 'country' | 'territory' | 'historical' | 'other';

export interface Place {
  /** Internal id: the ISO 3166-1 alpha-3 code, the withdrawn ISO 3166-3 code for a former state, or an X code of ours. */
  id: string;
  iso2: string;
  iso3: string;
  /** UN M49 (the ISO 3166 numeric code for current countries). */
  m49: string;
  kind: Kind;
  /** The administering country of a territory. */
  parent: string;
  /** Display name: the ISO short name in its everyday form (territories policy, section 3). */
  name: string;
  /** For tight spaces; the name when empty. */
  short: string;
  slug: string;
  /** The ISO 3166 short name, when it differs from the display name it is shown in the source line. */
  isoName: string;
  /** Neutral status line for profile kickers. */
  status: string;
  /** Dates a place existed, for historical states and new ones (YYYY-MM-DD). */
  start: string;
  end: string;
  /** For a former state: the places it split into or joined. */
  splitInto: string[];
}

/** A source's code that is not a plain ISO or M49 code, or that maps differently from one. */
export interface CodeRow {
  /** A source id, or "*" for every source using that kind of code. */
  source: string;
  system: System;
  code: string;
  /** Internal id; empty for an aggregate (world, region) that is skipped on purpose. */
  place: string;
  start: string;
  end: string;
  note: string;
}

export interface CoverageNote {
  source: string;
  place: string;
  note: string;
  /** Whether the fact in the note was checked against a cited source (the policy's notes start as drafts). */
  checked: boolean;
}

/** Kinds of code; `code` is a source's own list (CelesTrak's owner codes), matched only through codes.csv. */
export type System = 'iso3' | 'iso2' | 'm49' | 'name' | 'code';

const dir = new URL('../data/places/', import.meta.url);
const table = (file: string) => {
  const [head, ...rows] = parseCsv(readFileSync(new URL(file, dir), 'utf8'));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
};

export const PLACES: Place[] = table('places.csv').map((r) => ({
  id: r.id, iso2: r.iso2, iso3: r.iso3, m49: r.m49, kind: r.kind as Kind, parent: r.parent, name: r.name, short: r.short || r.name,
  slug: r.slug, isoName: r.iso_name, status: r.status, start: r.start, end: r.end, splitInto: r.split_into ? r.split_into.split(';') : [],
}));
export const CODES: CodeRow[] = table('codes.csv').map((r) => ({ source: r.source, system: r.system as System, code: r.code, place: r.place, start: r.start, end: r.end, note: r.note }));
export const NOTES: CoverageNote[] = table('notes.csv').map((r) => ({ source: r.source, place: r.place, note: r.note, checked: r.checked === 'yes' }));

const byId = new Map(PLACES.map((p) => [p.id, p]));
export const place = (id: string) => byId.get(id);

/** Names compared without case, accents, punctuation, a leading "the" or trailing "(the)", "&" or "St" for Saint. */
export const normName = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s*\(the\)$/, '').replace(/&/g, ' and ').replace(/['’`.]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').replace(/\bst\b/g, 'saint').trim();

const key = (system: System, code: string) => (system === 'name' ? normName(code) : system === 'm49' ? code.replace(/^0+/, '') : code.toUpperCase());

/** The plain lookup for each kind of code, from the places table. */
const generic = new Map<string, string>();
for (const p of PLACES) {
  if (p.iso3) generic.set(`iso3:${p.iso3}`, p.id);
  if (p.iso2) generic.set(`iso2:${p.iso2}`, p.id);
  if (p.m49) generic.set(`m49:${key('m49', p.m49)}`, p.id);
  for (const n of [p.name, p.short, p.isoName]) if (n) generic.set(`name:${normName(n)}`, p.id);
}

const inDates = (row: { start: string; end: string }, date?: string) =>
  !date || ((!row.start || date >= row.start.slice(0, date.length)) && (!row.end || date < row.end.slice(0, date.length)));

/**
 * Matches one source's codes to internal ids: the source's own rows in codes.csv first, then rows
 * for every source ("*"), then the places table. Unmatched codes are counted for the build report.
 */
export class Matcher {
  readonly source: string;
  readonly system: System;
  private rows: CodeRow[];
  private missed = new Map<string, number>();
  constructor(source: string, system: System, rows: CodeRow[] = CODES) {
    this.source = source;
    this.system = system;
    this.rows = rows.filter((r) => r.system === system && (r.source === source || r.source === '*'))
      .sort((a, b) => Number(b.source === source) - Number(a.source === source));
  }

  /** The internal id for a code, at a date (YYYY or YYYY-MM-DD) when mappings change over time; null when unknown or an aggregate. */
  match(code: string, date?: string): string | null {
    const id = this.lookup(code, date);
    if (id !== undefined) return id;
    if (code.trim()) this.missed.set(code.trim(), (this.missed.get(code.trim()) ?? 0) + 1);
    return null;
  }

  /** Like match, but undefined for an unknown code, which is not counted (for trying a cell whole before splitting it). */
  lookup(code: string, date?: string): string | null | undefined {
    const k = key(this.system, code.trim());
    if (!k) return null;
    const row = this.rows.find((r) => key(this.system, r.code) === k && inDates(r, date));
    if (row) return row.place || null;
    return generic.get(`${this.system}:${k}`);
  }

  /** Whether the code is one the table skips on purpose (a world or regional total). */
  isAggregate(code: string): boolean {
    const k = key(this.system, code.trim());
    return this.rows.some((r) => key(this.system, r.code) === k && !r.place);
  }

  /** Codes that matched nothing, most frequent first. */
  unmatched(): [string, number][] {
    return [...this.missed].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  report(): string {
    const u = this.unmatched();
    const what = this.system === 'name' ? 'name' : this.system === 'code' ? 'code' : `${this.system} code`;
    return u.length ? `${this.source}: ${u.length} unmatched ${what}(s): ${u.map(([c, n]) => `${c} (${n})`).join(', ')}` : `${this.source}: every ${what} matched`;
  }
}

/** The coverage notes to show next to a source's figure for a place. */
export const notesFor = (source: string, id: string) => NOTES.filter((n) => n.place === id && (n.source === source || n.source === '*'));

/** The administering country's name, for a territory. */
export const parentName = (id: string) => {
  const p = place(id);
  return p?.parent ? place(p.parent)?.name : undefined;
};
