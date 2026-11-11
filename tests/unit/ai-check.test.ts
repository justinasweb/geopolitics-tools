import { describe, expect, it } from 'vitest';
import { checkDraft, readDates, readQuantities, sameFigure, strayNumbers, wordsToNumber } from '../../src/lib/ai/check.ts';
import type { Fact, FactsFile } from '../../src/lib/ai/facts.ts';

// The checker (src/lib/ai/check.ts): every number, date and country name in a draft must be in its facts file.

const fact = (f: Partial<Fact> & Pick<Fact, 'id' | 'statement'>): Fact => ({ source: 'Test source', link: 'https://example.org', date: '2026-10-01', ...f });
const file = (facts: Fact[], extra: Partial<FactsFile> = {}): FactsFile => ({ id: 'river:nile', kind: 'river', subject: 'the Nile', generated: 'by hand', countries: ['ETH', 'SDN', 'EGY'], facts, ...extra });

const nile = file([
  fact({ id: 'agreement-1959', statement: 'Egypt and Sudan signed the Agreement for the Full Utilization of the Nile Waters on 8 November 1959.', period: '1959-11-08', places: ['EGY', 'SDN'] }),
  fact({ id: 'egypt-share', statement: 'The 1959 agreement allocates Egypt 55.5 billion cubic metres a year.', value: 55.5, unit: 'billion cubic metres a year', unitAliases: ['bcm a year'], period: '1959', places: ['EGY'] }),
  fact({ id: 'gerd-capacity', statement: 'The Grand Ethiopian Renaissance Dam has an installed capacity of 5,150 megawatts.', value: 5150, unit: 'megawatts', unitAliases: ['MW'], period: '2025', places: ['ETH'] }),
  fact({ id: 'people', statement: 'Ethiopia had 1,234,567 people in the area.', value: 1234567, unit: 'people', period: '2023', places: ['ETH'] }),
  fact({ id: 'stress', statement: 'Egypt’s water stress was 47.3%.', value: 47.3, unit: '%', period: '2019–2023', places: ['EGY'] }),
  fact({ id: 'gdp', statement: 'GDP was US$27.36 trillion.', value: 27.36e12, unit: 'US$', period: '2023', places: ['ETH'] }),
  fact({ id: 'gerd-inauguration', statement: 'Ethiopia inaugurated the dam in September 2025, after the four countries met.', period: '2025-09', places: ['ETH'] }),
]);

const ok = (t: string, f = nile) => {
  const r = checkDraft(t, f);
  expect(r.problems.map((p) => p.message), t).toEqual([]);
};
const bad = (t: string, kind: string, f = nile) => {
  const r = checkDraft(t, f);
  expect(r.ok, t).toBe(false);
  expect(r.problems.map((p) => p.kind), t).toContain(kind);
};

describe('reading numbers', () => {
  it('reads digits with commas, decimals, scales and money', () => {
    const q = readQuantities('1,234,567 people, 1.2 million, $27.4 tn, US$3bn and 55.5 bcm');
    expect(q.map((x) => x.value)).toEqual([1234567, 1.2e6, 27.4e12, 3e9, 55.5]);
    expect(q.map((x) => x.money)).toEqual([false, false, true, true, false]);
  });

  it('reads numbers written as words', () => {
    expect(wordsToNumber('twenty-one')).toBe(21);
    expect(wordsToNumber('three hundred and five')).toBe(305);
    expect(wordsToNumber('two million')).toBe(2e6);
    expect(wordsToNumber('a dozen')).toBe(12);
    expect(wordsToNumber('a thousand')).toBe(1000);
    expect(wordsToNumber('river')).toBeNull();
    expect(readQuantities('Eleven groupings and thirty-two members').map((x) => x.value)).toEqual([11, 32]);
  });

  it('reads ordinals and fractions', () => {
    const q = readQuantities('the third summit, the 21st member and two-thirds of the water');
    expect(q.map((x) => [x.value, x.ordinal, x.percent])).toEqual([[3, true, false], [21, true, false], [200 / 3, false, true]]);
  });

  it('gives a range its scale and per cent at both ends', () => {
    expect(readQuantities('1.2 to 3.4 million').map((x) => x.value)).toEqual([1.2e6, 3.4e6]);
    expect(readQuantities('15–20%').map((x) => x.percent)).toEqual([true, true]);
    expect(readQuantities('between 15 and 20 percent').map((x) => x.percent)).toEqual([true, true]);
    // "and" alone is not a range.
    expect(readQuantities('15 dams and 20%').map((x) => x.percent)).toEqual([false, true]);
    // Years in a range stay years.
    expect(readQuantities('1949–2026').map((x) => x.yearLike)).toEqual([true, true]);
  });

  it('skips names with digits and metres written "m"', () => {
    expect(readQuantities('the G20, the G7 and CO2')).toEqual([]);
    const q = readQuantities('a wall 145 m high');
    expect(q.map((x) => [x.value, x.text])).toEqual([[145, '145']]);
  });

  it('does not read "one" in phrases where it is not a figure', () => {
    expect(readQuantities('one of the members and one another')).toEqual([]);
  });
});

