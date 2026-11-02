// Downloads one data snapshot's raw files for the site build or local work:
//   node pipeline/pull.ts [--store=r2 | dir:<path>] [--snapshot=<id>] [--out=data/raw]
// Without --snapshot it takes latest.json. Writes <out>/<source>/<file>, <out>/snapshot.json and the
// public <out>/status.json,
// and checks every file against its recorded SHA-256. Rolling the site's data back is a build
// with an earlier --snapshot.
//
// It also brings This week's archive (lib/weeks.ts) to <out>/weeks/: every frozen week and approved summary, and the
// sanctions lists as they stood at the start of the live page's seven days (<out>/weeks/baseline/, with
// baseline.json giving the day), so the page can count entries added and removed.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRaw, type Snapshot } from './lib/runner.ts';
import { openStores } from './lib/store.ts';
import { baselineFor, loadLedger, summaryKey, unpack, weekKey } from './lib/weeks.ts';
import { rollingWeek, weekId } from '../src/lib/week/period.ts';

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
  const summary = await stores.snapshots.get(summaryKey(w));
  if (summary) writeFileSync(join(weeksOut, `${w}.summary.json`), summary);
}
const live = rollingWeek(snap.created.slice(0, 10));
// The live page shows the summary of the ISO week its last day is in, which is not frozen yet.
const liveSummary = await stores.snapshots.get(summaryKey(weekId(live.to)));
if (liveSummary) writeFileSync(join(weeksOut, `${weekId(live.to)}.summary.json`), liveSummary);
const base = baselineFor(ledger, live.from, live.to);
if (base) {
  await unpack(stores, base.files, join(weeksOut, 'baseline'));
  writeFileSync(join(weeksOut, 'baseline.json'), JSON.stringify({ date: base.date }));
}
console.log(`This week: ${frozen} frozen week(s)${base ? `, sanctions lists from ${base.date}` : ', no earlier sanctions lists yet'}`);
