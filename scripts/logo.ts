// Renders the raster logo Google wants for the Organization's structured data (a Google Images format, at least
// 112 × 112 px): the design system's colour symbol (src/design/symbol-color.svg) on white, 512 × 512.
// Writes public/logo-512.png: node scripts/logo.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

export const SIZE = 512;
const SVG_PATH = new URL('../src/design/symbol-color.svg', import.meta.url);
const PNG_PATH = new URL('../public/logo-512.png', import.meta.url);

export const logoPng = (): Buffer =>
  new Resvg(readFileSync(SVG_PATH, 'utf8'), { background: '#ffffff', fitTo: { mode: 'width', value: SIZE } }).render().asPng();

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(PNG_PATH, logoPng());
  console.log(`public/logo-512.png written (${SIZE} × ${SIZE})`);
}
