// One file per Explorer measure (src/lib/explorer.ts): every ranked place's values from the first year, loaded by
// the browser as the reader picks measures.
import type { APIRoute, GetStaticPaths } from 'astro';
import { explorerData, explorerMeasures } from '../../../lib/explorer';
import { live } from '../../../lib/routes';

export const getStaticPaths = (() => (live('tool:explorer') ? explorerMeasures().map((id) => ({ params: { id } })) : [])) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(explorerData(params.id!)), { headers: { 'Content-Type': 'application/json' } });
