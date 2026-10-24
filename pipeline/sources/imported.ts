// Sources with no API, imported by hand when they publish (node pipeline/import.ts; see
// docs/data-pipeline.md). Each kind is one file: the columns the site needs, a row filter, and a
// check that it is the right download. Imported files sit in the same state and snapshots as fetched
// ones, under their own source id. Ported from the prototype's fetchers/import.php.
import { CheckError, check } from '../lib/source.ts';
import { parseCsv } from '../lib/csv.ts';

export interface ImportedSource {
  id: string;
  name: string;
  attribution: string;
  licence: string;
  /** Where and how often it is released, for the status page and whoever imports it. */
  release: string;
}

export type Row = Record<string, string>;

export interface Kind {
  source: string;
  /** File name inside the source's folder, or how to make it from the downloaded file's name. */
  save: string | ((from: string) => string);
  about: string;
  /** csv: keep the columns below; geojson: keep the features, check their properties; raw: keep the file as it is, after `check`. */
  how: 'csv' | 'geojson' | 'raw';
  /** Kept columns (csv) or required properties (geojson), in this order. */
  columns?: string[];
  /** Hand-kept fields not in the publisher's file, appended (and left empty when the file lacks them). */
  added?: string[];
  filter?: (row: Row, now: Date) => boolean;
  /** For raw files: throws if it is the wrong file, returns the number of rows. */
  check?: (text: string) => number;
}

export const IMPORTED: ImportedSource[] = [
  { id: 'sipri', name: 'SIPRI Arms Transfers Database', attribution: 'Information from the Stockholm International Peace Research Institute (SIPRI), sipri.org/databases/armstransfers', licence: 'SIPRI terms: free reuse of less than 10% of the database, with credit', release: 'each March' },
  { id: 'wpp', name: 'UN World Population Prospects', attribution: 'United Nations, Department of Economic and Social Affairs, Population Division, World Population Prospects 2024', licence: 'CC BY 3.0 IGO', release: 'every two years' },
  { id: 'gem', name: 'Global Energy Monitor trackers', attribution: 'Global Energy Monitor (globalenergymonitor.org)', licence: 'CC BY 4.0', release: 'about twice a year' },
  { id: 'aqueduct', name: 'WRI Aqueduct country rankings', attribution: 'World Resources Institute, Aqueduct 4.0', licence: 'To confirm (see docs/licences.md)', release: 'rarely' },
  { id: 'aquastat', name: 'FAO AQUASTAT', attribution: 'FAO, AQUASTAT', licence: 'CC BY 4.0', release: 'rarely' },
  { id: 'gdw', name: 'Global Dam Watch', attribution: 'Global Dam Watch (globaldamwatch.org)', licence: 'CC BY 4.0', release: 'rarely' },
  { id: 'aiddata', name: 'AidData Chinese development finance', attribution: 'AidData, William & Mary', licence: 'To confirm (see docs/licences.md)', release: 'every few years' },
  { id: 'usgs-minerals', name: 'USGS Mineral Commodity Summaries', attribution: 'U.S. Geological Survey, Mineral Commodity Summaries', licence: 'Public domain (US government work)', release: 'each January' },
  { id: 'treasury-history', name: 'US Treasury holdings by country, history', attribution: 'U.S. Department of the Treasury, Treasury International Capital (TIC) system', licence: 'Public domain (US government work)', release: 'built once from the historical tables' },
];

const country = (r: Row) => /^[A-Z]{3}$/.test(r.ISO3_code);

