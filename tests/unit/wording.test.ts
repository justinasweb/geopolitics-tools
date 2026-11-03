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
