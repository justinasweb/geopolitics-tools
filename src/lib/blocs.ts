// Bloc memberships (src/data/blocs.csv): which places belong to each of the 19 groupings, for the "Outline a bloc"
// control on every map and, later, the Blocs views and Bloc overlap. Members are internal place ids. Bloc names are
// in the per-language text (src/i18n/map.en.ts).
//
// The table is the membership list the prototype kept by hand and the design review checked on 21 October 2026
// (design batch 5). Phase 5a adds the weekly Wikidata cross-check the spec names as the source; until then a change
// is an edit to the CSV, logged in Sources → Corrections like any other fix.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { place } from './places.ts';

/** The order blocs are offered in: the groupings readers ask about most first, then the rest by region. */
export const BLOC_ORDER = [
  'brics', 'g7', 'g20', 'eu', 'nato', 'opec', 'opec-plus', 'asean', 'sco', 'oecd', 'apec', 'rcep', 'unsc-p5',
  'quad', 'aukus', 'usmca', 'csto', 'eaeu', 'cis',
];

/** When the membership table was last checked against the blocs' own member lists. */
export const BLOCS_CHECKED = '2026-10-21';

let cache: Map<string, string[]> | null = null;
/** Members by bloc id, in BLOC_ORDER. Fails on an unknown place or bloc, so a typo cannot drop a member silently. */
export function blocs(): Map<string, string[]> {
  if (cache) return cache;
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data/blocs.csv'), 'utf8'));
  const [bi, pi] = [head.indexOf('bloc'), head.indexOf('place')];
  const by = new Map<string, string[]>(BLOC_ORDER.map((b) => [b, []]));
  for (const r of rows) {
    const [b, p] = [r[bi]?.trim(), r[pi]?.trim()];
    if (!b) continue;
    if (!by.has(b)) throw new Error(`blocs.csv: unknown bloc "${b}" (add it to BLOC_ORDER)`);
    if (!place(p)) throw new Error(`blocs.csv: unknown place "${p}" in ${b}`);
    by.get(b)!.push(p);
  }
  for (const [b, m] of by) if (!m.length) throw new Error(`blocs.csv: bloc "${b}" has no members`);
  cache = by;
  return by;
}
