// The Bloc overlap tool's shared model: the compact membership data the build embeds in the page, the settings the
// page keeps in its address, the shared-member counts, the membership rows and their sort. The build
// (src/lib/overlap.ts) and the browser script (src/scripts/overlap.ts) both use it, so it imports nothing that needs
// Node.

/** The order blocs are offered in on this page: the nine the design compares first, then the rest. */
export const OVERLAP_ORDER = [
  'nato', 'eu', 'g7', 'g20', 'brics', 'sco', 'asean', 'opec', 'quad',
  'oecd', 'apec', 'rcep', 'opec-plus', 'unsc-p5', 'aukus', 'usmca', 'csto', 'eaeu', 'cis',
];
/** Chosen when the address names none (BlocOverlap design). */
export const DEFAULT_BLOCS = ['nato', 'eu', 'g7', 'g20', 'brics', 'sco', 'asean', 'opec', 'quad'];
/** The two blocs the phone compares when the address names none. */
export const DEFAULT_PAIR: [string, string] = ['brics', 'sco'];

/**
 * The strict bridge-country rule (addendum section 4, decision 5.3): a full member of at least one Western-led
 * grouping and at least one non-Western one. Partners and invitees do not count.
 */
export const WEST = ['nato', 'eu', 'g7', 'quad'];
export const NON_WEST = ['brics', 'sco'];

/** The membership table's marks: shapes, not colour, tell the bloc groups apart. */
export type Shape = 'sq' | 'tri' | 'dot';
export const SHAPES: Record<Shape, string[]> = {
  sq: ['nato', 'eu', 'g7', 'g20', 'quad', 'oecd', 'aukus', 'usmca'],
  tri: ['brics', 'sco', 'csto', 'eaeu', 'cis'],
  dot: ['asean', 'opec', 'apec', 'rcep', 'opec-plus', 'unsc-p5'],
};
export const shapeOf = (bloc: string): Shape => (Object.keys(SHAPES) as Shape[]).find((s) => SHAPES[s].includes(bloc)) ?? 'dot';

/** Matrix shades: 0 shared, then 1–4, 5–9, 10–14, 15–19, 20 or more. */
export const SHADE_EDGES = [1, 5, 10, 15, 20];
export const shade = (n: number) => SHADE_EDGES.filter((e) => n >= e).length;

/** Rows the phone table shows before "Show all countries and blocs". */
export const PHONE_ROWS = 14;
/** Blocs the phone table shows: the two picked and the two chosen blocs sharing most members with them. */
export const PHONE_COLS = 4;

export interface Data {
  /** Every bloc, in OVERLAP_ORDER: id, short name, name inside a sentence, members (place ids). */
  blocs: { id: string; name: string; inText: string; members: string[] }[];
  places: Record<string, { n: string; c: string; h?: string }>;
  /** When the membership table was last checked (ISO date, and as written). */
  checked: string;
  checkedText: string;
}

export type Sort = 'total' | 'country';
export interface State {
  blocs: string[];
  a: string;
  b: string;
  sort: Sort;
  dir: 'asc' | 'desc';
  /** On a phone: every country and every chosen bloc. */
  all: boolean;
}

export const DEFAULTS: State = { blocs: DEFAULT_BLOCS, a: DEFAULT_PAIR[0], b: DEFAULT_PAIR[1], sort: 'total', dir: 'desc', all: false };

/** The prototype's ids (#/overlap?blocs=NATO,EU,OPEC+) and this site's. */
const norm = (id: string) => id.trim().toLowerCase().replace(/\+$/, '-plus');

export function parseState(q: URLSearchParams, data: Data): State {
  const known = new Set(data.blocs.map((b) => b.id));
  const asked = new Set((q.get('blocs') ?? '').split(',').map(norm).filter((b) => known.has(b)));
  const blocs = asked.size >= 2 ? OVERLAP_ORDER.filter((b) => asked.has(b)) : DEFAULTS.blocs;
  const one = (k: 'a' | 'b') => (known.has(norm(q.get(k) ?? '')) ? norm(q.get(k)!) : DEFAULTS[k]);
  const sort: Sort = q.get('sort') === 'country' ? 'country' : 'total';
  const dir = q.get('dir') === 'asc' || q.get('dir') === 'desc' ? (q.get('dir') as State['dir']) : sort === 'country' ? 'asc' : 'desc';
  return { blocs, a: one('a'), b: one('b'), sort, dir, all: q.get('all') === '1' };
}

