// The basemap every interactive map loads: countries and disputed boundaries, projected at build time
// (src/lib/map/basemap.ts).
import type { APIRoute } from 'astro';
import { basemap } from '../../lib/map/basemap';

export const GET: APIRoute = () => {
  const { countries, disputed } = basemap();
  return new Response(JSON.stringify({ countries, disputed }), { headers: { 'Content-Type': 'application/json' } });
};
