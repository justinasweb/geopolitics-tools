// Each page kind's structured data, from the same models its template uses, so a unit test can check what the page
// emits (tests/unit/structured.test.ts). The builders are in src/lib/structured.ts; Base adds the Organization.
import { GROUP_TEXT, INDICATOR_TEXT } from '../i18n/en';
import { COUNTRY_TEXT, DEFINITION, INDICATOR_PAGE, SOURCE_NOTE } from '../i18n/pages.en';
import { CONFLICT_TEXT } from '../i18n/conflict.en';
import { countryModel } from './country';
import { creditName, licenceOf, refreshed, sourceName } from './data';
import { csvAllowed, indicatorModel } from './indicator';
import { hubCrumb, paths, route } from './routes';
import { breadcrumbs, country, dataset, website } from './structured';

type Crumb = { label: string; href?: string };

export const indicatorCrumbs = (id: string): Crumb[] => [
  { label: INDICATOR_PAGE.indexTitle, href: paths.indicators() },
  { label: GROUP_TEXT[indicatorModel(id)!.indicator.group] },
  { label: INDICATOR_TEXT[id].label },
];

/** The indicator page's meta description: the measure, its year and the source credit. */
export function indicatorDescription(id: string): string {
  const m = indicatorModel(id)!;
  const credit = SOURCE_NOTE[id] ?? m.sources.map((s) => creditName(s)).join('; ');
  return INDICATOR_PAGE.description(INDICATOR_TEXT[id].label, m.indicator.static ? undefined : m.year, credit);
}

/** An indicator page: Dataset (the source as creator, this site as publisher) and its breadcrumbs. */
export function indicatorLd(id: string): object[] {
  const m = indicatorModel(id)!;
  const text = INDICATOR_TEXT[id];
  const years = m.loaded.years;
  return [dataset({
    name: `${text.label} by country`, description: DEFINITION[id] ?? indicatorDescription(id), path: paths.indicator(id),
    creator: m.sources.map(sourceName).join('; '), licenceUrl: licenceOf(m.source)?.terms, variable: text.label, unit: text.unit,
    csv: csvAllowed(m) ? paths.csv(id) : undefined, updated: refreshed(m.source),
    years: years.length ? [Math.min(...years), Math.max(...years)] : undefined,
  }), breadcrumbs(indicatorCrumbs(id))];
}

export const countryCrumbs = (id: string): Crumb[] => [{ label: COUNTRY_TEXT.countries, href: paths.countries() }, { label: countryModel(id)!.place.name }];

/** A country page: Country (or Place for a territory) with its ISO code, and its breadcrumbs. */
export function countryLd(id: string): object[] {
  const p = countryModel(id)!.place;
  return [country(p.name, paths.country(p.id), p.kind === 'territory' ? 'territory' : 'country', p.iso3), breadcrumbs(countryCrumbs(id))];
}

/** The home page: WebSite, which is how Google picks the site name. */
export const homeLd = (): object[] => [website()];

export const CONFLICT_KEY = 'view:conflict:events';
export const conflictCrumbs = (): Crumb[] => [hubCrumb('security'), { label: CONFLICT_TEXT.section, href: route(CONFLICT_KEY)!.path }];

/** The conflict map view: its breadcrumbs, with links. */
export const conflictLd = (): object[] => [breadcrumbs(conflictCrumbs())];
