import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('a bloc’s mineral shares', () => {
  it('carry the Estimate label when USGS marks the figures as estimated, as on the mineral pages', async () => {
    const { blocPage } = await import('../../src/lib/blocview.ts');
    const { mineralPages, listed } = await import('../../src/lib/minerals.ts');
    let seen = 0;
    for (const id of ['nato', 'brics', 'g20', 'eu']) {
      const p = blocPage(id);
      for (const s of p?.minerals ?? []) {
        const m = mineralPages().find((x) => `mineral:${x.id}` === s.id)!;
        const members = listed(m.latest).filter((x) => x.place && p!.members.includes(x.place));
        expect(s.estimated, `${id} ${s.id}`).toBe(Boolean(m.latest.estimated || members.some((x) => x.estimated)));
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('a bloc’s mineral sentences', () => {
  it('use each mineral’s own verb and keep the year and "estimated"', async () => {
    const { mineralSentences } = await import('../../src/lib/blocview.ts');
    const m = (id: string, share: number, measure: 'mine' | 'primary', estimated: boolean) => ({ id: `mineral:${id}`, share, year: 2025, have: 3, of: 11, estimated, measure });
    expect(mineralSentences([m('gallium', 0.99, 'primary', true), m('tungsten', 0.79, 'mine', true), m('rare-earths', 0.72, 'mine', false)])).toEqual([
      'Together they mine 79% of the world’s tungsten and 72% of the world’s rare earths (USGS, 2025, estimated).',
      'They produce 99% of the world’s primary gallium (USGS, 2025, estimated).',
    ]);
    expect(mineralSentences([m('gallium', 0.99, 'primary', false)])).toEqual(['Together they produce 99% of the world’s primary gallium (USGS, 2025).']);
  });

  it('give every bloc’s mineral its USGS measure', async () => {
    const { blocPage } = await import('../../src/lib/blocview.ts');
    const { mineralPages } = await import('../../src/lib/minerals.ts');
    for (const s of blocPage('brics')?.minerals ?? []) expect(s.measure).toBe(mineralPages().find((x) => `mineral:${x.id}` === s.id)!.mineral.measure);
  });
});


describe('a country page’s Member of line', () => {
  it('lists its groupings from blocs.csv in the blocs’ order, each with a live bloc page', async () => {
    const { BLOC_ORDER, blocs } = await import('../../src/lib/blocs.ts');
    const cn = V.blocsOf('CHN');
    expect(cn).toEqual(BLOC_ORDER.filter((b) => blocs().get(b)!.includes('CHN')));
    expect(cn).toEqual(expect.arrayContaining(['brics', 'g20', 'sco', 'unsc-p5']));
    for (const b of cn) expect(R.live(`view:blocs:${b}`)?.path, b).toBeTruthy();
  });

  it('names the UN Security Council as a membership, and dates the line with BLOCS_CHECKED', async () => {
    const { COUNTRY_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(COUNTRY_TEXT.memberName['unsc-p5']).toBe('UN Security Council (permanent member)');
    const page = readFileSync('src/templates/CountryPage.astro', 'utf8');
    expect(page).toContain('COUNTRY_TEXT.facts.membersAsOf(formatDate(BLOCS_CHECKED))');
  });

  it('has one checked date: no page or text writes a membership date by hand', async () => {
    const { BLOCS_CHECKED } = await import('../../src/lib/blocs.ts');
    expect(BLOCS_CHECKED).toBe('2026-11-10');
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'ai' ? [] : files(join(dir, e.name))) : [join(dir, e.name)]));
    for (const f of files('src').filter((x) => /\.(ts|astro|md)$/.test(x) && x !== join('src', 'lib', 'blocs.ts'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/(members?|member lists|memberships?)[^\n`]{0,40}(as of|checked( on)?) \d/i);
    }
  });
});
