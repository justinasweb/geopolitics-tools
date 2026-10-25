import { beforeAll, describe, expect, it } from 'vitest';
import { BLOC_SLUGS } from '../../src/i18n/slugs.en.ts';
import { BLOC_ABOUT } from '../../src/i18n/blocs.en.ts';

// The blocs views, built from the membership table and the sample files.
process.env.GT_DATA = 'sample';
type View = typeof import('../../src/lib/blocview.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: View;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/blocview.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

describe('blocs views', () => {
  it('has a page, a slug and a line on what it is for each of the 19 groupings', () => {
    const pages = V.blocPages();
    expect(pages).toHaveLength(19);
    for (const p of pages) {
      expect(BLOC_SLUGS[p.id]).toBeTruthy();
      expect(BLOC_ABOUT[p.id]).toBeTruthy();
      expect(R.paths.blocs(p.id)).toBe(`/blocs/${BLOC_SLUGS[p.id]}`);
    }
    expect(R.paths.blocs('all')).toBe('/blocs');
    expect(R.paths.blocs('unsc-p5')).toBe('/blocs/un-security-council');
  });

  it('gives shares of the world between 0 and 1, and overlaps that are really shared', () => {
    const nato = V.blocPage('nato')!;
    expect(nato.members).toHaveLength(32);
    for (const s of [...nato.shares, ...nato.minerals]) {
      expect(s.share).toBeGreaterThan(0);
      expect(s.share).toBeLessThanOrEqual(1);
    }
    const eu = nato.overlaps.find((o) => o.id === 'eu')!;
    expect(eu.shared.every((x) => V.blocPage('eu')!.members.includes(x))).toBe(true);
  });

  it('counts each country’s groupings, and the layer files shade members only', () => {
    const counts = V.membershipCounts();
    expect(counts[0].n).toBeGreaterThanOrEqual(counts.at(-1)!.n);
    expect(V.blocsOf('USA')).toContain('nato');
    const f = L.layerFile('blocs-quad');
    expect(Object.keys(f.data[0].v).sort()).toEqual(['AUS', 'IND', 'JPN', 'USA']);
    const all = L.layerFile('blocs-all');
    expect(all.data[0].v.USA[0]).toBe(V.countClass(V.blocsOf('USA').length));
  });
});