/** The address for a state, leaving out what is the default. */
export function queryOf(s: State): string {
  const q = new URLSearchParams();
  const ordered = OVERLAP_ORDER.filter((b) => s.blocs.includes(b));
  if (ordered.join(',') !== DEFAULTS.blocs.join(',')) q.set('blocs', ordered.join(','));
  if (s.a !== DEFAULTS.a) q.set('a', s.a);
  if (s.b !== DEFAULTS.b) q.set('b', s.b);
  if (s.sort !== 'total') q.set('sort', s.sort);
  if (s.dir !== (s.sort === 'country' ? 'asc' : 'desc')) q.set('dir', s.dir);
  if (s.all) q.set('all', '1');
  return q.toString().replace(/%2C/g, ',');
}

const membersOf = (data: Data, id: string) => data.blocs.find((b) => b.id === id)?.members ?? [];
export const blocOf = (data: Data, id: string) => data.blocs.find((b) => b.id === id)!;

/** Members of both blocs, by name. */
export function sharedMembers(data: Data, a: string, b: string): string[] {
  const in2 = new Set(membersOf(data, b));
  return membersOf(data, a).filter((m) => in2.has(m)).sort((x, y) => nameCmp(data, x, y));
}

const nameCmp = (data: Data, x: string, y: string) => (data.places[x]?.n ?? x).localeCompare(data.places[y]?.n ?? y, 'en');

/** In both, only the first, only the second: each by name. */
export function twoBlocs(data: Data, a: string, b: string): { both: string[]; onlyA: string[]; onlyB: string[] } {
  const A = new Set(membersOf(data, a)), B = new Set(membersOf(data, b));
  const byName = (l: string[]) => l.sort((x, y) => nameCmp(data, x, y));
  return {
    both: byName([...A].filter((m) => B.has(m))),
    onlyA: byName([...A].filter((m) => !B.has(m))),
    onlyB: byName([...B].filter((m) => !A.has(m))),
  };
}

/**
 * The matrix's headline: the pair sharing most members, then the pair sharing most among the blocs left (ties go to
 * the earlier bloc in the order offered). Pairs sharing nobody are left out.
 */
export function topPairs(data: Data, blocs: string[]): [string, string, number][] {
  const pairs: [string, string, number][] = [];
  blocs.forEach((a, i) => blocs.slice(i + 1).forEach((b) => pairs.push([a, b, sharedMembers(data, a, b).length])));
  const best = (l: typeof pairs) => l.filter((p) => p[2] > 0).reduce<(typeof pairs)[number] | null>((m, p) => (!m || p[2] > m[2] ? p : m), null);
  const first = best(pairs);
  if (!first) return [];
  const second = best(pairs.filter((p) => !p.slice(0, 2).some((x) => x === first[0] || x === first[1])));
  return second ? [first, second] : [first];
}

export interface MemberRow { id: string; in: boolean[]; total: number }

/** Every country in at least one of the blocs, with its memberships and how many, sorted as asked. */
export function memberRows(data: Data, blocs: string[], sort: Sort, dir: State['dir']): MemberRow[] {
  const sets = blocs.map((b) => new Set(membersOf(data, b)));
  const ids = new Set(sets.flatMap((s) => [...s]));
  const rows = [...ids].map((id) => {
    const inn = sets.map((s) => s.has(id));
    return { id, in: inn, total: inn.filter(Boolean).length };
  });
  const sign = dir === 'asc' ? 1 : -1;
  return rows.sort((x, y) => (sort === 'total' ? sign * (x.total - y.total) || nameCmp(data, x.id, y.id) : sign * nameCmp(data, x.id, y.id)));
}

/** The phone table's blocs: the two picked, then the chosen blocs sharing most members with either. */
export function phoneBlocs(data: Data, s: State): string[] {
  const pair = s.a === s.b ? [s.a] : [s.a, s.b];
  const union = new Set(pair.flatMap((b) => membersOf(data, b)));
  const rest = s.blocs.filter((b) => !pair.includes(b))
    .map((b, i) => ({ b, i, n: membersOf(data, b).filter((m) => union.has(m)).length }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || x.i - y.i);
  return [...pair, ...rest.slice(0, PHONE_COLS - pair.length).map((x) => x.b)];
}
