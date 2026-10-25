// The extras on the space views, from CelesTrak's catalogue (../adapters/celestrak.ts): each country's working
// satellites by orbit and constellation, the largest constellations, and launches by site and year.
import { space, type Orbit } from '../adapters/celestrak.ts';
import { shared } from './data.ts';

const spaceData = shared(space);

export interface Working { active: number; orbits: Record<Orbit, number>; constellations: Record<string, number> }

/** The catalogue's date: the latest launch it lists. */
export const spaceAsOf = () => spaceData()?.asOf ?? null;

/** Working satellites by country now; owners that are no country (ESA, Intelsat) are left out. */
export function workingBy(): Map<string, Working> {
  const out = new Map<string, Working>();
  for (const o of Object.values(spaceData()?.owners ?? {})) {
    if (!o.place || !o.active) continue;
    const w = out.get(o.place) ?? { active: 0, orbits: { leo: 0, meo: 0, geo: 0 }, constellations: {} };
    w.active += o.active;
    for (const k of ['leo', 'meo', 'geo'] as const) w.orbits[k] += o.orbits[k];
    for (const [c, n] of Object.entries(o.constellations)) w.constellations[c] = (w.constellations[c] ?? 0) + n;
    out.set(o.place, w);
  }
  return out;
}

/** Named constellations, largest first, with the owning country (null for an international owner). */
export function constellations(): { id: string; place: string | null; active: number }[] {
  const d = spaceData();
  if (!d) return [];
  return Object.entries(d.constellations).map(([id, c]) => ({ id, place: d.owners[c.owner]?.place ?? null, active: c.active })).sort((a, b) => b.active - a.active);
}

export interface SiteYear { code: string; name: string; lat: number; lon: number; place: string | null; n: number; total: number }

/** Launches by site in a year, most first; `total` is every launch from the site. Codes for one site are merged by name. */
export function sitesIn(year: number): SiteYear[] {
  const d = spaceData();
  if (!d) return [];
  const by = new Map<string, SiteYear>();
  for (const [code, s] of Object.entries(d.sites)) {
    const x = by.get(s.name) ?? { code, name: s.name, lat: s.lat, lon: s.lon, place: s.state(year), n: 0, total: 0 };
    x.n += s.byYear[year] ?? 0;
    x.total += Object.values(s.byYear).reduce((a, b) => a + b, 0);
    by.set(s.name, x);
  }
  return [...by.values()].filter((s) => s.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
