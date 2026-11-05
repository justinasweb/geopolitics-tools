import { beforeAll, describe, expect, it } from 'vitest';
import { mapNote, membersText, othersText, todaysMembers } from '../../src/i18n/members.en.ts';

// How pages count a grouping's members and say when it began (src/i18n/members.en.ts, BEGAN_AS in
// src/i18n/blocs.en.ts): members that are not countries are named, never dropped from a count that reads as
// complete; a start year that belongs to a predecessor names the predecessor.
process.env.GT_DATA = 'sample';

const G20 = '19 countries, plus the European Union and, since 2023, the African Union';
const G7 = '7 countries, with the European Union taking part as a non-enumerated member since 1977';

describe('the member count', () => {
  it('names the members that are not countries, as they stood in a year', () => {
    expect(membersText('g20', 19)).toBe(G20);
    expect(membersText('g20', 19, 1999)).toBe('19 countries, plus the European Union');
    expect(membersText('g20', 19, 2023)).toBe(G20);
    expect(membersText('g7', 7)).toBe(G7);
    expect(membersText('g7', 6, 1975)).toBe('6 countries');
    expect(membersText('opec', 11)).toBe('11 members');
    expect(othersText('opec')).toBe('');
  });

  it('says what the map outlines, in one short note', () => {
    expect(mapNote('g20', 19)).toBe('The map outlines the 19 countries; the European Union and the African Union are not countries, so they are not on it.');
    expect(mapNote('g7', 7)).toBe('The map outlines the 7 countries; the European Union is not a country, so it is not on it.');
    expect(mapNote('opec', 11)).toBe('');
  });

  it('calls the countries behind a share "member countries"', () => {
    expect(todaysMembers('G20', { count: 19 })).toBe('today’s 19 G20 member countries');
    expect(todaysMembers('OPEC')).toBe('today’s OPEC members');
  });
});

describe('the pages', () => {
  type Lib = { blocLede: (id: string) => string | null; historyLede: (id: string) => string | null };
  let L: Lib;
  let B: typeof import('../../src/i18n/blocs.en.ts');
  let layerFile: typeof import('../../src/lib/map/layers.ts')['layerFile'];
  let card: typeof import('../../src/lib/og-cards.ts')['card'];
  let route: typeof import('../../src/lib/routes.ts')['route'];
  beforeAll(async () => {
    L = { ...(await import('../../src/lib/blocview.ts')), ...(await import('../../src/lib/history.ts')) } as unknown as Lib;
    B = await import('../../src/i18n/blocs.en.ts');
    ({ layerFile } = await import('../../src/lib/map/layers.ts'));
    ({ card } = await import('../../src/lib/og-cards.ts'));
    ({ route } = await import('../../src/lib/routes.ts'));
  }, 300_000);

  it('give the G20 and G7 counts with their other members, on the bloc page, its title, panel and share image', () => {
    expect(L.blocLede('g20')).toMatch(new RegExp(`^G20 members: ${G20}\\. Together, today’s G20 member countries had`));
    expect(B.BLOCS_TEXT.sub('g20', 19)).toBe(G20);
    expect(B.BLOCS_TEXT.countLabel('g20')).toBe('Member countries');
    expect(B.BLOCS_TEXT.countMore('g20')).toBe('plus the European Union and, since 2023, the African Union');
    expect(B.BLOCS_TEXT.have('g20', 18, 19)).toBe('18 of 19 member countries have a figure');
    expect(B.BLOCS_TEXT.sharesCaption('g20')).toBe('Combined share of today’s member countries, latest year with figures');
    expect(L.blocLede('g7')).toMatch(new RegExp(`^G7 members: ${G7}\\.`));
    expect(L.blocLede('opec')).toMatch(/^OPEC has 11 members; together/);
    expect(card(route('view:blocs:g20')!).caption).toBe(`${G20}. Shares of the world: today’s 19 G20 member countries`);
  });

  it('never call the G20 or G7 countries alone its members, on any bloc map', () => {
    for (const id of ['blocs-all', 'blocs-g20', 'blocs-g7', 'blocs-opec', 'blocs-nato']) {
      const f = layerFile(id) as unknown as { data: { blocs?: Record<string, string> }[]; more?: Record<string, { rows: { name: string; value: string }[] }[]> };
      const lines = [...f.data.flatMap((y) => Object.values(y.blocs ?? {})), ...Object.values(f.more ?? {}).flat().flatMap((b) => b.rows.filter((r) => /^G(20|7)$/.test(r.name)).map((r) => `${r.name}: ${r.value}`))];
      expect(lines.length, id).toBeGreaterThan(0);
      for (const l of lines) expect(l, `${id}: ${l}`).not.toMatch(/\bG(20|7) has \d+ members|\b(19|7) G(20|7) members\b|G20: 19 members|G7: 7 members/);
    }
  });

  it('give the G20 history its other members, by year', () => {
    expect(L.historyLede('g20')).toBe(`G20 began in 1999 with 19 countries, plus the European Union. In 2026 it had ${G20}; membership changed in 2 years.`);
    expect(card(route('view:alliance-history:g20')!).caption).toBe(`1999–2026. In 2026: ${G20}`);
  });

  it('name the predecessor a grouping began as', () => {
    expect(L.historyLede('sco')).toBe('SCO began in 1996 as the Shanghai Five (China, Kazakhstan, Kyrgyzstan, Russia, Tajikistan) and became the Shanghai Cooperation Organisation in 2001, when Uzbekistan joined. In 2026 it had 10 members; membership changed in 5 years.');
    expect(L.historyLede('eu')).toMatch(/^European Union began in 1958 as the European Economic Community \(Belgium, France, West Germany, Italy, Luxembourg, the Netherlands\) and became the European Union in 1993\. In 2026 it had 27 members;/);
    expect(L.historyLede('csto')).toMatch(/^CSTO began in 1992 as the Collective Security Treaty \(Armenia, Kazakhstan, Kyrgyzstan, Russia, Tajikistan, Uzbekistan\) and became the Collective Security Treaty Organization in 2002\. In 2026 it had 6 members;/);
    expect(L.historyLede('brics')).toMatch(/^BRICS began in 2009 as BRIC \(Brazil, China, India, Russia\) and became BRICS in 2011, when South Africa joined\./);
    expect(L.historyLede('g7')).toMatch(/^G7 began in 1975 as a summit of six countries \(France, West Germany, Italy, Japan, the United Kingdom, the United States\) and became the G7 in 1976, when Canada joined\. In 2026 it had 7 countries, with the European Union taking part as a non-enumerated member since 1977;/);
    expect(L.historyLede('nato')).toMatch(/^NATO began in 1949 with 12 members\. In 2026 it had 32 members;/);
  });
});
