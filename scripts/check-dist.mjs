// Fails the build if dist/ breaks a Cloudflare Workers static-assets limit (free plan: 20,000 files,
// 25 MiB per file) or is missing a file the deploy relies on. Prints a size summary.
import { readdirSync, statSync, existsSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const REQUIRED = ['index.html', '404.html', 'robots.txt', '_headers'];

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
for (const r of REQUIRED) if (!existsSync(join(dir, r))) errors.push(`missing ${r}`);

const total = files.reduce((s, f) => s + f.bytes, 0);
const largest = files.reduce((a, b) => (b.bytes > a.bytes ? b : a), { path: '-', bytes: 0 });
const summary = `dist: ${files.length} files, ${(total / 2 ** 20).toFixed(2)} MiB, largest ${largest.path} (${(largest.bytes / 1024).toFixed(0)} KiB)`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

if (errors.length) {
  for (const e of errors) console.error(`check-dist: ${e}`);
  process.exit(1);
}
