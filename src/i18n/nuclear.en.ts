// The nuclear weapons views (/nuclear, /nuclear/treaties, /nuclear/sharing): every word on their pages, layer files,
// share images and the country page block. Figures arrive formatted; nothing here judges a state's choices.

export type TreatyStatus = 'party' | 'signed' | 'not-party' | 'withdrew';
/** A country's place on the treaties map: its NPT and TPNW standing together. */
export type TreatyClass = 'both' | 'npt-signed' | 'npt' | 'outside' | 'withdrew';
export type SharingClass = 'armed' | 'host' | 'reported' | 'umbrella';

const n = (v: number) => new Intl.NumberFormat('en').format(v);

export const NUCLEAR_TEXT = {
  section: 'Nuclear weapons',
  pickerLabel: 'Show',
  pick: { warheads: 'Warheads', treaties: 'Treaties', sharing: 'Sharing and guarantees' } as Record<string, string>,
  title: { warheads: 'Nuclear warheads', treaties: 'Nuclear treaties', sharing: 'Nuclear sharing and guarantees' } as Record<string, string>,
  description: {
    warheads: 'Estimated nuclear warhead inventories of the nine states with nuclear weapons, since 1945, from the Federation of American Scientists.',
    treaties: 'Which countries are party to the Non-Proliferation Treaty (NPT) and the Treaty on the Prohibition of Nuclear Weapons (TPNW).',
    sharing: 'Countries that host another state’s nuclear weapons, and countries covered by an ally’s nuclear guarantee.',
  } as Record<string, string>,
  related: 'Related',
  blocs: 'Blocs',
  nato: 'NATO members',
  blocsNote: 'Alliances and groupings',

  // Warheads
  /** The label every warhead figure carries. */
  estimate: (year: number) => `FAS estimate, as of early ${year}`,
  sourceShort: 'FAS',
  source: 'Federation of American Scientists, Status of World Nuclear Forces',
  sourceOwid: 'FAS, via Our World in Data',
  measure: 'warheads',
  figureLabel: 'Estimated warhead inventory',
  legend: (year: number) => `Estimated warhead inventory, early ${year}`,
  ticks: ['under 100', '100–300', '300–1,000', '1,000–5,000', '5,000+'],
  none: 'No nuclear weapons in FAS’s count',
  noneIn: 'No nuclear weapons in FAS’s count, {year}',
  lede: (top: string, value: string, second: string, value2: string, share: string, year: number) =>
    `${top} has the largest estimated inventory, ${value} warheads, then ${second} with ${value2}; together they hold ${share} of the world’s estimated total in early ${year}.`,
  world: 'All nine states',
  worldTotal: 'Estimated world inventory',
  /** FAS rounds nothing smaller than its own figures; the total is their sum, said as about. */
  about: (v: string) => `about ${v}`,
  states: (k: number) => `${k} ${k === 1 ? 'state' : 'states'} with nuclear weapons`,
  peak: (v: string, year: number) => `Peak: ${v} in ${year}`,
  changeFrom: (dir: 'up' | 'down' | 'flat', size: string, year: number) => (dir === 'flat' ? `About the same as in ${year}` : `${dir === 'up' ? 'Up' : 'Down'} ${size} from ${year}`),
  chart: (from: number, to: number) => `Estimated warhead inventories, ${from}–${to}`,
  chartCaption: 'Each line is one state’s estimated total inventory, retired warheads included.',
  split: (year: number) => `What the inventory is made of, early ${year}`,
  splitCaption: 'Deployed warheads sit on missiles or at bases with delivery forces. Reserve warheads are in the military stockpile but not deployed. Retired warheads are intact and waiting to be dismantled.',
  deployed: 'Deployed',
  reserve: 'Reserve (not deployed)',
  stockpile: 'Military stockpile',
  retired: 'Retired',
  inventory: 'Total inventory',
  deployedStrategic: 'Deployed strategic',
  deployedNonstrategic: 'Deployed nonstrategic',
  splitSource: (date: string) => `FAS, Status of World Nuclear Forces, ${date}`,
  methodology: 'How FAS estimates',
  methodologyNote: 'No state publishes a full count, so every figure is an estimate. FAS builds its estimates from official statements, budgets, satellite images and other open sources, and revises past years when it learns more; a revised figure replaces the old one here.',
  methodologyLink: 'https://fas.org/initiative/status-world-nuclear-forces/',
  table: 'Estimated warhead inventories',
  tableCaption: (year: number) => `Estimated total inventory in early ${year}, with the split FAS publishes for the current year.`,
  country: 'Country',
  first: 'First estimate',
  blocLine: (bloc: string, k: number, value: string, year: number) => (k ? `${bloc} members hold an estimated ${value} warheads in early ${year} (${k} ${k === 1 ? 'state' : 'states'}).` : `No ${bloc} member is among the nine states with nuclear weapons.`),
  mapLabel: (year: number, k: number) => `World map of estimated nuclear warhead inventories in early ${year}: ${k} states have nuclear weapons. The same figures are in the table below.`,
  csv: 'Download the figures shown (CSV)',
  rank: 'Rank',

  // Treaties
  npt: 'NPT',
  tpnw: 'TPNW',
  nptLong: 'Treaty on the Non-Proliferation of Nuclear Weapons (NPT)',
  tpnwLong: 'Treaty on the Prohibition of Nuclear Weapons (TPNW)',
  status: { party: 'Party', signed: 'Signed only', 'not-party': 'Not a party', withdrew: 'Announced withdrawal' } as Record<TreatyStatus, string>,
  treatyClass: {
    both: 'Party to both',
    'npt-signed': 'NPT party; signed the TPNW',
    npt: 'NPT party; not in the TPNW',
    outside: 'Not a party to the NPT',
    withdrew: 'Announced NPT withdrawal',
  } as Record<TreatyClass, string>,
  treatyLegend: 'NPT and TPNW status',
  treatyNone: 'Not listed by UNODA',
  treatySource: 'UNODA Treaties Database',
  checked: (date: string) => `checked ${date}`,
  /** Only a sample build shows the treaties page before the file is checked. */
  unchecked: 'not yet checked against UNODA',
  treatyLede: (npt: number, tpnw: number, signed: number) =>
    `${npt} countries are party to the NPT; ${tpnw} are party to the TPNW, which bans nuclear weapons outright, and ${signed} more have signed it.`,
  treatyCaption: 'The NPT (1968) commits states without nuclear weapons not to acquire them, and the five it recognises to pursue disarmament. The TPNW (2017) prohibits nuclear weapons for its parties.',
  treatyNotes: {
    PRK: 'Acceded to the NPT in 1985 and announced its withdrawal on 10 January 2003. UNODA still lists the 1985 accession; the parties have not agreed on its status.',
  } as Record<string, string>,
  since: (date: string) => `since ${date}`,
  treatyTable: 'Treaty status by country',
  treatyTableCaption: 'Status as the UNODA Treaties Database lists it: party (ratified or acceded), signed only, or not a party.',
  date: 'Date',
  treatyBloc: (bloc: string, both: number, of: number) => `${both} of ${of} ${bloc} members are party to both treaties.`,
  treatyLabel: 'World map of NPT and TPNW status by country. The same statuses are in the table below.',

  // Sharing
  sharingClass: {
    armed: 'Has nuclear weapons',
    host: 'Hosts another state’s weapons',
    reported: 'Hosts another state’s weapons, reported by FAS',
    umbrella: 'Covered by an ally’s nuclear guarantee',
  } as Record<SharingClass, string>,
  sharingLegend: 'Sharing and guarantees',
  sharingSources: 'Governments, NATO and FAS',
  sharingNone: 'No arrangement listed',
  kind: { host: 'Hosts weapons of', umbrella: 'Covered by the nuclear guarantee of' } as Record<string, string>,
  provider: { nato: 'NATO (the United States, the United Kingdom and France)' } as Record<string, string>,
  stated: 'Stated by a government or alliance',
  reportedBy: 'Reported by FAS, not officially confirmed',
  sharingLede: (hosts: number, reported: number, umbrella: number) =>
    `${hosts + reported} countries host another state’s nuclear weapons (${reported} of them reported by FAS, not officially confirmed), and ${umbrella} are covered by an ally’s nuclear guarantee.`,
  sharingCaption: 'An arrangement is shown as fact only when a government or alliance has stated it. A host that is not officially confirmed is marked as reported by FAS, with its own hatched pattern.',
  sharingNotes: {
    'host:USA': 'NATO states that US nuclear weapons are deployed in Europe under its nuclear sharing arrangements; it does not name the host countries.',
    'host:BLR': 'Russia said in March 2023 that it would station non-strategic weapons in Belarus, and in June 2023 that the first had been delivered.',
    'umbrella:BLR': 'Treaty on Security Guarantees within the Union State, signed in Minsk on 6 December 2024.',
    'umbrella:nato': 'NATO’s Strategic Concept (2022): the alliance’s nuclear forces deter attack on any member.',
    'umbrella:JPN': 'United States–Japan Joint Leaders’ Statement: the US commitment to defend Japan with its full range of capabilities, including nuclear.',
    'umbrella:KOR': 'Washington Declaration: the United States’ extended deterrence to the Republic of Korea, backed by its full range of capabilities, including nuclear.',
    'umbrella:AUS': '2016 Defence White Paper: only the nuclear and conventional capabilities of the United States can offer effective deterrence against nuclear threats to Australia.',
  } as Record<string, string>,
  sharingTable: 'Arrangements by country',
  sharingTableCaption: 'Each row is one dated arrangement with its source.',
  arrangement: 'Arrangement',
  with: 'With',
  basis: 'Basis',
  sharingBloc: (bloc: string, k: number, of: number) => `${k} of ${of} ${bloc} members host weapons or are covered by a guarantee.`,
  sharingLabel: 'World map of nuclear sharing and guarantees. The same arrangements are in the table below.',
  sharingFacts: (date: string) => `Facts as of ${date}`,
  /** The same inside a source line, after the sources' names. */
  factsAsOf: (date: string) => `facts as of ${date}`,

  // Country page block
  block: 'Nuclear weapons',
  blockCaption: (year: number) => `estimated warheads, early ${year}`,
  blockLink: 'Nuclear weapons map',
  ogFigure: (v: string) => `about ${v} warheads`,
  ogStates: (k: number) => `${n(k)} states`,
};
