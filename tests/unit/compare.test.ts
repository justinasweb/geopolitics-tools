import { describe, expect, it } from 'vitest';
import {
  chartsAndGaps, compareCharts, compareRows, comparePairs, gapGroups, pairHref, parsePair, staticPair, type CountryData, type Meta,
} from '../../src/lib/compare/model.ts';
import { chartsHtml, compareHtml, keyHtml, mineralsHtml } from '../../src/lib/compare/render.ts';
import { COMPARE_TEXT } from '../../src/i18n/pages.en.ts';

// Compare (D21): the rows both countries have, what could not be compared, the charts both have a series for, the
// mineral pairs, the static pairs and the address, and the markup, on two made-up countries; then the build's own
// meta and country files.
process.env.GT_DATA = 'sample';

const measure = (id: string, label: string, noun: string, credit: string) => ({ id, label, noun, unit: 'US$', format: { kind: 'money' as const }, credit, source: `${credit} full name` });
const meta: Meta = {
  measures: [measure('gdp', 'GDP', 'GDP', 'World Bank'), measure('milusd', 'Military spending', 'military spending', 'SIPRI'),
    measure('satellites', 'Satellites in orbit', 'satellites', 'CelesTrak'), measure('aicompute', 'AI compute', 'AI computing power', 'Epoch AI')],
  minerals: [{ id: 'gold', name: 'Gold', year: 2025, estimated: true, primary: false }, { id: 'lithium', name: 'Lithium', year: 2025, estimated: true, primary: false }],
  mineralSource: 'USGS Mineral Commodity Summaries 2026',
  pairs: [{ a: 'united-states', b: 'china', path: '/compare/united-states-vs-china', title: 'United States and China compared' }],
  base: '/compare/data/',
};
const mali: CountryData = {
  id: 'MLI', slug: 'mali', name: 'Mali', href: '/countries/mali',
  f: { gdp: [2.6e10, 2025], milusd: [8e8, 2024] },
  s: { gdp: [2000, [1, 2, 3, 4, 5]], milusd: [2010, [1, 2]] },
  m: { gold: 0.02, lithium: 0.004 },
};
const tuvalu: CountryData = {
  id: 'TUV', slug: 'tuvalu', name: 'Tuvalu',
  f: { gdp: [5.7e7, 2025], satellites: [1, 2025] },
  s: { gdp: [2002, [1, 2, 3, 4, 5, 6]] },
  m: {},
};

