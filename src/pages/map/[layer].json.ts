// One file per map layer (src/lib/map/layers.ts): what the map shades, by place and year, already worded.
import type { APIRoute, GetStaticPaths } from 'astro';
import { layerFile, mapLayers } from '../../lib/map/layers';
import { live } from '../../lib/routes';

export const getStaticPaths = (() => mapLayers().filter((l) => live(l.view)).map((l) => ({ params: { layer: l.id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(layerFile(params.layer!)), { headers: { 'Content-Type': 'application/json' } });
