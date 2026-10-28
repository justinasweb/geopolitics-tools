// The main menu: the five topic hubs and their views, in site-map order (02-site-map.md), plus the utility links.
// Paths only; the words are in src/i18n/<lang>.ts (NAV_TEXT). Wave 2 views (news signal, supply cutoffs) are left
// out, as the Header design asks. Phase 3's route registry will hide views that are not live yet.

export interface NavView { id: string; path: string }
export interface NavHub { id: string; path: string; views: NavView[] }

export const NAV_HUBS: NavHub[] = [
  {
    id: 'resources', path: '/resources', views: [
      { id: 'minerals', path: '/minerals' },
      { id: 'oil', path: '/oil' },
      { id: 'gas', path: '/gas' },
      { id: 'electricity', path: '/electricity' },
      { id: 'food', path: '/food/wheat' },
    ],
  },
  {
    id: 'technology', path: '/technology', views: [
      { id: 'internet', path: '/internet' },
      { id: 'ai', path: '/ai' },
      { id: 'space', path: '/space' },
    ],
  },
  {
    id: 'climate', path: '/climate', views: [
      { id: 'emissions', path: '/emissions' },
      { id: 'water', path: '/water' },
      { id: 'rivers', path: '/water/rivers/nile' },
      { id: 'disasters', path: '/disasters' },
    ],
  },
  {
    id: 'security', path: '/security', views: [
      { id: 'chokepoints', path: '/chokepoints' },
      { id: 'ports', path: '/ports' },
      { id: 'conflict', path: '/conflict' },
      { id: 'refugees', path: '/refugees' },
      { id: 'food-crises', path: '/food-crises' },
      { id: 'arms', path: '/arms' },
    ],
  },
  {
    id: 'power', path: '/power', views: [
      { id: 'sanctions', path: '/sanctions' },
      { id: 'chinese-lending', path: '/chinese-lending' },
      { id: 'blocs', path: '/blocs' },
      { id: 'alliance-history', path: '/blocs/nato/history' },
    ],
  },
];

export const NAV_UTIL = [
  { id: 'countries', path: '/countries' },
  { id: 'atlas', path: '/atlas' },
  { id: 'explorer', path: '/explorer' },
  { id: 'dependencies', path: '/dependencies' },
  { id: 'supply-chains', path: '/supply-chains' },
];

export const NAV_FOOTER = [
  { id: 'about', path: '/about' },
  { id: 'methodology', path: '/methodology' },
  { id: 'sources', path: '/sources' },
  { id: 'privacy', path: '/privacy' },
];

export const SOCIAL = { x: 'https://x.com/geopolitools', telegram: 'https://t.me/geopolitools' };