describe('Compare model', () => {
  it('shows a row only when both countries have a figure, and marks the larger', () => {
    const { rows, gaps } = compareRows(meta, [mali, tuvalu]);
    expect(rows.map((r) => r.m.id)).toEqual(['gdp']);
    expect(rows[0].higher).toBe(0);
    expect(gaps.map((g) => [g.m.id, g.lacks])).toEqual([['milusd', 1], ['satellites', 0], ['aicompute', null]]);
  });

  it('lists what could not be compared in one line, by country, with sources', () => {
    const { gaps } = compareRows(meta, [mali, tuvalu]);
    expect(COMPARE_TEXT.notCompared(gapGroups(gaps, [mali, tuvalu]))).toBe(
      'No data for Mali: satellites (source: CelesTrak); for Tuvalu: military spending (source: SIPRI); for either: AI computing power (source: Epoch AI).');
  });

  it('draws a chart only when both have the series, over the years both cover', () => {
    const charts = compareCharts(meta, [mali, tuvalu]);
    expect(charts.map((c) => c.m.id)).toEqual(['gdp']);
    expect(charts[0].years).toEqual([2002, 2003, 2004]);
    expect(charts[0].values).toEqual([[3, 4, 5], [1, 2, 3]]);
    expect(compareCharts(meta, [mali, { ...tuvalu, s: { gdp: [2004, [1, 2]] } }])).toEqual([]);
  });

  it('leaves out a chart only one country has figures for, or whose latest shared year is over 10 years old, and lists it', () => {
    const mil = { ...measure('milpct', 'Military spending, % of GDP', 'military spending as a share of GDP', 'SIPRI'), latest: 2025 };
    const m2: Meta = { ...meta, measures: [...meta.measures, mil] };
    // Laos's series ends in 2013, Bolivia's in 2025: the chart would end in 2013.
    const laos: CountryData = { ...mali, name: 'Laos', s: { ...mali.s, milpct: [2000, Array.from({ length: 14 }, () => 0.5)] } };
    const bolivia: CountryData = { ...tuvalu, name: 'Bolivia', s: { ...tuvalu.s, milpct: [2000, Array.from({ length: 26 }, () => 1.5)] } };
    const { charts, gaps } = chartsAndGaps(m2, [laos, bolivia]);
    expect(charts.map((c) => c.m.id)).toEqual(['gdp']);
    expect(gaps).toEqual([{ m: mil, ended: 2013 }]);
    expect(keyHtml(m2, [laos, bolivia])).toContain('Not drawn over time: military spending as a share of GDP (the latest year both have is 2013).');
    expect(chartsHtml(m2, [laos, bolivia])).not.toContain('over-milpct');
    // Within ten years it is drawn.
    const recent: CountryData = { ...laos, s: { ...laos.s, milpct: [2000, Array.from({ length: 16 }, () => 0.5)] } };
    expect(compareCharts(m2, [recent, bolivia]).map((c) => c.m.id)).toEqual(['gdp', 'milpct']);
    // Only one country has the series.
    expect(chartsAndGaps(m2, [mali, bolivia]).gaps).toEqual([{ m: mil, lacks: 0 }]);
    expect(keyHtml(m2, [mali, bolivia])).toContain('military spending as a share of GDP (no yearly figures for Mali)');
    // One side has the series but no value in the shared years.
    const blank: CountryData = { ...mali, s: { ...mali.s, milpct: [2018, [1, null, null, null, null, null, null]] } };
    expect(chartsAndGaps(m2, [blank, { ...bolivia, s: { ...bolivia.s, milpct: [2022, [1, 1, 1, 1]] } }]).gaps).toEqual([{ m: mil, lacks: 0 }]);
  });

  it('pairs minerals where either has 1% of world production', () => {
    expect(comparePairs(meta, [mali, tuvalu])).toEqual([{ m: meta.minerals[0], vals: [0.02, null] }]);
  });

  it('finds a static pair either way round and reads the address', () => {
    expect(staticPair(meta.pairs, 'china', 'united-states')?.path).toBe('/compare/united-states-vs-china');
    expect(pairHref(meta.pairs, '/compare', 'united-states', 'china')).toBe('/compare/united-states-vs-china');
    expect(pairHref(meta.pairs, '/compare', 'germany', 'france')).toBe('/compare?a=germany&b=france');
    expect(parsePair(new URLSearchParams('a=Germany&b=fr<ance>'))).toEqual({ a: 'germany', b: 'france' });
  });
});

