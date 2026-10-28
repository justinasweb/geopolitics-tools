// The menu as built pages see it: hubs and views whose pages are live, and the top links and tools that lead
// somewhere; the Header leaves out Tools when no tool is live. The component gallery (/dev/components) shows the
// full menu instead. `liveRoute` and `viewPath` are the route registry's, replaceable in tests.
import { NAV_HUBS, NAV_TOOLS, NAV_TOP } from '../data/nav.ts';
import { live, navKey, viewHref } from './routes.ts';

type Link = { id: string; path: string };

export function menu(full = false, liveRoute: (key: string) => { path: string } | undefined = live, viewPath: (id: string) => string | undefined = viewHref) {
  if (full) return { hubs: NAV_HUBS, top: NAV_TOP, tools: NAV_TOOLS };
  const hubs = NAV_HUBS.map((h) => ({ ...h, views: h.views.flatMap((v) => { const path = viewPath(v.id); return path ? [{ ...v, path }] : []; }) }))
    .filter((h) => h.views.length);
  const linked = (u: Link): Link[] => { const r = liveRoute(navKey(u.id)); return r ? [{ ...u, path: r.path }] : []; };
  return { hubs, top: NAV_TOP.flatMap(linked), tools: NAV_TOOLS.flatMap(linked) };
}
