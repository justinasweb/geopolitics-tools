// Turns the design tokens (src/design/tokens.json, exported from the Atlas design system) into CSS variables
// and checks them. Writes src/styles/tokens.css: node scripts/tokens.ts
// A unit test fails if tokens.css is out of date or a check fails, so a token change cannot ship unchecked.
import { readFileSync, writeFileSync } from 'node:fs';

type Themed = string | { light: string; dark: string };
interface Token { name: string; value: Themed; usage?: string }
interface TypeStyle {
  name: string; fontSize: string; lineHeight: string; fontWeight: number;
  letterSpacing?: string; opticalSize?: number; sample?: string;
}
export interface Tokens {
  color: { tokens: Token[] };
  type: { families: Record<string, string>; groups: { name: string; family: string; styles: TypeStyle[] }[] };
  spacing: { tokens: Token[] }; radius: { tokens: Token[] }; border: { tokens: Token[] };
  grid: { tokens: Token[] }; breakpoint: { tokens: Token[] }; shadow: { tokens: Token[] };
}

const TOKENS_PATH = new URL('../src/design/tokens.json', import.meta.url);
const CSS_PATH = new URL('../src/styles/tokens.css', import.meta.url);

export const loadTokens = (): Tokens => JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

// The self-hosted variable fonts are registered under these names (src/styles/fonts.css); the token's own
// stack follows as the fallback.
const FONT_FACE: Record<string, string> = { serif: '"Newsreader Variable"', sans: '"Source Sans 3 Variable"' };

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** A colour token's value in one theme, with {references} resolved. */
export function colour(tokens: Tokens, name: string, theme: Theme, seen: string[] = []): string {
  const t = tokens.color.tokens.find((c) => c.name === name);
  if (!t) throw new Error(`unknown colour token "${name}"${seen.length ? ` (from ${seen.join(' → ')})` : ''}`);
  if (seen.includes(name)) throw new Error(`colour tokens refer to each other in a loop: ${[...seen, name].join(' → ')}`);
  const v = typeof t.value === 'string' ? t.value : t.value[theme];
  const ref = /^\{([a-z0-9-]+)\}$/.exec(v);
  return ref ? colour(tokens, ref[1], theme, [...seen, name]) : v;
}

// ---- contrast (WCAG 2) ----

