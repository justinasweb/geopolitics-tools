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
  byClassCaption: 'Aid-like flows are grants and cheap loans; lending-like flows are loans near market rates (AidData’s terms ODA-like and OOF-like).',
  flow: { 'ODA-like': 'Aid-like', 'OOF-like': 'Lending-like', 'Vague (Official Finance)': 'Unclear' } as Record<string, string>,
  projects: 'Largest projects',
  projectsCaption: 'Single commitments, in 2021 dollars, with the year agreed.',
  largest: 'Largest commitments',
  largestCaption: (n: number) => `The ${n} largest single commitments in AidData’s records for these sectors, 2000–2021, in 2021 dollars.`,
  project: 'Project', country: 'Recipient', amount: 'Amount', year: 'Year',
};
