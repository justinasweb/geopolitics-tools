// The Supply chains tool's flows, worked out at build time from the flows module (src/data/flows.ts): one flow per
// page, for the latest year its source reports (SIPRI: the latest five-year total), never mixing years. A flow is
// live once its source is in the snapshot with at least one pair; the rest stay hidden.
import { FLOWS, loadFlows } from '../data/flows.ts';
import { FLOW_TEXT } from '../i18n/en.ts';
import { SOURCE_SHORT } from '../i18n/pages.en.ts';
import { CHAIN_TEXT } from '../i18n/supply-chains.en.ts';
import { licenceOf, refreshed, shared, sourceName } from './data.ts';
import { place } from './places.ts';
import { countryHref, paths } from './routes.ts';
import type { Chain } from './supply-chains/model.ts';

/** The flows in the site map's order. */
export const CHAIN_KEYS = ['oil', 'gas', 'wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate', 'arms', 'chips', 'refugees'] as const;

/** How each flow's amounts are written in its short unit (CHAIN_TEXT). */
const SCALE: Record<string, { div: number; digits: number; count?: boolean }> = {
  oil: { div: 1, digits: 0 }, gas: { div: 1, digits: 1 }, arms: { div: 1, digits: 0 }, chips: { div: 1e9, digits: 1 },
  refugees: { div: 1, digits: 0, count: true },
};

const loaded = new Map<string, () => ReturnType<typeof loadFlows> | null>();
const flowsOf = (key: string) => {
  if (!loaded.has(key)) loaded.set(key, shared((raw) => loadFlows(raw, key)));
  return loaded.get(key)!();
};

/** The flows with a year and at least one pair in this snapshot. */
export function liveChains(): string[] {
  return CHAIN_KEYS.filter((k) => {
    const f = FLOWS[k]?.load ? flowsOf(k) : null;
    return Boolean(f && f.pairs.length && /^\d{4}/.test(f.period));
  });
}

const cache = new Map<string, Chain>();
export function chainOf(key: string): Chain {
  const hit = cache.get(key);
  if (hit) return hit;
  const f = flowsOf(key);
  if (!f) throw new Error(`supply chain ${key}: its source is not in the snapshot`);
  const places: Chain['places'] = {};
  for (const p of f.pairs) {
    for (const id of [p.from, p.to]) {
      if (places[id]) continue;
      const pl = place(id);
      const h = countryHref(id);
      places[id] = { n: pl?.name ?? id, c: pl?.iso3 || id, ...(pl?.short && pl.short !== pl.name ? { s: pl.short } : {}), ...(h ? { h } : {}) };
    }
  }
  const updated = refreshed(f.source);
  const chain: Chain = {
    key, label: FLOW_TEXT[key].label, kind: CHAIN_TEXT[key].kind, period: f.period,
    pairs: f.pairs.map((p) => [p.from, p.to, Number(p.amount.toPrecision(6))]),
    places, ...{ div: 1, digits: 1 }, ...SCALE[key],
    src: f.source, source: sourceName(f.source), credit: SOURCE_SHORT[f.source] ?? sourceName(f.source),
    updated, retrieved: (updated ?? '').slice(0, 10), csv: licenceOf(f.source)?.downloads === 'yes',
    method: `${paths.page('methodology')}#supply-chains`,
  };
  cache.set(key, chain);
  return chain;
}

/** Every live flow for the switch: its name and its page. */
export const chainLinks = () => liveChains().map((k) => ({ key: k, label: FLOW_TEXT[k].label, path: paths.supplyChain(k) }));
