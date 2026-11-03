// The facts the long pages (About, Privacy, Methodology) and the five hub intros are drafted from: the source and
// licence registry (src/data/licences.ts), the site's own rules as the code sets them, and the territory notes
// (src/data/places/notes.csv, docs/territories.md). Each fact links to the file in the repository that makes it
// true, so it can be checked. `npm run ai:facts` writes them to src/data/ai/facts/pages and .../hubs; `npm run
// ai:status` says when the committed files no longer match what the code says.
import { LICENCES } from '../../data/licences.ts';
import { RIVERS } from '../../data/rivers.ts';
import { HISTORY_BLOCS } from '../history.ts';
import { BLOC_ORDER } from '../blocs.ts';
import { THRESHOLDS } from '../dependence.ts';
import { HHI } from '../supply-chains/model.ts';
import { FALLBACK_YEARS, INDEX_MIN_PLACES } from '../indicator.ts';
import { THIN_BELOW } from '../country.ts';
import { NOTES, place } from '../places.ts';
import { fathomSiteId } from '../site.ts';
import { AI_ATTEMPTS, AI_MODEL } from './config.ts';
import type { Fact, FactsFile } from './facts.ts';

const REPO = 'https://github.com/justinasweb/geopolitics-tools/blob/main';
const code = (path: string, on: string) => ({ source: `geopolitics.tools code (${path})`, link: `${REPO}/${path}`, date: on });

function sourcesFacts(on: string): Fact[] {
  // Names only: a source's licence is a fact only once its terms are checked (status "checked" in the licence table).
  return LICENCES.filter((l) => l.status !== 'permission asked').map((l): Fact => ({
    id: `source-${l.source}`, statement: l.status === 'checked' ? `${l.name} is one of the site's sources, under ${l.licence}.` : `${l.name} is one of the site's sources.`,
    source: l.name, link: l.terms, date: l.checked,
  })).concat([{ id: 'sources-page', statement: 'The Sources page lists every source with its licence, how often it is checked and when it last changed.', ...code('src/templates/SourcesPage.astro', on) }]);
}

function siteFacts(on: string): Fact[] {
  return [
    { id: 'site-what', statement: 'geopolitics.tools shows maps and figures from free official and research data on who depends on whom, for what.', ...code('README.md', on) },
    { id: 'site-rules', statement: 'Every figure on the site shows its source and the date the site last refreshed it.', ...code('docs/page-engine.md', on) },
    { id: 'site-free', statement: 'The site is free to use and has no accounts, no comments, no ads and no cookies.', ...code('docs/deploy.md', on) },
    { id: 'site-no-ranking', statement: 'A rank is a position on one measure, largest first; it is not a judgement.', ...code('docs/page-engine.md', on) },
    { id: 'contact', statement: 'Corrections go to data@geopolitics.tools and are listed on the Sources page.', ...code('src/i18n/pages.en.ts', on) },
    { id: 'owner-who', statement: 'For the owner to fill in: "[Owner to fill in: who runs the site, and why.]"', ...code('src/content/pages/about.md', on) },
    { id: 'owner-contact', statement: 'For the owner to fill in: "[Owner to fill in: other contact details and the social accounts.]"', ...code('src/content/pages/about.md', on) },
  ];
}

