// Site search's index (src/lib/search.ts): every live page by name, fetched by the search box on first use.
import type { APIRoute } from 'astro';
import { searchIndex } from '../lib/search';

export const GET: APIRoute = () => new Response(JSON.stringify(searchIndex()), { headers: { 'Content-Type': 'application/json' } });
