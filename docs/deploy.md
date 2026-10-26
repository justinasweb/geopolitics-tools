# Build and deploy

Everything runs in GitHub Actions (`.github/workflows/ci.yml`). Nothing is deployed from a laptop.

## What happens when

| Event | Jobs |
|---|---|
| Pull request opened or updated | **check** (lint, type check, unit tests, pull the latest data snapshot from R2, build, file-limit check, local serve with `wrangler dev` plus browser checks at 1440 and 390 px), **secrets** (gitleaks over the history), then **preview**: deploys a Cloudflare Preview named `pr-<number>`, posts its link on the PR and runs the same checks against it |
| Push to `main` (a merged PR) | **check**, **secrets**, then **production**: makes sure the R2 buckets exist, runs `wrangler deploy` and checks the live site |
| Run workflow on `main` (Actions tab → ci) | The same as a push: rebuilds from the latest data snapshot and deploys, for new data such as an import |
| Pull request closed | **cleanup**: deletes that PR's Preview |

Forked pull requests are checked but never deployed (they get no secrets).

## Platform choice: Workers static assets, not Pages

Decided in phase 0 (24 Oct 2026). The site is plain static files, so both would serve it free and unlimited.
Workers wins on what comes next:

- **Previews.** Cloudflare's branch Previews (`wrangler preview`) are a Workers feature and the documented
  way to test changes before production ([docs](https://developers.cloudflare.com/workers/previews/)).
  `workers.dev` Preview URLs send `X-Robots-Tag: noindex` on their own. They are in open beta; if they
  misbehave, the fallback is Version URLs with `wrangler versions upload --preview-alias pr-<n>`.
- **Private previews in one place.** A Worker's Access tab can protect "Previews only", leaving production public
  ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)).
- **One Worker for everything server-side.** The correction form, Telegram review button and the staleness
  check (a Cron Trigger, which Pages does not have) live in `worker/` with the site.
- `_headers`, `_redirects`, clean URLs and a real 404 page work the same as on Pages
  ([docs](https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/)).

Limits that matter (free plan): 20,000 files and 25 MiB per file, checked by `scripts/check-dist.mjs` on every
build; 100 Previews per Worker, oldest deleted automatically.

## Configuration

- `wrangler.jsonc`: Worker name `geopolitics-tools`, served on the custom domain `geopolitics.tools` (and on
  workers.dev, which CI checks use), assets from `dist/`, `/api/*` runs `worker/index.ts` first,
  unknown addresses get `404.html` with status 404, `/page.html` redirects to `/page`.
- Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (set; the data pipeline uses them for R2 too),
  `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (data alerts), and `GH_DISPATCH_TOKEN` (a fine-grained token for
  this repository with "Actions: read and write", so the Worker can start a data run GitHub skipped). The production
  job copies the last three into the Worker's secrets. Optional: `CF_ACCESS_CLIENT_ID`
  and `CF_ACCESS_CLIENT_SECRET`, an Access service token, so CI can check Previews once they are private.
  Without it the Preview check notices the Access login page and skips.
- Repository variables (optional): `PRODUCTION_URL` (leave unset until launch: the domain shows only the holding
  page until then, so the production checks run on the workers.dev address; set it to `https://geopolitics.tools`
  at launch), `SITE_INDEXABLE` (`true` at launch: removes `noindex` and
  opens `robots.txt`), `SITE_HOLDING` (`false` at launch: production stops serving the holding page as
  the home page; until then production builds get it and pull request builds get the development index).

## Before launch: noindex everywhere

Until `SITE_INDEXABLE` is `true`, every build, production and Previews alike, carries three signals:

- `X-Robots-Tag: noindex` on every file (added to `_headers` at build time by `astro.config.mjs`; `/api/` sets its own),
- `<meta name="robots" content="noindex">` on every page, including the holding page,
- `robots.txt` with `Disallow: /`.

The browser checks (`tests/e2e/smoke.mjs`) fail if any of them is missing, so a deploy that loses one shows red.
On top of that, while `SITE_HOLDING` is on, `geopolitics.tools` shows only the holding page: the Worker sends every
other address there with a 302 (`worker/index.ts`, switched on by the `HOLDING` variable the production deploy sets).
The workers.dev address and Previews keep every page, so CI can check them; they are not linked anywhere.
`www.geopolitics.tools` is not connected; a Cloudflare Redirect Rule (www to the bare domain) is the planned way
to cover it.

## Analytics

Fathom (cookieless, site `DNBPMMDA`, set in `src/lib/site.ts`) is tagged on every page and on the holding page,
with `data-included-domains="geopolitics.tools"`: Fathom counts visits only there, never on workers.dev, Previews
or localhost. Until launch that domain serves only the holding page, so only it is counted; at launch every page
is, with no change.

## R2 buckets

Created by the production job if missing:

| Bucket | Holds |
|---|---|
| `gt-raw` | Raw source files, `<source>/<run>/`, and the data runner's state |
| `gt-snapshots` | Data snapshots (which raw files make up a release), so a whole release can be rolled back |

Layout and retention rules: [data-pipeline.md](data-pipeline.md). The production job also creates the retention rules.
`gt-raw` already existed from the platform test and holds that test's World Bank files under time-stamped folders.

## Rolling back

Cloudflare dashboard → Workers & Pages → `geopolitics-tools` → Deployments → pick an earlier one → Rollback.
Or revert the PR on GitHub, which deploys the previous code.
