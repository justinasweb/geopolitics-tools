// Launch QA, links and sources: crawls the served build from / and
//   1. reports every internal link (href, src) that answers 404, with the pages it is on;
//   2. on every page, with JavaScript off (figures are in the HTML), finds each figure, chart, map and table and checks
//      that a line next to it names a source and a year or date: within its own box, or the nearest section around it.
// Usage: BASE=http://localhost:8787 node tests/qa/crawl.mjs [report.json]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BASE } from './pages.mjs';

const pages = new Map(); // path → status
const linkedFrom = new Map(); // path → set of pages
const queue = ['/'];
const norm = (href, from) => {
  try {
    const u = new URL(href, BASE + from);
    if (u.origin !== new URL(BASE).origin) return null;
    return u.pathname.replace(/\/$/, '') || '/';
  } catch { return null; }
};
const isPage = (p) => !/\.(png|jpg|svg|json|csv|xml|txt|woff2?|js|css|ico|pdf)$/.test(p) && !p.startsWith('/api/') && !p.startsWith('/cdn-cgi/');

// 1. Links: fetch every page reachable from /, and every asset they reference.
while (queue.length) {
  const path = queue.shift();
  if (pages.has(path)) continue;
  const res = await fetch(BASE + path, { redirect: 'follow' });
  pages.set(path, res.status);
  if (!res.ok || !isPage(path) || !(res.headers.get('content-type') ?? '').includes('html')) continue;
  const html = await res.text();
  for (const m of html.matchAll(/\s(?:href|src)="([^"#]+)/g)) {
    const p = norm(m[1].replace(/&amp;/g, '&'), path);
    if (!p) continue;
    if (!linkedFrom.has(p)) linkedFrom.set(p, new Set());
    linkedFrom.get(p).add(path);
    if (!pages.has(p) && !queue.includes(p)) queue.push(p);
  }
}
const broken = [...pages].filter(([, s]) => s === 404).map(([p]) => ({ path: p, from: [...(linkedFrom.get(p) ?? [])].slice(0, 5) }));
console.log(`Links: ${pages.size} addresses, ${broken.length} answer 404`);
for (const b of broken) console.log(`  404 ${b.path} ← ${b.from.join(', ')}`);

// 2. Sources: every figure, chart, map and table has a source and a year or date next to it.
const browser = await chromium.launch();
const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
const srcPage = await ctx.newPage();
await srcPage.goto(`${BASE}/sources`);
const names = await srcPage.evaluate(() => [...document.querySelectorAll('.gt-srctbl tbody tr > :first-child')].map((c) => c.textContent.trim().split(/\s{2,}|\n/)[0]).filter(Boolean));
// Short forms used on lines ("World Bank, 2025", "UN WPP", "GDACS") besides the registry names.
const known = [...new Set([...names, 'World Bank', 'IMF', 'UN ', 'UNHCR', 'FAOSTAT', 'USGS', 'SIPRI', 'EIA', 'Comtrade', 'Ember', 'Global Carbon Budget', 'GDACS', 'IODA', 'UCDP', 'Epoch', 'CelesTrak', 'FAS', 'AidData', 'Aqueduct', 'AQUASTAT', 'Global Dam Watch', 'EuRepoC', 'Treasury', 'TIC', 'OFAC', 'Consolidated Screening List', 'CSL', 'member lists', 'EU sanctions', 'UK Sanctions', 'IPC', 'TeleGeography', 'OpenStreetMap', 'Natural Earth', 'UNODA', 'geopolitics.tools'])];
await srcPage.close();

const FIGURES = '.gt-kf, .gt-cpstat, .gt-lcw, svg.gt-smap, .gt-stage, .gt-pyr, table.gt-table, .gt-bars, .gt-qbars, .gt-counts, .gt-card:not(.gt-card--empty)';
const missing = [];
const htmlPages = [...pages].filter(([p, s]) => s === 200 && isPage(p) && !p.startsWith('/dev')).map(([p]) => p);
for (const path of htmlPages) {
  const page = await ctx.newPage();
  await page.goto(BASE + path);
  const found = await page.evaluate(({ FIGURES, known }) => {
    // Spaces normalised: short source names are written with no-break spaces ("UN WPP").
    const flat = (t) => t.replace(/\s+/g, ' ');
    const hasSource = (t) => known.some((n) => flat(t).includes(flat(n)));
    // A year anywhere, not run into other digits (textContent joins "2025" to the next word: "2025Report").
    const hasDate = (t) => /(?<!\d)(1[89]|20)\d{2}(?!\d)/.test(t);
    const ok = (el) => { const t = el.textContent ?? ''; return hasSource(t) && hasDate(t); };
    const out = [];
    // A table whose columns give each row's source and year (the indicator index, a country's All figures) is sourced
    // row by row.
    const rowSourced = (el) => el.matches('table') && /Source/.test(el.tHead?.textContent ?? '') && /Year|year/.test(el.tHead?.textContent ?? '');
    for (const el of document.querySelectorAll(FIGURES)) {
      if (el.closest('[hidden], template, .gt-holding, nav, footer, header, #corrections') || rowSourced(el)) continue;
      // Its own box, then each box around it up to the nearest section (or six levels).
      let n = el, fine = false;
      for (let i = 0; n && i < 7 && !fine; n = n.parentElement, i++) {
        const lines = n.matches('.gt-source, .gt-caption, figcaption') ? [n] : [...n.querySelectorAll('.gt-source, .gt-caption, figcaption, caption, .gt-card__src, .gt-qcard__src, .gt-cpstat__c')];
        fine = lines.some(ok) || (i <= 1 && ok(n));
        if (n.matches('section, article, main, dialog')) break;
      }
      // Or a line right next to its section: the section before or after it, or after the box the section sits in.
      if (!fine) {
        const sec = el.closest('section');
        const near = [sec?.previousElementSibling, sec?.nextElementSibling, sec?.parentElement?.nextElementSibling].filter(Boolean);
        fine = near.some((x) => (x.matches('.gt-source, .gt-caption') ? [x] : [...x.querySelectorAll('.gt-source')]).some(ok));
      }
      if (!fine) out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}: "${(el.closest('section')?.querySelector('h2, h3')?.textContent ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}"`);
    }
    return out;
  }, { FIGURES, known });
  if (found.length) missing.push({ path, figures: found });
  await page.close();
}
await browser.close();
console.log(`\nSources: ${htmlPages.length} pages, ${missing.length} with a figure lacking a source and date line`);
for (const m of missing) console.log(`  ${m.path}\n    ${m.figures.slice(0, 4).join('\n    ')}${m.figures.length > 4 ? `\n    … ${m.figures.length - 4} more` : ''}`);

if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ broken, missing }, null, 2));
process.exit(broken.length || missing.length ? 1 : 0);