function privacyFacts(on: string): Fact[] {
  return [
    { id: 'fathom', statement: `Visits are counted with Fathom Analytics (site ${fathomSiteId}), which sets no cookies and stores no personal data; it counts pages read, referring sites, and country, browser and device type as totals.`, source: 'Fathom Analytics', link: 'https://usefathom.com/legal/compliance', date: on, unverified: true, note: 'Check Fathom’s compliance page says this for the plan used' },
    { id: 'fathom-domain', statement: 'Fathom counts visits on geopolitics.tools only, never on previews.', ...code('src/lib/site.ts', on) },
    { id: 'cloudflare', statement: 'The site is served by Cloudflare, whose servers see each visitor’s IP address and browser details to deliver pages and may keep them briefly in logs.', source: 'Cloudflare', link: 'https://www.cloudflare.com/privacypolicy/', date: on, unverified: true, note: 'Check how long Cloudflare keeps logs for this plan' },
    { id: 'share-links', statement: 'The share buttons are plain links to X and Telegram; nothing loads from those sites until a reader clicks.', ...code('src/components/ShareRow.astro', on) },
    { id: 'no-third-party', statement: 'The site sets no cookies and loads no third-party scripts besides Fathom.', ...code('docs/deploy.md', on) },
    { id: 'owner-logs', statement: 'For the owner to fill in: "[Owner to fill in: how long logs are kept, and Cloudflare’s role as processor.]"', ...code('src/content/pages/privacy.md', on) },
    { id: 'owner-entity', statement: 'For the owner to fill in: "[Owner to fill in: who to contact about privacy, and the legal entity responsible for the site.]"', ...code('src/content/pages/privacy.md', on) },
  ];
}

function methodologyFacts(on: string): Fact[] {
  const dep = code('src/lib/dependence.ts', on);
  const sc = code('src/lib/supply-chains/model.ts', on);
  const ind = code('src/lib/indicator.ts', on);
  const ai = code('src/lib/ai/config.ts', on);
  return [
    { id: 'imports-most', statement: 'Import reliance of 50% or more is labelled "Imports most".', value: THRESHOLDS.most * 100, unit: '%', ...dep },
    { id: 'imports-some', statement: 'Import reliance from 15% up to the "Imports most" line is labelled "Imports some"; within 15% either way, "Roughly self-sufficient"; below minus that, "Exporter".', value: THRESHOLDS.self * 100, unit: '%', ...dep },
    { id: 'tool-band', statement: 'The Dependencies tool also marks imports of 75% or more.', value: 75, unit: '%', ...code('src/lib/dependencies/model.ts', on) },
    { id: 'spof', statement: 'A single point of failure: imports at least 50% of use, with at least 50% of those imports from one supplier.', value: 50, unit: '%', ...code('src/lib/dependencies/model.ts', on) },
    { id: 'hhi-moderate', statement: 'Supplier concentration (Herfindahl–Hirschman index) from 1,000 counts as moderately concentrated, as in the 2023 US merger guidelines.', value: HHI.moderate, unit: '', period: '2023', ...sc },
    { id: 'hhi-high', statement: 'Above 1,800 counts as highly concentrated.', value: HHI.high, unit: '', ...sc },
    { id: 'hhi-max', statement: 'The index runs to 10,000 when one supplier has everything.', value: 10000, unit: '', ...sc },
    { id: 'common-year', statement: 'Indicator pages compare everyone on the latest year that at least 80% as many places have reported as in the best of the five years before.', value: 80, unit: '%', ...code('src/lib/stats.ts', on) },
    { id: 'latest-available', statement: '"Latest available" reaches back up to two years and marks the older rows.', value: FALLBACK_YEARS, unit: 'years', ...ind },
    { id: 'indicator-min', statement: 'An indicator page with fewer than 20 places reporting in its common year is not indexed.', value: INDEX_MIN_PLACES, unit: 'places', ...ind },
    { id: 'thin-profile', statement: 'A country page with fewer than 4 measures is not indexed and lists which sources cover the place.', value: THIN_BELOW, unit: 'measures', ...code('src/lib/country.ts', on) },
    { id: 'sipri-totals', statement: 'SIPRI arms transfers are shown as five-year totals of trend-indicator values (TIV).', value: 5, unit: 'years', unitAliases: ['five-year'], source: 'SIPRI Arms Transfers Database', link: 'https://www.sipri.org/databases/armstransfers/sources-and-methods', date: on, unverified: true, note: 'Check SIPRI recommends multi-year totals on its methods page' },
    { id: 'sipri-reuse', statement: 'SIPRI’s terms allow reuse of under 10% of its dataset, so only derived totals are published.', value: 10, unit: '%', unitAliases: ['dataset'], source: 'SIPRI', link: 'https://www.sipri.org/about/terms-and-conditions', date: on, unverified: true, note: 'Check the 10% limit on SIPRI’s terms page' },
    { id: 'ai-model', statement: `Texts drafted with AI are written by ${AI_MODEL} from a facts file, checked figure by figure, and approved by the editor before they appear.`, ...ai },
    { id: 'ai-attempts', statement: 'A draft that fails the check is redrafted once with the checker’s findings, then dropped.', value: AI_ATTEMPTS, unit: 'drafts', ...ai },
    ...NOTES.map((n) => ({
      id: `territory-${n.source}-${n.place}`.replace(/\*/g, 'all'), statement: n.note, places: [n.place].filter((p) => place(p)?.kind !== 'other'),
      source: 'Territory and code table (src/data/places/notes.csv)', link: `${REPO}/src/data/places/notes.csv`, date: on,
      ...(n.checked ? {} : { unverified: true, note: 'The territory notes start as drafts; check against the source and set checked to yes in notes.csv' }),
    })),
  ];
}

