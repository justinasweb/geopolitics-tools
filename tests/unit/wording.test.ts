import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Neutral wording: no judging adjectives in the words the site shows. Comments may name the banned words (to ban
// them), so only code lines are checked.
const DIR = 'src/i18n';
const JUDGING = /\b(dominat\w*|dominan\w*|vulnerab\w*)/i;

describe('interface words', () => {
  it('never call a country dominant or vulnerable', () => {
    const found: string[] = [];
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.ts'))) {
      readFileSync(`${DIR}/${f}`, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').trim();
        if (/^(\*|\/\*)/.test(code)) return;
        if (JUDGING.test(code)) found.push(`${f}:${i + 1}: ${code}`);
      });
    }
    expect(found).toEqual([]);
  });
});

describe('Compare source lines', () => {
  it('give one year when both figures share it, else each country its own year', async () => {
    const { COMPARE_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(COMPARE_TEXT.sourceYear('World Bank', [{ name: 'United States', year: 2024 }, { name: 'China', year: 2024 }])).toBe('World Bank, 2024');
    expect(COMPARE_TEXT.sourceYear('World Bank', [{ name: 'United States', year: 2024 }, { name: 'China', year: 2023 }])).toBe('United States: 2024; China: 2023 · World Bank');
    expect(COMPARE_TEXT.sourceYear('SIPRI', [{ name: 'China', year: 2023 }])).toBe('SIPRI, 2023');
  });
});

describe('the 65-and-over caption', () => {
  it('says Projection, medium variant for a year after the UN’s last estimate year, as the population chart does', async () => {
    const { DOSSIER_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(DOSSIER_TEXT.aged65Caption(2023, 2023, 'UN WPP')).toBe('2023 · UN WPP');
    expect(DOSSIER_TEXT.aged65Caption(2025, 2023, 'UN WPP')).toBe('2025, Projection, medium variant · UN WPP');
  });
});

describe('counts of one', () => {
  it('take the singular', async () => {
    const { CYBER_TEXT } = await import('../../src/i18n/cyber.en.ts');
    const { COUNTRY_TEXT } = await import('../../src/i18n/pages.en.ts');
    const { BLOCS_TEXT } = await import('../../src/i18n/blocs.en.ts');
    const { NUCLEAR_TEXT } = await import('../../src/i18n/nuclear.en.ts');
    const { EXPLORER_TEXT } = await import('../../src/i18n/explorer.en.ts');
    const { OVERLAP_TEXT } = await import('../../src/i18n/overlap.en.ts');
    const { QUAKES_TEXT } = await import('../../src/i18n/disasters.en.ts').then((m) => ({ QUAKES_TEXT: Object.values(m).find((x) => typeof x === 'object' && x && 'quakeCaption' in x) as { quakeCaption: (n: number, t: number) => string } }));
    expect(CYBER_TEXT.split({ state: 1, affiliated: 0, group: 2, none: 1 }, String)).toBe('Of these, 1 was attributed to a state, 0 only to groups EuRepoC links to a state, 2 only to other non-state groups, and 1 was not attributed.');
    expect(CYBER_TEXT.split({ state: 3, affiliated: 0, group: 0, none: 2 }, String)).toMatch(/^Of these, 3 were attributed .* and 2 were not attributed\.$/);
    expect(COUNTRY_TEXT.allFind('Niue', 1)).toBe('1 measure on this site has a recent figure for Niue.');
    expect(COUNTRY_TEXT.fewBody('Niue', 1, 30)).toMatch(/^1 of the 30 sources this site uses has figures for Niue\./);
    expect(BLOCS_TEXT.overlapLine('nato', 'NATO', 1, 32, 'the SCO')).toBe('1 of the 32 NATO members is also in the SCO.');
    expect(NUCLEAR_TEXT.treatyBloc('NATO', 1, 32)).toBe('1 of 32 NATO members is party to both treaties.');
    expect(NUCLEAR_TEXT.sharingBloc('SCO', 1, 10)).toBe('1 of 10 SCO members hosts weapons or is covered by a guarantee.');
    expect(NUCLEAR_TEXT.treatyLede(191, 73, 1)).toMatch(/and 1 more has signed it\.$/);
    expect(EXPLORER_TEXT.dropped(1)).toBe(' 1 with a zero or negative value is left off the log scale.');
    expect(OVERLAP_TEXT.phoneNote(1)).toBe('1 more country in these blocs.');
    expect(QUAKES_TEXT.quakeCaption(1, 1)).toBe('The one earthquake of magnitude 5.5 and over, by magnitude.');
    expect(QUAKES_TEXT.quakeCaption(1, 4)).toBe('The largest of 4 earthquakes of magnitude 5.5 and over, by magnitude.');
    expect(QUAKES_TEXT.quakeCaption(10, 40)).toBe('The 10 largest of 40 earthquakes of magnitude 5.5 and over, by magnitude.');
  });
});

describe('year-on-year changes', () => {
  it('read "than in {year}"', async () => {
    const texts = [(await import('../../src/i18n/food.en.ts')).FOOD_TEXT.change2, (await import('../../src/i18n/energy.en.ts')).ENERGY_TEXT.change2,
      (await import('../../src/i18n/views.en.ts')).VIEWS_TEXT.change2, (await import('../../src/i18n/map.en.ts')).MINERALS_VIEW.change];
    for (const f of texts) expect(f('4%', true, 2023, '12 Mt')).toBe('4% more than in 2023 (12 Mt)');
  });
});

describe('place names in sentences', () => {
  it('take "the" where the name needs it, and not for Vatican City', async () => {
    const { inSentence, DOSSIER_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(inSentence('Vatican City')).toBe('Vatican City');
    expect(inSentence('Vatican')).toBe('the Vatican');
    expect(DOSSIER_TEXT.moneyFind(inSentence('United States', true), '$30 trillion', 2024)).toBe('The United States’ economy produced $30 trillion in 2024.');
    expect(DOSSIER_TEXT.peopleFind(inSentence('Netherlands', true), '18 million', 2024)).toBe('The Netherlands had 18 million people in 2024.');
  });
});

describe('the Herfindahl note on mineral pages', () => {
  it('says what the index measures, on the 0 to 10,000 scale the site uses', async () => {
    const { MINERALS_VIEW } = await import('../../src/i18n/map.en.ts');
    expect(MINERALS_VIEW.concNote('2,500')).toContain('A measure of how concentrated production is: the sum of each country’s squared share, from near 0 (spread out) to 10,000 (one country).');
  });
});
