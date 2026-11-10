import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Loaded } from '../../src/data/indicators.ts';
import { INDICATORS } from '../../src/data/indicators.ts';
import { INDICATOR_TEXT } from '../../src/i18n/en.ts';
import { ANSWER, DEFINITION, inSentence, lc, ordinal } from '../../src/i18n/pages.en.ts';
import { INDICATOR_SLUGS, SECTION_SLUGS } from '../../src/i18n/slugs.en.ts';
import { tagFor } from '../../src/lib/dependence.ts';
import { formatParts } from '../../src/lib/format.ts';
import { breaks, classOf, defaultYear, preliminaryYears, ranking } from '../../src/lib/stats.ts';

// The page engine reads the sample files here (the prototype's fixtures), never a live snapshot.
process.env.GT_DATA = 'sample';
type Routes = typeof import('../../src/lib/routes.ts');
let R: Routes;
beforeAll(async () => {
  R = await import('../../src/lib/routes.ts');
});

const loaded = (values: Record<string, Record<number, number>>, extra: Partial<Loaded['indicator']> = {}): Loaded => ({
  indicator: { ...INDICATORS.gdp, ...extra },
  values,
  years: [...new Set(Object.values(values).flatMap((v) => Object.keys(v).map(Number)))].sort(),
});

describe('route registry', () => {
  it('builds every page once, with clean paths and no clashes', () => {
    const routes = R.routes();
    expect(() => R.checkRoutes(routes)).not.toThrow();
    for (const r of routes) expect(r.path).toMatch(/^\/[a-z0-9/-]+$/);
    expect(routes.filter((r) => r.kind === 'country' && r.live).length).toBeGreaterThan(50);
    expect(R.live('compare:USA,CHN')?.path).toBe('/compare/united-states-vs-china');
    expect(R.route('compare:USA,CHN')?.aliases).toContain('/compare/china-vs-united-states');
    // Renamed pages keep their old address as a redirect.
    expect(R.route('indicator:co2trade')?.aliases).toContain('/indicators/co2-imported-in-goods');
    expect(R.route('view:emissions:co2trade')?.aliases).toContain('/emissions/imported');
    expect(R.redirects()).toContain('/emissions/imported /emissions/net-imports 301');
  });

  it('dates About, Methodology and Privacy by the "updated" in their front matter, and Sources by the snapshot', () => {
    for (const id of R.STATIC_PAGES) {
      const md = readFileSync(join(process.cwd(), 'src/content/pages', `${id}.md`), 'utf8');
      expect(R.route(`page:${id}`)?.lastmod).toBe(md.match(/^updated: "(.+)"$/m)![1]);
    }
    expect(R.route('page:sources')?.lastmod).toBeTruthy();
  });

  it('fails on two pages with one path, an alias that is a page, or a path that breaks the rules', () => {
    const base = { kind: 'page' as const, lang: 'en' as const, live: true, indexed: true, id: '', aliases: [] as string[] };
    expect(() => R.checkRoutes([{ ...base, key: 'a', path: '/about' }, { ...base, key: 'b', path: '/about' }])).toThrow(/clash/);
    expect(() => R.checkRoutes([{ ...base, key: 'a', path: '/about' }, { ...base, key: 'b', path: '/x', aliases: ['/about'] }])).toThrow(/clash/);
    expect(() => R.checkRoutes([{ ...base, key: 'a', path: '/About' }])).toThrow(/clean/);
    expect(() => R.checkRoutes([{ ...base, key: 'a', path: '/about/' }])).toThrow(/clean/);
    expect(() => R.checkRoutes([{ ...base, key: 'a', path: '/a' }, { ...base, key: 'a', path: '/b' }])).toThrow(/twice/);
  });

  it('redirects ISO codes and reversed pairs, and maps old hash links', () => {
    const lines = R.redirects().trim().split('\n');
    expect(lines).toContain('/countries/usa /countries/united-states 301');
    expect(lines).toContain('/countries/us /countries/united-states 301');
    expect(lines.length).toBeLessThanOrEqual(2000);
    const hash = R.hashMap();
    expect(hash['country/RUS']).toBe('/countries/russia');
    expect(hash['compare/CHN,USA']).toBe('/compare/united-states-vs-china');
  });

  it('keeps views, hubs and tools out of the build until their phase', () => {
    // Phase 4 builds the critical minerals views, phase 5 the views on registry measures, phase 5b those on keyed sources (with sample data here), phase 6 the Explorer, Dependencies, Supply chains, Bloc overlap, the Atlas and the five topic hubs; the rest wait for theirs.
    const built = /^(view:(minerals|emissions|refugees|disasters|food|blocs|alliance-history|space|ai|sanctions|internet|water|chinese-lending|arms|rivers|oil|gas|electricity|conflict|food-crises|nuclear):|tool:(explorer|dependencies|supply-chains|blocs-overlap|atlas)(:|$)|hub:(resources|technology|climate|security|power)$)/;
    for (const r of R.routes().filter((x) => ['view', 'hub', 'tool'].includes(x.kind))) expect(r.live).toBe(built.test(r.key) && !R.gateHidden(r.key));
  });

  it('hides the views that failed the launch gate review, and links nothing to them', () => {
    expect(R.gateHidden('view:rivers:nile', ['view:rivers:'])).toBe(true);
    expect(R.gateHidden('view:water:waterdep', ['view:water:waterstress'])).toBe(false);
    const hidden = R.routes().filter((r) => R.gateHidden(r.key));
    expect(hidden.every((r) => !r.live && !r.indexed)).toBe(true);
    const paths = new Set(hidden.map((r) => r.path));
    expect(R.redirects().split('\n').some((l) => paths.has(l.split(' ')[1]))).toBe(false);
    expect(Object.values(R.hashMap()).some((p) => paths.has(p))).toBe(false);
    expect(R.viewHref('rivers')).toBeDefined();
  });

  it('builds the emissions and refugees views, each family’s first layer at the section’s own address', () => {
    const paths = R.routes().filter((r) => /^view:(emissions|refugees):/.test(r.key)).map((r) => r.path).sort();
    expect(paths).toEqual(['/emissions', '/emissions/net-imports', '/emissions/per-person', '/emissions/since-1750',
      '/refugees', '/refugees/displaced', '/refugees/hosted', '/refugees/per-person']);
    expect(R.viewHref('emissions')).toBe('/emissions');
    expect(R.viewHref('refugees')).toBe('/refugees');
  });

  it('builds a view per mineral, with /minerals as an alias of the first', () => {
    const views = R.routes().filter((r) => r.key.startsWith('view:minerals:'));
    expect(views.map((r) => r.path)).toContain('/minerals/lithium');
    expect(views.every((r) => r.live && r.indexed && r.path === R.paths.mineral(r.key.split(':')[2]))).toBe(true);
    expect(R.routes().some((r) => r.aliases?.includes('/minerals'))).toBe(true);
    expect(R.viewHref('minerals')).toBe(views[0].path);
  });

  it('has a slug for every indicator and section, all different', () => {
    expect(Object.keys(INDICATOR_SLUGS).sort()).toEqual(Object.keys(INDICATORS).sort());
    expect(new Set(Object.values(INDICATOR_SLUGS)).size).toBe(Object.keys(INDICATOR_SLUGS).length);
    expect(new Set(Object.values(SECTION_SLUGS)).size).toBe(Object.keys(SECTION_SLUGS).length);
  });
});

