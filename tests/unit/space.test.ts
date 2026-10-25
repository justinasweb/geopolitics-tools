import { beforeAll, describe, expect, it } from 'vitest';

// The space views, built from the sample CelesTrak catalogue.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Space = typeof import('../../src/lib/space.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: Views;
let S: Space;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  S = await import('../../src/lib/space.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

describe('space views', () => {
  it('builds satellites at /space and launches at /space/launches', () => {
    expect(R.route('view:space:satellites')!.path).toBe('/space');
    expect(R.route('view:space:launches')!.path).toBe('/space/launches');
  });

  it('stops launches at the last full year', () => {
    const p = V.viewPage('launches')!;
    const asOf = S.spaceAsOf()!;
    expect(p.year).toBeLessThan(Number(asOf.slice(0, 4)) + (asOf.slice(5) === '12-31' ? 1 : 0));
    expect(p.years.at(-1)).toBe(p.year);
  });

  it('marks each launch site in the years it launched, and the site counts match the country counts', () => {
    const p = V.viewPage('launches')!;
    const f = L.layerFile('space-launches');
    const sites = f.overlays!.find((o) => o.id === 'sites')!;
    expect(sites.items.length).toBeGreaterThan(0);
    const y = p.byYear[p.year];
    const bySite = S.sitesIn(p.year).filter((x) => x.place).reduce((t, x) => t + x.n, 0);
    expect(bySite).toBe(y.rows.reduce((t, r) => t + r.value, 0));
  });

  it('gives a country its working satellites by orbit', () => {
    const w = S.workingBy();
    for (const [, x] of w) expect(x.orbits.leo + x.orbits.meo + x.orbits.geo).toBe(x.active);
  });
});
