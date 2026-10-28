// The menu as built pages see it: hubs and views whose pages are live, and the top links and tools that lead
// somewhere; the Header leaves out Tools when no tool is live. The component gallery (/dev/components) shows the
// full menu instead. `liveRoute` and `viewPath` are the route registry's, replaceable in tests.
import { NAV_HUBS, NAV_TOOLS, NAV_TOP } from '../data/nav.ts';
import { live, navKey, viewHref } from './routes.ts';
import { NAV_TEXT, UI_TEXT } from '../i18n/en.ts';

type Link = { id: string; path: string };

export function menu(full = false, liveRoute: (key: string) => { path: string } | undefined = live, viewPath: (id: string) => string | undefined = viewHref) {
  if (full) return { hubs: NAV_HUBS, top: NAV_TOP, tools: NAV_TOOLS };
  const hubs = NAV_HUBS.map((h) => ({ ...h, views: h.views.flatMap((v) => { const path = viewPath(v.id); return path ? [{ ...v, path }] : []; }) }))
    .filter((h) => h.views.length);
  const linked = (u: Link): Link[] => { const r = liveRoute(navKey(u.id)); return r ? [{ ...u, path: r.path }] : []; };
  return { hubs, top: NAV_TOP.flatMap(linked), tools: NAV_TOOLS.flatMap(linked) };
}

/** The menu's groups as the header shows them: each topic hub with its views, then Tools. The Atlas's Menu shows
 *  the same groups. */
export function menuGroups(full = false) {
  const { hubs, tools } = menu(full);
  return [
    ...hubs.map((hub) => ({ id: hub.id, name: NAV_TEXT.hubs[hub.id], links: hub.views.map((v) => ({ path: v.path, text: NAV_TEXT.views[v.id] })) })),
    ...(tools.length ? [{ id: 'tools', name: UI_TEXT.tools, links: tools.map((t) => ({ path: t.path, text: NAV_TEXT.tools[t.id] })) }] : []),
  ];
}
