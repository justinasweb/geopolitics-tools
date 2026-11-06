// Downloads one data snapshot's raw files for the site build or local work:
//   node pipeline/pull.ts [--store=r2 | dir:<path>] [--snapshot=<id>] [--out=data/raw]
// Without --snapshot it takes latest.json. Writes <out>/<source>/<file>, <out>/snapshot.json and the
// public <out>/status.json,
// and checks every file against its recorded SHA-256. Each source folder is replaced whole (unpackSources), so it
// holds only the files this snapshot lists. Rolling the site's data back is a build with an earlier --snapshot.
//
// It also brings This week's archive (lib/weeks.ts) to <out>/weeks/: every frozen week, and the
// copies kept on the first of the live page's 7 days (<out>/weeks/baseline/, with baseline.json giving the day): the
// sanctions lists, to count entries added and removed, and GDACS's alerts, to tell which earlier alerts rose.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unpackSources, type Snapshot } from './lib/runner.ts';
import { openStores } from './lib/store.ts';
import { baselineFor, loadLedger, unpack, weekKey } from './lib/weeks.ts';
import { rollingWeek } from '../src/lib/week/period.ts';

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
mkdirSync(out, { recursive: true });
const files = await unpackSources(stores, Object.fromEntries(Object.entries(snap.sources).map(([source, s]) => [source, s.files])), out);
writeFileSync(join(out, 'snapshot.json'), JSON.stringify(snap, null, 2));
// The runner's public status (Live / Delayed per source), for the Sources page; older stores may not have one.
const status = await stores.snapshots.get('status.json');
if (status) writeFileSync(join(out, 'status.json'), status);
console.log(`Snapshot ${snap.id}: ${files} files from ${Object.keys(snap.sources).length} sources in ${out}/`);

const ledger = await loadLedger(stores);
const weeksOut = join(out, 'weeks');
mkdirSync(weeksOut, { recursive: true });
let frozen = 0;
for (const w of ledger.weeks) {
  const body = await stores.snapshots.get(weekKey(w));
  if (!body) continue;
  writeFileSync(join(weeksOut, `${w}.json`), body);
  frozen++;
}
// The live page covers the last 7 days: the copies from their first day only, so every count covers the same days.
const live = rollingWeek(snap.created.slice(0, 10));
const base = baselineFor(ledger, live.from, live.from);
if (base) {
  await unpack(stores, base.files, join(weeksOut, 'baseline'));
  writeFileSync(join(weeksOut, 'baseline.json'), JSON.stringify({ date: base.date }));
}
console.log(`This week: ${frozen} frozen week(s)${base ? `, copies from ${base.date}` : `, no copies from ${live.from} yet`}`);
