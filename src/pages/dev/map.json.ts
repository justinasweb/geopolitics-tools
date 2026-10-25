// The demo layer of the hidden /dev/map page: lithium with every overlay kind (src/lib/map/overlays.ts).
import type { APIRoute } from 'astro';
import { layerFile } from '../../lib/map/layers';
import { demoOverlays } from '../../lib/map/overlays';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(layerFile('minerals-lithium', demoOverlays())), { headers: { 'Content-Type': 'application/json' } });
