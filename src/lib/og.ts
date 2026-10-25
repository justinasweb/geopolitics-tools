// Share images (1200 × 630), rendered at build time: Satori lays the card out as SVG, resvg turns it into PNG.
// One layout for every page: kicker, title, a headline figure with its caption, up to five bars, and the source.
// Colours are the light theme's tokens (src/styles/tokens.css); fonts are the site's, as static WOFF files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const file = (p: string) => readFileSync(join(process.cwd(), p));
const fonts = [
  { name: 'Newsreader', data: file('node_modules/@fontsource/newsreader/files/newsreader-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Source Sans 3', data: file('node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const },
  { name: 'Source Sans 3', data: file('node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const },
];

/** The light theme's colour tokens: the first definition of each in tokens.css. */
const tokens = (() => {
  const out: Record<string, string> = {};
  for (const m of file('src/styles/tokens.css').toString().matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) out[m[1]] ??= m[2];
  return out;
})();
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
}

export async function shareImage(o: Card): Promise<Uint8Array> {
  const bars = (o.bars ?? []).slice(0, 5);
  const top = Math.max(...bars.map((b) => Math.abs(b.value)), 0) || 1;
  // Satori sizes the box without its padding, so the content box is the card minus the padding.
  const tree = h('div', { width: 1200 - 128, height: 630 - 80, display: 'flex', flexDirection: 'column', background: C.paper, padding: '44px 64px 36px', fontFamily: 'Source Sans 3', color: C.ink }, [
    h('div', { display: 'flex', flexShrink: 0, borderTop: `6px double ${C.ink}`, paddingTop: 20, fontSize: 22, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: C.accent }, o.kicker),
    h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 600, fontSize: o.title.length > 48 ? 50 : 60, lineHeight: 1.1, marginTop: 18, maxWidth: 1072 }, o.title),
    h('div', { display: 'flex', flex: 1, minHeight: 0, alignItems: 'flex-end', gap: 56 }, [
      h('div', { display: 'flex', flexDirection: 'column', maxWidth: bars.length ? 480 : 1072 }, [
        ...(o.figure ? [h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 600, fontSize: 88, lineHeight: 1 }, o.figure)] : []),
        ...(o.caption ? [h('div', { display: 'flex', fontSize: 26, lineHeight: 1.3, color: C.muted, marginTop: 10 }, o.caption)] : []),
      ]),
      ...(bars.length ? [h('div', { display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }, bars.map((b) =>
        h('div', { display: 'flex', alignItems: 'center', gap: 12, fontSize: 22 }, [
          h('div', { display: 'flex', width: 190, overflow: 'hidden', whiteSpace: 'nowrap' }, b.label),
          h('div', { display: 'flex', width: 240, height: 22, background: C.track }, [h('div', { display: 'flex', height: 22, width: Math.max(3, (240 * Math.abs(b.value)) / top), background: C.bar })]),
          h('div', { display: 'flex', fontWeight: 600 }, b.text),
        ])))] : []),
    ]),
    h('div', { display: 'flex', flexShrink: 0, justifyContent: 'space-between', borderTop: `1px solid ${C.ink}`, marginTop: 28, paddingTop: 14, fontSize: 20, color: C.muted }, [
      h('div', { display: 'flex' }, o.source ? `Source: ${o.source}` : ''),
      h('div', { display: 'flex', fontWeight: 600, color: C.ink }, 'geopolitics.tools'),
    ]),
  ]);
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts });
  return new Resvg(svg).render().asPng();
}
