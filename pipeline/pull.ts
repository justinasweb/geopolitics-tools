// Downloads one data snapshot's raw files for the site build or local work:
//   node pipeline/pull.ts [--store=r2 | dir:<path>] [--snapshot=<id>] [--out=data/raw]
// Without --snapshot it takes latest.json. Writes <out>/<source>/<file> and <out>/snapshot.json,
// and checks every file against its recorded SHA-256. Rolling the site's data back is a build
// with an earlier --snapshot.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRaw, type Snapshot } from './lib/runner.ts';
import { openStores } from './lib/store.ts';

const args = process.argv.slice(2);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const stores = openStores(value('store') ?? 'r2');
const id = value('snapshot');
const out = value('out') ?? 'data/raw';
const b = await stores.snapshots.get(id ? `snapshots/${id}.json` : 'latest.json');
if (!b) {
  console.error(`No snapshot ${id ?? 'latest.json'} in ${stores.snapshots.name}`);
  process.exit(1);
}
const snap = JSON.parse(new TextDecoder().decode(b)) as Snapshot;
let files = 0;
for (const [source, s] of Object.entries(snap.sources)) {
  for (const [name, rec] of Object.entries(s.files)) {
    const body = await readRaw(stores, rec);
    if (!body) throw new Error(`${rec.key} is missing from ${stores.raw.name}`);
    if (createHash('sha256').update(body).digest('hex') !== rec.sha256) throw new Error(`${rec.key} does not match its checksum`);
    mkdirSync(join(out, source), { recursive: true });
    writeFileSync(join(out, source, name), body);
    files++;
  }
}
writeFileSync(join(out, 'snapshot.json'), JSON.stringify(snap, null, 2));
console.log(`Snapshot ${snap.id}: ${files} files from ${Object.keys(snap.sources).length} sources in ${out}/`);
