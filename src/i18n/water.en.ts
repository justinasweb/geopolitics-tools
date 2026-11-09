// English words for the extras on the water and Chinese lending views. Same rules as views.en.ts.

export const DAMS_TEXT = {
  mark: 'Large dam (size: reservoir capacity)',
  tip: (name: string, river: string, place: string, year: string, cap: string) => `${name || 'Unnamed dam'}${river ? `, ${river}` : ''} (${place}): reservoir ${cap}${year ? `, built ${year}` : ''}`,
  km3: (mcm: number) => (mcm >= 1000 ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(mcm / 1000)} km³` : `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(mcm)} million m³`),
  largest: 'Largest dams',
  largestCaption: (n: number) => `The ${n} dams with the largest reservoirs in Global Dam Watch, by capacity. The map shows dams holding at least 1 km³.`,
  dam: 'Dam', river: 'River', country: 'Country', capacity: 'Reservoir', year: 'Built',
  source: 'Global Dam Watch (GRanD)',
};

export const LENDING_TEXT = {
  bySector: 'By sector',
  bySectorCaption: 'Commitments, 2000–2021, in 2021 dollars.',
  sector: { energy: 'Energy', transport: 'Transport', industry: 'Industry and mining', banking: 'Banking', other: 'Other sectors' } as Record<string, string>,
  byClass: 'Aid or lending',
  byClassCaption: 'Aid-like flows are grants and loans on easier terms than market lending; lending-like flows are loans near market rates (AidData’s terms ODA-like and OOF-like).',
  flow: { 'ODA-like': 'Aid-like', 'OOF-like': 'Lending-like', 'Vague (Official Finance)': 'Unclear' } as Record<string, string>,
  projects: 'Largest projects',
  projectsCaption: 'Single commitments, in 2021 dollars, with the year agreed.',
  largest: 'Largest commitments',
  largestCaption: (n: number) => `The ${n} largest single commitments in AidData’s records for these sectors, 2000–2021, in 2021 dollars.`,
  project: 'Project', country: 'Recipient', amount: 'Amount', year: 'Year',
};

/** The disputed river pages (/water/rivers/{river}). */
export const RIVERS_TEXT = {
  section: 'Disputed rivers',
  pickerLabel: 'River',
  name: {
    nile: 'Nile', indus: 'Indus', mekong: 'Mekong', 'tigris-euphrates': 'Tigris and Euphrates', brahmaputra: 'Brahmaputra',
    'amu-darya': 'Amu Darya', helmand: 'Helmand', dnipro: 'Dnipro',
  } as Record<string, string>,
  title: (river: string) => `The ${river}: water and dams`,
  sub: 'in the countries that dispute it',
  lede: (river: string, countries: string, dams: number, top: string, topShare: string) =>
    `The countries in the dispute over the ${river} are ${countries}. ${top} gets ${topShare} of its renewable water from other countries${dams ? `; Global Dam Watch lists ${dams} large dams on the river and its main tributaries in these countries` : ''}.`,
  legend: 'Water stress in the countries that dispute the river',
  notInDispute: 'Not in this dispute',
  countries: 'Countries in the dispute',
  countriesCaption: (river: string) => `Each country’s water stress now and projected for 2050 (WRI Aqueduct), the share of its renewable water that flows in from other countries (FAO AQUASTAT), and its large dams on the ${river} and main tributaries (Global Dam Watch). Listed roughly upstream first.`,
  /** Each column names its own dataset's period or year: the three come from different datasets. */
  country: 'Country', stress: (period: string) => `Water stress, ${period}`, stress2050: (year: number) => `Projected water stress, ${year}`,
  fromAbroad: (year: number) => `Renewable water from abroad, ${year}`, damsCol: 'Dams on the river',
  /** Aqueduct's source line: the baseline period and the projection's year. */
  stressPeriods: (period: string, year: number) => `baseline ${period}; projection ${year}`,
  damsTitle: 'Large dams on the river',
  damsCaption: (river: string, n: number) => `The ${n} dams in Global Dam Watch on the ${river} and its main tributaries in these countries, largest reservoir first.`,
  noDams: 'Global Dam Watch lists no large dams on the river in these countries.',
  onRiver: (river: string) => `On the ${river}`,
  damsHere: 'Large dams on the river',
  damsHereCaption: 'Largest reservoirs first.',
  mapLabel: (river: string, countries: string) => `Map of ${countries}, the countries that dispute the ${river}, shaded by water stress, with the river’s large dams.`,
  caveat: 'Dams are those in Global Dam Watch (version 1.0) on the river and its main tributaries, matched by the river names it records. It lists large dams built by about 2022, so the newest are missing, and it does not mark dams that have since been destroyed. Water stress is a national average; the river’s own basin can differ.',
  /** `countries`: at most three named, then "and n more" (listUpTo). */
  description: (river: string, countries: string) => `${river} dispute: water stress, water from abroad and dams in ${countries}. Sources: Aqueduct, AQUASTAT, Global Dam Watch.`,
  blocLine: (bloc: string, k: number, n: number) => (k ? `${k} of the ${n} ${bloc} members are in this dispute.` : `No ${bloc} member is in this dispute.`),
  others: 'Other disputed rivers',
  related: 'Related',
  allStress: 'Water stress, every country',
};
