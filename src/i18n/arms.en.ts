// English words for the extras on the arms views (src/lib/arms.ts): each country's main partners and suppliers by
// group in the panel, the largest flows as arcs and in a table. Same rules as pages.en.ts.

export const ARMS_TEXT = {
  buyers: (period: string) => `Main recipients, ${period}`,
  suppliers: (period: string) => `Main suppliers, ${period}`,
  partnersCaption: (exports: boolean) => `Each partner’s share of the country’s ${exports ? 'exports' : 'imports'} over the period, in SIPRI’s trend-indicator value.`,
  morePartners: (n: number) => `and ${n} more`,
  ofTotal: (share: string) => `${share} of the total`,
  mix: (period: string) => `Suppliers by group, ${period}`,
  mixCaption: 'Share of the country’s imports. European countries are those of Europe other than Russia and Türkiye.',
  group: { USA: 'United States', CHN: 'China', RUS: 'Russia', europe: 'European countries', other: 'Others' } as Record<string, string>,
  then: (share: string, period: string) => `${share} in ${period}`,
  arcs: 'Largest flows, supplier to recipient',
  arcTip: (from: string, to: string, value: string, period: string) => `${from} → ${to}: ${value}, ${period}`,
  largest: 'Largest flows',
  largestCaption: (n: number, period: string) => `The ${n} largest flows of major arms from one country to another, ${period}, in SIPRI’s trend-indicator value (millions).`,
  supplier: 'Supplier', recipient: 'Recipient', amount: 'TIV millions', share: 'Share of recipient’s imports',
};
