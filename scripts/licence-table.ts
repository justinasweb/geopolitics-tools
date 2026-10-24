// Prints docs/licences.md from the licence table: node scripts/licence-table.ts > docs/licences.md
import { LICENCES, type Licence } from '../src/data/licences.ts';

const cell = (s: string) => s.replace(/\|/g, '\\|');
const row = (l: Licence) => `| [${cell(l.name)}](${l.terms}) | ${cell(l.licence)} | ${l.downloads === 'yes' ? 'Yes' : 'Shown only'} | ${l.commercial === 'to confirm' ? 'To confirm' : l.commercial === 'yes' ? 'Yes' : 'No'} | ${l.status === 'checked' ? `Checked ${l.checked}` : l.status === 'permission asked' ? 'Permission asked' : 'To confirm'} | ${cell(l.note ?? '')} |`;

export function licenceTable(): string {
  const count = (s: Licence['status']) => LICENCES.filter((l) => l.status === s).length;
  return [
    '# Licences',
    '',
    'Generated from `src/data/licences.ts` by `node scripts/licence-table.ts > docs/licences.md`; edit the table, not this file.',
    '',
    `What each source's terms allow and what the site does with it (decision D9). Downloads are "Yes" only where the terms`,
    'allow redistribution; otherwise the site shows charts and figures only. Credits travel with every chart and export.',
    `${count('checked')} checked against the terms page, ${count('to confirm')} to confirm, ${count('permission asked')} waiting on permission.`,
    '',
    '| Source | Licence | Downloads | Commercial use | Status | Note |',
    '|---|---|---|---|---|---|',
    ...LICENCES.map(row),
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(licenceTable());