const HUB_FACTS: Record<string, (on: string) => Fact[]> = {
  resources: (on) => [
    { id: 'minerals', statement: 'Mine production of critical minerals by country, from the USGS Mineral Commodity Summaries.', ...code('src/data/views.ts', on) },
    { id: 'energy', statement: 'Oil and natural gas production, use, net trade and trade flows, from EIA and UN Comtrade.', ...code('src/data/views.ts', on) },
    { id: 'electricity', statement: 'Electricity generation by source as a share of each country’s own generation, from Ember.', ...code('src/data/views.ts', on) },
    { id: 'food', statement: 'Production, use, net trade and flows of food and fertiliser, from FAOSTAT and UN Comtrade.', ...code('src/data/views.ts', on) },
    { id: 'rule', statement: 'Each map shows one source’s own figures for each country, with the year it covers.', ...code('docs/page-engine.md', on) },
  ],
  technology: (on) => [
    { id: 'ai', statement: 'Shares of known AI supercomputer power and notable AI models by country, from Epoch AI.', ...code('src/data/views.ts', on) },
    { id: 'chips', statement: 'Imports of chips and chipmaking machines, from UN Comtrade, and US Entity List entries.', ...code('src/data/views.ts', on) },
    { id: 'space', statement: 'Satellites in orbit by owning country and orbital launches by launch site country, from CelesTrak.', ...code('src/data/views.ts', on) },
    { id: 'internet', statement: 'Internet outages detected in the last 12 months, from IODA.', value: 12, unit: 'months', ...code('src/data/views.ts', on) },
    { id: 'internet-use', statement: 'The share of people using the internet, from ITU via the World Bank.', ...code('src/data/views.ts', on) },
    { id: 'ict-exports', statement: 'Exports of ICT services (telecom, computer and information services), from IMF balance-of-payments data via the World Bank.', ...code('src/data/views.ts', on) },
    { id: 'cyber', statement: 'Publicly known cyber incidents by country affected since 2000, with the states they were attributed to and who attributed them, from EuRepoC; counts compare documented incidents, not how often a country is targeted.', value: 2000, unit: 'first year', ...code('src/data/views.ts', on) },
    { id: 'rule', statement: 'Each map shows one source’s own figures for each country, with the year or period it covers.', ...code('docs/page-engine.md', on) },
  ],
  climate: (on) => [
    { id: 'emissions', statement: 'CO2 emissions in total, per person, since 1750 and in traded goods, from the Global Carbon Budget.', ...code('src/data/views.ts', on) },
    { id: 'water', statement: 'Water stress and the water a country gets from abroad, from WRI Aqueduct and FAO AQUASTAT, and large dams from Global Dam Watch.', ...code('src/data/views.ts', on) },
    { id: 'rivers', statement: 'The countries of the disputed rivers and their large dams.', value: RIVERS.length, unit: 'rivers', unitAliases: ['disputed rivers'], ...code('src/data/rivers.ts', on) },
    { id: 'disasters', statement: 'Orange and red disaster alerts from GDACS and earthquakes from the USGS.', ...code('src/data/views.ts', on) },
    { id: 'rule', statement: 'Each map shows one source’s own figures for each country, with the year or period it covers.', ...code('docs/page-engine.md', on) },
  ],
  security: (on) => [
    { id: 'conflict', statement: 'Deaths in organised violence by month and over 12 months, from UCDP.', value: 12, unit: 'months', ...code('src/data/views.ts', on) },
    { id: 'refugees', statement: 'Refugees by country of origin and host, and people displaced inside their country, from UNHCR.', ...code('src/data/views.ts', on) },
    { id: 'arms', statement: 'Major arms exported and imported as five-year totals, from SIPRI.', value: 5, unit: 'years', unitAliases: ['five-year'], ...code('src/data/views.ts', on) },
    { id: 'rule', statement: 'Each map shows one source’s own figures for each country, with the year or period it covers.', ...code('docs/page-engine.md', on) },
  ],
  power: (on) => [
    { id: 'sanctions', statement: 'Listings by country on the US, EU and UK sanctions lists.', places: ['USA', 'GBR'], ...code('src/data/views.ts', on) },
    { id: 'lending', statement: 'Loans and grants from China committed 2000–2021, by recipient, from AidData.', period: '2000–2021', places: ['CHN'], ...code('src/data/views.ts', on) },
    { id: 'blocs', statement: 'Membership of groupings of countries, from the groupings’ own member lists.', value: BLOC_ORDER.length, unit: 'groupings', ...code('src/data/blocs.csv', on) },
    { id: 'history', statement: 'Membership year by year for the groupings with a history.', value: HISTORY_BLOCS.length, unit: 'groupings', ...code('src/data/bloc-history.csv', on) },
    { id: 'rule', statement: 'Each map shows one source’s own figures for each country, with the year it covers.', ...code('docs/page-engine.md', on) },
  ],
};

