// Launch QA, accessibility: axe on every page of tests/qa/pages.mjs, plus the search and correction dialogs open,
// at desktop width and at phone width (390 px), where the menus and panels differ. Prints each page's serious and critical violations and exits 1 if there are any.
// Usage: BASE=http://localhost:8787 node tests/qa/a11y.mjs [report.json]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { BASE, PAGES } from './pages.mjs';

const browser = await chromium.launch();
const results = [];

async function scan(page, name, path) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  results.push({ name, path, violations: bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')), count: v.nodes.length })) });
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name} (${path})${bad.map((v) => `\n     ${v.impact} ${v.id} ×${v.nodes.length}: ${v.help} [${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}]`).join('')}`);
}

for (const [width, label] of [[1440, ''], [390, ', 390 px']]) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
    await scan(page, p.name + label, p.path);
    await page.close();
  }
  // The dialogs, opened as a reader would.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/countries/germany`, { waitUntil: 'networkidle' });
  await page.locator('[data-gt-search]:visible').first().click();
  await page.waitForTimeout(300);
  await scan(page, `Search dialog (open)${label}`, '/countries/germany');
  await page.keyboard.press('Escape');
  await page.locator('[data-gt-corr]:visible').first().click();
  await page.waitForTimeout(300);
  await scan(page, `Correction form (open)${label}`, '/countries/germany');
  await ctx.close();
}

await browser.close();
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.violations.length);
console.log(`\n${results.length} scans, ${failed.length} with serious or critical issues`);
process.exit(failed.length ? 1 : 0);