describe('rounding', () => {
  const q = (t: string) => readQuantities(t)[0];
  it('accepts a figure rounded the way it is written, to two significant figures or more', () => {
    expect(sameFigure(q('1.2 million'), 1234567)).toBe(true);
    expect(sameFigure(q('1.23 million'), 1234567)).toBe(true);
    expect(sameFigure(q('1,234,567'), 1234567)).toBe(true);
    expect(sameFigure(q('1,230,000'), 1234567)).toBe(true);
    expect(sameFigure(q('47%'), 47.3)).toBe(true);
  });
  it('refuses wrong rounding and rounding to one significant figure', () => {
    expect(sameFigure(q('1.3 million'), 1234567)).toBe(false);
    expect(sameFigure(q('1 million'), 1234567)).toBe(false);
    expect(sameFigure(q('one million'), 1234567)).toBe(false);
    expect(sameFigure(q('1,234,568'), 1234567)).toBe(false);
    expect(sameFigure(q('50%'), 47.3)).toBe(false);
    expect(sameFigure(q('48%'), 47.3)).toBe(false);
  });
  it('accepts an exact figure however it is written', () => {
    expect(sameFigure(q('five'), 5)).toBe(true);
    expect(sameFigure(q('50%'), 50)).toBe(true);
  });
});

describe('reading dates', () => {
  it('reads days, months, ISO dates and decades', () => {
    const d = readDates('On 6 June 2023, in June 2023, on 2023-06-06, on November 8, 1959, in the 1990s and 2024-07.');
    expect(d.map((x) => x.day ?? x.month ?? x.decade)).toEqual(['2023-06-06', '2023-06', '2023-06-06', '1959-11-08', 1990, '2024-07']);
  });
});

