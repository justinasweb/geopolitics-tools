// The disputed river pages (/water/rivers/{river}, ../data/rivers.ts): the dispute's countries with their water
// stress now and in 2050 and the share of their water from abroad (the water views' own figures), and the river's
// large dams from Global Dam Watch.
import { RIVERS, river as riverOf, type River } from '../data/rivers.ts';
import { water, type Dam } from '../adapters/water.ts';
import { shared } from './data.ts';
import { valueText, viewPage } from './views.ts';
import { RIVERS_TEXT } from '../i18n/water.en.ts';
import { list } from '../i18n/pages.en.ts';
import { place } from './places.ts';

const waterData = shared(water);

export interface RiverCountry { id: string; stress: number | null; stress2050: number | null; fromAbroad: number | null; dams: number }
export interface RiverPage { river: River; dams: Dam[]; countries: RiverCountry[] }

/** The river's dams in the dispute's countries, largest reservoir first. */
export function damsOn(r: River, all: Dam[]): Dam[] {
  return all.filter((d) => d.place && r.countries.includes(d.place) && !r.not?.includes(d.name) && (r.rivers.test(d.river) || (!!r.basin && r.basin.test(d.basin))))
    .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
}

const valueIn = (layer: string, id: string) => {
  const p = viewPage(layer);
  return p?.byYear[p.year].rows.find((r) => r.id === id)?.value ?? null;
};

export function riverPage(id: string): RiverPage | null {
  const r = riverOf(id);
  const w = waterData();
  if (!r || !w) return null;
  const dams = damsOn(r, w.dams);
  const countries = r.countries.map((c) => ({
    id: c, stress: valueIn('waterstress', c), stress2050: valueIn('waterstress2050', c), fromAbroad: valueIn('waterdep', c), dams: dams.filter((d) => d.place === c).length,
  }));
  return { river: r, dams, countries };
}

/** The rivers with a page: those GDW and the water views have data for. */
export const riverIds = () => (waterData() ? RIVERS.map((r) => r.id) : []);

/** The view's answer in one sentence (its countries, its large dams, who gets most water from abroad): its page and
 *  its hub card. None without AQUASTAT's figures. */
export function riverLede(id: string): string | null {
  const p = riverPage(id);
  const dep = viewPage('waterdep');
  if (!p || !dep) return null;
  const nameOf = (x: string) => place(x)?.name ?? x;
  const most = [...p.countries].filter((x) => x.fromAbroad !== null).sort((a, b) => b.fromAbroad! - a.fromAbroad!)[0];
  return most ? RIVERS_TEXT.lede(RIVERS_TEXT.name[id] ?? id, list(p.river.countries.map(nameOf)), p.dams.length, nameOf(most.id), valueText(dep, most.fromAbroad!)) : null;
}
