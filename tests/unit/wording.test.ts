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
