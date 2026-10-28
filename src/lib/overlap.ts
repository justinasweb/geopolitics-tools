// The Bloc overlap tool's data, worked out at build time from the membership table (./blocs.ts): every bloc's members
// in the order this page offers them, the places with their country pages, the bridge countries under the strict rule,
// and the partners and invitees (src/data/bloc-partners.csv), which are listed but never counted as members.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';
import { OVERLAP_SHORT, OVERLAP_TEXT as T, blocIn } from '../i18n/overlap.en.ts';
import { BLOCS_CHECKED, blocs } from './blocs.ts';
import { formatDate } from './format.ts';
import { DEFAULT_BLOCS, NON_WEST, OVERLAP_ORDER, WEST, type Data } from './overlap/model.ts';
import type { Bridges } from './overlap/render.ts';
import { place } from './places.ts';
import { countryHref } from './routes.ts';

const STATUSES = ['partner', 'dialogue', 'invited', 'offered'] as const;
type Status = (typeof STATUSES)[number];

let cache: Data | null = null;
export function overlapData(): Data {
  if (cache) return cache;
  const all = blocs();
  const missing = [...all.keys()].filter((b) => !OVERLAP_ORDER.includes(b));
  if (missing.length) throw new Error(`overlap: add ${missing.join(', ')} to OVERLAP_ORDER`);
  const places: Data['places'] = {};
  for (const id of new Set([...all.values()].flat().concat(partnerRows().map((r) => r.place)))) {
    const p = place(id)!;
    const h = countryHref(id);
    places[id] = { n: p.name, c: p.iso3, ...(h ? { h } : {}) };
  }
  cache = {
    blocs: OVERLAP_ORDER.map((id) => {
      const name = OVERLAP_SHORT[id] ?? BLOC_TEXT[id] ?? id;
      return { id, name, inText: blocIn(id, name), members: all.get(id)! };
    }),
    places,
    checked: BLOCS_CHECKED,
    checkedText: formatDate(BLOCS_CHECKED),
  };
  return cache;
}

/** Partners and invitees, in the file's order. Fails on an unknown bloc, place or status, or on a full member. */
function partnerRows(): { bloc: string; place: string; status: Status; year: string }[] {
  const [head, ...rows] = parseCsv(readFileSync(join(process.cwd(), 'src/data/bloc-partners.csv'), 'utf8'));
  const col = (k: string) => head.indexOf(k);
  const all = blocs();
  return rows.filter((r) => r[col('bloc')]?.trim()).map((r) => {
    const [bloc, p, status, year] = ['bloc', 'place', 'status', 'year'].map((k) => r[col(k)]?.trim() ?? '');
    if (!all.has(bloc)) throw new Error(`bloc-partners.csv: unknown bloc "${bloc}"`);
    if (!place(p)) throw new Error(`bloc-partners.csv: unknown place "${p}"`);
    if (!STATUSES.includes(status as Status)) throw new Error(`bloc-partners.csv: unknown status "${status}" (${STATUSES.join(', ')})`);
    if (status === 'offered' && !year) throw new Error(`bloc-partners.csv: ${p} ${bloc} "offered" needs a year`);
    if (all.get(bloc)!.includes(p)) throw new Error(`bloc-partners.csv: ${p} is a full member of ${bloc}, not a partner`);
    return { bloc, place: p, status: status as Status, year };
  });
}

/** Bridge countries: full members of at least one Western-led and one non-Western grouping, by name. */
export function bridges(): Bridges {
  const data = overlapData();
  const of = (id: string) => data.blocs.find((b) => b.id === id)!.members;
  const memberOf = (p: string, group: string[]) => group.filter((b) => of(b).includes(p));
  const list = Object.keys(data.places)
    .map((id) => ({ id, west: memberOf(id, WEST), non: memberOf(id, NON_WEST) }))
    .filter((x) => x.west.length && x.non.length)
    .sort((x, y) => data.places[x.id].n.localeCompare(data.places[y.id].n, 'en'));
  const name = (b: string) => data.blocs.find((x) => x.id === b)!.name;
  const byPlace = new Map<string, string[]>();
  for (const r of partnerRows()) {
    const text = r.status === 'offered' ? T.partner.offered(name(r.bloc), r.year) : T.partner[r.status](name(r.bloc));
    if (!byPlace.has(r.place)) byPlace.set(r.place, memberOf(r.place, [...WEST, ...NON_WEST]).map(name));
    byPlace.get(r.place)!.push(text);
  }
  const partners = [...byPlace].map(([id, parts]) => ({ id, text: parts.join('; ') }));
  return { list, partners, west: WEST, non: NON_WEST, neither: DEFAULT_BLOCS.filter((b) => !WEST.includes(b) && !NON_WEST.includes(b)) };
}
