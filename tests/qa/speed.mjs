// Launch QA, speed: Lighthouse (mobile preset) on every page of tests/qa/pages.mjs against a served build, checked
// against the budget: LCP under 2.5 s, CLS under 0.1, TBT under 200 ms; JavaScript under 100 KB gzipped (450 KB on
// map pages) and CSS under 50 KB gzipped. JS and CSS sizes are what each page loads, gzipped here, so the figures do
// not depend on whether the local server compresses.
// Usage: BASE=http://localhost:8787 node tests/qa/speed.mjs [report.json]
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { BASE, PAGES } from './pages.mjs';

export const BUDGET = { lcp: 2500, cls: 0.1, tbt: 200, js: 100, jsMap: 450, css: 50 };
/**
 * Accepted exceptions (docs/launch-qa.md). The Atlas stays map-first on phones (owner's decision, 6 Nov 2026), so its
 * TBT is MapLibre's start-up, about 2.6 s; it may go up to 4 s here, so a real slowdown still fails.
 */
export const EXCEPTIONS = { '/atlas': { tbt: 4000 } };

const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
const gz = new Map();
const gzKb = async (url) => {
  if (!gz.has(url)) gz.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => gzipSync(Buffer.from(b), { level: 9 }).length / 1024));
  return gz.get(url);
};

const rows = [];
for (const p of PAGES.filter((x) => !x.status)) {
  const { lhr } = await lighthouse(BASE + p.path, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'] });
  const a = lhr.audits;
  const reqs = a['network-requests']?.details?.items ?? [];
  const sum = async (type) => (await Promise.all(reqs.filter((r) => r.resourceType === type && r.url.startsWith(BASE)).map((r) => gzKb(r.url)))).reduce((s, x) => s + x, 0);
  const r = {
    name: p.name, path: p.path, map: Boolean(p.map), score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcp: Math.round(a['largest-contentful-paint'].numericValue), cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
    tbt: Math.round(a['total-blocking-time'].numericValue), js: Math.round(await sum('Script')), css: Math.round(await sum('Stylesheet')),
  };
  r.over = [
    r.lcp >= BUDGET.lcp && `LCP ${r.lcp} ms`, r.cls >= BUDGET.cls && `CLS ${r.cls}`, r.tbt >= (EXCEPTIONS[p.path]?.tbt ?? BUDGET.tbt) && `TBT ${r.tbt} ms`,
    r.js >= (r.map ? BUDGET.jsMap : BUDGET.js) && `JS ${r.js} KB`, r.css >= BUDGET.css && `CSS ${r.css} KB`,
  ].filter(Boolean);
  r.accepted = EXCEPTIONS[p.path] && r.tbt >= BUDGET.tbt && !r.over.length ? `TBT ${r.tbt} ms, accepted exception` : undefined;
  rows.push(r);
  console.log(`${r.over.length ? 'OVER' : 'ok  '} ${p.name.padEnd(24)} LCP ${String(r.lcp).padStart(5)} ms  CLS ${String(r.cls).padEnd(5)}  TBT ${String(r.tbt).padStart(4)} ms  JS ${String(r.js).padStart(3)} KB  CSS ${String(r.css).padStart(2)} KB  score ${r.score}${r.over.length ? `  ← ${r.over.join(', ')}` : r.accepted ? `  (${r.accepted})` : ''}`);
}
await chrome.kill();
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
const over = rows.filter((r) => r.over.length);
console.log(`\n${rows.length} pages, ${over.length} over budget`);
process.exit(over.length ? 1 : 0);
