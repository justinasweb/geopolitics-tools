// Share images (1200 × 630), rendered at build time: Satori lays the card out as SVG, resvg turns it into PNG.
// One layout for every page: kicker, title, a headline figure with its caption, up to five bars, and the source.
// Colours are the light theme's tokens (src/styles/tokens.css); fonts are the site's, as static WOFF files. The lockup is
// the header's (src/components/LogoSprite.astro), its token colours resolved, drawn as an SVG image: outlines, no font.
//
// Bar labels are measured with the font Satori draws them in (the same opentype.js), and fitted before Satori sees
// them (`fitLabel`): wrapped to two lines at spaces, or cut after a whole word with "…", keeping a trailing year or
// bracketed short name ("Military spending, % of…, 2024", "Non-Proliferation… (NPT)"). A word is never split. When five two-line rows would not fit under the title,
// the rows get tighter, then smaller, then one line each (`barLayout`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import opentype, { type Font } from '@shuding/opentype.js';

const file = (p: string) => readFileSync(join(process.cwd(), p));
const FONT_FILES = {
  serif600: 'node_modules/@fontsource/newsreader/files/newsreader-latin-600-normal.woff',
  sans400: 'node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff',
  sans600: 'node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff',
};
const fonts = [
  { name: 'Newsreader', data: file(FONT_FILES.serif600), weight: 600 as const, style: 'normal' as const },
  { name: 'Source Sans 3', data: file(FONT_FILES.sans400), weight: 400 as const, style: 'normal' as const },
  { name: 'Source Sans 3', data: file(FONT_FILES.sans600), weight: 600 as const, style: 'normal' as const },
];

const parsed = new Map<string, Font>();
const fontOf = (key: keyof typeof FONT_FILES): Font => {
  if (!parsed.has(key)) {
    const b = file(FONT_FILES[key]);
    parsed.set(key, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
  }
  return parsed.get(key)!;
};
/** How wide a text is drawn, in pixels. */
export const measure = (text: string, size: number, font: keyof typeof FONT_FILES = 'sans400') => fontOf(font).getAdvanceWidth(text, size);

/** The light theme's colour tokens: the first definition of each in tokens.css. */
const tokens = (() => {
  const out: Record<string, string> = {};
  for (const m of file('src/styles/tokens.css').toString().matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) out[m[1]] ??= m[2];
  return out;
})();
/** The lockup as an SVG data URI, from the header's artwork with each token fill resolved to its light-theme colour. */
const LOCKUP = (() => {
  const art = file('src/components/LogoSprite.astro').toString().match(/<symbol id="gt-lockup-art" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/);
  if (!art) throw new Error('og: no lockup artwork in LogoSprite.astro');
  const body = art[2].replace(/style="fill:var\(--([a-z0-9-]+)\)"/g, (_, t: string) => {
    if (!tokens[t]) throw new Error(`og: no light-theme colour for --${t}`);
    return `fill="${tokens[t]}"`;
  });
  if (body.includes('var(')) throw new Error('og: lockup colour left unresolved');
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art[1]}">${body}</svg>`).toString('base64')}`;
})();
/** The lockup's width per pixel of height (its viewBox, 809.1 × 100), and its lowest band's height per pixel of height,
 *  which is its clear space on every side. */
const LOCKUP_RATIO = 8.091;
export const LOCKUP_CLEAR = 0.2315;
const lockup = (height: number, style: Record<string, unknown> = {}) =>
  ({ type: 'img', props: { src: LOCKUP, width: height * LOCKUP_RATIO, height, style: { flexShrink: 0, ...style } } });

const C = { paper: tokens.paper, ink: tokens.ink, muted: tokens['ink-muted'], accent: tokens.accent, bar: tokens['seq-4'], track: tokens['seq-1'] };