describe('common year and rankings', () => {
  it('takes the latest year most places have reported; later ones are preliminary', () => {
    const v: Record<string, Record<number, number>> = {};
    ['USA', 'CHN', 'DEU', 'FRA', 'JPN'].forEach((id, i) => (v[id] = { 2022: i + 1, 2023: i + 2 }));
    v.USA[2024] = 9;
    const l = loaded(v);
    expect(defaultYear(l)).toBe(2023);
    expect(preliminaryYears(l)).toEqual([2024]);
  });

  it('ranks largest first with shared ranks, and falls back to earlier years only when asked', () => {
    const l = loaded({ USA: { 2023: 5 }, CHN: { 2023: 5 }, DEU: { 2023: 3 }, FRA: { 2022: 7 } });
    expect(ranking(l, 2023).map((r) => [r.id, r.rank])).toEqual([['CHN', 1], ['USA', 1], ['DEU', 3]]);
    expect(ranking(l, 2023, 2).map((r) => r.id)).toEqual(['FRA', 'CHN', 'USA', 'DEU']);
  });

  it('cuts five map classes from quantiles', () => {
    const b = breaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(b).toHaveLength(4);
    expect(classOf(1, b)).toBe(0);
    expect(classOf(10, b)).toBe(4);
  });
});

describe('dependence and sentences', () => {
  it('labels import reliance at 50% and ±15%', () => {
    expect(tagFor(0.5)).toBe('most');
    expect(tagFor(0.49)).toBe('some');
    expect(tagFor(0.15)).toBe('some');
    expect(tagFor(0.1)).toBe('self');
    expect(tagFor(-0.1)).toBe('self');
    expect(tagFor(-0.15)).toBe('exp');
  });

  it('writes place names, ordinals and labels as they read in a sentence', () => {
    expect(inSentence('United States')).toBe('the United States');
    expect(inSentence('United States', true)).toBe('The United States');
    expect(inSentence('Germany')).toBe('Germany');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
    expect(lc('Military spending, share of GDP')).toBe('military spending, share of GDP');
    expect(lc('Chinese loans and grants received')).toBe('Chinese loans and grants received');
  });

  it('splits figures into number and unit for key figures', () => {
    expect(formatParts(1.44e12, { kind: 'money' })).toEqual({ num: 'US$1.44', unit: 'trillion' });
    expect(formatParts(1.41e9, { kind: 'count' })).toEqual({ num: '1.41', unit: 'billion' });
    expect(formatParts(0.8, { kind: 'percent', digits: 1 }, '% of GDP')).toEqual({ num: '0.8', unit: '% of GDP' });
  });

  it('writes two figures on the scale of the larger, for a row that compares them', () => {
    // Compare: the United States' 342 million beside China's 1.41 billion, both in billions.
    expect(formatParts(3.42e8, { kind: 'count' }, '', undefined, 1.41e9)).toEqual({ num: '0.34', unit: 'billion' });
    expect(formatParts(1.41e9, { kind: 'count' }, '', undefined, 1.41e9)).toEqual({ num: '1.41', unit: 'billion' });
    // Reserves: $3.6 trillion beside $910 billion.
    expect(formatParts(9.1e11, { kind: 'money' }, '', undefined, 3.6e12)).toEqual({ num: 'US$0.91', unit: 'trillion' });
    // Without a scale to follow, each figure keeps its own.
    expect(formatParts(3.42e8, { kind: 'count' })).toEqual({ num: '342', unit: 'million' });
  });

  it('has a definition for every indicator, and every answer belongs to one', () => {
    for (const id of Object.keys(INDICATORS)) expect(DEFINITION[id], id).toBeTruthy();
    for (const id of Object.keys(ANSWER)) expect(INDICATOR_TEXT[id], id).toBeDefined();
  });
});

