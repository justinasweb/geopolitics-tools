// The demo layer of the hidden /dev/map page: the first map layer with every overlay kind
// (src/lib/map/overlays.ts). Not built when the snapshot has no layer yet.
import type { APIRoute, GetStaticPaths } from 'astro';
import { layerFile, mapLayers } from '../../lib/map/layers';
import { demoOverlays } from '../../lib/map/overlays';

export const getStaticPaths = (() => (mapLayers().length ? [{ params: { demo: 'map' } }] : [])) satisfies GetStaticPaths;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(layerFile(mapLayers()[0].id, demoOverlays())), { headers: { 'Content-Type': 'application/json' } });
