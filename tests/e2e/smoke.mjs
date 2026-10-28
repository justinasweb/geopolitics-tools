// Checks a running copy of the site (local `wrangler dev` or a deployed preview/production URL):
// status codes, clean URLs, the 404 page, the API, then the home page in a browser at desktop and phone width.
// Usage: BASE=https://… node tests/e2e/smoke.mjs [screenshot dir]
// Behind Cloudflare Access, set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (a service token).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = (process.env.BASE || 'http://localhost:8787').replace(/\/$/, '');
const out = process.argv[2] ?? 'shots';
const expectIndexable = process.env.SITE_INDEXABLE === 'true';
const headers = process.env.CF_ACCESS_CLIENT_ID
  ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET ?? '' }
  : {};

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};
const get = (path) => fetch(base + path, { headers, redirect: 'manual' });

// Wait for a fresh hostname (new preview certificates can take a minute or two).
for (let i = 0; ; i++) {
  try {
    const res = await get('/');
    if (res.status < 500) break;
  } catch {
    /* not up yet */
  }
  if (i === 30) throw new Error(`${base} did not answer`);
  await new Promise((r) => setTimeout(r, 10_000));
}

const home = await get('/');
if (home.status === 302 && /cloudflareaccess\.com/.test(home.headers.get('location') ?? '')) {
  console.log(`${base} is behind Cloudflare Access and no service token is set: skipping the live checks.`);
  process.exit(0);
}
const homeHtml = await home.text();
check(home.status === 200, `/ returns 200 (got ${home.status})`);
check(/noindex/.test(homeHtml) !== expectIndexable, `/ ${expectIndexable ? 'has no' : 'has a'} noindex tag`);

const html = await get('/index.html');
check([301, 307, 308].includes(html.status) && new URL(html.headers.get('location') ?? '', base).pathname === '/', `/index.html redirects to / (got ${html.status})`);

const missing = await get('/does-not-exist');
check(missing.status === 404, `unknown address returns 404 (got ${missing.status})`);
check(/not on the map/.test(await missing.text()), 'unknown address shows the 404 page');

// Generated pages (phase 3): the indexes, a dossier, Compare, an indicator, the long reads, and the 301s.
for (const path of ['/countries', '/countries/united-states', '/compare/united-states-vs-china', '/indicators', '/indicators/gdp', '/methodology', '/sources', '/sitemap.xml']) {
  const res = await get(path);
  check(res.status === 200, `${path} returns 200 (got ${res.status})`);
}
// The map engine (phase 4): the basemap, and the lithium view with its layer file when the snapshot has USGS
// minerals (an imported source: until its file is imported, the views are not built).
check((await get('/geo/basemap.json')).status === 200, '/geo/basemap.json returns 200');
const minerals = (await get('/map/minerals-lithium.json')).status === 200;
if (minerals) check((await get('/minerals/lithium')).status === 200, '/minerals/lithium returns 200');
else console.log('skip /minerals/lithium: USGS minerals are not in this snapshot');
for (const [from, to] of [['/countries/usa', '/countries/united-states'], ['/compare/china-vs-united-states', '/compare/united-states-vs-china'], ...(minerals ? [['/minerals', '/minerals/lithium']] : [])]) {
  const res = await get(from);
  check(res.status === 301 && new URL(res.headers.get('location') ?? '', base).pathname === to, `${from} redirects to ${to} (got ${res.status})`);
}