function rgb(c: string, ground?: [number, number, number]): [number, number, number] {
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
  if (!m) throw new Error(`cannot read colour "${c}"`);
  const a = m[4] === undefined ? 1 : +m[4];
  const g = ground ?? [255, 255, 255];
  return [1, 2, 3].map((i, k) => +m![i] * a + g[k] * (1 - a)) as [number, number, number];
}
const lum = ([r, g, b]: [number, number, number]) =>
  [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// The pairs the design system promises (README "Contrast" and the token usage notes), checked in both themes.
// The README rounds: ink on note-bg is 12.4:1 in dark, ink-muted on note-bg 4.996:1 and the Estimate tag 6.98:1
// in light, so the floors sit just under the rounded figures. All stay above WCAG AA (4.5:1 text, 3:1 graphics).
const PAPERS = ['paper', 'paper-raised', 'paper-sunk'];
export const CONTRAST_RULES: { fg: string[]; bg: string[]; min: number; why: string }[] = [
  { fg: ['ink'], bg: [...PAPERS, 'note-bg'], min: 12, why: 'body text' },
  { fg: ['ink-muted'], bg: [...PAPERS, 'note-bg'], min: 4.95, why: 'secondary text' },
  { fg: ['accent', 'focus'], bg: PAPERS, min: 4.5, why: 'kickers and the focus ring' },
  { fg: ['link'], bg: PAPERS, min: 4.5, why: 'links' },
  { fg: ['rule-strong'], bg: ['paper', 'paper-raised'], min: 3, why: 'control borders' },
  { fg: ['on-brand'], bg: ['brand', 'brand-hover'], min: 4.5, why: 'text on buttons' },
  { fg: ['brand'], bg: ['brand-soft', ...PAPERS], min: 4.5, why: 'selected states' },
  { fg: ['est-ink'], bg: ['est-bg'], min: 6.9, why: 'Estimate tag' },
  { fg: ['proj-ink'], bg: ['proj-bg'], min: 6.9, why: 'Projection tag' },
  { fg: ['prelim-ink'], bg: ['prelim-bg'], min: 6.9, why: 'Preliminary tag' },
  { fg: ['error'], bg: ['error-bg', 'paper'], min: 4.5, why: 'error message' },
  { fg: ['tooltip-ink'], bg: ['tooltip-bg'], min: 7, why: 'tooltip text' },
  { fg: ['tooltip-muted'], bg: ['tooltip-bg'], min: 4.5, why: 'tooltip source line' },
  { fg: ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8'], bg: ['paper', 'paper-raised'], min: 3, why: 'chart lines' },
  { fg: ['seq-5'], bg: ['paper', 'paper-raised'], min: 3, why: 'bars' },
];

/** Everything wrong with the tokens, as sentences. Empty means they pass. */
export function checkTokens(tokens: Tokens): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  const all = [tokens.color, tokens.spacing, tokens.radius, tokens.border, tokens.grid, tokens.breakpoint, tokens.shadow]
    .flatMap((g) => g.tokens);
  for (const t of all) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.name)) errors.push(`token name "${t.name}" is not lower-case-with-dashes`);
    if (names.has(t.name)) errors.push(`token "${t.name}" is defined twice`);
    names.add(t.name);
  }
  for (const t of tokens.color.tokens) {
    for (const theme of THEMES) {
      try {
        const v = colour(tokens, t.name, theme);
        rgb(v);
      } catch (e) {
        errors.push(`colour "${t.name}" (${theme}): ${(e as Error).message}`);
      }
    }
  }
  if (errors.length) return errors;
  for (const rule of CONTRAST_RULES) {
    for (const theme of THEMES) {
      for (const fg of rule.fg) {
        for (const bg of rule.bg) {
          const ratio = contrast(colour(tokens, fg, theme), colour(tokens, bg, theme));
          if (ratio < rule.min) errors.push(`${fg} on ${bg} (${theme}) is ${ratio.toFixed(2)}:1, needs ${rule.min}:1 for ${rule.why}`);
        }
      }
    }
  }
  // Data scales: sequential steps must keep growing in contrast with paper (lighter to darker in light, the
  // reverse in dark), so the largest values always stand out.
  for (const theme of THEMES) {
    const paper = colour(tokens, 'paper', theme);
    const steps = [1, 2, 3, 4, 5].map((i) => contrast(colour(tokens, `seq-${i}`, theme), paper));
    for (let i = 1; i < steps.length; i++) {
      if (steps[i] <= steps[i - 1]) errors.push(`seq-${i + 1} does not stand out more than seq-${i} against paper (${theme})`);
    }
  }
  for (const g of tokens.type.groups) {
    if (!tokens.type.families[g.family]) errors.push(`type group "${g.name}" uses unknown family "${g.family}"`);
    for (const s of g.styles) {
      if (parseFloat(s.fontSize) < 12) errors.push(`type style "${s.name}" is under 12px`);
      if (!/^\d+px$/.test(s.fontSize) || !/^\d+px$/.test(s.lineHeight)) errors.push(`type style "${s.name}" needs px sizes`);
    }
  }
  return errors;
}

const block = (sel: string, lines: string[]) => `${sel} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}\n`;

/** tokens.css: light values on :root, dark values ready under [data-theme="dark"] (not switched on at launch). */
export function tokensCss(tokens: Tokens): string {
  const varOf = (v: string) => v.replace(/^\{([a-z0-9-]+)\}$/, 'var(--$1)');
  const themed = (theme: Theme) => [
    ...tokens.color.tokens.map((t) => `--${t.name}: ${varOf(typeof t.value === 'string' ? t.value : t.value[theme])};`),
    ...tokens.shadow.tokens.map((t) => `--${t.name}: ${typeof t.value === 'string' ? t.value : t.value[theme]};`),
  ];
  const fixed = [tokens.spacing, tokens.radius, tokens.border, tokens.grid, tokens.breakpoint]
    .flatMap((g) => g.tokens.map((t) => `--${t.name}: ${t.value as string};`));
  const fonts = Object.entries(tokens.type.families).map(([k, v]) => `--font-${k}: ${FONT_FACE[k] ? `${FONT_FACE[k]}, ` : ''}${v};`);
  const typeVars = tokens.type.groups.flatMap((g) => g.styles.map((s) => {
    const font = `--type-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${g.family});`;
    return s.letterSpacing ? [font, `--type-${s.name}-tracking: ${s.letterSpacing};`] : [font];
  }).flat());
  return [
    '/* Generated from src/design/tokens.json by `node scripts/tokens.ts`. Edit the JSON, not this file. */\n',
    block(':root', ['color-scheme: light;', ...themed('light'), ...fixed, ...fonts, ...typeVars]),
    block(':root[data-theme="dark"]', ['color-scheme: dark;', ...themed('dark')]),
  ].join('\n');
}

export const tokensCssPath = CSS_PATH;

if (import.meta.url === `file://${process.argv[1]}`) {
  const tokens = loadTokens();
  const errors = checkTokens(tokens);
  if (errors.length) {
    for (const e of errors) console.error(`tokens: ${e}`);
    process.exit(1);
  }
  writeFileSync(CSS_PATH, tokensCss(tokens));
  console.log('wrote src/styles/tokens.css');
}
