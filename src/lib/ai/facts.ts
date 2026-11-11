// Facts files (spec, D15, "Facts first"): every AI-drafted text on the site is written from one file in
// src/data/ai/facts/, and from nothing else. A fact has its value, unit and period, and the source it comes from
// with a link and a date. The hash of the facts a text uses is stored with it, so a text whose facts changed is
// flagged for redrafting instead of being kept (./store.ts). See docs/ai-drafting.md.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Fact {
  /** Stable id inside the file ("gerd-filling-2020"). */
  id: string;
  /** The fact in one plain sentence, the way the draft may say it. */
  statement: string;
  /** The figure, when the fact has one: in the unit given (a share as a percentage, 83 with unit "%"). */
  value?: number | null;
  /** What the value counts or measures ("billion cubic metres a year", "% of use", "members"). Empty for none. */
  unit?: string;
  /** Other ways of writing the unit that keep its meaning ("bcm", "km³"). */
  unitAliases?: string[];
  /** What the value or event covers: a year, a range of years, a month or a day (YYYY, YYYY–YYYY, YYYY-MM, YYYY-MM-DD). */
  period?: string;
  /** The places the fact is about (internal ids, src/data/places/places.csv). */
  places?: string[];
  /** Source name, as the source calls itself. */
  source: string;
  /** Where to check it: an official or primary page wherever possible. */
  link: string;
  /** When the source published or last updated what is cited (YYYY or YYYY-MM-DD), or when the site read it. */
  date: string;
  /** The figure's tag where the site shows one (Preliminary, Estimate, Projection): a sentence that gives the figure
   *  says so too (./check.ts). */
  status?: 'preliminary' | 'estimated' | 'projected';
  /** A share of a whole, in %: a text writes it as the site does (formatShare, src/lib/format.ts), "40%" for 39.6. */
  share?: boolean;
  /** True when the fact could not be checked against its source yet. Nothing is drafted from such a file. */
  unverified?: boolean;
  /** For the owner: why it is unverified, or what to check. */
  note?: string;
  /** The owner's own words (pages only): the text keeps the statement word for word between `<!-- owner -->` and
   *  `<!-- /owner -->`. It is not drafted, not checked as a draft and never carries the AI label. */
  owner?: boolean;
}

export type FactsKind = 'dossier' | 'history' | 'river' | 'page' | 'hub' | 'week';

export interface FactsFile {
  /** Text id: "dossier:USA", "history:nato", "river:nile", "page:about", "hub:power", "week:2026-45". */
  id: string;
  kind: FactsKind;
  /** What the text is about, in words ("NATO", "the Nile"). */
  subject: string;
  /** Places the text may name besides those in the facts (the river's countries, the bloc's members). */
  countries?: string[];
  /** Other names the text may use that are not countries but look like one to the checker ("West Germany"). */
  names?: string[];
  /** How the file was made: "by hand" or the generator and data snapshot it came from. */
  generated: string;
  /** True for a file generated from the sample data: the checker refuses it, so no sample figure reaches a page. */
  sample?: boolean;
  facts: Fact[];
}

export const FACTS_DIR = 'src/data/ai/facts';
const KIND_DIR: Record<FactsKind, string> = { dossier: 'dossiers', history: 'history', river: 'rivers', page: 'pages', hub: 'hubs', week: 'weeks' };

export const kindOf = (id: string): FactsKind => {
  const k = id.split(':')[0] as FactsKind;
  if (!(k in KIND_DIR)) throw new Error(`Unknown text id "${id}": expected dossier:, history:, river:, page:, hub: or week:`);
  return k;
};
export const factsPath = (id: string, root = process.cwd()) => join(root, FACTS_DIR, KIND_DIR[kindOf(id)], `${id.split(':')[1]}.json`);

/** JSON with sorted keys and no whitespace, so the hash depends on the facts only, not on how the file is laid out. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** The hash stored with a text: over what the text may say (subject, places, names) and the facts it uses, not over
 *  how or when the file was generated. With `used` (the fact ids the checker matched, ./check.ts) only those facts
 *  count, so a change to a fact the text does not use leaves it approved; a used fact that is gone counts as changed.
 *  Without it, every fact counts (texts saved before `usedFacts`). A fact's date (when the source was published or
 *  last refreshed), the owner's notes and the status field (its words are in the statement) are left out, so a weekly refresh that changes no figure, or a note, never
 *  forces a redraft. */
