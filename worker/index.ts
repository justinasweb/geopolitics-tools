// The site's only server code. It runs before every request: it handles /api/* (later: the correction form and
// the Telegram review button), keeps the public domain on the holding page until launch, and passes anything
// else to the static assets.
// Its hourly Cron Trigger watches the data pipeline from outside GitHub (decision D11): see watch.ts.
import { watch, type WatchEnv } from './watch';

export interface Env extends WatchEnv {
  ASSETS: Fetcher;
  // "true" while the production deploy serves the holding page (ci.yml passes SITE_HOLDING); unset elsewhere.
  HOLDING?: string;
}

// Until launch the site's own domain shows only the holding page: every other address goes back to it.
// workers.dev (where CI checks every page) and Previews keep the whole site, noindex like everything else.
const SITE_HOSTS = new Set(['geopolitics.tools', 'www.geopolitics.tools']);
const HOLDING_FILES = new Set(['/', '/robots.txt', '/favicon.svg', '/og.png']);

// Pages whose every state is in the query string (/atlas?layer=…&country=IND): the page itself is indexed, its states
// are not (site map, "Atlas states"; 10-seo-plan.md). A static page cannot tell its query, so the Worker says it.
// The canonical in the HTML is already the path alone.
const STATE_PAGES = new Set(['/atlas']);

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export default {
  async fetch(request, env): Promise<Response> {
    const { hostname, pathname, search } = new URL(request.url);
    if (env.HOLDING === 'true' && SITE_HOSTS.has(hostname) && !HOLDING_FILES.has(pathname) && !pathname.startsWith('/api/')) {
      return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    if (pathname === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'method not allowed' }, 405);
      return json({ ok: true });
    }
    if (pathname.startsWith('/api/')) return json({ ok: false, error: 'not found' }, 404);
    const res = await env.ASSETS.fetch(request);
    if (search && STATE_PAGES.has(pathname) && res.ok) {
      const out = new Response(res.body, res);
      out.headers.set('X-Robots-Tag', 'noindex, follow');
      return out;
    }
    return res;
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(watch(env, new Date()).then((r) => console.log(JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
