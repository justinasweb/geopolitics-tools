// Every AI-drafted text on the site (spec, D15), with what it is drafted from and what the page shows. Pages call
// `publishedText`: it gives the text only when the owner approved it and its facts have not changed since, or when
// the owner wrote it by hand. Anything else shows nothing: no placeholder, no empty box.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_BLOCS } from '../history.ts';
import { RIVERS } from '../../data/rivers.ts';
import { DOSSIERS } from '../country.ts';
import { tryLoadDossierFacts } from './current.ts';
import { FACTS_DIR, loadFacts, type FactsFile } from './facts.ts';
import { HUB_IDS, PAGE_IDS } from './page-facts.ts';
import { readText, stateOf, type StoredText, type TextState } from './store.ts';

/** This week's summaries: one text per closed ISO week, "week:2026-45". */
export const WEEK_TEXT_ID = /^week:\d{4}-(0[1-9]|[1-4]\d|5[0-3])$/;

/** The weeks whose facts were written (scripts/week.ts summary), oldest first. */
export function weekTextIds(root = process.cwd()): string[] {
  const dir = join(root, FACTS_DIR, 'weeks');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `week:${f.slice(0, -5)}`).filter((id) => WEEK_TEXT_ID.test(id)).sort() : [];
}

/** Every text id, in the order the status list shows them. */
export const TEXT_IDS = [
  ...DOSSIERS.map((d) => `dossier:${d}`),
  ...HISTORY_BLOCS.map((b) => `history:${b}`),
  ...RIVERS.map((r) => `river:${r.id}`),
  ...PAGE_IDS.map((p) => `page:${p}`),
  ...HUB_IDS.map((h) => `hub:${h}`),
  ...weekTextIds(),
];

/** A text id the pipeline knows: one of TEXT_IDS, or any week's summary (its facts may not be written yet). */
export const isTextId = (id: string) => TEXT_IDS.includes(id) || WEEK_TEXT_ID.test(id);

/** The facts a text is checked against now: a dossier's from the current data, every other text's from its file. */
export function currentFacts(id: string): FactsFile | null {
  return id.startsWith('dossier:') ? tryLoadDossierFacts(id.slice(8)) : loadFacts(id);
}

export interface Published {
  text: string;
  /** True for an AI draft the owner approved (it carries the label); false for the owner's own writing. */
  ai: boolean;
  approvedOn?: string;
}

const cache = new Map<string, Published | null>();

/** What a page shows for a text, or null for nothing. */
export function publishedText(id: string): Published | null {
  if (cache.has(id)) return cache.get(id)!;
  const t = readText(id);
  const state = stateOf(t, t && t.author === 'ai' ? currentFacts(id) : null);
  const out = shown(t, state);
  if (t && state === 'stale' && t.approved) console.warn(`[ai] ${id}: approved, but its facts changed since; hidden until it is redrafted (npm run ai:status).`);
  cache.set(id, out);
  return out;
}

function shown(t: StoredText | null, state: TextState): Published | null {
  if (!t) return null;
  if (state === 'owner') return { text: t.text, ai: false };
  if (state === 'approved') return { text: t.text, ai: true, approvedOn: t.approvedOn };
  return null;
}

/** Whether a long page or hub intro counts as approved: `approved: true` in its front matter, drafted from the facts
 *  its file holds now (or written by the owner). An approved page whose facts changed shows the draft banner again
 *  until it is redrafted and approved. */
export function longApproved(id: string): boolean {
  const t = readText(id);
  const state = stateOf(t, t && t.author === 'ai' ? loadFacts(id) : null);
  if (t?.approved && state === 'stale') console.warn(`[ai] ${id}: approved, but its facts changed since; shown as a draft until it is redrafted (npm run ai:status).`);
  return state === 'approved' || state === 'owner';
}
