import { beforeAll, describe, expect, it } from 'vitest';

// The AI and chips views: the registry's computing power share, and two measures only the views show.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: Views;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

describe('AI and chips views', () => {
  it('builds every layer with data at its own address', () => {
    const paths = V.familyPages('ai').map((p) => R.route(`view:ai:${p.id}`)!.path);
    expect(paths[0]).toBe('/ai');
    for (const x of paths.slice(1)) expect(['/ai/models', '/ai/export-controls']).toContain(x);
  });

  it('gives view-only measures no indicator page', () => {
    expect(R.route('indicator:aimodels')).toBeUndefined();
    expect(R.route('indicator:entitylist')).toBeUndefined();
  });

  it('marks the known supercomputers on the computing power map', () => {
    if (!V.viewPage('aicompute')) return;
    const f = L.layerFile('ai-aicompute');
    expect(f.overlays?.[0].kind).toBe('points');
  });
});