type Node = { type: string; props: { style: Record<string, unknown>; children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

export interface Card {
  kicker: string;
  title: string;
  figure?: string;
  caption?: string;
  source?: string;
  bars?: { label: string; value: number; text: string }[];
  /** The lockup in place of the kicker: the site default and pages with no figure of their own. The kicker still
   *  goes into the alt text. */
  logo?: boolean;
}

// The card's geometry, in pixels.
export const G = {
  width: 1200, height: 630, padX: 64, padTop: 44, padBottom: 36,
  /** Content box: the card less its padding. */
  get innerW() { return this.width - 2 * this.padX; },
  get innerH() { return this.height - this.padTop - this.padBottom; },
  /** Kicker: the double rule, its padding and one line. */
  kicker: 6 + 20 + 28,
  titleGap: 18, titleLine: 1.1,
  /** Footer: margin, rule, padding and the lockup's height. */
  footer: 28 + 1 + 12 + 30,
  footPad: 12, logoH: 30, logoTopH: 56,
  /** The lockup's width in the footer, and the least space between it and the source line. */
  get logoW() { return Math.ceil(this.logoH * LOCKUP_RATIO); },
  logoGap: 24,
  /** The figure and caption column beside the bars, and the gap between them. */
  leftW: 480, columnsGap: 56,
  rowGap: 12, cellGap: 12, barH: 22, labelLine: 1.15, valueLine: 1.25,
  labelW: 240, minLabelW: 170, minBarW: 140,
};

/** What a cut label keeps at its end: a year or period (", 2024") or a short name in brackets (" (NPT)"). */
const KEEP_END = /^(.*\S)(,\s\d{4}(?:[–-]\d{4})?|\s\([^()\s]{1,12}\))$/;
const PUNCT_END = /[\s,;:–—-]+$/;

/** A label as lines that fit `width` at `size`, broken only at spaces. More than `maxLines` lines are cut after a
 *  whole word with "…", keeping a trailing year (", 2024") or bracketed short name (" (NPT)"). Null when one word alone is wider than `width`, so the
 *  caller can try a smaller size; with `force`, such a word is left out instead (never split). */
export function fitLabel(text: string, width: number, size: number, maxLines = 2, force = false): { lines: string[]; cut: boolean } | null {
  const fits = (s: string) => measure(s, size) <= width;
  const words = text.trim().split(/\s+/);
  if (!force && words.some((w) => !fits(w))) return null;
  const wrap = (ws: string[]) => {
    const lines: string[] = [];
    for (const w of ws) {
      const last = lines.at(-1);
      if (last !== undefined && fits(`${last} ${w}`)) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    return lines;
  };
  const all = wrap(words);
  // A year left alone on the last line takes the word before it along, when that fits ("Wheat / production, 2024").
  if (all.length === 2 && all.length <= maxLines && !all[1].includes(' ') && all[0].includes(' ')) {
    const moved = all[0].lastIndexOf(' ');
    const second = `${all[0].slice(moved + 1)} ${all[1]}`;
    if (fits(second)) { all[0] = all[0].slice(0, moved); all[1] = second; }
  }
  if (all.length <= maxLines && all.every(fits)) return { lines: all, cut: false };
  // Too long: keep whole words, then "…" and the year or bracketed name the label ends with, if any.
  const m = text.trim().match(KEEP_END);
  const tail = m ? `…${m[2]}` : '…';
  const head = (m ? m[1] : text.trim()).split(/\s+/);
  const lines: string[] = [];
  let i = 0;
  while (lines.length < maxLines - 1 && i < head.length) {
    // Earlier lines take whole words, leaving the rest for the last line.
    let line = '';
    while (i < head.length && fits(line ? `${line} ${head[i]}` : head[i])) line = line ? `${line} ${head[i++]}` : head[i++];
    if (!line) break;
    lines.push(line);
  }
  let last = '';
  while (i < head.length) {
    const next = last ? `${last} ${head[i]}` : head[i];
    if (!fits(`${next.replace(PUNCT_END, '')}${tail}`)) break;
    last = next;
    i++;
  }
  const end = `${last.replace(PUNCT_END, '')}${tail}`;
  if (fits(end)) lines.push(end);
  else if (lines.length) lines[lines.length - 1] = `${lines.at(-1)!.replace(PUNCT_END, '')}…`;
  else lines.push('…');
  return { lines, cut: true };
}

export interface BarLayout {
  labelSize: number;
  rowGap: number;
  labelW: number;
  barW: number;
  valueW: number;
  labels: string[][];
  /** Height of the bar rows, and the height there is for them under the title. */
  height: number;
  room: number;
}

/** How many lines a title takes across the card. */
export const titleSize = (title: string) => (title.length > 48 ? 50 : 60);
function titleLines(title: string): number {
  const size = titleSize(title);
  let lines = 1;
  let line = '';
  for (const w of title.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, size, 'serif600') > G.innerW) { lines++; line = w; } else line = next;
  }
  return lines;
}

/** Sizes the bar rows for a card: label column, bar and value widths from the measured values, then the label size,
 *  row gap and lines per label that let every row fit under the title. */
export function barLayout(o: Pick<Card, 'title' | 'bars'>): BarLayout | null {
  const bars = (o.bars ?? []).slice(0, 5);
  if (!bars.length) return null;
  const colW = G.innerW - G.leftW - G.columnsGap;
  const room = G.innerH - G.kicker - G.titleGap - titleLines(o.title) * titleSize(o.title) * G.titleLine - G.footer;
  const tries: { size: number; gap: number; lines: number }[] = [
    { size: 22, gap: 12, lines: 2 }, { size: 22, gap: 6, lines: 2 }, { size: 20, gap: 6, lines: 2 },
    { size: 18, gap: 6, lines: 2 }, { size: 20, gap: 6, lines: 1 }, { size: 18, gap: 4, lines: 1 },
  ];
  let out: BarLayout | null = null;
  for (const t of tries) {
    const valueW = Math.ceil(Math.max(...bars.map((b) => measure(b.text, t.size, 'sans600')))) + 2;
    const labelW = Math.max(G.minLabelW, Math.min(G.labelW, colW - valueW - 2 * G.cellGap - G.minBarW));
    const barW = Math.max(40, colW - labelW - valueW - 2 * G.cellGap);
    const fitted = bars.map((b) => fitLabel(b.label, labelW, t.size, t.lines));
    const last = t === tries.at(-1);
    if (fitted.some((f) => f === null) && !last) continue;
    const labels = bars.map((b, i) => (fitted[i] ?? fitLabel(b.label, labelW, t.size, t.lines, true)!).lines);
    const rowH = (n: number) => Math.max(G.barH, n * t.size * G.labelLine, t.size * G.valueLine);
    const height = labels.reduce((s, l) => s + rowH(l.length), 0) + (bars.length - 1) * t.gap;
    out = { labelSize: t.size, rowGap: t.gap, labelW, barW, valueW, labels, height, room };
    if (height <= room && fitted.every(Boolean)) return out;
  }
  return out;
}

/** The card as SVG (Satori); `shareImage` turns it into PNG. */
export async function shareSvg(o: Card): Promise<string> {
  const bars = (o.bars ?? []).slice(0, 5);
  const top = Math.max(...bars.map((b) => Math.abs(b.value)), 0) || 1;
  const L = barLayout(o);
  // Satori sizes the box without its padding, so the content box is the card minus the padding.
  const tree = h('div', { width: G.innerW, height: G.innerH, display: 'flex', flexDirection: 'column', background: C.paper, padding: `${G.padTop}px ${G.padX}px ${G.padBottom}px`, fontFamily: 'Source Sans 3', color: C.ink }, [
    h('div', { display: 'flex', flexShrink: 0, borderTop: `6px double ${C.ink}`, paddingTop: 20, fontSize: 22, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: C.accent },
      o.logo ? [lockup(G.logoTopH)] : o.kicker),
    h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 600, fontSize: titleSize(o.title), lineHeight: G.titleLine, marginTop: G.titleGap, maxWidth: G.innerW }, o.title),
    h('div', { display: 'flex', flex: 1, minHeight: 0, alignItems: 'flex-end', gap: G.columnsGap }, [
      h('div', { display: 'flex', flexDirection: 'column', ...(L ? { width: G.leftW, flexShrink: 0 } : { maxWidth: G.innerW }) }, [
        ...(o.figure ? [h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 600, fontSize: 88, lineHeight: 1 }, o.figure)] : []),
        ...(o.caption ? [h('div', { display: 'flex', fontSize: 26, lineHeight: 1.3, color: C.muted, marginTop: 10 }, o.caption)] : []),
      ]),
      ...(L ? [h('div', { display: 'flex', flexDirection: 'column', gap: L.rowGap, flex: 1 }, bars.map((b, i) =>
        h('div', { display: 'flex', alignItems: 'center', gap: G.cellGap, fontSize: L.labelSize }, [
          h('div', { display: 'flex', flexDirection: 'column', width: L.labelW, flexShrink: 0, lineHeight: G.labelLine }, L.labels[i].map((line) => h('div', { display: 'flex', whiteSpace: 'nowrap' }, line))),
          h('div', { display: 'flex', width: L.barW, height: G.barH, flexShrink: 0, background: C.track }, [h('div', { display: 'flex', height: G.barH, width: Math.max(3, (L.barW * Math.abs(b.value)) / top), background: C.bar })]),
          h('div', { display: 'flex', width: L.valueW, flexShrink: 0, fontWeight: 600, whiteSpace: 'nowrap' }, b.text),
        ])))] : []),
    ]),
    // The footer's padding and the gap beside the source keep the lockup's clear space (its lowest band, 7px at 30px).
    h('div', { display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: G.logoGap, borderTop: `1px solid ${C.ink}`, marginTop: 28, paddingTop: G.footPad, fontSize: 20, color: C.muted }, [
      h('div', { display: 'flex' }, o.source ? `Source: ${o.source}` : ''),
      lockup(G.logoH),
    ]),
  ]);
  return satori(tree as unknown as Parameters<typeof satori>[0], { width: G.width, height: G.height, fonts });
}

export async function shareImage(o: Card): Promise<Uint8Array> {
  return new Resvg(await shareSvg(o)).render().asPng();
}
