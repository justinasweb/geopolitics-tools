// UNHCR Refugee Data Finder (unhcr/by-origin.json, by-host.json, pairs.json; the API's {items} format).
// "People" are refugees, asylum seekers and other people in need of international protection (oip,
// used mainly for Venezuelans in Latin America). Internally displaced people are the rows whose origin
// and host are the same country. Pairs folded by the fetcher (host "Other countries") count in the
// origin's total but are not flows between two countries.
import { type Raw, type Series, matcher, num, put } from './core.ts';

type Item = Record<string, unknown> & { year: number; coo_iso?: string | null; coa_iso?: string | null };

const people = (r: Item) => (num(r.refugees) ?? 0) + (num(r.asylum_seekers) ?? 0) + (num(r.oip) ?? 0);

/** The three groups the people figures add up: refugees, asylum seekers, others in need of international protection. */
export interface Parts { refugees: Series; asylum: Series; oip: Series }

export interface Displacement {
  origin: Series;
  host: Series;
  /** The origin and host figures by group. */
  originParts: Parts;
  hostParts: Parts;
  idps: Series;
  returned: Series;
  pairs: { year: number; from: string; to: string; people: number }[];
}

export function parseUnhcr(byOrigin: { items: Item[] }, byHost: { items: Item[] }, pairs: { items: Item[] }): Displacement {
  const m = matcher('unhcr', 'iso3');
  const parts = (): Parts => ({ refugees: {}, asylum: {}, oip: {} });
  const out: Displacement = { origin: {}, host: {}, originParts: parts(), hostParts: parts(), idps: {}, returned: {}, pairs: [] };
  const split = (p: Parts, id: string, r: Item) => {
    put(p.refugees, id, r.year, num(r.refugees) ?? 0, true);
    put(p.asylum, id, r.year, num(r.asylum_seekers) ?? 0, true);
    put(p.oip, id, r.year, num(r.oip) ?? 0, true);
  };
  for (const r of byOrigin.items) {
    const id = r.coo_iso && m.match(r.coo_iso);
    if (!id) continue;
    put(out.origin, id, r.year, people(r), true);
    split(out.originParts, id, r);
    put(out.returned, id, r.year, num(r.returned_refugees), true);
  }
  for (const r of byHost.items) {
    const id = r.coa_iso && m.match(r.coa_iso);
    if (!id) continue;
    put(out.host, id, r.year, people(r), true);
    split(out.hostParts, id, r);
    const idps = num(r.idps);
    if (idps) put(out.idps, id, r.year, idps, true);
  }
  for (const r of pairs.items) {
    if (!r.coo_iso || !r.coa_iso || r.coo_iso === r.coa_iso) continue;
    const from = m.match(r.coo_iso);
    const to = m.match(r.coa_iso);
    const n = people(r);
    if (from && to && n > 0) out.pairs.push({ year: r.year, from, to, people: n });
  }
  out.pairs.sort((a, b) => b.people - a.people);
  return out;
}

export const displacement = (raw: Raw) => parseUnhcr(raw.json('unhcr', 'by-origin.json'), raw.json('unhcr', 'by-host.json'), raw.json('unhcr', 'pairs.json'));
