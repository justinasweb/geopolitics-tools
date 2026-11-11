import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Dam } from '../../src/adapters/water.ts';

// Wording from the outside review of 10 Nov 2026: each figure says only what its source measures, with its status.
process.env.GT_DATA = 'sample';

const dam = (id: string, name: string, river: string, capacity = 18180): Dam =>
  ({ id, name, river, basin: '', place: 'UKR', year: 1955, height: null, capacity, use: '', lon: 0, lat: 0, status: 'Operating' });

describe('river pages', () => {
  it('label the panel’s bars as national water stress, never a function’s text', async () => {
    const { RIVERS_TEXT } = await import('../../src/i18n/water.en.ts');
    expect(RIVERS_TEXT.stressBars).toBe('National water stress (WRI Aqueduct baseline), 0–5: the basin can differ');
    expect(RIVERS_TEXT.damsTitle).toBe('Dams in Global Dam Watch');
    expect(readFileSync('src/templates/RiverView.astro', 'utf8')).not.toMatch(/\{R\.stress\}/);
  });

  it('mark Kakhovka as destroyed, write Dnipro dams in the page’s spellings and name GDW’s in a note', async () => {
    const { shownDam, capacityText, gdwNamesNote } = await import('../../src/lib/dams.ts');
    const k = shownDam(dam('4376', 'Kakhovskaya', 'Dniepr'));
    expect([k.name, k.river, k.gdwName]).toEqual(['Kakhovka', 'Dnipro', 'Kakhovskaya']);
    expect(capacityText(k)).toBe('18.2 km³ (destroyed June 2023; former reservoir capacity)');
    const kyiv = shownDam(dam('4368', 'Kiev', 'Dniepr', 3730));
    expect(capacityText(kyiv)).toBe('3.7 km³');
    expect(gdwNamesNote([k, kyiv])).toBe('Names in this site’s spellings, with Global Dam Watch’s in brackets: Kakhovka (Kakhovskaya), Kyiv (Kiev), river Dnipro (Dniepr).');
    expect(gdwNamesNote([shownDam(dam('1', 'Tarbela', 'Indus'))])).toBeNull();
  });
});

describe('Chinese loans and grants', () => {
  it('say China committed them, never that a country received them', async () => {
    const { VIEW_TEXT } = await import('../../src/i18n/views.en.ts');
    const f = VIEW_TEXT['chinese-lending'];
    expect(f.section).toBe('Chinese loans and grants');
    for (const [id, l] of Object.entries(f.layers)) {
      const s = l.lede({ top: 'Russia', topIn: 'Russia', value: '$170 bn', share: '12%', top3: '30%', year: 2021 });
      expect(s, id).toMatch(/^China committed \$170 bn .*to Russia between 2000 and 2021/);
      expect(`${s} ${l.title} ${l.bloc?.('BRICS', '10%', 2021)}`, id).not.toMatch(/receiv|Chinese lending|went to/);
    }
    const { INDICATOR_TEXT } = await import('../../src/i18n/en.ts');
    expect(INDICATOR_TEXT.chinaloans.label).not.toMatch(/received/);
  });
});

describe('sanctions', () => {
  it('count list entries that give a place as an address or nationality, not sanctions on countries', async () => {
    const { VIEW_TEXT } = await import('../../src/i18n/views.en.ts');
    const s = VIEW_TEXT.sanctions.layers.sanctions.lede({ top: 'Russia', topIn: 'Russia', value: '9,017', share: '31%', year: 2026 });
    expect(s).toMatch(/9,017 entries on the US, EU and UK sanctions lists give Russia as an address or nationality \(counts entries, not how strict the measures are\)/);
    const { ANSWER } = await import('../../src/i18n/pages.en.ts');
    expect(ANSWER.sanctions.sentence!('Russia', '9,017', 'Russia')).toMatch(/^9,017 list entries give Russia as an address or nationality.*\(counts entries, not how strict the measures are\)\.$/);
  });
});

