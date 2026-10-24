// Runs the data pipeline: node pipeline/run.ts [options]
//
//   --store=r2 | dir:<path>   where state and files live (default dir:.data, a local folder)
//   --force                   run every enabled source, due or not
//   --only=a,b                run just these sources (also ones switched off), due or not
//   --allow-shrink            accept a sharp drop in values against the last good copy
//   --fail-on-alert           exit 1 when this run raised an alert (the scheduled run uses this,
//                             so GitHub's failed-run email backs up Telegram)
//   --fail-on-error           exit 1 when a source that ran failed a check or got a client error
//                             (the pull request check); network trouble and server errors only warn
//   --list                    print the sources and their schedules, and stop
//   --retention               print the R2 lifecycle rules the raw bucket needs (name, prefix, days), and stop
import { appendFileSync } from 'node:fs';
import { telegram } from './lib/alert.ts';
import { createHttp } from './lib/http.ts';
import { run, type RunReport } from './lib/runner.ts';
import { openStores } from './lib/store.ts';
import { SOURCES } from './sources/index.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const hours = (h: number) => (h % 24 ? `${h} h` : `${h / 24} d`);

if (flag('list')) {
  for (const s of SOURCES) console.log(`${s.id.padEnd(14)} every ${hours(s.every).padEnd(6)} deadline ${hours(s.staleAfter).padEnd(6)} ${s.enabled === true ? '' : `OFF: ${s.enabled}`}`);
  process.exit(0);
}

if (flag('retention')) {
  // Raw copies of hourly sources are kept two weeks; everything else is kept, because sources revise their history.
  for (const s of SOURCES) if (s.keepDays) console.log(`keep-${s.id} ${s.id}/ ${s.keepDays}`);
  console.log('keep-ci ci/ 2');
  process.exit(0);
}

const only = value('only')?.split(',').filter(Boolean);
const unknown = only?.filter((id) => !SOURCES.some((s) => s.id === id));
if (unknown?.length) {
  console.error(`Unknown source(s): ${unknown.join(', ')}. Known: ${SOURCES.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

const http = createHttp();
const alerter = telegram(http);
const report = await run({
  sources: SOURCES,
  stores: openStores(value('store') ?? 'dir:.data'),
  http,
  alerter,
  force: flag('force'),
  only,
  allowShrink: flag('allow-shrink'),
});

function summary(r: RunReport) {
  const icon = { changed: '🟢', unchanged: '⚪', failed: '🔴', 'not due': '·', off: '⏸' } as const;
  const lines = [
    `### Data run ${r.run}`,
    '',
    `${r.changed ? `New data; snapshot \`${r.snapshot}\`.` : `No new data; latest snapshot \`${r.snapshot ?? 'none yet'}\`.`} Alerts raised: ${r.alerts}${alerter.configured ? '' : ' (Telegram not configured)'}.`,
    '',
    '| Source | Result | Detail | Time |',
    '|---|---|---|---|',
    ...r.reports.map((s) => `| ${s.name} | ${icon[s.outcome]} ${s.outcome} | ${s.detail.replace(/\|/g, '\\|')} | ${s.seconds === undefined ? '' : `${s.seconds} s`} |`),
  ];
  return lines.join('\n') + '\n';
}

console.log(`\n${summary(report)}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(report));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${report.changed}\nsnapshot=${report.snapshot ?? ''}\n`);

const failed = report.reports.filter((s) => s.outcome === 'failed');
const passing = failed.filter((s) => s.transient);
if (passing.length) console.warn(`::warning::Network or server trouble, likely to pass on its own: ${passing.map((s) => s.id).join(', ')}`);
const real = failed.filter((s) => !s.transient);
if (flag('fail-on-error') && real.length) {
  console.error(`${real.length} source(s) failed: ${real.map((s) => s.id).join(', ')}`);
  process.exitCode = 1;
}
if (flag('fail-on-alert') && report.alerts) {
  console.error(`${report.alerts} alert(s) raised; see above.`);
  process.exitCode = 1;
}