describe('titles and descriptions', () => {
  it('cuts a description at the last whole word before 160 characters', async () => {
    const { cutWords, fitSentences } = await import('../../src/lib/format.ts');
    const long = `${'word '.repeat(40)}end.`;
    const cut = cutWords(long);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut).toMatch(/ word…$/);
    expect(cutWords('Short.')).toBe('Short.');
    expect(fitSentences(['One.', 'x'.repeat(200), 'Two.'])).toBe('One. Two.');
  });

  it('names at most three countries, then how many more', async () => {
    const { listUpTo } = await import('../../src/i18n/pages.en.ts');
    expect(listUpTo(['A', 'B', 'C'], 3)).toBe('A, B and C');
    expect(listUpTo(['A', 'B', 'C', 'D', 'E'], 3)).toBe('A, B, C and 2 more');
  });

  it('starts a country page description with the largest world share, else the largest import, else population and GDP', async () => {
    const { countryModel } = await import('../../src/lib/country.ts');
    const { PLACES } = await import('../../src/lib/places.ts');
    for (const p of PLACES) {
      const m = countryModel(p.id);
      if (!m) continue;
      if (m.minerals.length) expect(m.lead).toMatch(/ (mines|produces) [\d.]+% of the world’s .* \(USGS, \d{4}/);
      else if (m.deps.some((d) => d.state === 'ok' && d.tag === 'most')) expect(m.lead).toMatch(/ imports .* (it uses|supply) \(.+, \d{4}\)\.$/);
      else if (m.allFigures.some((f) => f.id === 'population')) expect(m.lead).toMatch(/ has .* people \(/);
      if (m.lead) expect(m.lead).not.toMatch(/^It /);
    }
  });
});

describe('the <title>', () => {
  const titleAt = async (path: string) => {
    const { fullTitle } = await import('../../src/lib/site.ts');
    const { countryModel } = await import('../../src/lib/country.ts');
    const { COUNTRY_TEXT } = await import('../../src/i18n/pages.en.ts');
    const r = R.routes().find((x) => x.path === path)!;
    return fullTitle(COUNTRY_TEXT.title(countryModel(r.id)!.place.name));
  };

  it('adds " | geopolitics.tools" only when the whole stays within 65 characters', async () => {
    expect(await titleAt('/countries/democratic-republic-of-the-congo')).toBe('Democratic Republic of the Congo: imports, resources and key figures');
    expect(await titleAt('/countries/germany')).toMatch(/^Germany: .* \| geopolitics\.tools$/);
    const { fullTitle } = await import('../../src/lib/site.ts');
    expect(fullTitle('geopolitics.tools')).toBe('geopolitics.tools');
    expect(fullTitle('x'.repeat(45))).toHaveLength(65);
    expect(fullTitle('x'.repeat(46))).toBe('x'.repeat(46));
  });

  it('gives the home page its own title, with the site name after it', async () => {
    const { fullTitle } = await import('../../src/lib/site.ts');
    const { HOME_TEXT } = await import('../../src/i18n/home.en.ts');
    expect(fullTitle(HOME_TEXT.title)).toBe('Who depends on whom, for what | geopolitics.tools');
  });
});
