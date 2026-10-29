// What each topic hub lists besides its map views (the views come from src/data/nav.ts): the tools for the topic,
// the supply-chain flows that belong to it (src/data/flows.ts keys) and the indicator groups whose rankings it shows
// (src/data/indicators.ts). A tool, flow or indicator page that is not live is left out.

export const HUB_TOOLS: Record<string, string[]> = {
  resources: ['dependencies', 'supply-chains', 'explorer', 'atlas'],
  technology: ['atlas', 'supply-chains', 'explorer'],
  climate: ['atlas', 'explorer'],
  security: ['supply-chains', 'atlas', 'explorer'],
  power: ['blocs-overlap', 'atlas', 'explorer'],
};

export const HUB_FLOWS: Record<string, string[]> = {
  resources: ['oil', 'gas', 'wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate'],
  technology: ['chips'],
  security: ['arms', 'refugees'],
};

export const HUB_GROUPS: Record<string, string[]> = {
  resources: ['energy', 'food'],
  technology: ['tech'],
  climate: ['climate'],
  security: ['security'],
  power: ['influence'],
};
