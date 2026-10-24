# geopolitics.tools

Maps and charts from free official and research data on resources, trade, security and alliances:
who depends on whom, for what.

Static site built with [Astro](https://astro.build) and served by a Cloudflare Worker with static assets.
Until launch the home page is the holding page in `src/holding/index.html`, and every page is `noindex`.

## Commands

Needs Node 24 (`.nvmrc`).

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server with live reload (http://localhost:4321) |
| `npm run build` | Build to `dist/` and check it against Cloudflare's file limits |
| `npm run serve` | Serve `dist/` exactly as Cloudflare will (clean URLs, 404 page, `/api/*`) at http://localhost:8787 |
| `npm run check` | Lint, type check and unit tests |
| `npm run test:e2e` | Route and browser checks against `BASE` (default http://localhost:8787) |

## Layout

| Path | What |
|---|---|
| `src/pages/` | Pages and generated files (`robots.txt`) |
| `src/layouts/` | Page shell |
| `src/holding/` | Temporary holding page served as the home page until launch |
| `worker/` | The only server code: `/api/*` (health check now; correction form and review button later) |
| `public/` | Files copied as-is (`_headers`, favicon, share image) |
| `scripts/` | Build helpers |
| `tests/unit/` | Vitest unit tests |
| `tests/e2e/` | Checks against a running copy of the site |
| `docs/` | How the project is set up and run |

## Deploys

See [docs/deploy.md](docs/deploy.md). In short: every pull request gets a private Preview link, every
merge to `main` goes to production, and both are checked automatically after deploying.
