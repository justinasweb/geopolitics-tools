import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Terms and labels from the outside wording review of 11 Nov 2026.
process.env.GT_DATA = 'sample';

const methodology = readFileSync(new URL('../../src/content/pages/methodology.md', import.meta.url), 'utf8');

describe('dependence labels', () => {
  it('call the middle band "Low net trade", with cut-offs that do not overlap, in the tags, legend and Methodology', async () => {
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    const { DEPS_TEXT } = await import('../../src/i18n/dependencies.en.ts');
    const { bandOf } = await import('../../src/lib/dependencies/model.ts');
    expect(DEP_TEXT.tags.self).toBe('Low net trade');
    expect(DEPS_TEXT.bands).toContain('Low net trade (−15% to under 15%)');
    expect(DEPS_TEXT.bands.join(' ')).not.toMatch(/self-sufficient|\d–\d/);
    expect(bandOf('wheat', { v: -0.15 })).toBe(4);
    expect(bandOf('wheat', { v: 0.15 })).toBe(3);
    expect(methodology).toMatch(/\| −15% to under 15% \| Low net trade \|/);
    expect(methodology).not.toMatch(/self-sufficient|usually transit/);
    expect(methodology).toMatch(/Goods passing through, or changes in stocks, can cause this; the data do not show which\./);
  });

  it('define net imports beside every dependence share', async () => {
    const def = 'imports minus exports, as a share of what the country uses';
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    const { DEPS_TEXT } = await import('../../src/i18n/dependencies.en.ts');
    const { HOME_TEXT } = await import('../../src/i18n/home.en.ts');
    expect(DEP_TEXT.caption).toContain(def);
    expect(DEPS_TEXT.definition).toContain(def);
    expect(HOME_TEXT.gas.net('Hungary', '80%', 2024, true)).toContain(`Net imports: ${def}.`);
  });
});

describe('SIPRI and military spending', () => {
  it('say what TIV is beside SIPRI shares and totals', async () => {
    const { TIV_NOTE, ARMS_TEXT } = await import('../../src/i18n/arms.en.ts');
    const { VIEW_TEXT } = await import('../../src/i18n/views.en.ts');
    const { ANSWER, COMPARE_TEXT, DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(TIV_NOTE).toBe('SIPRI’s measure of military capability delivered, not price or number of weapons');
    for (const s of [ARMS_TEXT.partnersCaption(false), ARMS_TEXT.largestCaption(20, '2021–2025'), VIEW_TEXT.arms.layers.armsimp5.caveat!,
      VIEW_TEXT.arms.layers.armsexp5.total!('1,000', 2025), ANSWER.armsexp.caveats![0], COMPARE_TEXT.measureNote.armsimp, DEP_TEXT.caption]) expect(s).toContain(TIV_NOTE);
    expect(methodology).toContain('not price or number of weapons');
  });

  it('give military spending in each year’s dollars, among places with a figure', async () => {
    const { ANSWER, DEFINITION } = await import('../../src/i18n/pages.en.ts');
    expect(ANSWER.milusd.sentence!('the United States', 'US$997 billion', 'The United States', 2025))
      .toBe('In 2025, among places with a 2025 figure, the United States spent the most on its military: US$997 billion, in 2025 US dollars, not adjusted for inflation.');
    expect(DEFINITION.milusd).not.toMatch(/current US/);
  });
});

describe('CO2, tables and water stress', () => {
  it('say "from fossil fuels and cement" in the leads, and title indicator tables for countries and territories', async () => {
    const { VIEW_TEXT, VIEWS_TEXT } = await import('../../src/i18n/views.en.ts');
    const { ANSWER, INDICATOR_PAGE, DOSSIER_TEXT } = await import('../../src/i18n/pages.en.ts');
    const co2 = VIEW_TEXT.emissions.layers;
    expect(co2.co2pc.lede!({ topIn: 'Qatar', value: '37 t', world: '4.7 t', year: 2024 } as never)).toContain('from fossil fuels and cement');
    expect(co2.co2.bloc!('eu', '6%', 2024)).toContain('from fossil fuels and cement');
    for (const id of ['co2', 'co2pc', 'co2cum']) expect(ANSWER[id].verb).toContain('from fossil fuels and cement');
    expect(DOSSIER_TEXT.climateFind('China', '12,000 Mt', 2024)).toContain('from fossil fuels and cement');
    expect(VIEWS_TEXT.table).toBe('Countries and territories with data');
    expect(INDICATOR_PAGE.ranked).toBe('Countries and territories with data, ranked');
  });

  it('name Aqueduct’s highest category and its baseline period', async () => {
    const { VIEW_TEXT } = await import('../../src/i18n/views.en.ts');
    const { RIVERS_TEXT } = await import('../../src/i18n/water.en.ts');
    const ws = VIEW_TEXT.water.layers.waterstress;
    expect(ws.lede!({ up: 25, of: 160 } as never)).toBe('25 of 160 countries are in WRI Aqueduct’s highest water-stress category (withdrawals above 80% of renewable supply), on its baseline for 1979–2019.');
    expect(ws.pick).toBe('Baseline, 1979–2019');
    expect(RIVERS_TEXT.countriesCaption('Nile')).not.toMatch(/stress now/);
    expect(RIVERS_TEXT.countriesCaption('Nile')).toContain('1979–2019');
  });
});

describe('rivers and membership histories', () => {
  it('give each lede figure its source, and the Indus page its basin and dispute', async () => {
    const { RIVERS_TEXT } = await import('../../src/i18n/water.en.ts');
    expect(RIVERS_TEXT.lede('nile', 'Nile', 'Ethiopia, Sudan and Egypt', 12, 'Egypt', '98%', 2023))
      .toBe('The countries in the dispute over the Nile are Ethiopia, Sudan and Egypt. Across Egypt, 98% of renewable water comes from other countries (FAO AQUASTAT, 2023); Global Dam Watch lists 12 large dams on the river and its main tributaries in these countries.');
    expect(RIVERS_TEXT.lede('indus', 'Indus', 'China, India, Afghanistan and Pakistan', 0, 'Pakistan', '78%', 2023))
      .toMatch(/^This page shows the basin in China, India, Afghanistan and Pakistan; the Indus Waters Treaty dispute is between India and Pakistan\. Across Pakistan/);
  });

  it('call them membership histories, explain the integrated military command and write West Germany before 1990', async () => {
    const { HISTORY_TEXT, HISTORY_EVENTS, THEN_NAMES } = await import('../../src/i18n/blocs.en.ts');
    const { NAV_TEXT } = await import('../../src/i18n/en.ts');
    expect(HISTORY_TEXT.section).toBe('Membership history');
    expect(NAV_TEXT.views['alliance-history'][0]).toBe('Membership history');
    expect(HISTORY_EVENTS.nato[1966]).toMatch(/integrated military command, the joint command of the members’ forces/);
    expect(HISTORY_EVENTS.nato[2009]).toBe('France returned to NATO’s integrated military command.');
    expect(THEN_NAMES.DEU).toEqual({ before: 1990, name: 'West Germany' });
  });
});
