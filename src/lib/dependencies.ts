// The Dependencies tool's grid, worked out at build time from the same rows as each country page's "Dependencies
// at a glance" (src/lib/dependence.ts): every country with at least one share of use, its ten cells, the places
// its suppliers need for their ISO codes, the blocs, and what each source allows in the download.
import { FLOWS } from '../data/flows.ts';
import { RESOURCE_TEXT, SOURCE_SHORT } from '../i18n/pages.en.ts';
import { BLOC_TEXT } from '../i18n/map.en.ts';
import { blocs } from './blocs.ts';
import { licenceOf, refreshed, sourceName } from './data.ts';
import { RESOURCES, dependencies, type DepRow } from './dependence.ts';
import type { Cell, Grid, ResourceMeta } from './dependencies/model.ts';
import { countryHref } from './routes.ts';
import { ranked } from './stats.ts';
import { PLACES, place } from './places.ts';

/** Where each resource's share of use comes from, as src/lib/dependence.ts reads it. */
const BALANCE: Record<string, string> = { oil: 'eia', gas: 'eia', arms: 'sipri', chips: 'comtrade' };
const short = (s: string) => SOURCE_SHORT[s] ?? sourceName(s);
const downloads = (s: string) => licenceOf(s)?.downloads === 'yes';
const share = (v: number) => Number(v.toFixed(4));

function cellOf(r: DepRow): Cell {
  const c: Cell = {};
  if (r.state === 'pending') return { why: 'p' };
  if (r.state === 'none') return { why: r.resource === 'arms' && r.period ? 'i' : 'n' };
  if (r.noUse) return { why: 'u' };
  if (r.reliance !== undefined && !r.main) c.v = share(r.reliance);
  if (r.exportShare !== undefined) c.x = share(r.exportShare);
  const t = r.main ?? r.top;
  if (t) c.t = [t.id, share(t.share)];
  const y = r.period ?? (r.year !== undefined ? String(r.year) : undefined);
  if (y) c.y = y;
  return c;
}

let cache: Grid | null = null;
export function dependencyGrid(): Grid {
  if (cache) return cache;
  const rows: Grid['rows'] = [];
  const used = new Map<string, Set<string>>();
  const years: number[] = [];
  for (const p of PLACES) {
    if (!ranked(p.id)) continue;
    const deps = dependencies(p.id);
    if (!deps.some((d) => d.state === 'ok' && d.reliance !== undefined)) continue;
    rows.push({ id: p.id, cells: deps.map(cellOf) });
    for (const d of deps) {
      if (d.state !== 'ok') continue;
      if (!used.has(d.resource)) used.set(d.resource, new Set());
      used.get(d.resource)!.add(d.source);
      if (d.year !== undefined) years.push(d.year);
      if (d.period) for (const y of d.period.split('–').map(Number)) years.push(y);
    }
  }
  rows.sort((a, b) => place(a.id)!.name.localeCompare(place(b.id)!.name, 'en'));
  const places: Grid['places'] = {};
  const add = (id: string) => {
    const p = place(id);
    if (!p || places[id]) return;
    const h = countryHref(id);
    places[id] = { n: p.name, c: p.iso3, ...(h ? { h } : {}) };
  };
  for (const r of rows) {
    add(r.id);
    for (const c of r.cells) if (c.t) add(c.t[0]);
  }
  const resources: ResourceMeta[] = RESOURCES.map((id) => {
    const src = BALANCE[id] ?? 'faostat';
    const flow = FLOWS[id].source;
    return {
      id, label: RESOURCE_TEXT[id].label, noun: RESOURCE_TEXT[id].noun, credit: short(src), flowCredit: short(flow),
      csv: downloads(src), csvTop: downloads(flow),
    };
  });
  const sources = [...new Set([...used.values()].flatMap((s) => [...s]).concat(RESOURCES.filter((r) => used.has(r)).map((r) => FLOWS[r].source)))];
  const dates = sources.map(refreshed).filter((d): d is string => Boolean(d)).sort();
  const lo = Math.min(...years), hi = Math.max(...years);
  const ids = new Set(rows.map((r) => r.id));
  cache = {
    resources, rows, places,
    blocs: [...blocs()].map(([id, members]) => ({ id, name: BLOC_TEXT[id] ?? id, members: members.filter((m) => ids.has(m)) })).filter((b) => b.members.length),
    credits: sources.map(short).sort().join('; '),
    years: years.length ? (lo === hi ? String(hi) : `${lo}–${hi}`) : '',
    updated: dates.at(-1),
    retrieved: (dates.at(-1) ?? '').slice(0, 10),
  };
  return cache;
}
