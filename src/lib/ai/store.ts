// Where drafted texts are kept, and the approval step (spec, D15, "Approve"). Nothing is published without the
// owner's approval, and an approval is tied to the facts it was given on: each text stores the hash of its facts
// file, so a text whose facts changed reads as stale (flagged for redrafting) instead of staying on the page.
//
// - Short texts (dossier, history, river, and This week's summary) are JSON files in
//   src/data/ai/texts/<kind>/<id>.json. They are approved with `npm run ai:approve` or the Telegram review buttons
//   (Approve, Edit, Skip; docs/telegram.md), which run the same steps here from a GitHub Actions run.
// - Long pages and hub intros keep living in src/content/pages/*.md and src/content/hubs/*.md, with the `approved`
//   front matter they already had and the same record next to it (author, model, factsHash, drafted, approvedOn).
//   They are approved in a pull request: merging with `approved: true` (and `approvedOn`) is the approval.
//
// A text the owner wrote by hand has `author: owner`. The drafting script never overwrites it, and it carries no
// AI label.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkDraft, problemLines } from './check.ts';
import { factsHash, kindOf, refusals, type FactsFile } from './facts.ts';

export type Author = 'ai' | 'owner';
export type Via = 'cli' | 'telegram' | 'pr';

export interface StoredText {
  id: string;
  text: string;
  author: Author;
  /** The model that drafted it, or "manual (Claude chat)" for a pasted draft. */
  model?: string;
  /** Hash of the facts file the text was drafted from (./facts.ts, factsHash). */
  factsHash?: string;
  /** When it was drafted (YYYY-MM-DD). */
  drafted?: string;
  approved: boolean;
  /** When the owner approved it (YYYY-MM-DD). */
  approvedOn?: string;
  /** Where it was approved. */
  approvedVia?: Via;
  /** The day the owner tapped Skip (YYYY-MM-DD): this draft is not published, and is not sent for review again. */
  skipped?: string;
  /** The day the owner replaced the draft with corrected text through Edit (YYYY-MM-DD). It passed the same check. */
  edited?: string;
}

export type TextState = 'none' | 'draft' | 'approved' | 'stale' | 'owner' | 'skipped';

export const TEXTS_DIR = 'src/data/ai/texts';
const DIR: Record<string, string> = { dossier: 'dossiers', history: 'history', river: 'rivers', week: 'weeks' };
export const isLong = (id: string) => ['page', 'hub'].includes(kindOf(id));

export function textPath(id: string, root = process.cwd()): string {
  const [kind, name] = [kindOf(id), id.split(':')[1]];
  if (kind === 'page') return join(root, 'src/content/pages', `${name}.md`);
  if (kind === 'hub') return join(root, 'src/content/hubs', `${name}.md`);
  return join(root, TEXTS_DIR, DIR[kind], `${name}.json`);
}

/** A short hash of the text itself, so an approval names exactly the version the owner read. */
export const textHash = (text: string) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 12);

// ---------------------------------------------------------------------------------------------------------------
// Front matter: the content pages' YAML is flat `key: value` lines (and the hubs' `facts:` list), so a small reader
// and writer keeps every other line exactly as it was.

interface Md { lines: string[]; body: string }

export function splitMd(src: string): Md {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('no front matter');
  return { lines: m[1].split('\n'), body: m[2] };
}

