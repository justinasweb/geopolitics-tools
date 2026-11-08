// Launch QA, keyboard and motion: Tab through Atlas, a map view and the home page (search), checking every stop is
// visible and shows a focus ring; open each dialog, sheet and menu from the keyboard, close it with Esc and check
// focus goes back to what opened it; and with prefers-reduced-motion, check nothing is left animating.
// Usage: BASE=http://localhost:8787 node tests/qa/keyboard.mjs [report.json]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BASE } from './pages.mjs';

const browser = await chromium.launch();
const results = [];
const record = (area, check, ok, detail = '') => {
  results.push({ area, check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${area}: ${check}${detail ? ` (${detail})` : ''}`);
};

/** What has focus: a short description, whether it is visible, and whether it shows a focus ring. */
const focused = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  // The ring may be drawn on the element or, through :focus-within, on a box up to three levels around it.
  const hasRing = (n) => { const c = getComputedStyle(n); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none'); };
  let ring = false;
  for (let n = el, i = 0; n && i < 4 && !ring; n = n.parentElement, i++) ring = hasRing(n);
  const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
  return { desc: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''} "${name}"`, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', ring };
});

/** Tabs through a page; every stop must be visible and show a ring, and focus must not get stuck. */
async function tabWalk(page, area, max = 120) {
  const seen = new Map();
  let noRing = [], hidden = [], stops = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await focused(page);
    if (!f) continue;
    stops++;
    if (seen.has(f.desc) && seen.get(f.desc) > 2) break;
    seen.set(f.desc, (seen.get(f.desc) ?? 0) + 1);
    if (!f.visible) hidden.push(f.desc);
    else if (!f.ring) noRing.push(f.desc);
  }
  record(area, `Tab reaches ${stops} stops`, stops > 5);
  record(area, 'every focused element is visible', !hidden.length, [...new Set(hidden)].slice(0, 6).join('; '));
  record(area, 'every focused element shows a focus ring', !noRing.length, [...new Set(noRing)].slice(0, 6).join('; '));
}

/** Focuses `opener`, presses Enter, checks `isOpen`, presses Esc, checks it closed and focus is back on the opener. */
async function escReturns(page, area, what, opener, isOpen) {
  const btn = page.locator(opener).locator('visible=true').first();
  if (!(await btn.count())) return record(area, `${what}: opener found`, false, opener);
  await btn.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const opened = await isOpen();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = !(await isOpen());
  const back = await btn.evaluate((el) => el === document.activeElement);
  record(area, `${what}: Enter opens, Esc closes, focus returns`, opened && closed && back, `opened ${opened}, closed ${closed}, focus back ${back}`);
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Home: the page's own search box (the header's search button scrolls to it there, no dialog).
let page = await desktop.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await tabWalk(page, 'Home');
await page.close();

// Any other page: the search dialog and the correction form.
page = await desktop.newPage();
await page.goto(`${BASE}/countries/germany`, { waitUntil: 'networkidle' });
const dialogOpen = () => page.locator('dialog[open]').count().then((n) => n > 0);
await escReturns(page, 'Country page', 'Search dialog', '[data-gt-search]', dialogOpen);
await escReturns(page, 'Country page', 'Correction form', '[data-gt-corr]', dialogOpen);
await page.close();

// A map view: controls, legend, the country panel from the keyboard.
page = await desktop.newPage();
await page.goto(`${BASE}/minerals/lithium`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await tabWalk(page, 'Map view');
const canvas = page.locator('canvas').first();
if (await canvas.count()) {
  // N steps to the next country, Enter opens its panel while focus stays on the map (so N and P go on working), Esc
  // closes it.
  await canvas.focus();
  await page.keyboard.press('n');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const panel = () => page.locator('[data-panel="country"]').first().isVisible();
  const opened = await panel();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = !(await panel());
  const onMap = await page.evaluate(() => document.activeElement?.tagName === 'CANVAS');
  record('Map view', 'country panel: N then Enter opens it, Esc closes it, focus stays on the map', opened && closed && onMap, `opened ${opened}, closed ${closed}, on map ${onMap}`);
}
await page.close();

// Atlas: share, menu, the legend's hide button.
page = await desktop.newPage();
await page.goto(`${BASE}/atlas`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await tabWalk(page, 'Atlas', 160);
const expanded = (sel) => () => page.locator(sel).locator('visible=true').first().getAttribute('aria-expanded').then((v) => v === 'true');
await escReturns(page, 'Atlas', 'Share panel', '[data-at-share]', expanded('[data-at-share]'));
await escReturns(page, 'Atlas', 'Menu', '[data-at-menu]', expanded('[data-at-menu]'));
const leg = page.locator('[data-at-leghide]').locator('visible=true').first();
if (await leg.count()) {
  const before = await leg.getAttribute('aria-expanded');
  await leg.focus();
  await page.keyboard.press('Enter');
  const after = await page.locator('[data-at-leghide]').locator('visible=true').first().getAttribute('aria-expanded');
  record('Atlas', 'legend: Enter hides and shows it', before !== after, `${before} → ${after}`);
}
await page.close();

// Phone: the site menu, a map view's full-screen map.
page = await phone.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await tabWalk(page, 'Home, 390 px', 60);
await escReturns(page, 'Home, 390 px', 'Site menu', '[data-gt-menu-open]', expanded('[data-gt-menu-open]'));
await page.goto(`${BASE}/minerals/lithium`, { waitUntil: 'networkidle' });
await escReturns(page, 'Map view, 390 px', 'Full-screen map', '[data-show-map]', () => page.locator('dialog[open]').count().then((n) => n > 0));
await page.close();

// Reduced motion: after loading and opening things, nothing is still animating.
const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
for (const path of ['/', '/minerals/lithium', '/atlas', '/this-week']) {
  page = await calm.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.locator('[data-gt-search]').locator('visible=true').first().click().catch(() => {});
  await page.waitForTimeout(50);
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration) > 20)
    .map((a) => `${a.constructor.name} ${a.animationName ?? a.transitionProperty ?? ''} on ${a.effect?.target?.className || a.effect?.target?.tagName}`));
  record(`Reduced motion ${path}`, 'nothing animates after load and opening search', !moving.length, moving.slice(0, 4).join('; '));
  await page.close();
}

await browser.close();
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