describe('Compare markup', () => {
  it('names both countries with their side’s colour and marker, and the gaps under the table', () => {
    const html = keyHtml(meta, [mali, tuvalu]);
    expect(html).toContain('gt-cchip gt-cc--first');
    expect(html).toContain('gt-cchip gt-cc--second');
    expect(html).toContain('<span class="gt-cchip__col">blue</span>');
    expect(html).toContain('<b>Not available for both.</b> No data for Mali');
    expect(html.match(/<tr>/g)).toHaveLength(2);
    expect(html).not.toMatch(/gt-cc--(us|cn|ru)/);
  });

  it('dashes the second country’s line, labels both, and numbers the sections in order', () => {
    const charts = chartsHtml(meta, [mali, tuvalu]);
    expect(charts).toContain('gt-lc__line gt-cc--second gt-lc__line--dash');
    expect(charts).toContain('>Mali</text>');
    expect(charts).toContain('>Tuvalu</text>');
    expect(mineralsHtml(meta, [mali, tuvalu], 3)).toContain('<span class="gt-cpsec__n">3</span>');
    const all = compareHtml(meta, [mali, tuvalu]);
    expect([...all.matchAll(/gt-cpsec__n">(\d+)/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
  });

  it('writes each figure in its own scale, as the country page does', () => {
    const people = { ...meta, measures: [{ ...meta.measures[0], id: 'population', unit: 'people', format: { kind: 'count' as const } }] };
    const big = { ...mali, f: { population: [1.41e9, 2025] as [number, number] } };
    const small = { ...tuvalu, f: { population: [3.42e8, 2025] as [number, number] } };
    const html = keyHtml(people, [big, small]);
    expect(html).toContain('>1.41 billion<');
    expect(html).toContain('>342 million<');
    expect(html).not.toContain('<small>');
    expect(keyHtml(people, [big, { ...small, f: { population: [9492, 2025] as [number, number] } }])).toContain('>9,492<');
    const money = keyHtml(meta, [{ ...mali, f: { gdp: [3.6e12, 2025] } }, { ...tuvalu, f: { gdp: [4.27e11, 2025] } }]);
    expect(money).toContain('>US$427 billion<');
    expect(money).toContain('>US$3.60 trillion<');
  });

  it('tags a figure as the country page does', () => {
    const html = keyHtml(meta, [{ ...mali, f: { gdp: [2.6e10, 2025, 'estimate'] } }, { ...tuvalu, f: { gdp: [5.7e7, 2025] } }]);
    expect(html.match(/gt-tag--estimate/g)).toHaveLength(2);
    expect(html).toContain('>US$26.0 billion <span class="gt-tag gt-tag--estimate');
  });

  it('explains a mineral share USGS does not list, rather than a bare dash', () => {
    const html = mineralsHtml(meta, [mali, tuvalu], 3);
    expect(html).toContain('<span class="gt-vh">Not listed by USGS</span>');
    expect(html).toContain('– Not listed by USGS. USGS names the largest producers');
    expect(mineralsHtml(meta, [mali, { ...tuvalu, m: { gold: 0.03 } }], 3)).not.toContain('Not listed');
  });

  it('ends a source line on its last part: Report a correction is in the footer only', () => {
    const html = compareHtml(meta, [mali, tuvalu]);
    expect(html).not.toContain('gt-corrlink');
    expect(html).not.toMatch(/gt-source__sep" aria-hidden="true">·<\/span><\/p>/);
  });

  it('escapes names', () => {
    expect(keyHtml(meta, [{ ...mali, name: '<b>' }, tuvalu])).not.toContain('<b><b>');
  });
});

describe('Compare at build time', () => {
  it('points a grouping typed into a country box to its page', async () => {
    const { compareBlocNotes } = await import('../../src/lib/compare.ts');
    const { paths } = await import('../../src/lib/routes.ts');
    const notes = compareBlocNotes();
    const eu = notes.find((n) => n.k.includes('eu'))!;
    expect(eu.k).toContain('european union');
    expect(`${eu.before}${eu.link}${eu.after}`).toBe('Compare works for two countries. See the European Union’s page for its members and shares.');
    expect(eu.h).toBe(paths.blocs('eu'));
    const nato = notes.find((n) => n.k.includes('nato'))!;
    expect(nato.link).toBe('NATO’s page');
    expect(nato.k).toContain('north atlantic treaty organization');
    expect(notes.find((n) => n.k.includes('opec'))!.h).toBe(paths.blocs('opec'));
  });

  it('writes each country page’s figures, and the static pairs, from the snapshot', async () => {
    const { compareData, compareMeta, compareChoices } = await import('../../src/lib/compare.ts');
    const { routes } = await import('../../src/lib/routes.ts');
    const m = compareMeta();
    expect(m.pairs.map((p) => p.path)).toEqual(routes().filter((r) => r.kind === 'compare' && r.id).map((r) => r.path));
    expect(m.measures.length).toBeGreaterThan(0);
    const us = compareData('USA');
    expect(us.slug).toBe('united-states');
    expect(Object.keys(us.f).every((id) => m.measures.some((x) => x.id === id))).toBe(true);
    for (const [from, values] of Object.values(us.s)) {
      expect(from).toBeGreaterThanOrEqual(2000);
      expect(values.length).toBeGreaterThan(1);
    }
    expect(compareChoices().length).toBe(routes().filter((r) => r.kind === 'country').length);
  });

  it('registers /compare live and noindex', async () => {
    const { live } = await import('../../src/lib/routes.ts');
    expect(live('compare')).toMatchObject({ path: '/compare', indexed: false });
  });
});
