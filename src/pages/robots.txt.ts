import type { APIRoute } from 'astro';
import { indexable } from '../lib/site';

// Before launch everything is disallowed; after, the data cache and the component gallery are, and the sitemap is named.
export const GET: APIRoute = ({ site }) =>
  new Response(
    indexable ? `User-agent: *\nAllow: /\nDisallow: /dev/\nDisallow: /data/cache/\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n` : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
