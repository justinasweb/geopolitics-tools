// The menu as built pages see it: hubs and views whose pages are live, and the utility links that lead somewhere.
// The component gallery (/dev/components) shows the full menu instead.
import { NAV_HUBS, NAV_UTIL } from '../data/nav.ts';
import { live, paths } from './routes.ts';

export function menu(full = false) {
  if (full) return { hubs: NAV_HUBS, util: NAV_UTIL };
  const hubs = NAV_HUBS.map((h) => ({ ...h, views: h.views.filter((v) => live(`view:${v.id}`)) })).filter((h) => h.views.length);
  const util = NAV_UTIL.filter((u) => live(u.id === 'countries' ? 'countries' : `tool:${u.id}`));
  if (live('indicators')) util.splice(1, 0, { id: 'indicators', path: paths.indicators() });
  return { hubs, util };
}