describe('checkDraft', () => {
  it('passes a draft that says only what the facts say', () => {
    ok('Egypt and Sudan signed an agreement on 8 November 1959. It allocates Egypt 55.5 billion cubic metres a year (1959).');
    ok('The Grand Ethiopian Renaissance Dam has a capacity of 5,150 MW (2025). Ethiopia inaugurated it in September 2025.');
    ok('About 1.2 million people lived in Ethiopia’s part of the area in 2023.');
    ok('Egypt’s water stress was 47% in 2019–2023.');
    ok('GDP was $27.4 trillion in 2023.');
    ok('After the four countries met, Ethiopia inaugurated the dam in 2025.');
  });

  it('accepts a figure written with a unit alias or the unit’s words in another order', () => {
    ok('In 1959 Egypt was allocated 55.5 bcm a year.');
    ok('The 1959 agreement allocates 55.5 billion cubic metres of water a year to Egypt.');
  });

  it('refuses a number that is not in the facts', () => {
    bad('The agreement allocates Egypt 57 billion cubic metres a year (1959).', 'number');
    // 56 is 55.5 rounded to two significant figures, which is allowed.
    ok('The agreement allocates Egypt 56 billion cubic metres a year (1959).');
    bad('About 1.3 million people lived there in 2023.', 'number');
    bad('About one million people lived there in 2023.', 'number');
    bad('The dam has 16 turbines.', 'number');
    bad('Egypt’s water stress was 50% in 2019–2023.', 'number');
  });

  it('refuses a number without its unit or period in the sentence', () => {
    bad('Egypt was allocated 55.5 (1959).', 'number');
    bad('Egypt was allocated 55.5 billion cubic metres a year.', 'number');
    bad('Egypt’s water stress was 47.3% in 2023.', 'number');
  });

  it('keeps percentages and money apart from plain numbers', () => {
    bad('Egypt’s water stress was 47.3 in 2019–2023.', 'number');
    bad('There were 27.36 trillion people in 2023.', 'number');
    bad('The dam cost $5,150 in 2025.', 'number');
  });

  it('refuses numbers written as words when they are not facts', () => {
    bad('Three countries share the river.', 'number');
    bad('Ethiopia built the dam over twelve years.', 'number');
    ok('The four countries met before Ethiopia inaugurated the dam in 2025.');
  });

  it('checks both ends of a range', () => {
    const f = file([fact({ id: 'hhi-low', statement: 'Moderate concentration starts at 1,000.', value: 1000, unit: '' }), fact({ id: 'hhi-high', statement: 'High concentration starts above 1,800.', value: 1800, unit: '' })]);
    ok('Between 1,000 and 1,800 counts as moderately concentrated.', f);
    bad('Between 1,000 and 2,000 counts as moderately concentrated.', 'number', f);
    const pct = file([fact({ id: 'lo', statement: 'The lower bound is 15%.', value: 15, unit: '%' }), fact({ id: 'hi', statement: 'The upper bound is 50%.', value: 50, unit: '%' })]);
    ok('Imports some: 15–50%.', pct);
    bad('Imports some: 15–60%.', 'number', pct);
  });

  it('refuses dates and years the facts do not have', () => {
    bad('Egypt and Sudan signed it on 9 November 1959.', 'date');
    bad('Ethiopia inaugurated the dam in October 2025.', 'date');
    bad('The dam opened in 2024.', 'date');
    bad('Talks began in the 1980s.', 'date');
    ok('The agreement dates from the 1950s.');
  });

  it('refuses ordinals the facts do not have', () => {
    bad('Egypt was the third country to sign, in 1959.', 'number');
    const f = file([fact({ id: 'summit', statement: 'Brazil, Russia, India and China held the first summit in 2009.', period: '2009', places: ['BRA', 'RUS', 'IND', 'CHN'] })], { id: 'history:brics', kind: 'history', countries: [] });
    ok('Brazil, Russia, India and China held the first summit in 2009.', f);
    bad('Brazil, Russia, India and China held the second summit in 2009.', 'number', f);
  });

  it('refuses country names the facts do not name, by name, alias or demonym', () => {
    bad('Egypt and Israel signed it on 8 November 1959.', 'country');
    bad('Turkey was not part of the 1959 agreement.', 'country');
    bad('The US was not part of the 1959 agreement.', 'country');
    bad('A Chinese company built the dam in 2025.', 'country');
    bad('South Sudan was not part of it in 1959.', 'country');
  });

  it('reads the longest name first and accepts aliases of allowed places', () => {
    const f = file([fact({ id: 'x', statement: 'South Sudan and Türkiye.', places: ['SSD', 'TUR'] })], { countries: [] });
    ok('South Sudan and Turkey.', f);
    bad('Sudan and Turkey.', 'country', f);
    const us = file([fact({ id: 'x', statement: 'The United States.', places: ['USA'] })], { countries: [] });
    ok('The United States, the US and American firms.', us);
    ok('Some of us went to South America.', us);
  });

  it('asks for the full name when a name could be two countries', () => {
    const f = file([fact({ id: 'x', statement: 'Republic of the Congo.', places: ['COG'] })]);
    bad('Congo joined.', 'country', f);
    ok('The Republic of the Congo joined.', f);
  });

  it('accepts names the facts file allows that are not countries', () => {
    const f = file([fact({ id: 'x', statement: 'West Germany joined in 1955.', period: '1955', places: ['DEU', 'XWG'] })], { names: ['NATO'] });
    ok('West Germany joined NATO in 1955.', f);
    bad('East Germany joined NATO in 1955.', 'country', f);
  });

  it('refuses comparisons and words the site does not use', () => {
    bad('Egypt’s allocation doubled in 1959.', 'comparison');
    bad('The dam will change the river.', 'style');
    bad('Ethiopia is the dominant country on the river.', 'style');
    bad('Egypt is vulnerable to changes upstream.', 'style');
  });

  it('refuses drafts that talk about the facts or the summary itself', () => {
    bad('According to the facts, Egypt and Sudan signed an agreement on 8 November 1959.', 'style');
    bad('The facts record no departures.', 'style');
    bad('This summary covers the agreement Egypt and Sudan signed on 8 November 1959.', 'style');
    bad('As This Summary shows, Egypt and Sudan signed an agreement on 8 November 1959.', 'style');
    ok('Egypt and Sudan signed an agreement on 8 November 1959.');
  });

  it('reads Markdown and HTML as plain text', () => {
    ok('## The 1959 agreement\n\nEgypt and Sudan signed [an agreement](https://example.org/2024/77) on **8 November 1959**.');
    bad('| Year | Note |\n| --- | --- |\n| 1960 | Something |', 'date');
  });

  it('flags numbers in a statement that should be facts of their own', () => {
    expect(strayNumbers(fact({ id: 'x', statement: 'The dam holds 74 billion cubic metres and has 5,150 MW.', value: 5150, unit: 'MW' }))).toEqual(['74 billion']);
    expect(strayNumbers(fact({ id: 'x', statement: 'Signed on 8 November 1959 by the two countries.' }))).toEqual([]);
  });
});

