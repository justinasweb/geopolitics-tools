// The disputed rivers (/water/rivers/{river}): the countries in each dispute, roughly upstream first, and how to find
// the river's large dams in Global Dam Watch. GDW names rivers in many spellings and gives a main basin for about a
// third of its dams, so a dam belongs to a river when it is in one of the dispute's countries and its river matches
// `rivers` (the main stem and its large tributaries) or its main basin matches `basin`, less the dams in `not`
// (checked by name: in the basin field but draining elsewhere). Words are in src/i18n/water.en.ts.

export interface River {
  id: string;
  countries: string[];
  rivers: RegExp;
  basin?: RegExp;
  not?: string[];
}

export const RIVERS: River[] = [
  { id: 'nile', countries: ['ETH', 'SDN', 'EGY'], rivers: /nile|atbara|abbai|abay|tekeze|setit|dinder|rahad/i, basin: /^nile$/i, not: ['Tendaho'] },
  { id: 'indus', countries: ['CHN', 'IND', 'AFG', 'PAK'], rivers: /indus|jhelum|chenab|chinab|ravi|beas|sutl|kabul|swat|kishan|neelum|kunhar|gilgit|shyok/i, basin: /^indus$/i, not: ['Hub'] },
  {
    id: 'mekong', countries: ['CHN', 'MMR', 'LAO', 'THA', 'KHM', 'VNM'],
    rivers: /mekong|lancang|lacang|nam ngum|nam theun|nam leuk|nam pong|nam pung|nam phrom|\bmun\b|\bchi\b|lam dom|xe kaman|se ?san|srepok|krong/i,
    basin: /^mekong$/i, not: ['Tabsalao', 'Ham Thuan 1', 'Danhim', 'Lindong'],
  },
  {
    id: 'tigris-euphrates', countries: ['TUR', 'IRN', 'SYR', 'IRQ'],
    rivers: /tigris|euphrates|firat|dicle|khabur|lesser zab|greater zab|diyala|karkheh|karun|karoon|murat|munzur|tohma|peri|karasu|tuzla|botan|adhaim/i,
    basin: /^(tigris|euphrates|shatt)/i, not: ['Zernek'],
  },
  { id: 'brahmaputra', countries: ['CHN', 'IND', 'BGD'], rivers: /brahmaputra|yarlung|tsangpo|teesta|tista|subansiri|siang|kopili|manas|lhasa|nyang|niancu/i },
  { id: 'amu-darya', countries: ['AFG', 'TJK', 'UZB', 'TKM'], rivers: /amu ?dar|vakhsh|panj|pyandzh|kafirnigan|surkhan|kokcha|kunduz|sherabad/i },
  { id: 'helmand', countries: ['AFG', 'IRN'], rivers: /helmand|hirmand|arghandab/i },
  { id: 'dnipro', countries: ['UKR', 'RUS'], rivers: /dniep|dnipro|dnepr|desna|pripyat|psel|vorskla|inhulets|ingulets/i },
];

export const river = (id: string) => RIVERS.find((r) => r.id === id);
