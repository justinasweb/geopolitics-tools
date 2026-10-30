// The Bloc overlap tool's words (BlocOverlap and BlocOverlapPage designs). The page template and the browser script
// (src/scripts/overlap.ts) both read these, so this file imports nothing that needs Node.

/** Short names for the chips, the matrix and the table heads, where the map's name is long. */
export const OVERLAP_SHORT: Record<string, string> = { eu: 'EU', 'unsc-p5': 'UN P5', eaeu: 'EAEU' };

/** A grouping's name inside a sentence, with "the" where English uses it. */
const THE = new Set(['g7', 'g20', 'eu', 'oecd', 'sco', 'quad', 'csto', 'eaeu', 'cis', 'unsc-p5']);
export const blocIn = (id: string, name: string) => (THE.has(id) ? `the ${name}` : name);

const or = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
const and = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export const OVERLAP_TEXT = {
  title: 'Bloc overlap',
  crumb: 'Tools',
  lede: 'Which countries belong to which groupings, and where groupings share members.',
  description: (n: number) => `${n} groupings side by side: how many members each pair shares, the countries in at least one of NATO, the EU, the G7 and the Quad and at least one of BRICS and the SCO, and every country’s memberships.`,
  source: 'Membership: the groupings’ own member lists',
  checked: (date: string) => `Members as of ${date}`,
  note: 'G7 also includes the EU; G20 also includes the EU and the African Union. Only countries are counted here. Partners and observers are not counted.',

  // Chips
  compare: 'Compare',
  atLeastTwo: 'Choose at least two blocs.',
  chosen: (n: number) => `${n} blocs chosen.`,

  // Matrix
  matrixTitle: 'Shared members',
  matrixLabel: 'Shared members between each pair of blocs',
  matrixCaption: 'Number of countries that belong to both blocs. Diagonal: bloc size. Darker cells share more members; every cell shows its number.',
  bloc: 'Bloc',
  members: 'members',
  pairs: (pairs: [string, string, number][]) =>
    `${pairs.map(([a, b, n], i) => `${i ? a : a[0].toUpperCase() + a.slice(1)} and ${b} share ${n} member${n === 1 ? '' : 's'}`).join('; ')}.`,
  noPairs: 'None of these blocs share a member.',

  // Two blocs (phone)
  first: 'First bloc',
  second: 'Second bloc',
  share: (a: string, b: string, n: number) =>
    n ? `${a[0].toUpperCase() + a.slice(1)} and ${b} share ${n} member${n === 1 ? '' : 's'}.` : `${a[0].toUpperCase() + a.slice(1)} and ${b} share no members.`,
  same: 'Pick two different blocs.',
  inBoth: 'In both',
  only: (bloc: string) => `Only ${bloc}`,
  none: 'None',

  // Bridge countries
  bridgeTitle: 'Bridge countries',
  bridgeFind: (countries: { name: string; a: string[]; b: string[] }[]) => {
    const [one] = countries;
    return !one ? 'No country is a full member of a grouping on each side.'
      : countries.length === 1 ? `${one.name} is the only country that is a full member of groupings on both sides: ${and(one.a)} on one, ${and(one.b)} on the other.`
        : `${and(countries.map((c) => c.name))} are full members of a grouping on each side.`;
  },
  bridgeRule: (a: string[], b: string[], others: string[]) =>
    `One side is ${and(a)}; the other is ${and(b)}. Full members only.${others.length ? ` Membership of other groupings, ${and(others)} among them, is not counted here.` : ''}`,
  partnersTitle: 'Partners and invitees, not counted as members',
  partner: { partner: (b: string) => `${b} partner country`, dialogue: (b: string) => `${b} dialogue partner`, invited: (b: string) => `invited to ${b}; has not confirmed membership`, offered: (b: string, y: string) => `offered ${b} partner status in ${y}` },

  // Membership table
  tableTitle: 'Full membership table',
  tableTitlePhone: 'All memberships',
  tableLabel: 'Membership by country',
  keyMember: (names: string[]) => `Member: ${or(names)}`,
  keyNot: 'Not a member',
  member: 'Member',
  notMember: 'Not a member',
  country: 'Country',
  total: 'Total',
  tableCaption: (byName: boolean, asc: boolean) =>
    `Shapes differ by bloc group, so the table reads without colour. ${byName ? `Sorted by country${asc ? '' : ', Z to A'}` : `Sorted by number of memberships${asc ? ', fewest first' : ''}`}.`,
  showAll: 'Show all countries and blocs',
  showFewer: 'Show fewer',
  phoneNote: (n: number) => `${n} more countries in these blocs.`,
  download: 'Download CSV',
  csvAsOf: 'members as of',
};
