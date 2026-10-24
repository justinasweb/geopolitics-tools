import { defineConfig } from 'astro/config';

// Static build: every page is plain HTML, served by Cloudflare Workers static assets.
// build.format 'file' writes /about.html, which Workers serves at /about (and redirects /about.html there).
export default defineConfig({
  site: 'https://geopolitics.tools',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
});
