// The data every page is built from: one snapshot's raw files (pipeline/pull.ts writes them to data/raw), its
// snapshot.json (when each source was fetched) and status.json (whether each source is on schedule). Loaded once
// per build and shared by every page.
//
// Without a snapshot the build stops, unless GT_DATA=sample: then it uses the prototype's sample files from
// tests/fixtures, every page carries a "Sample data" banner, and scripts/check-dist.mjs refuses the result unless
// ALLOW_SAMPLE=1, so sample figures can never reach a deployed page.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rawDir, type Raw } from '../adapters/core.ts';
import { registry, INDICATORS, type Loaded } from '../data/indicators.ts';
import { LICENCES, type Licence } from '../data/licences.ts';

export interface SnapshotSource { name: string; attribution: string; licence: string; fetched: string; changed?: string; dataTo?: string; imported?: Record<string, { file?: string; date?: string }> }
export interface Snapshot { id: string; created: string; sources: Record<string, SnapshotSource> }
export interface SourceStatus {
  name: string; enabled?: boolean; off?: string; ok?: boolean | null; stale?: boolean; everyHours?: number; deadlineHours?: number;
  lastSuccess?: string | null; lastChange?: string | null; imported?: boolean; release?: string; lastImport?: string | null;
}
export interface PublicStatus { generated: string; snapshot?: string; sources: Record<string, SourceStatus> }

// The repository root (the build bundles this module into dist/, so not relative to it).
const ROOT = `${process.cwd()}/`;
const FIXTURES = join(ROOT, 'tests/fixtures/prototype');
const LIVE_FIXTURES = join(ROOT, 'tests/fixtures/live');

/** The prototype's sample folders use their own names for some sources. */
const SAMPLE_FOLDERS: Record<string, string> = { 'imf-weo': 'imf', 'usgs-minerals': 'usgs', 'usgs-quakes': 'usgsquakes', pinksheet: 'worldbank', 'treasury-history': 'treasury' };
const SAMPLE_DATE = '2026-10-22T00:00:00.000Z';

/**
 * The samples as a snapshot. UNHCR is split into the three files the live fetcher writes; the sanctions lists come
 * from the live-format fixtures (real records, kept small for tests).
 */
export function sampleRaw(): Raw {
  const dir = mkdtempSync(join(tmpdir(), 'gt-sample-'));
  mkdirSync(join(dir, 'unhcr'));
  const items = JSON.parse(readFileSync(join(FIXTURES, 'unhcr/population.json'), 'utf8')).items as Record<string, unknown>[];
  const total = (key: 'coo_iso' | 'coa_iso') => {
    const by = new Map<string, Record<string, unknown>>();
    for (const r of items) {
      const k = `${r.year}|${r[key]}`;
      const o = by.get(k) ?? { year: r.year, [key]: r[key], refugees: 0, asylum_seekers: 0, oip: 0, idps: 0, returned_refugees: 0 };
      for (const c of ['refugees', 'asylum_seekers', 'oip', 'idps', 'returned_refugees']) o[c] = Number(o[c]) + Number(r[c] ?? 0);
      by.set(k, o);
    }
    return { items: [...by.values()] };
  };
  writeFileSync(join(dir, 'unhcr/by-origin.json'), JSON.stringify(total('coo_iso')));
  writeFileSync(join(dir, 'unhcr/by-host.json'), JSON.stringify(total('coa_iso')));
  writeFileSync(join(dir, 'unhcr/pairs.json'), JSON.stringify({ items }));
  const samples = rawDir(FIXTURES, SAMPLE_FOLDERS);
  const live = rawDir(LIVE_FIXTURES);
  const split = rawDir(dir);
  const pick = (s: string) => (s === 'unhcr' ? split : ['csl', 'eu-sanctions', 'uk-sanctions'].includes(s) ? live : samples);
  return { has: (s, f) => pick(s).has(s, f), list: (s) => pick(s).list(s), text: (s, f) => pick(s).text(s, f), json: (s, f) => pick(s).json(s, f) };
}

function load() {
  const sample = process.env.GT_DATA === 'sample';
  const dir = process.env.GT_DATA_DIR ?? join(ROOT, 'data/raw');
  if (!sample && !existsSync(join(dir, 'snapshot.json'))) {
    throw new Error(`No data snapshot in ${dir}. Run "node pipeline/pull.ts" (needs the Cloudflare keys), or build with the sample files: "npm run build:sample".`);
  }
  const raw = sample ? sampleRaw() : rawDir(dir);
  const sources: Record<string, SnapshotSource> = {};
  if (sample) {
    for (const l of LICENCES) sources[l.source] = { name: l.name, attribution: l.credit, licence: l.licence, fetched: SAMPLE_DATE };
  }
  const snapshot: Snapshot = sample
    ? { id: 'sample', created: SAMPLE_DATE, sources }
    : JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const statusFile = join(dir, 'status.json');
  const status: PublicStatus | null = !sample && existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : null;
  return { sample, raw, snapshot, status, reg: registry(raw) };
}

let cached: ReturnType<typeof load> | null = null;
/** The build's data, loaded on first use. */
export const data = () => (cached ??= load());

const loadedCache = new Map<string, Loaded | null>();
/** An indicator's values, or null when it has no loader yet or its files are not in this snapshot. */
export function indicator(id: string): Loaded | null {
  if (loadedCache.has(id)) return loadedCache.get(id)!;
  const d = INDICATORS[id];
  let out: Loaded | null = null;
  if (d?.load && !d.pending) {
    try {
      const l = data().reg.load(id);
      out = Object.keys(l.values).length ? l : null;
    } catch (e) {
      if (!/is not in the snapshot/.test((e as Error).message)) throw e;
    }
  }
  loadedCache.set(id, out);
  return out;
}

/** Runs an adapter, or returns null when its files are not in this snapshot. */
export function tryLoad<T>(f: (raw: Raw) => T): T | null {
  try {
    return f(data().raw);
  } catch (e) {
    if (/is not in the snapshot/.test((e as Error).message)) return null;
    throw e;
  }
}

/** Memoised tryLoad, for adapters several pages share. */
export function shared<T>(f: (raw: Raw) => T): () => T | null {
  let done = false;
  let v: T | null = null;
  return () => {
    if (!done) { v = tryLoad(f); done = true; }
    return v;
  };
}

const licenceBy = new Map(LICENCES.map((l) => [l.source, l]));
export const licenceOf = (source: string): Licence | undefined => licenceBy.get(source);

/** When the site last refreshed a source: the snapshot's fetch time (not a file date on disk). */
export function refreshed(source: string): string | undefined {
  return data().snapshot.sources[source]?.fetched;
}

/** When a source's data last changed, for sitemap lastmod. */
export function changed(source: string): string | undefined {
  const s = data().snapshot.sources[source];
  return s?.changed ?? s?.fetched;
}

/** Whether a source is past its freshness deadline, by the runner's last public status. */
export function isDelayed(source: string): boolean {
  return Boolean(data().status?.sources[source]?.stale);
}

/** A source's own name, for source lines: the licence table's, else the snapshot's, else its id. */
export const sourceName = (source: string): string => licenceOf(source)?.name ?? data().snapshot.sources[source]?.name ?? source;