const robots = await get('/robots.txt');
const robotsText = await robots.text();
check(robots.status === 200 && (expectIndexable ? /Allow: \//.test(robotsText) : /Disallow: \//.test(robotsText)), `robots.txt ${expectIndexable ? 'allows' : 'disallows'} crawling`);

const health = await get('/api/health');
check(health.status === 200 && (await health.json()).ok === true, `/api/health answers (got ${health.status})`);

const favicon = await get('/favicon.svg');
check(favicon.status === 200, `favicon loads (got ${favicon.status})`);
check(home.headers.get('x-content-type-options') === 'nosniff', 'security headers from _headers are applied');
for (const [path, res] of [['/', home], ['/robots.txt', robots], ['/favicon.svg', favicon]]) {
  const tag = /noindex/.test(res.headers.get('x-robots-tag') ?? '');
  check(tag !== expectIndexable, `${path} ${expectIndexable ? 'has no' : 'sends an'} X-Robots-Tag: noindex header`);
}

mkdirSync(out, { recursive: true });
// SwiftShader gives headless Chromium the WebGL the map needs.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, extraHTTPHeaders: headers });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!sideways, `${name}: no sideways scroll`);
  check(errors.length === 0, `${name}: no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
  await page.screenshot({ path: `${out}/home-${name}.png`, fullPage: true });

  // A dossier, Compare and an indicator page: no errors, nothing wider than the screen.
  for (const [shot, path] of [['dossier', '/countries/china'], ['compare', '/compare/united-states-vs-china'], ['indicator', '/indicators/gdp']]) {
    errors.length = 0;
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: ${path} has no sideways scroll`);
    check(errors.length === 0, `${name}: ${path} has no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
    await page.screenshot({ path: `${out}/${shot}-${name}.png`, fullPage: true });
  }

  // The lithium map view, opened on a country: the map draws, the panel shows the country, the URL keeps it.
  errors.length = 0;
  if (minerals) {
    await page.goto(`${base}/minerals/lithium?country=australia`, { waitUntil: 'networkidle' });
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: /minerals/lithium has no sideways scroll`);
    check((await page.textContent('[data-panel="country"] h2'))?.trim() === 'Australia', `${name}: ?country=australia opens Australia's panel`);
    if (name === 'phone') await page.click('[data-show-map]');
    else await page.locator('.gt-stage').scrollIntoViewIfNeeded();
    const drawn = await page.waitForSelector('[data-map-state="loading"][hidden]', { state: 'attached', timeout: 30_000 }).then(() => true, () => false);
    const failed = await page.isVisible('[data-map-state="error"]');
    check(drawn && !failed, `${name}: the map loads${failed ? ' (it shows its error state)' : ''}`);
    const size = await page.evaluate(() => { const c = [...document.querySelectorAll('.maplibregl-canvas')].find((x) => x.offsetParent); return c ? c.getBoundingClientRect().height : 0; });
    check(size > 300, `${name}: the map fills its frame (${Math.round(size)} px high)`);
    if (name === 'phone') check(await page.evaluate(() => document.querySelector('[data-mapfull]').open), 'phone: Show map opens the full-screen map');
    await page.waitForTimeout(800);
    check(errors.length === 0, `${name}: /minerals/lithium has no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
    await page.screenshot({ path: `${out}/minerals-${name}.png` });
  }

  // The Explorer's scatter: the chart draws after its data loads and the address keeps the settings.
  errors.length = 0;
  await page.goto(`${base}/explorer/scatter`, { waitUntil: 'networkidle' });
  check(await page.locator('svg.gt-sc circle').count() > 2, `${name}: the Explorer scatter draws`);
  check(/[?&]x=/.test(page.url()), `${name}: the Explorer keeps its settings in the address`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: /explorer/scatter has no sideways scroll`);
  check(errors.length === 0, `${name}: /explorer/scatter has no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
  await page.screenshot({ path: `${out}/explorer-${name}.png`, fullPage: true });

  // Dependencies: the single points of failure and the grid (or, on a phone, a country's card) draw, and a filter
  // goes into the address.
  errors.length = 0;
  await page.goto(`${base}/dependencies`, { waitUntil: 'networkidle' });
  check(await page.locator('.gt-spof__list li').count() > 0, `${name}: Dependencies lists single points of failure`);
  check(await page.locator('.gt-dgtbl tbody tr, .gt-dgcard').count() > 1, `${name}: Dependencies draws the grid and the card`);
  await page.locator('[data-d-set="bloc"]:visible').selectOption({ index: 1 });
  check(/[?&]bloc=/.test(page.url()), `${name}: Dependencies keeps the bloc filter in the address`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: /dependencies has no sideways scroll`);
  check(errors.length === 0, `${name}: /dependencies has no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
  await page.screenshot({ path: `${out}/dependencies-${name}.png`, fullPage: true });

  // Supply chains: the index lists flows; a flow page draws the Sankey (or, on a phone, the top flows), and focusing
  // a country redraws it and goes into the address.
  errors.length = 0;
  await page.goto(`${base}/supply-chains`, { waitUntil: 'networkidle' });
  const chainLink = page.locator('.gt-skindex a').first();
  check(await page.locator('.gt-skindex a').count() > 0, `${name}: Supply chains lists flows`);
  await page.goto(`${base}${await chainLink.getAttribute('href')}`, { waitUntil: 'networkidle' });
  check(await page.locator('.gt-sk__band').count() > 1, `${name}: a supply chain draws its bands`);
  check(await page.locator('.gt-sktable tbody tr').count() > 1, `${name}: a supply chain lists its flows in a table`);
  if (name === 'phone') check(await page.locator('.gt-flowlist li').count() > 1, `${name}: a supply chain leads with its top flows`);
  const target = await page.locator('.gt-sktable tbody tr td a').first().textContent();
  await page.fill('#sk-c', target ?? '');
  await page.press('#sk-c', 'Enter');
  check(/[?&]country=/.test(page.url()), `${name}: a supply chain keeps the focus in the address`);
  check(await page.locator('.gt-blocchip').count() === 1, `${name}: a supply chain shows the focus`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: a supply chain has no sideways scroll`);
  check(errors.length === 0, `${name}: supply chains have no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
  await page.screenshot({ path: `${out}/supply-chain-${name}.png`, fullPage: true });

  // The header: on desktop the Tools menu opens inside the screen and Esc closes it; on a phone the menu opens under
  // a bar that does not move, the page behind keeps its scroll, and the same button closes it.
  errors.length = 0;
  await page.goto(`${base}/countries/china`, { waitUntil: 'networkidle' });
  if (name === 'desktop') {
    const tools = page.locator('.gt-nav__btn', { hasText: 'Tools' });
    if (await tools.count()) {
      await tools.click();
      const panel = await page.evaluate(() => { const m = document.querySelector('.gt-nav__item--end .gt-mega'); const r = m.getBoundingClientRect(); return !m.hidden && r.left >= 0 && r.right <= window.innerWidth; });
      check(panel, `${name}: the Tools menu opens inside the screen`);
      await page.keyboard.press('Escape');
      check(await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Tools'), `${name}: Esc closes the Tools menu and returns focus`);
    }
  } else {
    await page.evaluate(() => window.scrollTo(0, 20));
    const bar = () => page.evaluate(() => { const r = document.querySelector('.gt-header').getBoundingClientRect(); const b = document.querySelector('[data-gt-menu-open]').getBoundingClientRect(); return `${r.top},${r.bottom},${b.left},${b.top}`; });
    const shut = await bar();
    await page.evaluate(() => document.querySelector('[data-gt-menu-open]').click());
    const menu = await page.evaluate(() => { const m = document.querySelector('[data-gt-menu]'); return { open: !m.hidden, top: m.getBoundingClientRect().top, bar: document.querySelector('.gt-header').getBoundingClientRect().bottom, inert: document.querySelector('main').inert }; });
    check(menu.open && menu.top === menu.bar && menu.inert, `${name}: the menu opens under the bar, with the page inert`);
    check(await bar() === shut, `${name}: the header bar does not move when the menu opens`);
    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(200);
    check(await page.evaluate(() => window.scrollY) === 20, `${name}: the page behind the menu does not scroll`);
    await page.evaluate(() => document.querySelector('[data-gt-menu-open]').click());
    check(await page.evaluate(() => document.querySelector('[data-gt-menu]').hidden && window.scrollY === 20 && !document.querySelector('main').inert), `${name}: the menu button closes the menu, at the same scroll`);
  }
  check(errors.length === 0, `${name}: the header has no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);

  // The design system's components page (hidden, noindex): renders without errors or sideways scroll.
  errors.length = 0;
  await page.goto(`${base}/dev/components`, { waitUntil: 'networkidle' });
  check(/noindex/.test(await page.content()), `${name}: /dev/components is noindex`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: /dev/components has no sideways scroll`);
  check(errors.length === 0, `${name}: /dev/components has no console errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
  await page.screenshot({ path: `${out}/components-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();

if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`all checks passed on ${base}`);
