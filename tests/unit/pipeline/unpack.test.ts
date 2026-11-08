import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { unpackSources } from '../../../pipeline/lib/runner.ts';
import { openStores } from '../../../pipeline/lib/store.ts';
import { tempStores } from './helpers.ts';

// pipeline/pull.ts (and This week's copies) write a snapshot's files to <out>/<source>/: each source folder holds
// exactly what the snapshot lists, never a file an earlier snapshot left there.

async function stored(name: string, body: string) {
  const stores = tempStores();
  const key = `raw/${name}`;
  await stores.raw.put(key, gzipSync(body));
  return { stores, rec: { key, sha256: createHash('sha256').update(body).digest('hex') } };
}

describe('unpacking a snapshot', () => {
  it('replaces each source folder it writes, so files the snapshot does not list are gone', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gt-pull-'));
    mkdirSync(join(out, 'ucdp'));
    writeFileSync(join(out, 'ucdp', 'gedevents_25.1.json'), '{"old":true}');
    mkdirSync(join(out, 'weeks'));
    writeFileSync(join(out, 'weeks', '2026-44.json'), '{}');
    const { stores, rec } = await stored('ucdp-26.1', '{"Result":[]}');
    expect(await unpackSources(stores, { ucdp: { 'gedevents_26.1.json': rec } }, out)).toBe(1);
    expect(readdirSync(join(out, 'ucdp'))).toEqual(['gedevents_26.1.json']);
    expect(readFileSync(join(out, 'ucdp', 'gedevents_26.1.json'), 'utf8')).toBe('{"Result":[]}');
    // Folders it does not write are left alone, and no work folder stays behind.
    expect(existsSync(join(out, 'weeks', '2026-44.json'))).toBe(true);
    expect(readdirSync(out).sort()).toEqual(['ucdp', 'weeks']);
  });

  it('leaves the old folders as they were when a file is missing or does not match its checksum', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gt-pull-'));
    mkdirSync(join(out, 'ucdp'));
    writeFileSync(join(out, 'ucdp', 'gedevents_25.1.json'), 'old');
    const { stores, rec } = await stored('ucdp-26.1', 'new');
    await expect(unpackSources(stores, { ucdp: { 'gedevents_26.1.json': { ...rec, sha256: 'f'.repeat(64) } } }, out)).rejects.toThrow(/checksum/);
    await expect(unpackSources(stores, { ucdp: { 'gedevents_26.1.json': { key: 'raw/none', sha256: rec.sha256 } } }, out)).rejects.toThrow(/missing/);
    expect(readdirSync(join(out, 'ucdp'))).toEqual(['gedevents_25.1.json']);
    expect(readdirSync(out)).toEqual(['ucdp']);
  });

  it('pull.ts removes a file an earlier snapshot left in a source folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gt-store-'));
    const stores = openStores(`dir:${root}`);
    const body = '{"Result":[]}';
    await stores.raw.put('raw/ucdp-26.1', gzipSync(body));
    const rec = { key: 'raw/ucdp-26.1', sha256: createHash('sha256').update(body).digest('hex') };
    await stores.snapshots.put('latest.json', JSON.stringify({ id: '2026-11-06T1200Z', created: '2026-11-06T12:00:00.000Z', sources: { ucdp: { files: { 'gedevents_26.1.json': rec } } } }));
    const out = mkdtempSync(join(tmpdir(), 'gt-pull-'));
    mkdirSync(join(out, 'ucdp'));
    writeFileSync(join(out, 'ucdp', 'gedevents_25.1.json'), '{"old":true}');
    execFileSync(process.execPath, ['pipeline/pull.ts', `--store=dir:${root}`, `--out=${out}`], { stdio: 'pipe' });
    expect(readdirSync(join(out, 'ucdp'))).toEqual(['gedevents_26.1.json']);
  }, 30_000);
});
