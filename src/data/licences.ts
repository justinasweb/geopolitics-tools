// The licence table (spec, "Licences and permissions"; decision D9): for each source, what its
// terms allow and what the site does. Downloads per source, the credit lines and the Sources page
// come from here. `status` is "checked" only where the terms page was read and says so; anything
// else stays "to confirm", and the site shows "To confirm" (addendum 6.9). docs/licences.md is
// generated from this file (node scripts/licence-table.ts > docs/licences.md).

export type Downloads = 'yes' | 'shown only';
export type Status = 'checked' | 'to confirm' | 'permission asked';

export interface Licence {
  /** Source id, as in pipeline/sources/. */
  source: string;
  name: string;
  licence: string;
  terms: string;
  /** What we offer: the data itself for download, or charts and figures only. */
  downloads: Downloads;
  /** Whether commercial use is allowed (the site is non-commercial at launch; ads or a paid tier would reopen this). */
  commercial: 'yes' | 'no' | 'to confirm';
  /** Credit shown with every chart and export. */
  credit: string;
  status: Status;
  checked: string;
  note?: string;
}

const ON = '2026-10-24';

export const LICENCES: Licence[] = [
  // Fetched on a schedule.
  { source: 'gdacs', name: 'GDACS disaster alerts', licence: 'No licence stated; terms are a disclaimer only', terms: 'https://gdacs.org/About/termofuse.aspx', downloads: 'shown only', commercial: 'to confirm', credit: 'GDACS, a cooperation framework of the United Nations and the European Commission', status: 'to confirm', checked: ON, note: 'The terms say data is "as is" and should be confirmed before decisions; nothing on reuse. Ask the JRC before offering downloads' },
  { source: 'usgs-quakes', name: 'USGS earthquakes', licence: 'Public domain (US government work)', terms: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits', downloads: 'yes', commercial: 'yes', credit: 'U.S. Geological Survey, Earthquake Hazards Program', status: 'to confirm', checked: ON, note: 'USGS works are public domain; terms page to be read' },
  { source: 'ioda', name: 'IODA internet outages', licence: 'Not stated', terms: 'https://www.caida.org/about/legal/', downloads: 'shown only', commercial: 'to confirm', credit: 'IODA, Georgia Tech Internet Intelligence Lab', status: 'to confirm', checked: ON, note: 'No terms found on the project pages; ask the IODA team' },
  { source: 'portwatch', name: 'IMF PortWatch', licence: 'IMF copyright and usage terms', terms: 'https://www.imf.org/en/about/copyright-and-terms', downloads: 'shown only', commercial: 'no', credit: 'IMF PortWatch (portwatch.imf.org), with data from the UN Global Platform', status: 'permission asked', checked: ON, note: 'Scheduled fetching waits on the IMF (copyright@imf.org)' },
  { source: 'celestrak', name: 'CelesTrak SATCAT', licence: 'Not stated; usage policy limits automated queries', terms: 'https://www.celestrak.org/usage-policy.php', downloads: 'shown only', commercial: 'to confirm', credit: 'CelesTrak (Dr T.S. Kelso)', status: 'to confirm', checked: ON, note: 'Policy: no more than one query an hour per file, stop on any error. Fetched daily, which fits. Nothing on redistribution' },
  { source: 'csl', name: 'US Consolidated Screening List', licence: 'Public domain (US government work)', terms: 'https://www.trade.gov/consolidated-screening-list', downloads: 'yes', commercial: 'yes', credit: 'U.S. Department of Commerce, International Trade Administration, Consolidated Screening List', status: 'to confirm', checked: ON },
  { source: 'eu-sanctions', name: 'EU financial sanctions list', licence: 'Commission default for raw data: CC0 1.0 (content: CC BY 4.0)', terms: 'https://digital-strategy.ec.europa.eu/en/news/rules-reuse-commission-information', downloads: 'yes', commercial: 'yes', credit: 'European Commission, Financial Sanctions Files (FSF)', status: 'to confirm', checked: ON, note: 'The Commission reuse decision of February 2019 sets CC0 for raw data; check that no FSF-specific terms override it. Only the Official Journal is authentic' },
  { source: 'uk-sanctions', name: 'UK Sanctions List', licence: 'Open Government Licence v3.0', terms: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', downloads: 'yes', commercial: 'yes', credit: 'Contains public sector information licensed under the Open Government Licence v3.0 (FCDO, UK Sanctions List)', status: 'to confirm', checked: ON },
  { source: 'worldbank', name: 'World Bank Indicators', licence: 'CC BY 4.0', terms: 'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets', downloads: 'yes', commercial: 'yes', credit: 'World Bank, World Development Indicators (CC BY 4.0)', status: 'to confirm', checked: ON, note: 'Some indicators carry third-party terms (military spending is from SIPRI); check per indicator' },
  { source: 'pinksheet', name: 'World Bank Pink Sheet', licence: 'CC BY 4.0 (the page links its data to the World Bank’s CC BY terms)', terms: 'https://www.worldbank.org/en/research/commodity-markets', downloads: 'yes', commercial: 'yes', credit: 'World Bank, Commodity Price Data (The Pink Sheet)', status: 'to confirm', checked: ON },
  { source: 'treasury', name: 'US Treasury TIC', licence: 'Public domain (US government work)', terms: 'https://home.treasury.gov/data/treasury-international-capital-tic-system', downloads: 'yes', commercial: 'yes', credit: 'U.S. Department of the Treasury, Treasury International Capital (TIC) system', status: 'to confirm', checked: ON },
  { source: 'epoch', name: 'Epoch AI', licence: 'CC BY 4.0', terms: 'https://epoch.ai/data/notable-ai-models', downloads: 'yes', commercial: 'yes', credit: 'Epoch AI, "Data on AI Models" (CC BY 4.0)', status: 'checked', checked: ON },
  { source: 'owid', name: 'Our World in Data CO2', licence: 'CC BY 4.0, passing on its providers’ terms', terms: 'https://ourworldindata.org/faqs', downloads: 'yes', commercial: 'yes', credit: 'Global Carbon Budget, via Our World in Data (CC BY 4.0)', status: 'to confirm', checked: ON, note: 'The CO2 columns come from the Global Carbon Budget (CC BY 4.0); confirm each column used' },
  { source: 'unhcr', name: 'UNHCR Refugee Data Finder', licence: 'CC BY 4.0, with UNHCR’s supplemental terms', terms: 'https://www.unhcr.org/terms-use-datasets', downloads: 'yes', commercial: 'yes', credit: 'UNHCR Refugee Population Statistics Database', status: 'checked', checked: ON, note: 'Link the terms page when sharing the data; no UNHCR logo; no implied endorsement' },
  { source: 'imf-weo', name: 'IMF World Economic Outlook', licence: 'IMF copyright and usage terms', terms: 'https://www.imf.org/en/about/copyright-and-terms', downloads: 'shown only', commercial: 'no', credit: 'IMF, World Economic Outlook database', status: 'permission asked', checked: ON },
  { source: 'cables', name: 'Submarine cables (OpenStreetMap)', licence: 'ODbL 1.0', terms: 'https://www.openstreetmap.org/copyright', downloads: 'yes', commercial: 'yes', credit: '© OpenStreetMap contributors (ODbL)', status: 'checked', checked: ON, note: 'A downloaded or derived database must be offered under ODbL too' },
  { source: 'faostat', name: 'FAOSTAT', licence: 'CC BY 4.0, with FAO’s additional terms', terms: 'https://www.fao.org/contact-us/terms/db-terms-of-use', downloads: 'yes', commercial: 'yes', credit: 'FAO, FAOSTAT (CC BY 4.0)', status: 'checked', checked: ON, note: 'Citation names the dataset, year of update, access date and URL. No use promoting a business or implying FAO endorsement; third-party data can carry its own terms' },

  // Imported by hand.
  { source: 'sipri', name: 'SIPRI Arms Transfers Database', licence: 'SIPRI terms: non-commercial reuse of under 10% of a dataset, with credit', terms: 'https://www.sipri.org/about/terms-and-conditions', downloads: 'shown only', commercial: 'no', credit: 'Information from the Stockholm International Peace Research Institute (SIPRI)', status: 'to confirm', checked: ON, note: 'Spec: derived five-year totals only, no download' },
  { source: 'wpp', name: 'UN World Population Prospects', licence: 'CC BY 3.0 IGO', terms: 'https://population.un.org/wpp/downloads/', downloads: 'yes', commercial: 'yes', credit: 'United Nations, DESA, Population Division, World Population Prospects 2024 (CC BY 3.0 IGO)', status: 'to confirm', checked: ON, note: 'Licence as recorded by Our World in Data for the 2024 files; read it on the UN page' },
  { source: 'gem', name: 'Global Energy Monitor', licence: 'CC BY 4.0', terms: 'https://globalenergymonitor.org/creative-commons-license', downloads: 'yes', commercial: 'yes', credit: 'Global Energy Monitor (CC BY 4.0)', status: 'to confirm', checked: ON },
  { source: 'aqueduct', name: 'WRI Aqueduct', licence: 'Not stated on the dataset page', terms: 'https://datasets.wri.org/datasets/aqueduct-40-current-and-future-country-rankings', downloads: 'shown only', commercial: 'to confirm', credit: 'World Resources Institute, Aqueduct 4.0', status: 'to confirm', checked: ON, note: 'WRI data is usually CC BY 4.0; the dataset page does not say' },
  { source: 'aquastat', name: 'FAO AQUASTAT', licence: 'CC BY 4.0, with FAO’s additional terms', terms: 'https://www.fao.org/contact-us/terms/db-terms-of-use', downloads: 'yes', commercial: 'yes', credit: 'FAO, AQUASTAT (CC BY 4.0)', status: 'checked', checked: ON },
  { source: 'gdw', name: 'Global Dam Watch', licence: 'CC BY 4.0', terms: 'https://doi.org/10.6084/m9.figshare.25988293.v1', downloads: 'yes', commercial: 'yes', credit: 'Lehner et al. (2024), Global Dam Watch database version 1.0 (CC BY 4.0)', status: 'to confirm', checked: ON, note: 'Licence as listed by the Earth Engine community catalogue; read it on figshare' },
  { source: 'aiddata', name: 'AidData Chinese development finance', licence: 'Not stated on the dataset page', terms: 'https://www.aiddata.org/data/aiddatas-global-chinese-development-finance-dataset-version-3-0', downloads: 'shown only', commercial: 'to confirm', credit: 'AidData (2023), Global Chinese Development Finance Dataset, Version 3.0', status: 'to confirm', checked: ON, note: 'The spec names CLG-Global 1.0, the prototype used GCDF 3.0: check which is current and its licence' },
  { source: 'usgs-minerals', name: 'USGS Mineral Commodity Summaries', licence: 'Public domain (US government work)', terms: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits', downloads: 'yes', commercial: 'yes', credit: 'U.S. Geological Survey, Mineral Commodity Summaries', status: 'to confirm', checked: ON },
  { source: 'treasury-history', name: 'US Treasury holdings, history', licence: 'Public domain (US government work)', terms: 'https://home.treasury.gov/data/treasury-international-capital-tic-system', downloads: 'yes', commercial: 'yes', credit: 'U.S. Department of the Treasury, Treasury International Capital (TIC) system', status: 'to confirm', checked: ON },

  // Waiting on a key or permission; listed so their pages can say so.
  { source: 'comtrade', name: 'UN Comtrade', licence: 'UN Comtrade terms; limits on redistributing extracted records', terms: 'https://uncomtrade.org/docs/re-dissemination-of-data/', downloads: 'shown only', commercial: 'to confirm', credit: 'United Nations, UN Comtrade database', status: 'to confirm', checked: ON, note: 'Spec: charts and aggregates; no raw bilateral downloads beyond the limits' },
  { source: 'peeringdb', name: 'PeeringDB', licence: 'PeeringDB acceptable use policy', terms: 'https://tools.peeringdb.com/aup', downloads: 'shown only', commercial: 'no', credit: 'PeeringDB', status: 'to confirm', checked: ON, note: 'Spec: exchange points left out unless PeeringDB gives permission' },
];
