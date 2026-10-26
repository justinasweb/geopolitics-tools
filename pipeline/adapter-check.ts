// Runs every indicator and flow over a snapshot's raw files and prints what each found, plus every
// adapter's unmatched codes:
//   node pipeline/adapter-check.ts [dir]      (default data/raw, as pipeline/pull.ts writes it)
// The pull request live check runs it on the files just fetched, so an adapter meets the real
// format before it merges. Measures whose files are not in the snapshot (imported sources, keyed
// ones) are listed as skipped. Exits 1 when a loader fails or finds nothing.
import { matchReports, rawDir } from '../src/adapters/core.ts';
import { space } from '../src/adapters/celestrak.ts';
import { cables, outages } from '../src/adapters/digital.ts';
import { gem } from '../src/adapters/gem.ts';
import { hazards } from '../src/adapters/hazards.ts';
import { minerals } from '../src/adapters/minerals.ts';
import { chokepoints } from '../src/adapters/portwatch.ts';
import { prices } from '../src/adapters/prices.ts';
import { treasuryHistory, treasuryHolders } from '../src/adapters/treasury.ts';
import { oilPrices } from '../src/adapters/eia.ts';
import { comtrade } from '../src/adapters/comtrade.ts';
import { FLOWS, loadFlows } from '../src/data/flows.ts';
import { INDICATORS, latestYear, registry } from '../src/data/indicators.ts';

const dir = process.argv[2] ?? 'data/raw';
const raw = rawDir(dir);
const reg = registry(raw);
const missing = (e: unknown) => /is not in the snapshot/.test((e as Error).message);
const failed: string[] = [];
const skipped: string[] = [];

for (const [id, d] of Object.entries(INDICATORS)) {
  if (!d.load) continue;
  try {
    const l = reg.load(id);
    const places = Object.keys(l.values).length;
    console.log(`${id.padEnd(16)} ${String(places).padStart(4)} places, ${l.years[0] ?? '-'}–${l.years.at(-1) ?? '-'}, latest ${latestYear(l) ?? '-'}`);
    if (!places) failed.push(`${id}: no values`);
  } catch (e) {
    if (missing(e)) skipped.push(id);
    else failed.push(`${id}: ${(e as Error).message}`);
  }
}
for (const [key, f] of Object.entries(FLOWS)) {
  if (!f.load) continue;
  try {
    const fl = loadFlows(raw, key);
    console.log(`flow ${key.padEnd(11)} ${String(fl.pairs.length).padStart(4)} pairs, ${fl.period}`);
    if (!fl.pairs.length) failed.push(`flow ${key}: no pairs`);
  } catch (e) {
    if (missing(e)) skipped.push(`flow ${key}`);
    else failed.push(`flow ${key}: ${(e as Error).message}`);
  }
}
// Adapters the map views read directly: what each found.
const VIEWS: [string, () => string][] = [
  ['hazards', () => { const h = hazards(raw); const q = h.filter((e) => e.kind === 'EQ'); return `${h.length - q.length} alerts, ${q.length} quakes (${q.filter((e) => !e.place).length} at sea or unplaced)`; }],
  ['outages', () => `${outages(raw).length} country outages`],
  ['cables', () => { const c = cables(raw); return `${c.length} cables, ${c.filter((x) => x.landings.length >= 2).length} with two or more landings, ${c.flatMap((x) => x.landings).filter((l) => !l.place).length} landings unplaced`; }],
  ['chokepoints', () => chokepoints(raw).map((p) => `${p.name} ${p.status}`).join(', ')],
  ['prices', () => `${Object.keys(prices(raw).series).length} Pink Sheet series`],
  ['minerals', () => minerals(raw).map((m) => `${m.id} ${m.year}`).join(', ')],
  ['gem', () => { const g = gem(raw); return `${g.pipelines.length} pipelines, ${g.terminals.length} terminals, ${g.plants.length} plants`; }],
  ['treasury', () => `${treasuryHolders(raw).holders.length} holders to ${treasuryHolders(raw).months[0]}`],
  ['oil prices', () => { const p = oilPrices(raw); return `${p.brent.length} Brent months to ${p.brent.at(-1)?.date}, ${p.wti.length} WTI`; }],
  ['comtrade', () => { const r = comtrade(raw); return `${r.length} rows, ${new Set(r.map((x) => x.reporter)).size} reporters, ${[...new Set(r.map((x) => x.year))].sort().join(' ')}`; }],
  ['treasury history', () => `${Object.keys(treasuryHistory(raw)).length} places`],
];
for (const [name, f] of VIEWS) {
  try {
    const line = f();
    console.log(`view ${name.padEnd(16)} ${line}`);
    if (/^0 |^$/.test(line)) failed.push(`view ${name}: nothing found`);
  } catch (e) {
    if (missing(e)) skipped.push(`view ${name}`);
    else failed.push(`view ${name}: ${(e as Error).message}`);
  }
}
if (raw.has('celestrak', 'satcat.csv')) {
  const u = Object.entries(space(raw).unknownSites).sort((a, b) => b[1] - a[1]);
  console.log(u.length ? `celestrak: ${u.length} launch site(s) not in SITES (counted as other): ${u.map(([k, n]) => `${k} (${n})`).join(', ')}` : 'celestrak: every launch site known');
}
console.log(`\nUnmatched codes (add them to src/data/places/codes.csv, with an empty place for aggregates):\n${matchReports().join('\n')}`);
if (skipped.length) console.log(`\nSkipped, files not in this snapshot: ${skipped.join(', ')}`);
if (failed.length) {
  console.error(`\nFailed:\n${failed.join('\n')}`);
  process.exit(1);
}
