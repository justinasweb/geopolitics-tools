import { describe, expect, it } from 'vitest';
import { checkDraft } from '../../src/lib/ai/check.ts';
import type { Fact, FactsFile } from '../../src/lib/ai/facts.ts';
import { currentHash, usage } from '../../src/lib/ai/store.ts';

// The facts hash stored with a text covers what the text shows of each fact it uses (./facts.ts factsHash): a value
// that moves without changing how the text writes it, or a new fetch date, leaves the text approved; a figure, year,
// source or tag that would read differently makes it stale.

const OIL: Fact = {
  id: 'exports-oil', statement: 'The United States’ net exports of oil as a share of its production (preliminary).', value: 12.6185, unit: '%', share: true,
  unitAliases: ['oil it produces'], period: '2025', places: ['USA'], source: 'U.S. Energy Information Administration', link: 'https://www.eia.gov/international/data/world', date: '2026-11-17', status: 'preliminary',
};
const POP: Fact = { id: 'population', statement: 'Population of the United States.', value: 341785000, unit: 'people', period: '2025', places: ['USA'], source: 'World Bank Indicators', link: 'https://data.worldbank.org/country/us', date: '2026-11-21' };
const file = (oil: Partial<Fact> = {}, pop: Partial<Fact> = {}): FactsFile => ({
  id: 'dossier:USA', kind: 'dossier', subject: 'the United States', generated: 'test', facts: [{ ...OIL, ...oil }, { ...POP, ...pop }],
});
const TEXT = 'The United States exports 13% of the oil it produces (U.S. Energy Information Administration, 2025, preliminary). It has 341.8 million people (World Bank Indicators, 2025).';

describe('the facts hash', () => {
  const saved = { text: TEXT, ...usage('dossier:USA', TEXT, file()) };

  it('records how the text writes each figure it uses', () => {
    expect(checkDraft(TEXT, file()).shown).toEqual({ 'exports-oil': ['13%'], population: ['341.8 million'] });
    expect(saved.usedFacts).toEqual(['exports-oil', 'population']);
  });

  it('stays the same when a value moves but reads the same, or a fetch date, statement or link changes', () => {
    for (const f of [
      file({ value: 12.6188 }),
      file({ value: 13.4 }),
      file({ date: '2026-11-24' }, { date: '2026-11-28' }),
      file({ statement: 'Net oil exports as a share of production, United States (preliminary).', link: 'https://www.eia.gov/' }),
      file({}, { value: 341_810_000 }),
    ]) expect(currentHash(saved, f)).toBe(saved.factsHash);
  });

  it('changes when a shown figure, year, source, place or tag would change, or a used fact is gone', () => {
    for (const f of [
      file({ value: 13.6 }),
      file({}, { value: 341_850_000 }),
      file({ period: '2026' }),
      file({ source: 'Energy Institute Statistical Review' }),
      file({ places: ['USA', 'CAN'] }),
      file({ status: 'estimated' }),
      { ...file(), facts: [{ ...POP }] },
    ]) expect(currentHash(saved, f)).not.toBe(saved.factsHash);
  });
});
