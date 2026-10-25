// Structured data (schema.org JSON-LD): Organization on every page with the social accounts, Dataset on indicator
// pages, Country or Place on country pages (spec, "SEO").
import { SOCIAL } from '../data/nav';
import { siteName } from './site';

const SITE = 'https://geopolitics.tools';
const abs = (path: string) => new URL(path, SITE).href;

export const organization = () => ({
  '@context': 'https://schema.org', '@type': 'Organization', name: siteName, url: SITE, logo: abs('/favicon.svg'),
  sameAs: [SOCIAL.x, SOCIAL.telegram],
});

export interface DatasetInput {
  name: string; description: string; path: string; creator: string; licenceUrl?: string; years?: [number, number];
  variable: string; unit: string; csv?: string; updated?: string; keywords?: string[];
}

export const dataset = (d: DatasetInput) => ({
  '@context': 'https://schema.org', '@type': 'Dataset', name: d.name, description: d.description, url: abs(d.path),
  creator: { '@type': 'Organization', name: d.creator },
  isAccessibleForFree: true,
  ...(d.licenceUrl ? { license: d.licenceUrl } : {}),
  ...(d.years ? { temporalCoverage: `${d.years[0]}/${d.years[1]}` } : {}),
  spatialCoverage: { '@type': 'Place', name: 'World' },
  variableMeasured: { '@type': 'PropertyValue', name: d.variable, unitText: d.unit },
  ...(d.updated ? { dateModified: d.updated.slice(0, 10) } : {}),
  ...(d.keywords ? { keywords: d.keywords } : {}),
  ...(d.csv ? { distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: abs(d.csv) }] } : {}),
  includedInDataCatalog: { '@type': 'DataCatalog', name: siteName, url: SITE },
});

export const country = (name: string, path: string, kind: 'country' | 'territory', iso: string) => ({
  '@context': 'https://schema.org', '@type': kind === 'country' ? 'Country' : 'Place', name, url: abs(path),
  ...(iso ? { identifier: { '@type': 'PropertyValue', propertyID: 'ISO 3166-1 alpha-3', value: iso } } : {}),
});

export const breadcrumbs = (items: { label: string; href?: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, ...(it.href ? { item: abs(it.href) } : {}) })),
});
