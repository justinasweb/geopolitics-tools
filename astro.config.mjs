import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';

// Astro skips pages whose names start with "_", so the redirects are built as redirects.txt and moved here.
const redirectsFile = {
  name: 'redirects-file',
  hooks: { 'astro:build:done': ({ dir }) => renameSync(new URL('redirects.txt', dir), new URL('_redirects', dir)) },
};

// Until launch (src/lib/site.ts) every file is sent with X-Robots-Tag: noindex, not only the HTML pages with their
// meta tag: CSVs, images and JSON too, on the domain, workers.dev and Previews alike. /api/ sets its own.
// It goes into the existing /* block: a second /* block would replace that block's headers, not add to them.
const noindexHeader = {
  name: 'noindex-header',
  hooks: {
    'astro:build:done': ({ dir }) => {
      if (process.env.SITE_INDEXABLE === 'true') return;
      const file = new URL('_headers', dir);
      const headers = readFileSync(file, 'utf8');
      if (!headers.startsWith('/*\n')) throw new Error('public/_headers must start with the /* block');
      writeFileSync(file, headers.replace('/*\n', '/*\n  X-Robots-Tag: noindex\n'));
    },
  },
};

// Static build: every page is plain HTML, served by Cloudflare Workers static assets.
// build.format 'file' writes /about.html, which Workers serves at /about (and redirects /about.html there).
export default defineConfig({
  site: 'https://geopolitics.tools',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [redirectsFile, noindexHeader],
});