describe('the owner’s own words', () => {
  const words = 'The site is run by [A. Person](https://example.org), who lives in Lithuania and wrote this in 2026.';
  const about = file([
    fact({ id: 'site', statement: 'The site shows figures from official sources.' }),
    fact({ id: 'owner-who', statement: words, owner: true }),
  ], { id: 'page:about', kind: 'page', subject: 'About', countries: [] });

  it('pass word for word between the markers, and are not read as a draft', () => {
    ok(`## Who runs it\n\n<!-- owner -->\n${words}\n<!-- /owner -->\n\nThe site shows figures from official sources.`, about);
  });

  it('fail when missing, changed or unmarked', () => {
    bad('The site shows figures from official sources.', 'owner', about);
    bad(`<!-- owner -->\n${words.replace('wrote', 'made')}\n<!-- /owner -->`, 'owner', about);
    bad(words, 'owner', about);
  });

  it('fail when the draft marks its own words as the owner’s', () => {
    bad(`<!-- owner -->\n${words}\n<!-- /owner -->\n<!-- owner -->\nThe site shows figures.\n<!-- /owner -->`, 'owner', about);
  });
});

describe('ranges of days', () => {
  const week = file([fact({ id: 'week', statement: 'This summary covers ISO week 45 of 2026, from 2 November 2026 to 8 November 2026.', value: 45, unit: 'week' })], { countries: [] });
  it('take both ends from the facts, with or without the year', () => {
    expect(readDates('in the week of 2–8 November')[0]).toMatchObject({ days: ['-11-02', '-11-08'] });
    ok('No entries were removed in the week of 2–8 November.', week);
    ok('No entries were removed in the week of 2–8 November 2026.', week);
    bad('No entries were removed in the week of 2–9 November.', 'date', week);
    bad('No entries were removed in the week of 2–8 November 2025.', 'date', week);
  });
});

describe('tagged figures', () => {
  const tagged = file([
    fact({ id: 'exports-oil', statement: 'The United States’ net exports of oil as a share of its production (preliminary).', value: 12.6, unit: '%', unitAliases: ['oil production'], period: '2025', places: ['USA'], status: 'preliminary' }),
  ], { id: 'dossier:USA', kind: 'dossier', subject: 'the United States', countries: ['USA'] });

  it('wants the sentence that gives a preliminary or estimated figure to say so', () => {
    bad('In 2025, net exports were 12.6% of oil production (EIA, 2025).', 'status', tagged);
    ok('In 2025, net exports were 12.6% of oil production (EIA, 2025, preliminary).', tagged);
  });
});
