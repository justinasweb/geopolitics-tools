// One pipeline run: fetch every source that is due, keep what passed its checks, record the
// state, alert on problems and publish a snapshot when anything changed.
//
// Raw bucket:        <source>/<run>/<file>.gz   every changed copy, gzipped, never overwritten
//                    state/status.json          this runner's memory (lib/state.ts)
// Snapshots bucket:  snapshots/<run>.json       which raw files make up the data at that run
//                    latest.json                the newest snapshot; the site build reads this
//                    status.json                public summary per source, for the staleness check
import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { Alerter } from './alert.ts';
import { type Http, isTransient } from './http.ts';
import type { FetchContext, Source } from './source.ts';
import type { ImportedSource } from '../sources/imported.ts';
import { type State, type SourceState, type FileRecord, emptyState, emptySource, isDue, isStale, decideAlert, runStamp } from './state.ts';
import type { Stores } from './store.ts';

export const STATE_KEY = 'state/status.json';
const FETCH_TIMEOUT_MS = 20 * 60_000;

export interface RunOptions {
  sources: Source[];
  /** Sources imported by hand: never fetched, but kept in every snapshot and in the status. */
  imported?: ImportedSource[];
  stores: Stores;
  http: Http;
  alerter: Alerter;
  now?: Date;
  /** Run every enabled source, due or not. */
  force?: boolean;
  /** Run only these sources (also ones switched off, for testing), due or not. */
  only?: string[];
  allowShrink?: boolean;
  env?: Record<string, string | undefined>;
  log?: (...a: unknown[]) => void;
}

export type Outcome = 'changed' | 'unchanged' | 'failed' | 'not due' | 'off';

export interface SourceReport {
  id: string;
  name: string;
  outcome: Outcome;
  detail: string;
  seconds?: number;
  /** A failure that may pass on its own (network, timeout, server error), not a check or a wrong address. */
  transient?: boolean;
}

export interface RunReport {
  run: string;
  reports: SourceReport[];
  changed: boolean;
  snapshot?: string;
  /** Alerts raised by this run (not counting "working again"). */
  alerts: number;
}

export interface Snapshot {
  id: string;
  created: string;
  sources: Record<string, {
    name: string;
    attribution: string;
    licence: string;
    fetched: string;
    changed?: string;
    rows?: number;
    dataTo?: string;
    files: Record<string, Omit<FileRecord, 'contentType'>>;
    imported?: SourceState['imported'];
  }>;
}

