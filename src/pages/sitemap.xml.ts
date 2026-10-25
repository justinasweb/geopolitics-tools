// /sitemap.xml: every live, indexed page with when its content last changed, and its share image (site map,
// "Not indexed, redirects and sitemap files"). Priority and change frequency are left out: search engines ignore them.
import type { APIRoute } from 'astro';
import { routes } from '../lib/routes';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = ({ site }) => {
  const abs = (p: string) => esc(new URL(p, site).href);
  const urls = [{ path: '/', lastmod: undefined as string | undefined, image: undefined as string | undefined }, ...routes().filter((r) => r.live && r.indexed)];
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${abs(u.path)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : '',
    u.image ? `    <image:image><image:loc>${abs(u.image)}</image:loc></image:image>` : '',
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
