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
for (const [from, to] of [['/countries/usa', '/countries/united-states'], ['/compare/china-vs-united-states', '/compare/united-states-vs-china']]) {
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

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
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
