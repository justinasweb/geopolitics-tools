import { describe, expect, it } from 'vitest';
import { decode, distance, fold, marks, nearest, search, type WireIndex } from '../../src/lib/search-match.ts';

// Site search: folding and marking, the matching rules on a small index of our own, then the index the build makes
// from the sample files (live pages only, other names from the territory table).
process.env.GT_DATA = 'sample';

const wire: WireIndex = {
  g: ['countries', 'maps', 'measures', 'places', 'blocs', 'tools', 'pages'],
  e: [
    ['Myanmar', 0, 'Country page', '/countries/myanmar', 'Burma', 'MM MMR', 'MMR'],
    ['Türkiye', 0, 'Country page', '/countries/turkiye', 'Turkey', 'TR TUR', 'TUR'],
    ['Germany', 0, 'Country page', '/countries/germany', '', 'DE DEU', 'DEU'],
    ['Lithuania', 0, 'Country page', '/countries/lithuania', '', 'LT LTU', 'LTU'],
    ['United States', 0, 'Country page', '/countries/united-states', 'USA|United States of America', 'US USA', 'USA'],
    ['Lithium', 1, 'Resources · Critical minerals', '/minerals/lithium', 'Critical minerals', '', ''],
    ['Wheat use', 1, 'Resources · Food and fertiliser', '/food/wheat/use', 'Food and fertiliser', '', ''],
    ['US sanctions listings', 1, 'Power and alliances · Sanctions', '/sanctions/us', 'Sanctions', '', ''],
    ['Military spending', 2, 'Indicator ranking', '/indicators/military-spending', 'defence|defense', '', ''],
    ['Nile', 3, 'Disputed river', '/water/rivers/nile', 'river', '', ''],
    ['NATO', 4, 'North Atlantic Treaty Organization', '/blocs/nato', 'North Atlantic Treaty Organization', 'nato', 'DEU TUR USA LTU'],
    ['NATO', 4, 'Membership history', '/blocs/nato/history', 'history|Membership history', '', ''],
    ['European Union', 4, 'Grouping', '/blocs/eu', '', 'eu', 'DEU LTU'],
  ],
  t: [['Germany', '/countries/germany'], ['lithium', '/minerals/lithium']],
};
const index = decode(wire);
const names = (q: string) => search(index, q, 5, (c) => `${c} is a member`).groups.flatMap((g) => g.entries.map((e) => `${e.name} ${e.path}`));

describe('site search: matching', () => {
  it('folds accents, apostrophes and punctuation', () => {
    expect(fold('Côte d’Ivoire')).toBe('cote divoire');
    expect(fold("  Korea, Dem. People's Rep. ")).toBe('korea dem peoples rep');
    expect(fold('Türkiye')).toBe('turkiye');
  });

  it('marks the typed words where they start a word, in the name as written', () => {
    expect(marks('Türkiye', 'tur')).toEqual([[0, 3]]);
    expect(marks('CO2 emissions per person', 'per em')).toEqual([[4, 6], [14, 17]]);
    expect(marks('Germany', 'many')).toEqual([]);
  });

  it('finds a country by another name, with or without accents, and by its ISO codes typed whole', () => {
    expect(names('Burma')[0]).toBe('Myanmar /countries/myanmar');
    expect(names('turkey')[0]).toBe('Türkiye /countries/turkiye');
    expect(names('turkiye')[0]).toBe('Türkiye /countries/turkiye');
    expect(names('Türkiye')[0]).toBe('Türkiye /countries/turkiye');
    expect(names('DEU')[0]).toBe('Germany /countries/germany');
    expect(names('de')[0]).toBe('Germany /countries/germany');
    expect(names('mm')[0]).toBe('Myanmar /countries/myanmar');
    // A code is not matched by its start: "mmx" is not Myanmar's "MMR".
    expect(names('mmx')).toEqual([]);
  });

  it('matches one or two letters only at the start of a name, so "us" is not every page with "use" in it', () => {
    expect(names('us')).toContain('United States /countries/united-states');
    expect(names('us')).toContain('US sanctions listings /sanctions/us');
    expect(names('us')).not.toContain('Wheat use /food/wheat/use');
    expect(names('use')).toContain('Wheat use /food/wheat/use');
  });

  it('groups results, the group with the best match first, and keeps the names a page goes by', () => {
    const r = search(index, 'lith');
    expect(r.groups.map((g) => g.id)).toEqual(['countries', 'maps']);
    expect(search(index, 'defence').groups[0].entries[0].name).toBe('Military spending');
    expect(search(index, 'nato history').groups[0].entries.map((e) => e.path)).toEqual(['/blocs/nato/history']);
    expect(search(index, 'eu').groups[0].entries[0].path).toBe('/blocs/eu');
  });

  it("follows a country typed in full with the blocs it is a member of, and not a name that also starts something else", () => {
    const blocs = search(index, 'germany', 5, (c) => `${c} is a member`).groups.find((g) => g.id === 'blocs')!;
    expect(blocs.entries.map((e) => `${e.path} ${e.detail}`)).toEqual(['/blocs/nato Germany is a member', '/blocs/eu Germany is a member']);
    expect(search(index, 'lith', 5, (c) => c).groups.some((g) => g.id === 'blocs')).toBe(false);
  });

  it('shows the nearest name for a typo, by its own name, and nothing for nonsense', () => {
    const r = search(index, 'germny');
    expect(r.corrected).toBe('Germany');
    expect(r.groups[0].entries[0].name).toBe('Germany');
    expect(search(index, 'burmaa').corrected).toBe('Myanmar');
    expect(search(index, 'qwrty')).toEqual({ groups: [], total: 0 });
    expect(nearest(index, 'zzzz')).toBeUndefined();
  });

  it('searches the words that match when several match nothing together, and says nothing matches only when no word does', () => {
    const withUkraine = decode({ ...wire, e: [...wire.e, ['Ukraine', 0, 'Country page', '/countries/ukraine', '', 'UA UKR', 'UKR']] });
    const r = search(withUkraine, 'ukraine war');
    expect(r.partial).toBe('Ukraine');
    expect(r.groups[0].entries[0].path).toBe('/countries/ukraine');
    // The line names the words kept when they are not one page's name.
    expect(search(index, 'military zzz').partial).toBe('military');
    expect(search(index, 'nile qqq').groups[0].entries[0].name).toBe('Nile');
    // Words that match on their own but not together: the first of them.
    const two = search(index, 'germany lithium zzz');
    expect(two.partial).toBe('Germany');
    expect(two.groups[0].entries[0].name).toBe('Germany');
    // No word matches: nothing, and no partial line.
    expect(search(index, 'zzzz qqqq')).toEqual({ groups: [], total: 0 });
  });

  it('counts a swap of two letters as one edit', () => {
    expect(distance('indai', 'india')).toBe(1);
    expect(distance('germny', 'germany')).toBe(1);
    expect(distance('abc', 'xyz', 1)).toBeGreaterThan(1);
  });

  it('cuts each group to its best few, and says how many there were', () => {
    const many: WireIndex = { ...wire, e: Array.from({ length: 20 }, (_, i) => [`Wheat ${i}`, 1, '', `/w/${i}`, '', '', ''] as WireIndex['e'][number]).concat([['Wheat', 5, '', '/sc/wheat', '', '', '']]) };
    const r = search(decode(many), 'wheat', 5);
    expect(r.groups.map((g) => [g.id, g.entries.length, g.total])).toEqual([['tools', 1, 1], ['maps', 5, 20]]);
    // One group alone shows more.
    expect(search(decode({ ...many, e: many.e.slice(0, 20) }), 'wheat', 5).groups[0].entries.length).toBe(12);
  });
});

