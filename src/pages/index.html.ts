// Until launch the home page is the holding page (src/holding/index.html, one self-contained file from the
// Brand directions work). It is served as-is, plus the site-wide noindex tag while the site is not indexable.
import type { APIRoute } from 'astro';
import holding from '../holding/index.html?raw';
import { indexable } from '../lib/site';

export const GET: APIRoute = () => {
  const html = indexable ? holding : holding.replace('<head>', '<head>\n<meta name="robots" content="noindex">');
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