describe('BRICS and Saudi Arabia', () => {
  it('say BRICS lists 11 members, including Saudi Arabia, which has not confirmed it', async () => {
    const { countSentence, membersText } = await import('../../src/i18n/members.en.ts');
    expect(countSentence('brics', 'BRICS', 11)).toBe('BRICS lists 11 members, including Saudi Arabia, which has not confirmed it');
    expect(countSentence('nato', 'NATO', 32)).toBe('NATO has 32 members');
    expect(membersText('brics', 5, 2011)).toBe('5 members');
    const { BLOCS_TEXT, HISTORY_TEXT, HISTORY_EVENTS } = await import('../../src/i18n/blocs.en.ts');
    expect(BLOCS_TEXT.lede('brics', 'BRICS', 11, '45%', '28%', 2025)).toMatch(/^BRICS lists 11 members, including Saudi Arabia, which has not confirmed it; together/);
    expect(BLOCS_TEXT.imageCaption('brics', 'BRICS', 11)).toMatch(/^BRICS lists 11 members, including Saudi Arabia/);
    expect(HISTORY_TEXT.lede({ id: 'brics', bloc: 'BRICS', first: 2009, n0: 4, founders: [], became: [], n: 11, last: 2026, changes: 4 }))
      .toMatch(/In 2026 BRICS listed 11 members, including Saudi Arabia, which has not confirmed it;/);
    expect(HISTORY_EVENTS.brics[2024]).toMatch(/listed by BRICS as a member from 2024/);
    expect(HISTORY_EVENTS.brics[2024]).not.toMatch(/Saudi Arabia(,| and)[^.]* joined/);
  });
});

describe('leads carry their figure’s status', () => {
  it('give a preliminary UCDP month as UCDP’s preliminary count', async () => {
    const { CONFLICT_TEXT } = await import('../../src/i18n/conflict.en.ts');
    const p = { month: 'September 2026', deaths: '13,286', deaths12: '150,000', months12: 12 };
    expect(CONFLICT_TEXT.lede({ ...p, preliminary: true })).toMatch(/^UCDP’s preliminary count: 13,286 deaths in organised violence in September 2026/);
    expect(CONFLICT_TEXT.lede(p)).toMatch(/^UCDP recorded 13,286 deaths/);
  });

  it('keep Hungary’s two figures apart, each with its year, source and status', async () => {
    const { HOME_TEXT: T } = await import('../../src/i18n/home.en.ts');
    expect(`73% ${T.gas.lead('Hungary', 'Russia', '2025')}`).toBe('73% of Hungary’s gas imports came from Russia in 2025 (UN Comtrade)');
    expect(T.gas.net('Hungary', '80%', 2024, true)).toBe('Hungary imported 80% of the gas it used in 2024 (EIA, preliminary).');
  });
});

describe('what a measure covers', () => {
  it('call UNHCR’s hosted count refugees and others in need of protection', async () => {
    const { VIEW_TEXT } = await import('../../src/i18n/views.en.ts');
    const l = VIEW_TEXT.refugees.layers.refin;
    expect(`${l.title}, ${l.sub}`).toBe('Refugees and others in need of protection, by host country');
    expect(l.lede({ top: 'The United States', topIn: 'the United States', value: '4.2 m', share: '9.2%', year: 2025 })).toMatch(/^UNHCR counts 4\.2 m people in these groups in the United States/);
    const { QUESTION_TEXT } = await import('../../src/i18n/home.en.ts');
    expect(QUESTION_TEXT.refugees[0]).toMatch(/refugees and others in need of protection/);
    const { HUB_TEXT } = await import('../../src/i18n/hubs.en.ts');
    expect(HUB_TEXT.cardKicker.refugees).toBe('Refugees and others in need of protection');
  });

  it('give AI computing power as a share of systems Epoch AI documented', async () => {
    const { ANSWER } = await import('../../src/i18n/pages.en.ts');
    expect(ANSWER.aicompute.sentence!('the United States', '75%', 'The United States')).toBe('The United States had 75% of the computing power of AI supercomputers documented by Epoch AI, the largest share (many private systems are not included).');
    expect(ANSWER.aicompute.caveats!.join(' ')).toMatch(/H100-equivalents: how many of Nvidia’s H100 chips/);
  });

  it('say how many APEC economies have figures, and list Taiwan’s APEC membership as Chinese Taipei', async () => {
    const { BLOCS_TEXT } = await import('../../src/i18n/blocs.en.ts');
    expect(BLOCS_TEXT.have('apec', 20, 21)).toBe('20 of 21 member economies have figures');
    const { COUNTRY_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(COUNTRY_TEXT.memberNameOf['apec:TWN']).toBe('APEC (member economy, as Chinese Taipei)');
  });
});

describe('the refugees indicator', () => {
  it('leads with UNHCR’s count of people in these groups, under a title within the limit', async () => {
    const { ANSWER } = await import('../../src/i18n/pages.en.ts');
    expect(ANSWER.refin.sentence!('the United States', '4.2 m', 'The United States', 2025)).toBe('In 2025, UNHCR counts 4.2 m people in these groups in the United States, the most of any country.');
    const { INDICATOR_TEXT } = await import('../../src/i18n/en.ts');
    expect(INDICATOR_TEXT.refin.label).toBe('Refugees and others needing protection, by host');
    expect(`Countries by ${INDICATOR_TEXT.refin.label.toLowerCase()}`.length).toBeLessThanOrEqual(65);
  });
});