type About = Pick<Source, 'id' | 'name' | 'attribution' | 'licence'>;

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const bytesOf = (b: string | Uint8Array) => (typeof b === 'string' ? new TextEncoder().encode(b) : b);
const enc = (o: unknown) => JSON.stringify(o, null, 2);

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => { t = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 60_000} minutes`)), ms); }),
  ]);
}

export async function loadState(stores: Stores): Promise<State> {
  const b = await stores.raw.get(STATE_KEY);
  return b ? (JSON.parse(new TextDecoder().decode(b)) as State) : emptyState();
}

export async function readRaw(stores: Stores, rec: Pick<FileRecord, 'key'>): Promise<Uint8Array | null> {
  const b = await stores.raw.get(rec.key);
  return b && gunzipSync(b);
}

/**
 * Writes a snapshot's files to <dir>/<source>/<file>, each checked against its SHA-256, and returns how many. Each
 * source folder it writes ends up holding exactly the files listed: they are written to a fresh folder first, and
 * only once every file is there do the new folders replace the old ones, so a file an earlier snapshot left (an old
 * yearly release) never stays beside the new ones. Folders of sources not listed are left as they are.
 */
export async function unpackSources(stores: Stores, files: Record<string, Record<string, Pick<FileRecord, 'key' | 'sha256'>>>, dir: string): Promise<number> {
  const fresh = (source: string) => join(dir, `.${source}.new`);
  let count = 0;
  try {
    for (const [source, byName] of Object.entries(files)) {
      rmSync(fresh(source), { recursive: true, force: true });
      mkdirSync(fresh(source), { recursive: true });
      for (const [name, rec] of Object.entries(byName)) {
        const body = await readRaw(stores, rec);
        if (!body) throw new Error(`${rec.key} is missing from ${stores.raw.name}`);
        if (createHash('sha256').update(body).digest('hex') !== rec.sha256) throw new Error(`${rec.key} does not match its checksum`);
        writeFileSync(join(fresh(source), name), body);
        count++;
      }
    }
  } catch (e) {
    for (const source of Object.keys(files)) rmSync(fresh(source), { recursive: true, force: true });
    throw e;
  }
  for (const source of Object.keys(files)) {
    rmSync(join(dir, source), { recursive: true, force: true });
    renameSync(fresh(source), join(dir, source));
  }
  return count;
}

function sameFiles(a: Record<string, FileRecord>, b: Record<string, { sha256: string }>) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k].sha256 === b[k].sha256);
}

function describe(src: Source, st: SourceState, kind: string, now: Date) {
  const last = st.lastSuccess ? `last good data fetched ${st.lastSuccess.slice(0, 16).replace('T', ' ')} UTC` : 'no good data yet';
  if (kind === 'failing') return `⚠️ geopolitics.tools data: ${src.name} failed ${st.failures} times in a row. ${st.lastError ?? ''}\nThe site keeps using the ${last}.`;
  if (kind === 'stale') return `⏰ geopolitics.tools data: ${src.name} is past its ${Math.round(src.staleAfter / 24)}-day freshness deadline (${last}). Its pages will show it as out of date.`;
  return `✅ geopolitics.tools data: ${src.name} is working again (${now.toISOString().slice(0, 16).replace('T', ' ')} UTC).`;
}

export function buildSnapshot(id: string, now: Date, state: State, sources: About[]): Snapshot {
  const out: Snapshot = { id, created: now.toISOString(), sources: {} };
  // A source both fetched (switched off) and imported is described by its import, listed last.
  for (const src of sources) {
    const st = state.sources[src.id];
    if (!st?.lastSuccess || !Object.keys(st.files).length) continue;
    out.sources[src.id] = {
      name: src.name,
      attribution: src.attribution,
      licence: src.licence,
      fetched: st.lastSuccess,
      changed: st.lastChange,
      rows: st.rows,
      dataTo: st.dataTo,
      files: Object.fromEntries(Object.entries(st.files).map(([n, { key, sha256, bytes }]) => [n, { key, sha256, bytes }])),
      ...(st.imported ? { imported: st.imported } : {}),
    };
  }
  return out;
}

export function publicStatus(now: Date, state: State, sources: Source[], snapshot: string | undefined, imported: ImportedSource[] = []) {
  return {
    generated: now.toISOString(),
    snapshot,
    sources: Object.fromEntries([...sources.filter((src) => !imported.some((i) => i.id === src.id)).map((src) => {
      const st = state.sources[src.id] ?? emptySource();
      return [src.id, {
        name: src.name,
        enabled: src.enabled === true,
        ...(src.enabled === true ? {} : { off: src.enabled }),
        ok: src.enabled === true ? st.failures === 0 && Boolean(st.lastSuccess) : null,
        stale: src.enabled === true && isStale(src, st, now),
        everyHours: src.every,
        deadlineHours: src.staleAfter,
        lastAttempt: st.lastAttempt ?? null,
        lastSuccess: st.lastSuccess ?? null,
        lastChange: st.lastChange ?? null,
        failuresInRow: st.failures,
        lastError: st.failures ? st.lastError ?? null : null,
        rows: st.rows ?? null,
        dataTo: st.dataTo ?? null,
      }];
    }), ...imported.map((src) => {
      const st = state.sources[src.id];
      return [src.id, {
        name: src.name,
        imported: true,
        release: src.release,
        lastImport: st?.lastSuccess ?? null,
        files: st?.imported ?? {},
      }];
    })]),
  };
}

/** Each source's files in a snapshot, by name and checksum: what the site would build from. */
const filesOf = (snap: Snapshot) => JSON.stringify(Object.keys(snap.sources).sort().map((id) =>
  [id, Object.entries(snap.sources[id].files).map(([n, f]) => [n, f.sha256]).sort()]));

/**
 * Write a new snapshot when something changed (or the latest one's id when not), then the state and the public
 * status. Shared by the runner and the import tool. The state is read again just before it is written, and sources
 * this writer does not own are taken from that fresh copy, so an import during an hourly run is not lost (and the
 * other way round).
 *
 * latest.json is written before the state, and a run that changed nothing still compares it with the state's files:
 * when a run saved new files but could not publish them, the next run publishes them.
 */
export async function publish(stores: Stores, state: State, own: string[], about: { sources: Source[]; imported: ImportedSource[] }, now: Date, changed: boolean): Promise<{ snapshot: string | undefined; published: boolean }> {
  const fresh = await loadState(stores);
  for (const [id, st] of Object.entries(fresh.sources)) if (!own.includes(id)) state.sources[id] = st;
  state.updated = now.toISOString();

  const id = runStamp(now);
  const next = buildSnapshot(id, now, state, [...about.sources, ...about.imported]);
  let snapshot: string | undefined;
  let published = changed;
  if (!changed) {
    const b = await stores.snapshots.get('latest.json');
    const latest = b ? (JSON.parse(new TextDecoder().decode(b)) as Snapshot) : null;
    snapshot = latest?.id;
    published = Object.keys(next.sources).length > 0 && (!latest || filesOf(latest) !== filesOf(next));
  }
  if (published) {
    snapshot = id;
    const snap = enc(next);
    await stores.snapshots.put(`snapshots/${snapshot}.json`, snap, 'application/json');
    await stores.snapshots.put('latest.json', snap, 'application/json');
  }
  await stores.raw.put(STATE_KEY, enc(state), 'application/json');
  await stores.snapshots.put('status.json', enc(publicStatus(now, state, about.sources, snapshot, about.imported)), 'application/json');
  return { snapshot, published };
}

/**
 * Saves a source's last good copy again, under this run's prefix, once it is half its retention period old, so the
 * bucket's lifecycle rule never deletes the files the latest snapshot points to. It runs for every source on every
 * run, whether the source is due, works or fails: a source that fails for weeks keeps its last good data.
 * Returns whether the files moved (the snapshot must then point to the new copies).
 */
async function keepLastGood(stores: Stores, src: Source, st: SourceState, stamp: string, now: Date): Promise<boolean> {
  const since = st.saved ?? st.lastChange;
  if (src.keepDays === undefined || !since || !Object.keys(st.files).length) return false;
  if (now.getTime() - Date.parse(since) <= (src.keepDays / 2) * 86_400_000) return false;
  const moved: Record<string, FileRecord> = {};
  for (const [name, rec] of Object.entries(st.files)) {
    const body = await stores.raw.get(rec.key);
    if (!body) throw new Error(`${rec.key} is gone from ${stores.raw.name}`);
    const key = `${src.id}/${stamp}/${name}.gz`;
    await stores.raw.put(key, body, 'application/gzip');
    moved[name] = { ...rec, key };
  }
  st.files = moved;
  st.saved = now.toISOString();
  return true;
}

export async function run(opts: RunOptions): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a));
  const stamp = runStamp(now);
  const { stores } = opts;
  const state = await loadState(stores);
  const reports: SourceReport[] = [];
  let changed = false;
  let alerts = 0;

  for (const src of opts.sources) {
    const st = (state.sources[src.id] ??= emptySource());
    try {
      if (await keepLastGood(stores, src, st, stamp, now)) {
        changed = true;
        log(src.id.padEnd(12), 'saved the last good copy again before its retention rule could delete it');
      }
    } catch (e) {
      log(src.id.padEnd(12), `could not save the last good copy again: ${(e as Error).message}`);
    }
    const named = opts.only?.includes(src.id) ?? false;
    if (opts.only && !named) continue;
    if (src.enabled !== true && !named) {
      reports.push({ id: src.id, name: src.name, outcome: 'off', detail: src.enabled });
      continue;
    }
    if (!named && !opts.force && !isDue(src, st, now)) {
      reports.push({ id: src.id, name: src.name, outcome: 'not due', detail: `last tried ${st.lastAttempt?.slice(0, 16)}` });
      continue;
    }

    const started = Date.now();
    st.firstAttempt ??= now.toISOString();
    st.lastAttempt = now.toISOString();
    const ctx: FetchContext = {
      http: opts.http,
      now,
      allowShrink: opts.allowShrink ?? false,
      env: opts.env ?? process.env,
      log: (...a) => log(src.id.padEnd(12), ...a),
      previous: async (name) => {
        const rec = st.files[name];
        const b = rec && (await readRaw(stores, rec));
        return b ? new TextDecoder().decode(b) : null;
      },
    };
    let report: SourceReport;
    try {
      const result = await withTimeout(src.fetch(ctx), FETCH_TIMEOUT_MS, src.id);
      if (!result.files.length) throw new Error('the fetcher returned no files');
      const fresh: Record<string, FileRecord & { body: Uint8Array }> = {};
      for (const f of result.files) {
        if (fresh[f.name]) throw new Error(`file name ${f.name} used twice`);
        const body = bytesOf(f.body);
        fresh[f.name] = { key: `${src.id}/${stamp}/${f.name}.gz`, sha256: sha256(body), bytes: body.length, contentType: f.contentType ?? 'application/octet-stream', body };
      }
      // Copies under a retention rule were saved again above (keepLastGood) when they needed it.
      const isNew = !sameFiles(st.files, fresh);
      if (isNew) {
        for (const f of Object.values(fresh)) await stores.raw.put(f.key, gzipSync(f.body, { level: 9 }), 'application/gzip');
        st.files = Object.fromEntries(Object.entries(fresh).map(([n, { key, sha256, bytes, contentType }]) => [n, { key, sha256, bytes, contentType }]));
        st.lastChange = st.saved = now.toISOString();
        changed = true;
      }
      st.lastSuccess = now.toISOString();
      st.failures = 0;
      delete st.lastError;
      st.rows = result.rows;
      st.dataTo = result.dataTo;
      if (result.notice && result.notice !== st.notice) {
        // Not counted as an alert: nothing failed, so the run stays green.
        await opts.alerter.send(`ℹ️ geopolitics.tools data: ${src.name}. ${result.notice}`);
      }
      if (result.notice) st.notice = result.notice;
      else delete st.notice;
      const size = Object.values(fresh).reduce((s, f) => s + f.bytes, 0);
      report = {
        id: src.id, name: src.name, outcome: isNew ? 'changed' : 'unchanged',
        detail: `${result.rows.toLocaleString('en')} rows${result.dataTo ? `, to ${result.dataTo}` : ''}, ${Object.keys(fresh).length} file(s), ${(size / 1e6).toFixed(1)} MB`,
      };
    } catch (e) {
      st.failures += 1;
      st.lastError = String((e as Error).message ?? e).slice(0, 400);
      report = { id: src.id, name: src.name, outcome: 'failed', detail: `${st.lastError} (${st.failures} in a row)`, transient: isTransient(e) };
    }
    report.seconds = Math.round((Date.now() - started) / 100) / 10;
    log(src.id.padEnd(12), report.outcome.toUpperCase(), report.detail, `${report.seconds} s`);
    reports.push(report);
  }

  // Alerts: checked for every enabled source, so a source that silently stopped being run still goes stale.
  for (const src of opts.sources) {
    if (src.enabled !== true) continue;
    const st = state.sources[src.id];
    if (!st?.lastAttempt) continue;
    const d = decideAlert(src, st, now);
    if (!d) continue;
    if (d.kind !== 'recovered') alerts++;
    await opts.alerter.send(describe(src, st, d.kind, now));
  }

  // A switched-off fetcher whose files are imported by hand (the IMF WEO) belongs to the import tool.
  const own = opts.sources.map((s) => s.id).filter((id) => !opts.imported?.some((i) => i.id === id));
  const { snapshot, published } = await publish(stores, state, own, { sources: opts.sources, imported: opts.imported ?? [] }, now, changed);

  return { run: stamp, reports, changed: published, snapshot, alerts };
}
