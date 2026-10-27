// The Dependencies tool's shared model: the compact grid the build writes (/dependencies/data.json), the settings
// the page keeps in its address, the bands, the sort and the single points of failure. The build
// (src/lib/dependencies.ts) and the browser script (src/scripts/dependencies.ts) both use it, so it imports
// nothing that needs Node.

export const RESOURCE_IDS = ['oil', 'gas', 'wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate', 'arms', 'chips'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
/** Arms and chips show supplier concentration only: no share of use is measured. */
export const CONCENTRATION: ResourceId[] = ['arms', 'chips'];
/** Import reliance and supplier share that make a single point of failure. */
export const SPOF = { reliance: 0.5, supplier: 0.5 };
/** Single points of failure shown before "Show all". */
export const SPOF_SHOWN = 8;
/** On a phone, the first four. */
export const SPOF_PHONE = 4;

/** 1–6 on the diverging scale (imports most → exports most), 'c' supplier concentration only, 0 no figure. */
export type Band = 1 | 2 | 3 | 4 | 5 | 6 | 'c' | 0;

export interface Cell {
  /** Net imports ÷ use; negative for a net exporter. */
  v?: number;
  /** Net exports ÷ output, for an exporter. */
  x?: number;
  /** Main supplier and its share of imports. */
  t?: [string, number];
  /** Year, or period for arms ("2020–2024"). */
  y?: string;
  /** Why there is no figure: p no data yet, n not reported, u not used, i no imports. */
  why?: 'p' | 'n' | 'u' | 'i';
}

export interface ResourceMeta {
  id: ResourceId;
  label: string;
  noun: string;
  /** Short name of the share-of-use source and of the supplier source. */
  credit: string;
  flowCredit: string;
  /** The shares (of use, of output) may be downloaded; the supplier shares may be downloaded. */
  csv: boolean;
  csvTop: boolean;
}

export interface Grid {
  resources: ResourceMeta[];
  /** Countries by name, each with its ten cells in RESOURCE_IDS order. */
  rows: { id: string; cells: Cell[] }[];
  places: Record<string, { n: string; c: string; h?: string }>;
  blocs: { id: string; name: string; members: string[] }[];
  /** The source line: credits, the years shown, the latest refresh; retrieved dates for the CSV. */
  credits: string;
  years: string;
  updated?: string;
  retrieved: string;
}

export type Show = 'country' | 'commodity';
export interface State {
  bloc: string;
  /** A resource id, or 'country'. */
  sort: string;
  dir: 'asc' | 'desc';
  find: string;
  /** Phone: one country's card, or one commodity ranked. */
  show: Show;
  c: string;
  /** All single points of failure, not just the first eight. */
  all: boolean;
}

export const DEFAULTS: State = { bloc: '', sort: 'oil', dir: 'desc', find: '', show: 'country', c: '', all: false };

export function bandOf(r: ResourceId, cell: Cell): Band {
  if (CONCENTRATION.includes(r)) return cell.t ? 'c' : 0;
  const v = cell.v;
  if (v === undefined) return 0;
  if (v >= 0.75) return 1;
  if (v >= 0.5) return 2;
  if (v >= 0.15) return 3;
  if (v > -0.15) return 4;
  return (cell.x ?? 0) > 0.5 ? 6 : 5;
}

/** The figure a column sorts on: import reliance, or the main supplier's share for arms and chips. */
export function sortValue(r: ResourceId, cell: Cell): number | undefined {
  return CONCENTRATION.includes(r) ? cell.t?.[1] : cell.v;
}

/** The first resource with any figure, so the default sort never lands on an empty column. */
export function firstLive(grid: Grid): ResourceId {
  const i = RESOURCE_IDS.findIndex((r, i) => grid.rows.some((row) => sortValue(r, row.cells[i]) !== undefined));
  return RESOURCE_IDS[Math.max(0, i)];
}

export function parseState(q: URLSearchParams, grid: Grid): State {
  const bloc = q.get('bloc') ?? '';
  const sort = q.get('sort') ?? '';
  const c = q.get('c') ?? '';
  return {
    bloc: grid.blocs.some((b) => b.id === bloc) ? bloc : '',
    sort: sort === 'country' || (RESOURCE_IDS as readonly string[]).includes(sort) ? sort : firstLive(grid),
    dir: q.get('dir') === 'asc' ? 'asc' : q.get('dir') === 'desc' ? 'desc' : sort === 'country' ? 'asc' : 'desc',
    find: (q.get('find') ?? '').slice(0, 60),
    show: q.get('show') === 'commodity' ? 'commodity' : 'country',
    c: grid.places[c] ? c : '',
    all: q.get('all') === '1',
  };
}

/** The settings that differ from the defaults, as an address query. */
export function queryOf(s: State, grid: Grid): string {
  const q = new URLSearchParams();
  if (s.bloc) q.set('bloc', s.bloc);
  if (s.sort !== firstLive(grid)) q.set('sort', s.sort);
  if (s.dir !== (s.sort === 'country' ? 'asc' : 'desc')) q.set('dir', s.dir);
  if (s.find) q.set('find', s.find);
  if (s.show !== 'country') q.set('show', s.show);
  if (s.c) q.set('c', s.c);
  if (s.all) q.set('all', '1');
  return q.toString();
}

export const resIndex = (r: string) => (RESOURCE_IDS as readonly string[]).indexOf(r);

/** The rows in the chosen bloc, sorted; countries without the sorted figure go last, by name. */
export function rowsOf(s: State, grid: Grid) {
  const members = s.bloc ? new Set(grid.blocs.find((b) => b.id === s.bloc)?.members ?? []) : null;
  const rows = grid.rows.filter((r) => !members || members.has(r.id));
  if (s.sort === 'country') return s.dir === 'asc' ? rows : [...rows].reverse();
  const i = resIndex(s.sort);
  const r = RESOURCE_IDS[i];
  const sign = s.dir === 'asc' ? 1 : -1;
  return rows.map((row, at) => ({ row, at, v: sortValue(r, row.cells[i]) })).sort((a, b) => {
    if (a.v === undefined || b.v === undefined) return a.v === b.v ? a.at - b.at : a.v === undefined ? 1 : -1;
    return (a.v - b.v) * sign || a.at - b.at;
  }).map((x) => x.row);
}

export interface Spof { id: string; r: ResourceId; v: number; t: [string, number] }

/** Single points of failure among these rows: largest share from one supplier first. */
export function spofs(rows: Grid['rows']): Spof[] {
  const out: Spof[] = [];
  for (const row of rows) {
    RESOURCE_IDS.forEach((r, i) => {
      const c = row.cells[i];
      if (CONCENTRATION.includes(r) || c.v === undefined || !c.t) return;
      if (c.v >= SPOF.reliance && c.t[1] >= SPOF.supplier) out.push({ id: row.id, r, v: c.v, t: c.t });
    });
  }
  return out.sort((a, b) => b.t[1] - a.t[1] || b.v - a.v);
}

/** The first country whose name starts with, then contains, the search. */
export function foundRow(grid: Grid, ids: string[], q: string): string | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  const name = (id: string) => (grid.places[id]?.n ?? id).toLowerCase();
  return ids.find((id) => name(id).startsWith(t)) ?? ids.find((id) => name(id).includes(t)) ?? null;
}
