import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTokens, colour, contrast, loadTokens, tokensCss, tokensCssPath } from '../../scripts/tokens.ts';
import { formatDate } from '../../src/lib/format.ts';

const tokens = loadTokens();

describe('design tokens', () => {
  it('pass every check (names, colours, contrast, scales, type)', () => {
    expect(checkTokens(tokens)).toEqual([]);
  });

  it('tokens.css is up to date (run node scripts/tokens.ts)', () => {
    expect(readFileSync(tokensCssPath, 'utf8')).toBe(tokensCss(tokens));
  });

  it('a broken token is caught', () => {
    const bad = structuredClone(tokens);
    bad.color.tokens.find((t) => t.name === 'ink-muted')!.value = { light: '#c0c0c0', dark: '#a3a9b1' };
    bad.color.tokens.find((t) => t.name === 'focus')!.value = '{nope}';
    const errors = checkTokens(bad);
    expect(errors.some((e) => e.includes('focus'))).toBe(true);
    const fixed = structuredClone(bad);
    fixed.color.tokens.find((t) => t.name === 'focus')!.value = '{accent}';
    expect(checkTokens(fixed).some((e) => e.startsWith('ink-muted on paper (light)'))).toBe(true);
  });

  it('resolves references and measures contrast', () => {
    expect(colour(tokens, 'focus', 'light')).toBe(colour(tokens, 'accent', 'light'));
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('every CSS variable the styles use is a token or set locally', () => {
    const dir = new URL('../../src/', import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(css|astro|ts)$/.test(e.name)) files.push(p);
      }
    };
    walk(dir);
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const defined = new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...text.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    // A name ending in "-" is built in a template (var(--type-${name})).
    const unknown = [...used].filter((v) => !v.endsWith('-') && !defined.has(v) && !text.includes(`setProperty('${v}'`));
    expect(unknown).toEqual([]);
  });
});

describe('formatDate', () => {
  it('writes day, short month, year in UTC', () => {
    expect(formatDate('2026-10-21')).toBe('21 Oct 2026');
    expect(formatDate('2026-09-01')).toBe('1 Sep 2026');
  });
});