const PAGE_FACTS: Record<string, { subject: string; facts: (on: string) => Fact[] }> = {
  about: { subject: 'About', facts: (on) => [...siteFacts(on), ...sourcesFacts(on)] },
  privacy: { subject: 'Privacy', facts: privacyFacts },
  methodology: { subject: 'Methodology', facts: (on) => [...methodologyFacts(on), ...sourcesFacts(on).filter((f) => /sipri|unhcr|faostat|comtrade|usgs/.test(f.id))] },
};
const HUB_SUBJECT: Record<string, string> = { resources: 'Resources', technology: 'Technology', climate: 'Climate', security: 'Security', power: 'Power' };

export const PAGE_IDS = Object.keys(PAGE_FACTS);
export const HUB_IDS = Object.keys(HUB_FACTS);

export function pageFacts(name: string, on: string): FactsFile | null {
  const p = PAGE_FACTS[name];
  if (!p) return null;
  const facts = p.facts(on);
  // Licence and model names carry version numbers; listed as names, their digits are not read as figures.
  const names = [...new Set([AI_MODEL, ...LICENCES.filter((l) => l.status === 'checked').map((l) => l.licence)])];
  return { id: `page:${name}`, kind: 'page', subject: p.subject, countries: [...new Set(facts.flatMap((f) => f.places ?? []))], names, generated: 'src/lib/ai/page-facts.ts', facts };
}

export function hubFacts(name: string, on: string): FactsFile | null {
  const h = HUB_FACTS[name];
  if (!h) return null;
  const facts = h(on);
  return { id: `hub:${name}`, kind: 'hub', subject: HUB_SUBJECT[name], countries: [...new Set(facts.flatMap((f) => f.places ?? []))], generated: 'src/lib/ai/page-facts.ts', facts };
}
