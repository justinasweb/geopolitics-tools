// Fails the build if dist/ breaks a Cloudflare Workers static-assets limit (free plan: 20,000 files,
// 25 MiB per file), is missing a file the deploy relies on, or a page outside /dev/ carries a Sample tag
// (illustrative figures must never reach a live page), or a page in the sitemap has an empty or duplicate title or
// description, or more than one <h1>. Warns on a title over 65 characters or a description outside 70–170. Prints a
// size summary.
import { readdirSync, statSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const REQUIRED = ['index.html', '404.html', 'robots.txt', '_headers', '_redirects', 'sitemap.xml'];

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push({ path: relative(dir, p), bytes: statSync(p).size });
  }
};
walk(dir);

const errors = [];
if (files.length > MAX_FILES) errors.push(`${files.length} files, limit is ${MAX_FILES}`);
for (const f of files) if (f.bytes > MAX_FILE_BYTES) errors.push(`${f.path} is ${(f.bytes / 2 ** 20).toFixed(1)} MiB, limit is 25 MiB`);
// A sample-data build (npm run build:sample) is for local work and pull requests from forks, never a deploy.
const allowSample = process.env.ALLOW_SAMPLE === '1';
for (const f of files) {
  if (!allowSample && f.path.endsWith('.html') && !f.path.startsWith('dev/') && readFileSync(join(dir, f.path), 'utf8').includes('gt-tag--sample')) {
    errors.push(`${f.path} shows a Sample tag: illustrative figures must not reach a live page`);
  }
}
for (const r of REQUIRED) if (!existsSync(join(dir, r))) errors.push(`missing ${r}`);

// Titles, descriptions and headings of the pages search engines are told about.
const TITLE_MAX = 65;
const DESC_RANGE = [70, 170];
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const warnings = [];
if (existsSync(join(dir, 'sitemap.xml'))) {
  const locs = [...readFileSync(join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const seen = { title: new Map(), description: new Map() };
  const long = [];
  const odd = [];
  for (const path of locs) {
    const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
    if (!existsSync(join(dir, file))) { errors.push(`${path} is in the sitemap but ${file} is missing`); continue; }
    const html = readFileSync(join(dir, file), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    const title = decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    const desc = decode(head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
    const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
    if (!title) errors.push(`${path} has an empty title`);
    if (!desc) errors.push(`${path} has an empty description`);
    if (h1s > 1) errors.push(`${path} has ${h1s} <h1>s`);
    for (const [k, v] of [['title', title], ['description', desc]]) {
      if (!v) continue;
      if (seen[k].has(v)) errors.push(`${path} has the same ${k} as ${seen[k].get(v)}: "${v}"`);
      else seen[k].set(v, path);
    }
    if (title.length > TITLE_MAX) long.push(`  ${path} (${title.length}): ${title}`);
    if (desc && (desc.length < DESC_RANGE[0] || desc.length > DESC_RANGE[1])) odd.push(`  ${path} (${desc.length}): ${desc}`);
  }
  if (long.length) warnings.push(`${long.length} titles over ${TITLE_MAX} characters:\n${long.join('\n')}`);
  if (odd.length) warnings.push(`${odd.length} descriptions outside ${DESC_RANGE[0]}–${DESC_RANGE[1]} characters:\n${odd.join('\n')}`);
}
for (const w of warnings) console.warn(`check-dist: warning: ${w}`);

const total = files.reduce((s, f) => s + f.bytes, 0);
const largest = files.reduce((a, b) => (b.bytes > a.bytes ? b : a), { path: '-', bytes: 0 });
const summary = `dist: ${files.length} files, ${(total / 2 ** 20).toFixed(2)} MiB, largest ${largest.path} (${(largest.bytes / 1024).toFixed(0)} KiB)`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

if (errors.length) {
  for (const e of errors) console.error(`check-dist: ${e}`);
  process.exit(1);
}
