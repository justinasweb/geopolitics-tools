// The import tool's work (pipeline/import.ts): read a hand-downloaded file, check it against its
// kind (sources/imported.ts), keep what the site needs, and save it like a fetched file: gzipped in
// the raw bucket, recorded in the state, published in a new snapshot.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ImportedSource, Kind, Row } from '../sources/imported.ts';
import { csvRows, toCsv } from './csv.ts';
import { loadState, publish, readRaw } from './runner.ts';
import { type Source, CheckError, check, guardShrink } from './source.ts';
import { emptySource, runStamp } from './state.ts';
import type { Stores } from './store.ts';
import { readXlsx } from './xlsx.ts';
import { unzip } from './zip.ts';

/** A downloaded file's contents: text (CSV, JSON) or, from a workbook, rows. */
export type Input = { text: string } | { rows: string[][]; sheet: string };

// Windows-1252 bytes 0x80–0x9f (Node's decoder treats them as Latin-1 control codes); the rest is Latin-1.
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

/** UTF-8 when it is valid UTF-8, otherwise Windows-1252 (what Excel saves); a byte-order mark is dropped. */
export function decodeText(b: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('latin1').decode(b).replace(/[\u0080-\u009f]/g, (c) => CP1252[c.charCodeAt(0) - 0x80]);
  }
}

export interface ReadOptions {
  /** Workbook sheet to read (otherwise the first one with all the kind's columns). */
  sheet?: string;
  /** File inside a zip to read (needed when it holds more than one). */
  entry?: string;
  columns?: string[];
}

const usable = /\.(csv|json|geojson|xlsx)$/i;

/** .csv, .json, .geojson or .xlsx, as is or in a .gz, or one of them inside a .zip. */
export async function readInput(name: string, data: Uint8Array, opts: ReadOptions = {}): Promise<Input> {
  if (/\.gz$/i.test(name)) return readInput(name.slice(0, -3), gunzipSync(data), opts);
  if (/\.zip$/i.test(name)) {
    const files = [...(await unzip(data))].filter(([n]) => usable.test(n) && !n.startsWith('__MACOSX/'));
    const pick = opts.entry ? files.filter(([n]) => n === opts.entry || basename(n) === opts.entry) : files;
    if (!pick.length) throw new CheckError(opts.entry ? `no "${opts.entry}" in the zip; it holds ${files.map(([n]) => n).join(', ')}` : 'no CSV, JSON or xlsx file inside the zip');
    if (pick.length > 1) throw new CheckError(`the zip holds ${pick.length} files (${pick.map(([n]) => n).join(', ')}); name one with --entry=`);
    return readInput(pick[0][0], pick[0][1], opts);
  }
  if (/\.xlsx$/i.test(name)) {
    const book = await readXlsx(data);
    const want = opts.sheet ? [opts.sheet] : book.sheets;
    if (opts.sheet && !book.sheets.includes(opts.sheet)) throw new CheckError(`no sheet "${opts.sheet}"; the workbook has ${book.sheets.join(', ')}`);
    for (const sheet of want) {
      const rows = book.rows(sheet);
      // The header is the first of the top rows holding every column the kind needs.
      const h = rows.slice(0, 10).findIndex((r) => (opts.columns ?? []).every((c) => r.map((v) => v.trim()).includes(c)));
      if (h >= 0) return { rows: rows.slice(h), sheet };
      if (opts.sheet) return { rows, sheet };
    }
    throw new CheckError(`no sheet with the columns ${(opts.columns ?? []).join(', ')}; the workbook has ${book.sheets.join(', ')} (name one with --sheet= to see what it holds)`);
  }
  if (!/\.(csv|json|geojson|txt)$/i.test(name)) throw new CheckError(`can't read "${name}": give a .csv, .json, .geojson or .xlsx file, as is, gzipped or zipped`);
  return { text: decodeText(data) };
}

export interface Prepared {
  body: string;
  rows: number;
  contentType: string;
  /** Hand-kept columns the file did not have, left empty. */
  added: string[];
}

