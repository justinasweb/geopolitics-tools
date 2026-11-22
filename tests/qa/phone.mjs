// Launch QA, phone layout: every page of tests/qa/pages.mjs at 390 and 360 px wide, full-page screenshots, and four
// checks: no sideways scroll, no text cut off by its box, no two controls (links, buttons, inputs) overlapping, and
// no page running on past its footer. The last one also runs at 1440 px, where wide tables scroll inside a box.
// Pages on the map view wrapper are also checked at every width for blocks past the header's content edges, and map
// pages at phone widths for panel edges: the inline panel (and with a place selected) within the page text, the
// full-screen map's bottom sheet with 16 px at its sides.
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

// Side edges in map panels and sheets. The bottom sheets are boxed: every block in a sheet's head, body or foot, and
// anything else it holds directly, keeps at least 16 px from its left and right edges, from the wrappers' padding.
// The inline panel on a phone is unboxed (PhoneMapView design): its blocks sit on the page gutter and may not reach
// past the page text's left or right edge (main's content box).
const PANEL_GAP = 16;
async function panelPadding(page) {
  return page.evaluate((GAP) => {
    const out = [];
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; };
    const name = (e) => `${e.tagName.toLowerCase()}${e.classList[0] ? `.${e.classList[0]}` : ''}`;
    const blocksOf = (box) => [...box.querySelectorAll(':scope .gt-panel__head > *, :scope .gt-panel__body > *, :scope .gt-panel__foot > *'),
      ...[...box.children].filter((c) => !c.matches('[data-panel], .gt-panel__head, .gt-panel__body, .gt-panel__foot, .gt-sheet__grab'))];
    const main = document.querySelector('main');
    const ms = main && getComputedStyle(main), mr = main?.getBoundingClientRect();
    const textL = mr ? mr.left + parseFloat(ms.paddingLeft) : 0, textR = mr ? mr.right - parseFloat(ms.paddingRight) : innerWidth;
    for (const box of document.querySelectorAll('.gt-mvpanel, .gt-atpanel, [data-map-sheet], .gt-sheet')) {
      if (!vis(box)) continue;
      const br = box.getBoundingClientRect();
      // A sheet, or a panel drawn as a box (the Atlas's), keeps the 16 px; the unboxed inline panel keeps to the page text.
      const boxed = box.matches('[data-map-sheet], .gt-sheet') || getComputedStyle(box).backgroundColor !== 'rgba(0, 0, 0, 0)';
      for (const b of blocksOf(box)) {
        if (!vis(b)) continue;
        const r = b.getBoundingClientRect();
        if (boxed) {
          const l = Math.round(r.left - br.left), rt = Math.round(br.right - r.right);
          if (l < GAP - 0.5 || rt < GAP - 0.5) out.push(`${name(box)} > ${name(b)} ${l} px from the left, ${rt} px from the right (boxed: ${GAP} px)`);
        } else if (r.left < textL - 0.5 || r.right > textR + 0.5) {
          out.push(`${name(box)} > ${name(b)} ${Math.round(r.left)}–${Math.round(r.right)}, past the page text ${Math.round(textL)}–${Math.round(textR)}`);
        }
        if (out.length >= 5) return out;
      }
    }
    return out;
  }, PANEL_GAP);
}

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
      // Overlapping controls: two visible controls whose boxes cross by more than a few pixels. Each line box counts on
      // its own (getClientRects), so a link that wraps doesn't "cover" the one after it.
      const ctl = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')].filter((el) => visible(el) && !el.closest('.gt-tablewrap, svg, .maplibregl-map'));
      const boxes = ctl.map((el) => ({ el, rs: [...el.getClientRects()] }));
      const cross = (p, q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 4 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 4;
      const overlaps = [];
      for (let i = 0; i < boxes.length && overlaps.length < 5; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (a.rs.some((p) => b.rs.some((q) => cross(p, q)))) { overlaps.push(`${label(a.el)} × ${label(b.el)}`); break; }
      }
      // Past the footer: the page scrolls on below the site footer, and what lies down there.
      const foot = document.querySelector('.gt-footer');
      const footBottom = foot ? Math.round(foot.getBoundingClientRect().bottom + scrollY) : null;
      const scrollHeight = document.documentElement.scrollHeight;
      const below = footBottom !== null && scrollHeight > footBottom + PAST_FOOTER
        ? [...new Set([...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().top + scrollY > footBottom).map((el) => label(el.parentElement ?? el)))].slice(0, 3)
        : null;
      // Content edges: on a page built on the map view wrapper (place pages, map views), every block and what is in it
      // lies within the header's content edges, as the wrapper sets them. The map stage is wider on purpose; tables
      // scroll in their box and SVG drawings clip to theirs.
      const head = document.querySelector('.gt-header__in');
      const edges = [];
      const mv = document.querySelector('main.gt-mv');
      if (head && mv) {
        const hs = getComputedStyle(head), hr = head.getBoundingClientRect();
        const L = hr.left + parseFloat(hs.paddingLeft), R = hr.right - parseFloat(hs.paddingRight);
        for (const el of mv.querySelectorAll('*')) {
          if (!visible(el) || el.closest('.gt-stage, svg, .gt-tablewrap, .gt-mvcompact')) continue;
          const r = el.getBoundingClientRect();
          if (r.left < L - 1 || r.right > R + 1) edges.push(`${label(el)} ${Math.round(r.left)}–${Math.round(r.right)}, header content ${Math.round(L)}–${Math.round(R)}`);
          if (edges.length >= 5) break;
        }
      }
      return { wide, sticking, clipped, overlaps, edges, scrollWidth: document.documentElement.scrollWidth, vw, scrollHeight, footBottom, below };
    }, PAST_FOOTER);
    // Map panels at phone widths: the inline panel, a place selected in it, then the full-screen map's sheet after a tap.
    found.panels = [];
    if (phone && p.map) {
      found.panels.push(...await panelPadding(page));
      const picked = await page.evaluate(() => { const b = [...document.querySelectorAll('.gt-mvpanel [data-panel="world"] [data-select]')].find((e) => e.getBoundingClientRect().width > 0); b?.click(); return !!b; });
      if (picked) { await page.waitForTimeout(300); found.panels.push(...await panelPadding(page)); await page.evaluate(() => document.querySelector('.gt-mvpanel [data-panel-close]')?.click()); }
      const show = page.locator('[data-show-map]').first();
      if (await show.count() && await show.isVisible()) {
        await show.click();
        const canvas = page.locator('.gt-mapfull canvas');
        await canvas.waitFor({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const c = await canvas.boundingBox().catch(() => null);
        if (c) for (const [fx, fy] of [[0.5, 0.45], [0.3, 0.4], [0.6, 0.35], [0.7, 0.5], [0.45, 0.55]]) {
          await page.touchscreen.tap(c.x + c.width * fx, c.y + c.height * fy);
          await page.waitForTimeout(400);
          if (await page.locator('.gt-mapfull [data-map-sheet]:not([hidden])').count()) break;
        }
        found.panels.push(...await panelPadding(page));
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      }
      found.panels = [...new Set(found.panels)];
    }
    if (!phone) {
      // At 1440 only the footer and content-edge checks: the others are phone layout checks.
      found.wide = false; found.clipped = []; found.overlaps = [];
    }
    const file = `${out}/${width}-${p.path === '/' ? 'home' : p.path.slice(1).replace(/\//g, '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const issues = [found.panels.length && `panel edges: ${found.panels.join('; ')}`, found.edges.length && `past the header's content edges: ${found.edges.join('; ')}`, found.wide && `sideways scroll (${found.scrollWidth} px): ${found.sticking.join('; ')}`, found.clipped.length && `clipped: ${found.clipped.join('; ')}`, found.overlaps.length && `overlap: ${found.overlaps.join('; ')}`, found.below && `runs ${found.scrollHeight - found.footBottom} px past the footer (${found.scrollHeight} px tall, footer ends at ${found.footBottom}): ${found.below.join('; ')}`].filter(Boolean);
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
