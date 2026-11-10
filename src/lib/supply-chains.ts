// The Supply chains tool's flows, worked out at build time from the flows module (src/data/flows.ts): one flow per
// page, for the latest year its source reports (SIPRI: the latest five-year total), never mixing years. A flow is
// live once its source is in the snapshot with at least one pair; the rest stay hidden.
import { FLOWS, loadFlows } from '../data/flows.ts';
import { FLOW_TEXT } from '../i18n/en.ts';
import { DEP_TEXT, SOURCE_SHORT, inSentence } from '../i18n/pages.en.ts';
import { CHAIN_TEXT, chainTitle } from '../i18n/supply-chains.en.ts';
import { ENERGY_TEXT } from '../i18n/energy.en.ts';
import { amount as energyAmount, gasLeftOutLines, gasNotShown } from './energy.ts';
import { licenceOf, refreshed, shared, sourceName } from './data.ts';
import { place } from './places.ts';
import { countryHref, paths } from './routes.ts';
import type { Chain } from './supply-chains/model.ts';
import { OTHER_SUPPLIER } from '../adapters/sipri.ts';
import { food, type Crop } from '../adapters/faostat.ts';
import { displacement } from '../adapters/unhcr.ts';
import type { Series } from '../adapters/core.ts';

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

const foodData = shared(food);
const people = shared(displacement);
/** The source's full exports and imports (crops: FAOSTAT's trade) or people abroad and hosted (refugees) in a flow's
 *  year, for the places in it: the diagram's totals cover the flows shown only. */
function fullOf(key: string, year: number, ids: string[]): Chain['full'] {
  const crop = ['wheat', 'maize', 'rice', 'soy'].includes(key) ? foodData()?.crops[key as Crop] : null;
  const p = key === 'refugees' ? people() : null;
  const [from, to]: [Series, Series] | [null, null] = crop ? [crop.exports, crop.imports] : p ? [p.origin, p.host] : [null, null];
  if (!from || !to) return undefined;
  const pick = (s: Series) => Object.fromEntries(ids.filter((id) => s[id]?.[year] !== undefined).map((id) => [id, Number(s[id][year].toPrecision(6))]));
  return { from: pick(from), to: pick(to) };
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
      if (id === OTHER_SUPPLIER) { places[id] = { n: DEP_TEXT.otherSuppliers, c: '' }; continue; }
      const pl = place(id);
      const h = countryHref(id);
      places[id] = { n: pl?.name ?? id, c: pl?.iso3 || id, ...(pl?.short && pl.short !== pl.name ? { s: pl.short } : {}), ...(h ? { h } : {}) };
    }
  }
  const updated = refreshed(f.source);
  const mirror = f.pairs.filter((p) => p.mirror).map((p) => DEP_TEXT.flow(places[p.from].n, places[p.to].n));
  const via = f.pairs.filter((p) => p.via === 'eia').map((p) => DEP_TEXT.flow(places[p.from].n, places[p.to].n));
  const full = fullOf(key, Number(f.period), Object.keys(places));
  const fuel = key === 'oil' || key === 'gas' ? key : null;
  const over = Object.fromEntries(fuel ? f.pairs.filter((p) => p.output !== undefined).map((p) => [`${p.from}>${p.to}`,
    ENERGY_TEXT.overOutput(fuel, inSentence(places[p.from].n), inSentence(places[p.to].n), Number(f.period), energyAmount(fuel, 'production', p.output!), p.mirror === true)]) : []);
  const notShown = key === 'gas' ? [ENERGY_TEXT.notShown(...Object.values(gasNotShown(Number(f.period))) as [string[], string[]]), ...gasLeftOutLines(Number(f.period))].filter(Boolean).join(' ') || null : null;
  const chain: Chain = {
    key, label: FLOW_TEXT[key].label, kind: CHAIN_TEXT[key].kind, period: f.period, ...(f.partial ? { partial: true as const } : {}),
    pairs: f.pairs.map((p) => [p.from, p.to, Number(p.amount.toPrecision(6))]),
    places, ...{ div: 1, digits: 1 }, ...SCALE[key],
    ...(mirror.length ? { mirrored: DEP_TEXT.asReported(mirror, true), mirror } : {}),
    ...(Object.keys(over).length ? { over } : {}),
    ...(full ? { full } : {}),
    ...(key === 'gas' && notShown ? { notShown } : {}),
    ...(via.length ? { via } : {}),
    ...(key === 'oil' ? { notes: [...(via.length ? [ENERGY_TEXT.usImports] : []), ENERGY_TEXT.crudeTonnes].join(' ') } : {}),
    src: f.source, source: via.length ? `${sourceName(f.source)}; ${sourceName('eia')} (${ENERGY_TEXT.usSource})` : sourceName(f.source), credit: SOURCE_SHORT[f.source] ?? sourceName(f.source),
    updated, retrieved: (updated ?? '').slice(0, 10), csv: licenceOf(f.source)?.downloads === 'yes',
    method: `${paths.page('methodology')}#supply-chains`,
  };
  cache.set(key, chain);
  return chain;
}

/** Every live flow for the switch and the index: its title and its page. */
export const chainLinks = () => liveChains().map((k) => ({ key: k, label: chainTitle(k, FLOW_TEXT[k].label).title, path: paths.supplyChain(k) }));
