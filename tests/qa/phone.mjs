// Launch QA, phone layout: every page of tests/qa/pages.mjs at 390 and 360 px wide, full-page screenshots, and four
// checks: no sideways scroll, no text cut off by its box, no two controls (links, buttons, inputs) overlapping, and
// no page running on past its footer. The last one also runs at 1440 px, where wide tables scroll inside a box.
// Usage: BASE=http://localhost:8787 node tests/qa/phone.mjs [screenshot dir, default shots/qa-phone] [report.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BASE, PAGES } from './pages.mjs';

const out = process.argv[2] ?? 'shots/qa-phone';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];

// Scroll height allowed below the site footer's bottom edge: anything more is something placed against the page from
// inside a box (as the screen-reader text of an unpositioned scrolling table was, 14,000 px on /dependencies).
const PAST_FOOTER = 50;

for (const width of [390, 360, 1440]) {
  const phone = width < 600;
  const ctx = await browser.newContext(phone ? { viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width, height: 900 } });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const found = await page.evaluate((PAST_FOOTER) => {
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
      // Squeezed inputs: a text or search box under 120 px wide cannot show what is typed (or its placeholder).
      for (const el of document.querySelectorAll('input[type="search"], input[type="text"], input:not([type])')) {
        if (visible(el) && el.getBoundingClientRect().width < 120) clipped.push(`${label(el)} only ${Math.round(el.getBoundingClientRect().width)} px wide (${el.placeholder})`);
      }
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
      // Past the footer: the page scrolls on below the site footer, and what lies down there.
      const foot = document.querySelector('.gt-footer');
      const footBottom = foot ? Math.round(foot.getBoundingClientRect().bottom + scrollY) : null;
      const scrollHeight = document.documentElement.scrollHeight;
      const below = footBottom !== null && scrollHeight > footBottom + PAST_FOOTER
        ? [...new Set([...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().top + scrollY > footBottom).map((el) => label(el.parentElement ?? el)))].slice(0, 3)
        : null;
      return { wide, sticking, clipped, overlaps, scrollWidth: document.documentElement.scrollWidth, vw, scrollHeight, footBottom, below };
    }, PAST_FOOTER);
    if (!phone) {
      // At 1440 only the footer check: the others are phone layout checks.
      found.wide = false; found.clipped = []; found.overlaps = [];
    }
    const file = `${out}/${width}-${p.path === '/' ? 'home' : p.path.slice(1).replace(/\//g, '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const issues = [found.wide && `sideways scroll (${found.scrollWidth} px): ${found.sticking.join('; ')}`, found.clipped.length && `clipped: ${found.clipped.join('; ')}`, found.overlaps.length && `overlap: ${found.overlaps.join('; ')}`, found.below && `runs ${found.scrollHeight - found.footBottom} px past the footer (${found.scrollHeight} px tall, footer ends at ${found.footBottom}): ${found.below.join('; ')}`].filter(Boolean);
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
