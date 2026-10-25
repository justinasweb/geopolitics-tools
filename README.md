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
| `npm run data:pull` | Download the latest data snapshot from R2 into `data/raw/` (needs the Cloudflare keys) |
| `npm run build` | Build every page from `data/raw/` to `dist/` and check it against Cloudflare's file limits |
| `npm run build:sample` | Build from the prototype's sample files instead (marked Sample on every page; never deployed) |
| `npm run serve` | Serve `dist/` exactly as Cloudflare will (clean URLs, 404 page, `/api/*`) at http://localhost:8787 |
| `npm run check` | Lint, type check and unit tests |
| `npm run test:e2e` | Route and browser checks against `BASE` (default http://localhost:8787) |
| `node pipeline/run.ts --only=<source>` | Fetch one data source into `.data/` (see [docs/data-pipeline.md](docs/data-pipeline.md)) |

## Layout

| Path | What |
|---|---|
| `src/pages/` | Pages and generated files (`robots.txt`, `sitemap.xml`, share images, CSVs, map files); `/dev/components` shows every design component, `/dev/map` every map overlay |
| `src/lib/routes.ts` | The route registry: every page, its path, redirects and whether it is built and indexed (see [docs/page-engine.md](docs/page-engine.md)) |
| `src/templates/` | Page templates: country, Compare, indicator, long read, Sources, map views |
| `src/lib/map/`, `src/scripts/map/` | The map engine: basemap, layer files, overlays, and the MapLibre island (see [docs/maps.md](docs/maps.md)) |
| `src/content/pages/` | About, Methodology and Privacy in Markdown |
| `src/i18n/` | Words, sentence templates and slugs, one file per language |
| `src/components/`, `src/styles/`, `src/scripts/` | The Atlas design system in code (see [docs/design-system.md](docs/design-system.md)) |
| `src/design/tokens.json` | Design tokens; `node scripts/tokens.ts` checks them and writes `src/styles/tokens.css` |
| `src/layouts/` | Document shell (`Base`) and site page (`Page`: header, page container, footer) |
| `src/holding/` | Temporary holding page served as the home page until launch |
| `worker/` | The only server code: `/api/*` (health check now; correction form and review button later) |
| `public/` | Files copied as-is (`_headers`, favicon, share image) |
| `scripts/` | Build helpers |
| `pipeline/` | Data fetchers and the hourly runner (raw files and snapshots in R2) |
| `tests/unit/` | Vitest unit tests |
| `tests/e2e/` | Checks against a running copy of the site |
| `docs/` | How the project is set up and run |

## Data

See [docs/data-pipeline.md](docs/data-pipeline.md). An hourly GitHub Actions run fetches each source when it is due,
checks it, keeps the last good copy when a check fails, stores raw files and snapshots in R2 and alerts on Telegram.
The site build pulls the latest snapshot and generates every page from it ([docs/page-engine.md](docs/page-engine.md)).

## Deploys

See [docs/deploy.md](docs/deploy.md). In short: every pull request gets a private Preview link, every
merge to `main` goes to production, and both are checked automatically after deploying.
