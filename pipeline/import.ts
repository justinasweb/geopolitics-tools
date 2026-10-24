// Imports a file downloaded by hand, after checking it: node pipeline/import.ts <kind> <file> [options]
//
//   --store=r2 | dir:<path>   where state and files live (default dir:.data, a local folder)
//   --sheet=<name>            the workbook sheet to read (otherwise the first with the kind's columns)
//   --entry=<name>            the file to read inside a zip holding several
//   --allow-shrink            accept far fewer rows than the last imported copy
//   --list                    print the kinds and what file each expects, and stop
//
// For sources with no API (sources/imported.ts): SIPRI, UN World Population Prospects, Global Energy
// Monitor, WRI Aqueduct, FAO AQUASTAT, Global Dam Watch, AidData, USGS minerals and the Treasury
// history table. The import stops with a clear message if a column is missing (the publisher changed
// the format), keeps only the columns the site needs, and publishes a new snapshot with the file.
import { existsSync } from 'node:fs';
import { importFile } from './lib/importer.ts';
import { openStores } from './lib/store.ts';
import { IMPORTED, KINDS } from './sources/imported.ts';
import { SOURCES } from './sources/index.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const [kindId, path] = args.filter((a) => !a.startsWith('--'));

if (flag('list') || !path) {
  console.log('Usage: node pipeline/import.ts <kind> <file> [--store=r2] [--sheet=…] [--entry=…] [--allow-shrink]\n\nKinds:');
  for (const [k, s] of Object.entries(KINDS)) console.log(`  ${k.padEnd(18)} ${s.about}`);
  process.exit(flag('list') ? 0 : 1);
}
const kind = KINDS[kindId];
if (!kind) {
  console.error(`Unknown kind "${kindId}". Run with --list.`);
  process.exit(2);
}
if (!existsSync(path)) {
  console.error(`No such file: ${path}`);
  process.exit(2);
}

try {
  const r = await importFile({
    stores: openStores(value('store') ?? 'dir:.data'),
    kindId,
    kind,
    path,
    sheet: value('sheet'),
    entry: value('entry'),
    allowShrink: flag('allow-shrink'),
    sources: SOURCES,
    imported: IMPORTED,
  });
  console.log(`import ${kindId}: ${r.rows.toLocaleString('en')} rows → ${r.source}/${r.file} (${(r.bytes / 1e6).toFixed(1)} MB)`);
  console.log(r.changed ? `New snapshot ${r.snapshot}.` : `Same as the copy already imported; snapshot ${r.snapshot ?? 'none yet'} unchanged.`);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === 'EPERM' || err.code === 'EACCES') {
    console.error(`Can't read ${path}. On a Mac, Terminal may not be allowed into that folder (System Settings → Privacy & Security → Files and Folders); move the file into the project folder and try again.`);
  } else console.error(`import ${kindId} failed: ${err.message}`);
  process.exit(1);
}
