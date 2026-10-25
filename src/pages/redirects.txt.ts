// The 301s for every alias in the route registry (ISO codes, reversed Compare pairs). The build moves this file
// to dist/_redirects, which Cloudflare's static assets read (astro.config.mjs).
import type { APIRoute } from 'astro';
import { redirects } from '../lib/routes';

export const GET: APIRoute = () => new Response(redirects(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
