import { renameSync } from 'node:fs';
import { defineConfig } from 'astro/config';

// Astro skips pages whose names start with "_", so the redirects are built as redirects.txt and moved here.
const redirectsFile = {
  name: 'redirects-file',
  hooks: { 'astro:build:done': ({ dir }) => renameSync(new URL('redirects.txt', dir), new URL('_redirects', dir)) },
};

// Static build: every page is plain HTML, served by Cloudflare Workers static assets.
// build.format 'file' writes /about.html, which Workers serves at /about (and redirects /about.html there).
export default defineConfig({
  site: 'https://geopolitics.tools',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [redirectsFile],
});