/** Check the input against its kind and keep what the site needs. `previous` is the last imported copy, for the shrink check. */
export function prepare(kind: Kind, input: Input, now: Date, previous: string | null = null, allowShrink = false): Prepared {
  if (kind.how === 'raw' || kind.how === 'geojson') {
    if (!('text' in input)) throw new CheckError(`this kind takes the ${kind.how === 'raw' ? 'CSV' : 'GeoJSON'} file, not a workbook`);
    if (kind.how === 'raw') return { body: input.text, rows: kind.check!(input.text), contentType: 'text/csv', added: [] };
    let json: { type?: string; features?: { properties?: Record<string, unknown> }[] };
    try {
      json = JSON.parse(input.text);
    } catch {
      throw new CheckError('not valid JSON');
    }
    check(json.type === 'FeatureCollection' && Array.isArray(json.features), 'not a GeoJSON FeatureCollection');
    const missing = (kind.columns ?? []).filter((c) => !(c in (json.features![0]?.properties ?? {})));
    check(!missing.length, `features lack properties: ${missing.join(', ')}`);
    for (const f of json.features) for (const a of kind.added ?? []) (f.properties ??= {})[a] ??= null;
    guardShrink({ allowShrink }, kind.source, json.features.length, previous, (p) => (JSON.parse(p).features as unknown[]).length);
    return { body: JSON.stringify(json), rows: json.features.length, contentType: 'application/geo+json', added: [] };
  }

  const rows = 'text' in input ? csvRows(input.text) : input.rows[Symbol.iterator]();
  const first = rows.next();
  const head = first.done ? [] : first.value.map((c) => c.trim());
  const columns = kind.columns ?? [];
  // A kept column is read under its own name, else under the names the publisher has used for it: the first that is filled.
  const at = (c: string) => [c, ...(kind.from?.[c] ?? [])].map((n) => head.indexOf(n)).filter((i) => i >= 0);
  const missing = columns.filter((c) => !at(c).length && !kind.derived?.includes(c));
  if (missing.length) throw new CheckError(`missing columns: ${missing.join(', ')}\nColumns in the file: ${head.join(', ')}`);
  const cols = [...columns, ...(kind.added ?? [])];
  const idx = cols.map(at);
  const out = [cols];
  for (const r of rows) {
    // A short CSV row is a broken line; a workbook simply leaves out trailing empty cells.
    if ('text' in input && r.length < head.length) continue;
    const row: Row = {};
    cols.forEach((c, i) => { row[c] = idx[i].map((j) => r[j] ?? '').find((v) => v.trim()) ?? ''; });
    if (kind.derive) kind.derive(row, Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
    if (cols.every((c) => !row[c].trim())) continue;
    if (kind.filter && !kind.filter(row, now)) continue;
    out.push(cols.map((c) => row[c]));
  }
  const kept = out.length - 1;
  check(kept >= 10, `only ${kept} rows kept; is this the right file?`);
  guardShrink({ allowShrink }, kind.source, kept, previous, (p) => p.trim().split('\n').length - 1);
  return { body: toCsv(out), rows: kept, contentType: 'text/csv', added: (kind.added ?? []).filter((c) => !head.includes(c)) };
}

export interface ImportOptions extends ReadOptions {
  stores: Stores;
  kindId: string;
  kind: Kind;
  path: string;
  /** Every fetched and imported source, for the snapshot and status. */
  sources: Source[];
  imported: ImportedSource[];
  now?: Date;
  allowShrink?: boolean;
  log?: (...a: unknown[]) => void;
}

export interface ImportResult {
  source: string;
  file: string;
  rows: number;
  bytes: number;
  changed: boolean;
  snapshot?: string;
}

export async function importFile(o: ImportOptions): Promise<ImportResult> {
  const now = o.now ?? new Date();
  const log = o.log ?? console.log;
  const from = basename(o.path);
  const file = typeof o.kind.save === 'function' ? o.kind.save(from) : o.kind.save;
  const input = await readInput(from, new Uint8Array(readFileSync(o.path)), { ...o, columns: o.kind.columns });
  if ('sheet' in input) log(`read sheet "${input.sheet}"`);

  const state = await loadState(o.stores);
  const st = (state.sources[o.kind.source] ??= emptySource());
  const prevRec = st.files[file];
  const prevBytes = prevRec && (await readRaw(o.stores, prevRec));
  const prepared = prepare(o.kind, input, now, prevBytes ? new TextDecoder().decode(prevBytes) : null, o.allowShrink);
  if (prepared.added.length) log(`columns added by us, left empty for you to fill: ${prepared.added.join(', ')}`);

  const body = new TextEncoder().encode(prepared.body);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const changed = prevRec?.sha256 !== sha256;
  if (changed) {
    const key = `${o.kind.source}/${runStamp(now)}/${file}.gz`;
    await o.stores.raw.put(key, gzipSync(body, { level: 9 }), 'application/gzip');
    st.files[file] = { key, sha256, bytes: body.length, contentType: prepared.contentType };
    st.lastChange = now.toISOString();
  }
  (st.imported ??= {})[file] = { from, at: now.toISOString(), rows: prepared.rows };
  st.firstAttempt ??= now.toISOString();
  st.lastAttempt = st.lastSuccess = now.toISOString();
  st.failures = 0;
  st.rows = Object.values(st.imported).reduce((s, f) => s + f.rows, 0);

  // This writer owns only the imported source; everything else is taken fresh from the bucket.
  const snapshot = await publish(o.stores, state, [o.kind.source], { sources: o.sources, imported: o.imported }, now, changed);
  return { source: o.kind.source, file, rows: prepared.rows, bytes: body.length, changed, snapshot };
}
