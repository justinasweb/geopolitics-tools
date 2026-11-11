// Large dams for the water stress view and the river pages, from Global Dam Watch (../adapters/water.ts), with the
// site's own spellings and the dams destroyed since (../data/dams.ts): the largest by reservoir capacity, for map marks
// and tables.
import { water, type Dam } from '../adapters/water.ts';
import { DAM_FIXES } from '../data/dams.ts';
import { DAMS_TEXT } from '../i18n/water.en.ts';
import { shared } from './data.ts';

const waterData = shared(water);

/** A dam as the pages show it: `name` and `river` in the site's spellings, GDW's own in `gdwName` and `gdwRiver`. */
export interface ShownDam extends Dam { gdwName: string; gdwRiver: string; destroyed: string | null }

export function shownDam(d: Dam): ShownDam {
  const f = DAM_FIXES[d.id];
  return { ...d, name: f?.name ?? d.name, river: f?.river ?? d.river, gdwName: d.name, gdwRiver: d.river, destroyed: f?.destroyed ?? null };
}

/** Dams with a position, largest reservoir first; `min` is the smallest capacity kept, in million m³. */
export function largeDams(min = 0): ShownDam[] {
  return (waterData()?.dams ?? []).filter((d) => d.lon !== null && d.lat !== null && (d.capacity ?? 0) >= min).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0)).map(shownDam);
}

/** The reservoir figure, with "destroyed …; former reservoir capacity" beside it for a dam that no longer stands. */
export const capacityText = (d: ShownDam) => (d.capacity ? `${DAMS_TEXT.km3(d.capacity)}${d.destroyed ? ` (${DAMS_TEXT.destroyed(d.destroyed)})` : ''}` : '–');

/** The source note naming GDW's own spellings for the dams shown under the site's, or null when there are none. */
export function gdwNamesNote(dams: ShownDam[]): string | null {
  const names = dams.filter((d) => d.name !== d.gdwName).map((d) => DAMS_TEXT.gdwName(d.name, d.gdwName));
  const rivers = [...new Set(dams.filter((d) => d.river !== d.gdwRiver).map((d) => DAMS_TEXT.gdwName(d.river, d.gdwRiver)))];
  return names.length || rivers.length ? DAMS_TEXT.gdwNames(names, rivers) : null;
}