function sipriCheck(text: string) {
  check(/SIPRI/i.test(text.slice(0, 500)), 'this does not look like a SIPRI export (no "SIPRI" in its first lines)');
  check(/^Supplier,Recipient,(\d{4},)+/m.test(text), 'no "Supplier,Recipient,<years>" header row; export the TIV table by supplier and recipient');
  return (text.match(/^[^",\n][^\n]*,[^\n]*\d/gm) ?? []).length;
}

function usgsCheck(text: string) {
  const header = parseCsv(text.slice(0, text.search(/\r?\n/) + 1 || undefined))[0] ?? [];
  for (const c of ['Commodity', 'Country', 'Statistics', 'Year', 'Value']) {
    if (!header.includes(c)) throw new CheckError(`missing the "${c}" column; is this the commodity CSV?`);
  }
  return (text.match(/\n/g) ?? []).length;
}

function treasuryHistoryCheck(text: string) {
  const first = text.trim().split(/\r?\n/, 1)[0];
  check(/^"?Country"?,(\d{4},?)+$/.test(first.trim()), 'header must be Country followed by years');
  return (text.trim().match(/\n/g) ?? []).length;
}

export const KINDS: Record<string, Kind> = {
  'sipri': {
    source: 'sipri', save: 'tiv_2015-2025.csv', how: 'raw', check: sipriCheck,
    about: 'SIPRI Arms Transfers Database: "TIV of arms exports by supplier and recipient" CSV export, five or more recent years',
  },
  'wpp-total': {
    source: 'wpp', save: 'total_population.csv', how: 'csv',
    about: 'WPP2024_TotalPopulationBySex.csv(.gz): total population, all variants',
    columns: ['Variant', 'ISO3_code', 'Location', 'Time', 'PopTotal'],
    filter: (r) => country(r) && ['Medium', 'Low', 'High'].includes(r.Variant),
  },
  'wpp-indicators': {
    source: 'wpp', save: 'demographic_indicators.csv', how: 'csv',
    about: 'WPP2024_Demographic_Indicators_Medium.csv(.gz)',
    columns: ['ISO3_code', 'Location', 'Time', 'TPopulation1July', 'TFR', 'LEx', 'NetMigrations', 'MedianAgePop'],
    filter: country,
  },
  'wpp-age': {
    source: 'wpp', save: 'population_by_age.csv', how: 'csv',
    about: 'WPP2024_PopulationByAge5GroupSex_Medium.csv(.gz); every fifth year and the current year are kept',
    columns: ['ISO3_code', 'Location', 'Time', 'AgeGrp', 'AgeGrpStart', 'PopMale', 'PopFemale', 'PopTotal'],
    filter: (r, now) => country(r) && (Number(r.Time) % 5 === 0 || Number(r.Time) === now.getUTCFullYear()),
  },
  'gem-coal': {
    source: 'gem', save: 'coal_plants.csv', how: 'csv',
    about: 'Global Coal Plant Tracker, unit sheet (xlsx, or saved as CSV)',
    columns: ['GEM location ID', 'Country/Area', 'Plant name', 'Capacity (MW)', 'Status', 'Start year', 'Retired year', 'Latitude', 'Longitude'],
  },
  'gem-nuclear': {
    source: 'gem', save: 'nuclear_plants.csv', how: 'csv',
    about: 'Global Nuclear Power Tracker (xlsx, or saved as CSV)',
    columns: ['GEM location ID', 'Country/Area', 'Project Name', 'Capacity (MW)', 'Status', 'Start Year', 'Retirement Year', 'Latitude', 'Longitude'],
    added: ['Stop year'],
  },
  'gem-lng': {
    source: 'gem', save: 'lng_terminals.csv', how: 'csv',
    about: 'Global Gas Infrastructure Tracker, LNG terminals sheet (xlsx, or saved as CSV)',
    columns: ['TerminalID', 'TerminalName', 'Country', 'FacilityType', 'Status', 'CapacityInMtpa', 'StartYear1', 'Latitude', 'Longitude'],
    added: ['StopYear'],
  },
  'gem-pipelines': {
    source: 'gem', save: 'pipelines.geojson', how: 'geojson',
    about: 'Gas or oil pipelines GeoJSON from the GEM trackers (merge gas and oil into one file first)',
    columns: ['ProjectID', 'PipelineName', 'Fuel', 'Status', 'StartYear1', 'Capacity', 'CapacityUnits', 'Countries'],
    added: ['StopYear'],
  },
  'aqueduct-baseline': {
    source: 'aqueduct', save: 'rankings_baseline.csv', how: 'csv',
    about: 'Aqueduct 4.0 country rankings, baseline',
    columns: ['gid_0', 'name_0', 'indicator_name', 'weight', 'score', 'score_ranked', 'cat', 'label'],
  },
  'aqueduct-future': {
    source: 'aqueduct', save: 'rankings_future.csv', how: 'csv',
    about: 'Aqueduct 4.0 country rankings, future',
    columns: ['gid_0', 'name_0', 'indicator_name', 'weight', 'year', 'scenario', 'score', 'cat', 'label'],
  },
  'aquastat': {
    source: 'aquastat', save: 'water_resources.csv', how: 'csv',
    about: 'FAO AQUASTAT export: dependency ratio and renewable water per person, long format',
    columns: ['Area', 'ISO3', 'Variable', 'Year', 'Value', 'Unit'],
  },
  'gdw': {
    source: 'gdw', save: 'dams.csv', how: 'csv',
    about: 'Global Dam Watch / GRanD dam attributes as CSV',
    columns: ['GRAND_ID', 'DAM_NAME', 'RIVER', 'MAIN_BASIN', 'COUNTRY', 'ISO3', 'YEAR', 'DAM_HGT_M', 'CAP_MCM', 'MAIN_USE', 'LONG_DD', 'LAT_DD'],
    added: ['STATUS'],
  },
  'aiddata': {
    source: 'aiddata', save: 'gcdf_v3.csv', how: 'csv',
    about: 'AidData Global Chinese Development Finance Dataset, main sheet (xlsx, or saved as CSV)',
    columns: ['AidData Record ID', 'Recommended For Aggregates', 'Financier Country', 'Recipient', 'Recipient ISO-3', 'Recipient Region',
      'Commitment Year', 'Title', 'Status', 'Intent', 'Flow Type', 'Flow Class', 'Sector Name', 'Funding Agencies', 'Amount (Constant USD 2021)'],
  },
  'usgs': {
    source: 'usgs-minerals', how: 'raw', check: usgsCheck,
    // One file per edition, so older editions can be imported beside it (MCS2025_…, MCS2024_…).
    save: (from) => {
      const edition = from.match(/MCS\d{4}/i)?.[0].toUpperCase();
      check(edition, `"${from}" does not name its edition; keep the USGS file name (MCS2026_Commodities_Data.csv)`);
      return `${edition}_Commodities_Data.csv`;
    },
    about: 'USGS Mineral Commodity Summaries commodity CSV, MCS<year>_Commodities_Data.csv (ScienceBase refuses scripts; download it from the data release page)',
  },
  'treasury-history': {
    source: 'treasury-history', save: 'mfh_history.csv', how: 'raw', check: treasuryHistoryCheck,
    about: "Year-end holdings by country, built once from Treasury's historical tables: Country,2015,2016,…",
  },
};