// The first test builds the index from every data file, which takes a few seconds while the other test files run.
describe('site search: the index', { timeout: 30_000 }, () => {
  it('lists only live pages, each name and address once, in known groups', async () => {
    const { searchIndex } = await import('../../src/lib/search.ts');
    const { routes } = await import('../../src/lib/routes.ts');
    const live = new Set(routes().filter((r) => r.live).map((r) => r.path));
    const w = searchIndex();
    expect(w.e.length).toBeGreaterThan(50);
    for (const [name, g, , path] of w.e) {
      expect(live.has(path), `${name} ${path}`).toBe(true);
      expect(w.g[g]).toBeDefined();
    }
    expect(new Set(w.e.map(([n, , , p]) => `${n} ${p}`)).size).toBe(w.e.length);
    for (const [, path] of w.t) expect(live.has(path)).toBe(true);
    // No page that is not live: every hidden route stays out.
    const hidden = new Set(routes().filter((r) => !r.live).map((r) => r.path));
    for (const [, , , path] of w.e) expect(hidden.has(path) && !live.has(path)).toBe(false);
  });

  it('gives countries their other names from the territory table, never one naming another place', async () => {
    const { otherNames, blocFullName } = await import('../../src/lib/search.ts');
    expect(otherNames('MMR')).toContain('Burma');
    expect(otherNames('TUR')).toContain('Turkey');
    expect(otherNames('CIV')).toContain('Ivory Coast');
    expect(otherNames('TWN').some((n) => /china/i.test(n))).toBe(false);
    expect(otherNames('COD')).toContain('Congo (Kinshasa)');
    expect(blocFullName('nato')).toBe('North Atlantic Treaty Organization');
    expect(blocFullName('brics')).toBeUndefined();
  });

  it('stays small: under 25 kB gzipped', async () => {
    const { gzipSync } = await import('node:zlib');
    const { searchIndex } = await import('../../src/lib/search.ts');
    expect(gzipSync(JSON.stringify(searchIndex())).length).toBeLessThan(25_000);
  });
});

describe('pages not on the site yet', () => {
  const soon = decode({ ...wire, s: [['Chokepoints aren’t on the site yet.', 'Chokepoints|Strait of Hormuz|Hormuz|Suez Canal|Suez|Panama Canal'], ['Ports aren’t on the site yet.', 'Ports|port|harbour']] });
  it('answer that they are not here yet, instead of a spelling hint', () => {
    expect(search(soon, 'Hormuz')).toMatchObject({ total: 0, soon: 'Chokepoints aren’t on the site yet.' });
    expect(search(soon, 'strait of hormuz').soon).toBe('Chokepoints aren’t on the site yet.');
    expect(search(soon, 'ports').soon).toBe('Ports aren’t on the site yet.');
    expect(search(soon, 'Hormuz').corrected).toBeUndefined();
  });
  it('never hide a live page', () => {
    // "Germany" is live; nothing about chokepoints is said.
    expect(search(soon, 'Germany').soon).toBeUndefined();
    expect(search(soon, 'Germany').total).toBeGreaterThan(0);
  });
});
