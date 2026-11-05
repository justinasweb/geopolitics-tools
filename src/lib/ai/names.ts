// Country names the checker recognises in a draft (./check.ts): every place's display name, short name and ISO name,
// plus the other ways English writes them (aliases) and the adjectives made from them (demonyms). A draft may only
// name the places its facts file allows, so all of these must map to a place. Region and organisation names that
// contain a country's name ("South America", "Indian Ocean", "European Union") are listed so the checker skips them
// instead of reading a country in them.
import { PLACES } from '../places.ts';

const ALIASES: Record<string, string[]> = {
  USA: ['United States of America', 'USA', 'US', 'U.S.', 'U.S.A.', 'America', 'the States'],
  GBR: ['UK', 'Britain', 'Great Britain', 'U.K.', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  RUS: ['Russian Federation'],
  CHN: ["People's Republic of China", 'PRC', 'mainland China'],
  TWN: ['Republic of China', 'Chinese Taipei'],
  KOR: ['Republic of Korea', 'ROK'],
  PRK: ["Democratic People's Republic of Korea", 'DPRK'],
  TUR: ['Turkey', 'Turkiye'],
  CZE: ['Czech Republic'],
  MKD: ['Macedonia', 'FYROM', 'Former Yugoslav Republic of Macedonia'],
  CIV: ['Ivory Coast', "Cote d'Ivoire"],
  SWZ: ['Swaziland'],
  CPV: ['Cape Verde'],
  MMR: ['Burma'],
  LAO: ['Lao PDR', "Lao People's Democratic Republic"],
  VNM: ['Viet Nam'],
  IRN: ['Islamic Republic of Iran', 'Persia'],
  SYR: ['Syrian Arab Republic'],
  NLD: ['Holland', 'the Netherlands'],
  COD: ['DRC', 'Congo-Kinshasa', 'DR Congo'],
  COG: ['Congo-Brazzaville'],
  ARE: ['UAE', 'Emirates'],
  SAU: ['KSA'],
  TLS: ['East Timor', 'Timor Leste'],
  BLR: ['Byelorussia', 'Belorussia'],
  KGZ: ['Kyrgyz Republic', 'Kirghizia'],
  MDA: ['Republic of Moldova'],
  TZA: ['United Republic of Tanzania'],
  BOL: ['Plurinational State of Bolivia'],
  VEN: ['Bolivarian Republic of Venezuela'],
  PSE: ['State of Palestine', 'Palestinian territories'],
  GNQ: ['Equatorial Guinea'],
  SUN: ['USSR', 'U.S.S.R.', 'Soviet Union'],
  XWG: ['Federal Republic of Germany', 'FRG'],
  DDR: ['German Democratic Republic', 'GDR'],
};

const DEMONYMS: Record<string, string[]> = {
  USA: ['American', 'Americans'], GBR: ['British', 'Briton', 'Britons'], RUS: ['Russian', 'Russians'],
  CHN: ['Chinese'], IND: ['Indian', 'Indians'], PAK: ['Pakistani', 'Pakistanis'], AFG: ['Afghan', 'Afghans'],
  IRN: ['Iranian', 'Iranians'], IRQ: ['Iraqi', 'Iraqis'], SYR: ['Syrian', 'Syrians'], TUR: ['Turkish'],
  UKR: ['Ukrainian', 'Ukrainians'], EGY: ['Egyptian', 'Egyptians'], ETH: ['Ethiopian', 'Ethiopians'],
  SDN: ['Sudanese'], LAO: ['Laotian', 'Lao'], THA: ['Thai'], KHM: ['Cambodian', 'Khmer'], VNM: ['Vietnamese'],
  MMR: ['Burmese'], BGD: ['Bangladeshi', 'Bangladeshis'], TJK: ['Tajik', 'Tajikistani'], UZB: ['Uzbek', 'Uzbekistani'],
  TKM: ['Turkmen'], FRA: ['French'], DEU: ['German', 'Germans'], ITA: ['Italian', 'Italians'], JPN: ['Japanese'],
  CAN: ['Canadian', 'Canadians'], BRA: ['Brazilian', 'Brazilians'], SAU: ['Saudi', 'Saudis'], ARE: ['Emirati'],
  IDN: ['Indonesian', 'Indonesians'], BLR: ['Belarusian', 'Belarusians'], ARM: ['Armenian', 'Armenians'],
  KAZ: ['Kazakh', 'Kazakhstani'], KGZ: ['Kyrgyz'], AUS: ['Australian', 'Australians'], ESP: ['Spanish'],
  POL: ['Polish'], FIN: ['Finnish'], SWE: ['Swedish'], NOR: ['Norwegian'], DNK: ['Danish'], NLD: ['Dutch'],
  GRC: ['Greek'], PRT: ['Portuguese'], ISR: ['Israeli', 'Israelis'], KOR: ['South Korean'], PRK: ['North Korean'],
  MEX: ['Mexican'], ZAF: ['South African'], NGA: ['Nigerian'], VEN: ['Venezuelan'], QAT: ['Qatari'],
  KWT: ['Kuwaiti'], DZA: ['Algerian'], LBY: ['Libyan'], AGO: ['Angolan'], ECU: ['Ecuadorian'], GAB: ['Gabonese'],
  AZE: ['Azerbaijani'], GEO: ['Georgian'], SUN: ['Soviet'],
};

/** Names containing a country's name that are not a country: read past, never counted. */
export const NOT_COUNTRIES = [
  'South America', 'North America', 'Latin America', 'Central America', 'Americas', 'American Samoa',
  'Indian Ocean', 'Indian subcontinent', 'South Asia', 'Southeast Asia', 'Central Asia', 'East Asia',
  'European Union', 'European Economic Community', 'European Commission', 'European Council', 'African Union',
  'Arab League', 'Gulf of Guinea', 'Persian Gulf', 'Sea of Japan', 'South China Sea', 'East China Sea',
  'West Bank', 'New Development Bank', 'Mekong River Commission', 'Nile Basin Initiative',
  'Shatt al-Arab', 'Grand Ethiopian Renaissance Dam', 'Turkish Straits', 'Russian Empire', 'US Geological Survey',
  'U.S. Geological Survey',
];

export interface NameEntry { name: string; place: string }

const strip = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");

let table: NameEntry[] | null = null;
/** Every country name with its place, longest first so "South Sudan" is read before "Sudan". Matched with case, so
 *  "US" is a country and "us" is not, and "Turkey" is but "turkey" is not. */
export function countryNames(): NameEntry[] {
  if (table) return table;
  const out = new Map<string, string>();
  const add = (n: string, p: string) => { const k = strip(n.trim()); if (k && !out.has(k)) out.set(k, p); };
  for (const p of PLACES) {
    add(p.name, p.id);
    if (p.short && p.short.length > 2) add(p.short, p.id);
    if (p.isoName && !p.isoName.includes(',')) add(p.isoName, p.id);
  }
  for (const [p, ns] of Object.entries(ALIASES)) for (const n of ns) add(n, p);
  for (const [p, ns] of Object.entries(DEMONYMS)) for (const n of ns) add(n, p);
  // "Congo" alone could be either Congo; "Korea" either Korea: read as a name the facts must give.
  out.set('Congo', '?Congo');
  out.set('Korea', '?Korea');
  out.set('Guinea', 'GIN');
  table = [...out].map(([name, place]) => ({ name, place })).sort((a, b) => b.name.length - a.name.length);
  return table;
}

export { strip as stripAccents };
