// English words for the extras on the AI and chips views. Same rules as views.en.ts.

export const AI_TEXT = {
  mark: 'AI supercomputer (size: computing power)',
  tip: (name: string, owner: string, h100e: string, year: string) => `${name}${owner ? ` (${owner})` : ''}: ${h100e} H100 equivalents, working since ${year}`,
  largest: 'Largest known AI supercomputers',
  largestCaption: (n: number, y: number) => `The ${n} largest of the AI supercomputers Epoch AI lists as working at the end of ${y}, by computing power in H100 equivalents (one H100 equivalent is the power of one Nvidia H100 chip).`,
  name: 'Supercomputer',
  owner: 'Owner',
  country: 'Country',
  power: 'H100 equivalents',
  since: 'Working since',
  arcs: 'Largest flows, supplier to buyer',
  arcTip: (from: string, to: string, value: string, year: number) => `${from} → ${to}: ${value}, ${year}`,
  suppliers: (year: number) => `Main suppliers, ${year}`,
  suppliersCaption: 'As the importer reports them to UN Comtrade, with each supplier’s share.',
  moreSuppliers: (n: number) => `and ${n} more`,
  flows: 'Largest flows',
  flowsCaption: (n: number, year: number) => `The ${n} largest flows in ${year}, as importers report them to UN Comtrade, in US dollars.`,
  from: 'From',
  to: 'To',
  value: 'Value',
};
