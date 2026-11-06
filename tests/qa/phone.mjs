// Launch QA, phone layout: every page of tests/qa/pages.mjs at 390 and 360 px wide, full-page screenshots, and three
// checks: no sideways scroll, no text cut off by its box, no two controls (links, buttons, inputs) overlapping.
// Usage: BASE=http://localhost:8787 node tests/qa/phone.mjs [screenshot dir, default shots/qa-phone] [report.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BASE, PAGES } from './pages.mjs';

const out = process.argv[2] ?? 'shots/qa-phone';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];

for (const width of [390, 360]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const found = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      // Visually hidden text (.gt-vh, for screen readers) is clipped on purpose and is not counted.
      const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && !el.closest('[hidden], dialog:not([open]), [aria-hidden="true"], .gt-vh'); };
      const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
      // Sideways scroll: the page wider than the screen, and what sticks out.
      const wide = document.documentElement.scrollWidth > vw + 1;
      const sticking = wide ? [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1 && !el.closest('.gt-tablewrap, [tabindex="0"][role="region"], .gt-scroll')).slice(0, 5).map(label) : [];
      // Clipped text: a text box that hides what it holds (ellipsis on purpose is not counted).
      const clipped = [...document.querySelectorAll('body *')].filter((el) => {
        if (!visible(el) || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
        const cs = getComputedStyle(el);
        if (cs.textOverflow === 'ellipsis' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
        return (cs.overflowX === 'hidden' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2;
      }).slice(0, 5).map(label);
      // Overlapping controls: two visible controls whose boxes cross by more than a few pixels.
      const ctl = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')].filter((el) => visible(el) && !el.closest('.gt-tablewrap, svg, .maplibregl-map'));
      const boxes = ctl.map((el) => ({ el, r: el.getBoundingClientRect() }));
      const overlaps = [];
      for (let i = 0; i < boxes.length && overlaps.length < 5; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 4 && y > 4) { overlaps.push(`${label(a.el)} × ${label(b.el)}`); break; }
      }
      return { wide, sticking, clipped, overlaps, scrollWidth: document.documentElement.scrollWidth, vw };
    });
    const file = `${out}/${width}-${p.path === '/' ? 'home' : p.path.slice(1).replace(/\//g, '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const issues = [found.wide && `sideways scroll (${found.scrollWidth} px): ${found.sticking.join('; ')}`, found.clipped.length && `clipped: ${found.clipped.join('; ')}`, found.overlaps.length && `overlap: ${found.overlaps.join('; ')}`].filter(Boolean);
    rows.push({ name: p.name, path: p.path, width, issues, file });
    console.log(`${issues.length ? 'FAIL' : 'ok  '} ${width} ${p.name}${issues.length ? `\n     ${issues.join('\n     ')}` : ''}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(rows, null, 2));
const bad = rows.filter((r) => r.issues.length);
console.log(`\n${rows.length} pages checked, ${bad.length} with issues; screenshots in ${out}/`);
process.exit(bad.length ? 1 : 0);