export function factsHash(f: FactsFile, used?: string[]): string {
  // `status` is in the statement's words too, so a tag that changes still changes the hash.
  const strip = (x: Fact) => ({ ...x, date: undefined, note: undefined, status: undefined });
  const base = { id: f.id, subject: f.subject, countries: f.countries ?? [], names: f.names ?? [] };
  const body = used
    ? canonical({ ...base, used: [...new Set(used)].sort().map((id) => { const x = f.facts.find((y) => y.id === id); return x ? strip(x) : { id, missing: true }; }) })
    : canonical({ ...base, facts: f.facts.map(strip) });
  return `sha256:${createHash('sha256').update(body).digest('hex').slice(0, 32)}`;
}

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const PERIOD = /^\d{4}(-\d{2}(-\d{2})?)?([–-]\d{4}(-\d{2}(-\d{2})?)?)?$/;

/** Problems with a facts file's shape: missing fields, bad dates, duplicate ids. Empty when the file is usable. */
export function validateFacts(f: FactsFile, knownPlace: (id: string) => boolean = () => true): string[] {
  const out: string[] = [];
  if (!f.id || !f.kind || !f.subject) out.push('id, kind and subject are required');
  if (f.id && kindOf(f.id) !== f.kind) out.push(`kind "${f.kind}" does not match id "${f.id}"`);
  if (!Array.isArray(f.facts) || !f.facts.length) out.push('no facts');
  const ids = new Set<string>();
  for (const x of f.facts ?? []) {
    const at = `fact "${x.id}"`;
    if (!x.id) out.push('a fact has no id');
    if (ids.has(x.id)) out.push(`${at}: duplicate id`);
    ids.add(x.id);
    if (!x.statement?.trim()) out.push(`${at}: no statement`);
    if (!x.source?.trim()) out.push(`${at}: no source`);
    if (!/^https:\/\//.test(x.link ?? '')) out.push(`${at}: link must be an https address`);
    if (!DATE.test(x.date ?? '')) out.push(`${at}: date must be YYYY, YYYY-MM or YYYY-MM-DD`);
    if (x.period !== undefined && !PERIOD.test(x.period)) out.push(`${at}: period "${x.period}" is not a year, month, day or range`);
    if (x.value !== undefined && x.value !== null && !Number.isFinite(x.value)) out.push(`${at}: value is not a number`);
    if (x.value !== undefined && x.value !== null && x.unit === undefined) out.push(`${at}: a value needs a unit (use "" for a plain count)`);
    for (const p of x.places ?? []) if (!knownPlace(p)) out.push(`${at}: unknown place "${p}"`);
  }
  for (const p of f.countries ?? []) if (!knownPlace(p)) out.push(`unknown place "${p}" in countries`);
  return out;
}

/** Why nothing may be drafted from this file yet: sample data or facts not checked against their source. */
export function refusals(f: FactsFile): string[] {
  const out: string[] = [];
  if (f.sample) out.push(`${f.id}: generated from the sample data, not a real snapshot`);
  for (const x of f.facts) if (x.unverified) out.push(`${f.id}: fact "${x.id}" is unverified${x.note ? ` (${x.note})` : ''}`);
  return out;
}

export function loadFacts(id: string, root = process.cwd()): FactsFile | null {
  const p = factsPath(id, root);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as FactsFile) : null;
}

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'its', 'it', 'as', 'by', 'from', 'with', 'for', 'was', 'were', 'is', 'are', 'has', 'had', 'again']);
const contentWords = (s: string) => new Set(s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w)));

/** Pairs of facts in one file that state the same thing: about the same places in the same year, with the same
 *  figure or none, in mostly the same words. Events (no figure) count when half their content words are shared;
 *  figures, whose statements are often one template with a different measure ("China's place on GDP", "…on
 *  population"), only when four in five are. A drafted text would otherwise say it twice. */
export function duplicateFacts(f: FactsFile): [Fact, Fact][] {
  const out: [Fact, Fact][] = [];
  const key = (x: Fact) => [...(x.places ?? [])].sort().join(',');
  for (let i = 0; i < f.facts.length; i++) {
    for (let j = i + 1; j < f.facts.length; j++) {
      const [a, b] = [f.facts[i], f.facts[j]];
      if (!key(a) || key(a) !== key(b)) continue;
      if ((a.period ?? '').slice(0, 4) !== (b.period ?? '').slice(0, 4)) continue;
      if ((a.value ?? null) !== (b.value ?? null) || (a.unit ?? '') !== (b.unit ?? '')) continue;
      const [wa, wb] = [contentWords(a.statement), contentWords(b.statement)];
      const shared = [...wa].filter((w) => wb.has(w)).length;
      const figure = a.value !== undefined && a.value !== null;
      if (shared / new Set([...wa, ...wb]).size >= (figure ? 0.8 : 0.5)) out.push([a, b]);
    }
  }
  return out;
}
