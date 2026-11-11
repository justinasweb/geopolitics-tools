// PeeringDB (peeringdb/ix.json, fac.json, ixfac.json): internet exchange points as their operators list them, by
// the country PeeringDB gives each exchange (ISO2). An exchange is placed on the map at its first listed facility
// (the lowest ixfac id) that has coordinates; one without is counted for its country but has no mark. Networks are
// PeeringDB's net_count, the networks connected to the exchange; a network at several exchanges counts at each, so
// they are never added up. The network type field is not read.
import { type Raw, matcher } from './core.ts';

/** PeeringDB's own example organisation: its "PeeringDB Example IX" (in Antarctica) is there for documentation and
 *  "does not represent a real IX", so it is left out. */
export const EXAMPLE_ORG = 25554;

export interface Exchange {
  id: number;
  name: string;
  city: string;
  place: string;
  /** Networks connected, as PeeringDB counts them. */
  networks: number;
  /** The facility the mark stands at, when one with coordinates is listed. */
  at: { lat: number; lon: number; facility: string } | null;
}

export interface Exchanges {
  /** The day PeeringDB generated the files (meta.generated), or null when they do not say. */
  generated: string | null;
  /** Largest first (by networks, then name). */
  list: Exchange[];
  /** Exchanges whose country matched no place. */
  unmatched: number;
}

interface File<T> { meta?: { generated?: number }; data?: T[] }
interface Ix { id: number; org_id?: number; name: string; city?: string; country?: string; net_count?: number; status?: string }
interface Fac { id: number; name: string; latitude?: number | null; longitude?: number | null; status?: string }
interface IxFac { id?: number; ix_id: number; fac_id: number; status?: string }

const live = (s?: string) => !s || s === 'ok';

export function parsePeeringDb(ix: File<Ix>, fac: File<Fac>, ixfac: File<IxFac>): Exchanges {
  const m = matcher('peeringdb', 'iso2');
  const facs = new Map((fac.data ?? []).filter((f) => live(f.status) && f.latitude != null && f.longitude != null).map((f) => [f.id, f]));
  const links = [...(ixfac.data ?? [])].filter((l) => live(l.status)).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const first = new Map<number, Fac>();
  for (const l of links) {
    const f = facs.get(l.fac_id);
    if (f && !first.has(l.ix_id)) first.set(l.ix_id, f);
  }
  const list: Exchange[] = [];
  let unmatched = 0;
  for (const x of ix.data ?? []) {
    if (!live(x.status) || x.org_id === EXAMPLE_ORG) continue;
    const place = x.country ? m.match(x.country) : null;
    if (!place) { unmatched++; continue; }
    const f = first.get(x.id);
    list.push({
      id: x.id, name: x.name, city: x.city ?? '', place, networks: Number(x.net_count) || 0,
      at: f ? { lat: Number(f.latitude), lon: Number(f.longitude), facility: f.name } : null,
    });
  }
  list.sort((a, b) => b.networks - a.networks || a.name.localeCompare(b.name));
  const at = Number(ix.meta?.generated);
  return { generated: at > 0 ? new Date(at * 1000).toISOString().slice(0, 10) : null, list, unmatched };
}

export const exchanges = (raw: Raw) =>
  parsePeeringDb(raw.json('peeringdb', 'ix.json'), raw.json('peeringdb', 'fac.json'), raw.json('peeringdb', 'ixfac.json'));
