import type { APIRoute } from 'astro';
import { indexable } from '../lib/site';

export const GET: APIRoute = () =>
  new Response(
    indexable ? "User-agent: *\nAllow: /\nDisallow: /dev/\n" : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
