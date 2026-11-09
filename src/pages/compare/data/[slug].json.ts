// One small file per country page (D21): only the figures, series and mineral shares Compare uses
// (src/lib/compare.ts), loaded by /compare in the browser for the two countries picked.
import type { APIRoute, GetStaticPaths } from 'astro';
import { compareData } from '../../../lib/compare';
import { countryPages } from '../../../lib/country';
import { live } from '../../../lib/routes';

export const getStaticPaths = (() => (live('compare') ? countryPages().map((m) => ({ params: { slug: m.place.slug }, props: { id: m.place.id } })) : [])) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(compareData(props.id as string)), { headers: { 'Content-Type': 'application/json' } });
