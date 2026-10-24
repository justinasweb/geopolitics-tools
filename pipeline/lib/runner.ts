// One pipeline run: fetch every source that is due, keep what passed its checks, record the
// state, alert on problems and publish a snapshot when anything changed.
//
// Raw bucket:        <source>/<run>/<file>.gz   every changed copy, gzipped, never overwritten
//                    state/status.json          this runner's memory (lib/state.ts)
// Snapshots bucket:  snapshots/<run>.json       which raw files make up the data at that run
//                    latest.json                the newest snapshot; the site build reads this
//                    status.json                public summary per source, for the staleness check
import { createHash } from 'node:crypto';
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
    sources: Object.fromEntries([...sources.map((src) => {
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

/**
 * Write the state, a new snapshot when something changed (or the latest one's id when not) and the
 * public status. Shared by the runner and the import tool. The state is read again just before it is
 * written, and sources this writer does not own are taken from that fresh copy, so an import during
 * an hourly run is not lost (and the other way round).
 */
export async function publish(stores: Stores, state: State, own: string[], about: { sources: Source[]; imported: ImportedSource[] }, now: Date, changed: boolean) {
  const fresh = await loadState(stores);
  for (const [id, st] of Object.entries(fresh.sources)) if (!own.includes(id)) state.sources[id] = st;
  state.updated = now.toISOString();
  await stores.raw.put(STATE_KEY, enc(state), 'application/json');

  let snapshot: string | undefined;
  if (changed) {
    snapshot = runStamp(now);
    const snap = enc(buildSnapshot(snapshot, now, state, [...about.sources, ...about.imported]));
    await stores.snapshots.put(`snapshots/${snapshot}.json`, snap, 'application/json');
    await stores.snapshots.put('latest.json', snap, 'application/json');
  } else {
    const latest = await stores.snapshots.get('latest.json');
    snapshot = latest ? (JSON.parse(new TextDecoder().decode(latest)) as Snapshot).id : undefined;
  }
  await stores.snapshots.put('status.json', enc(publicStatus(now, state, about.sources, snapshot, about.imported)), 'application/json');
  return snapshot;
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
      // Copies under a retention rule are saved again before the rule could delete the last good one.
      const expiring = src.keepDays !== undefined && st.lastChange !== undefined && now.getTime() - Date.parse(st.lastChange) > (src.keepDays / 2) * 86_400_000;
      const isNew = !sameFiles(st.files, fresh) || expiring;
      if (isNew) {
        for (const f of Object.values(fresh)) await stores.raw.put(f.key, gzipSync(f.body, { level: 9 }), 'application/gzip');
        st.files = Object.fromEntries(Object.entries(fresh).map(([n, { key, sha256, bytes, contentType }]) => [n, { key, sha256, bytes, contentType }]));
        st.lastChange = now.toISOString();
        changed = true;
      }
      st.lastSuccess = now.toISOString();
      st.failures = 0;
      delete st.lastError;
      st.rows = result.rows;
      st.dataTo = result.dataTo;
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

  const snapshot = await publish(stores, state, opts.sources.map((s) => s.id), { sources: opts.sources, imported: opts.imported ?? [] }, now, changed);

  return { run: stamp, reports, changed, snapshot, alerts };
}