export function fmGet(lines: string[], key: string): string | boolean | undefined {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  if (line === undefined) return undefined;
  const v = line.slice(key.length + 1).trim();
  if (v === 'true' || v === 'false') return v === 'true';
  if (v === '' || v === 'null' || v === '~') return undefined;
  if (v.startsWith('"')) return JSON.parse(v) as string;
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

export function fmSet(lines: string[], key: string, value: string | boolean | undefined): string[] {
  const text = value === undefined ? null : typeof value === 'boolean' ? String(value) : JSON.stringify(value);
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  const out = [...lines];
  if (text === null) { if (i >= 0) out.splice(i, 1); return out; }
  if (i >= 0) out[i] = `${key}: ${text}`;
  else out.push(`${key}: ${text}`);
  return out;
}

const joinMd = (md: Md) => `---\n${md.lines.join('\n')}\n---\n${md.body.startsWith('\n') ? md.body : `\n${md.body}`}`;

// ---------------------------------------------------------------------------------------------------------------

export function readText(id: string, root = process.cwd()): StoredText | null {
  const p = textPath(id, root);
  if (!existsSync(p)) return null;
  if (!isLong(id)) {
    const j = JSON.parse(readFileSync(p, 'utf8')) as StoredText;
    return { ...j, id, approved: j.approved === true, author: j.author ?? 'ai' };
  }
  const md = splitMd(readFileSync(p, 'utf8'));
  const get = (k: string) => fmGet(md.lines, k);
  const text = kindOf(id) === 'hub' ? String(get('intro') ?? '') : md.body.trim();
  return {
    id, text, author: get('author') === 'owner' ? 'owner' : 'ai', model: get('model') as string | undefined,
    factsHash: get('factsHash') as string | undefined, drafted: get('drafted') as string | undefined,
    approved: get('approved') === true, approvedOn: get('approvedOn') as string | undefined, approvedVia: get('approvedVia') as Via | undefined,
  };
}

export function writeText(t: StoredText, root = process.cwd()): void {
  const p = textPath(t.id, root);
  if (!isLong(t.id)) {
    mkdirSync(dirname(p), { recursive: true });
    const { id, text, author, model, factsHash: fh, drafted, approved, approvedOn, approvedVia, skipped, edited } = t;
    writeFileSync(p, `${JSON.stringify({ id, author, text, model, factsHash: fh, drafted, edited, approved, approvedOn: approvedOn ?? null, approvedVia: approvedVia ?? null, skipped }, null, 2)}\n`);
    return;
  }
  const md = splitMd(readFileSync(p, 'utf8'));
  let lines = md.lines;
  if (kindOf(t.id) === 'hub') lines = fmSet(lines, 'intro', t.text);
  for (const [k, v] of [['author', t.author], ['model', t.model], ['factsHash', t.factsHash], ['drafted', t.drafted], ['approved', t.approved], ['approvedOn', t.approvedOn], ['approvedVia', t.approvedVia]] as const) lines = fmSet(lines, k, v);
  if (kindOf(t.id) === 'page' && t.drafted) lines = fmSet(lines, 'updated', t.drafted);
  writeFileSync(p, joinMd({ lines, body: kindOf(t.id) === 'page' ? `\n${t.text.trim()}\n` : md.body }));
}

/** Where a text stands against its current facts. A hand-written text is the owner's and is never stale. */
export function stateOf(t: StoredText | null, facts: FactsFile | null): TextState {
  if (!t || !t.text.trim()) return 'none';
  if (t.author === 'owner') return 'owner';
  // A draft written before the pipeline has no facts hash: still a draft, but an approval needs one.
  if (!t.factsHash) return t.approved ? 'stale' : 'draft';
  if (facts && t.factsHash !== factsHash(facts)) return 'stale';
  if (t.skipped && !t.approved) return 'skipped';
  return t.approved ? 'approved' : 'draft';
}

/** Saves a new AI draft (not approved). Refuses to touch a text the owner wrote. */
export function saveDraft(id: string, d: { text: string; model: string; facts: FactsFile; on: string }, root = process.cwd()): StoredText {
  const old = readText(id, root);
  if (old?.author === 'owner') throw new Error(`${id} was written by the owner (author: owner) and is never overwritten.`);
  const t: StoredText = { id, text: d.text.trim(), author: 'ai', model: d.model, factsHash: factsHash(d.facts), drafted: d.on, approved: false };
  writeText(t, root);
  return t;
}

export interface ApproveOptions {
  on: string;
  via: Via;
  /** The text hash the owner was shown (Telegram sends it back), so a text changed since cannot be approved by it. */
  textHash?: string;
}

/** The approval step. It approves only an AI draft that still matches its facts and passes the checker, and only
 *  the version the owner saw when a text hash is given. Throws with the reason otherwise. */
export function approveText(id: string, facts: FactsFile, o: ApproveOptions, root = process.cwd()): StoredText {
  const t = readText(id, root);
  if (!t || !t.text.trim()) throw new Error(`${id}: there is no draft to approve.`);
  if (t.author === 'owner') throw new Error(`${id}: the owner wrote this text; it needs no approval.`);
  const refused = refusals(facts);
  if (refused.length) throw new Error(`${id}: its facts are not ready:\n${refused.join('\n')}`);
  if (t.factsHash !== factsHash(facts)) throw new Error(`${id}: its facts changed since it was drafted (${t.factsHash ?? 'no hash'} → ${factsHash(facts)}); redraft it.`);
  if (o.textHash && o.textHash !== textHash(t.text)) throw new Error(`${id}: the text changed since it was sent for review; review it again.`);
  const r = checkDraft(t.text, facts);
  if (!r.ok) throw new Error(`${id}: the text no longer passes the check:\n${problemLines(r).join('\n')}`);
  const out = { ...t, approved: true, approvedOn: o.on, approvedVia: o.via, skipped: undefined };
  writeText(out, root);
  return out;
}

export interface ReviewOptions {
  on: string;
  /** The text hash the owner was shown: the step acts only on that version. */
  textHash: string;
}

/** The owner tapped Skip: the draft stays unpublished (an approved one is withdrawn) and is not sent for review again.
 *  For This week's summary this records that the week has no summary. Only short texts are reviewed this way. */
export function skipText(id: string, o: ReviewOptions, root = process.cwd()): StoredText {
  if (isLong(id)) throw new Error(`${id}: long pages are approved in a pull request, not skipped.`);
  const t = readText(id, root);
  if (!t || !t.text.trim()) throw new Error(`${id}: there is no draft to skip.`);
  if (t.author === 'owner') throw new Error(`${id}: the owner wrote this text; there is nothing to skip.`);
  if (o.textHash !== textHash(t.text)) throw new Error(`${id}: the text changed since it was sent for review; review it again.`);
  const out: StoredText = { ...t, approved: false, approvedOn: undefined, approvedVia: undefined, skipped: o.on };
  writeText(out, root);
  return out;
}

/** The owner replied to Edit with corrected text. It replaces the draft only if it passes the same number and fact
 *  check as a drafted text; it is then a draft again, sent back for review, so it is published only on Approve.
 *  Throws with the checker's findings otherwise, and the stored draft is left as it was. */
export function editText(id: string, text: string, facts: FactsFile, o: ReviewOptions, root = process.cwd()): StoredText {
  if (isLong(id)) throw new Error(`${id}: long pages are edited in a pull request.`);
  const t = readText(id, root);
  if (!t || !t.text.trim()) throw new Error(`${id}: there is no draft to edit.`);
  if (t.author === 'owner') throw new Error(`${id}: the owner wrote this text; change it with npm run ai:own.`);
  if (o.textHash !== textHash(t.text)) throw new Error(`${id}: the text changed since it was sent for review; edit the latest version.`);
  const refused = refusals(facts);
  if (refused.length) throw new Error(`${id}: its facts are not ready:\n${refused.join('\n')}`);
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) throw new Error(`${id}: the corrected text is empty.`);
  const r = checkDraft(clean, facts);
  if (!r.ok) throw new Error(`${id}: the corrected text does not pass the check:\n${problemLines(r).join('\n')}`);
  const out: StoredText = { ...t, text: clean, factsHash: factsHash(facts), edited: o.on, approved: false, approvedOn: undefined, approvedVia: undefined, skipped: undefined };
  writeText(out, root);
  return out;
}
