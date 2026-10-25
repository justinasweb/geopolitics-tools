# Build and deploy

Everything runs in GitHub Actions (`.github/workflows/ci.yml`). Nothing is deployed from a laptop.

## What happens when

| Event | Jobs |
|---|---|
| Pull request opened or updated | **check** (lint, type check, unit tests, pull the latest data snapshot from R2, build, file-limit check, local serve with `wrangler dev` plus browser checks at 1440 and 390 px), **secrets** (gitleaks over the history), then **preview**: deploys a Cloudflare Preview named `pr-<number>`, posts its link on the PR and runs the same checks against it |
| Push to `main` (a merged PR) | **check**, **secrets**, then **production**: makes sure the R2 buckets exist, runs `wrangler deploy` and checks the live site |
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

- `wrangler.jsonc`: Worker name `geopolitics-tools`, assets from `dist/`, `/api/*` runs `worker/index.ts` first,
  unknown addresses get `404.html` with status 404, `/page.html` redirects to `/page`.
- Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (set; the data pipeline uses them for R2 too),
  `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (data alerts), and `GH_DISPATCH_TOKEN` (a fine-grained token for
  this repository with "Actions: read and write", so the Worker can start a data run GitHub skipped). The production
  job copies the last three into the Worker's secrets. Optional: `CF_ACCESS_CLIENT_ID`
  and `CF_ACCESS_CLIENT_SECRET`, an Access service token, so CI can check Previews once they are private.
  Without it the Preview check notices the Access login page and skips.
- Repository variables (optional): `PRODUCTION_URL` (set to `https://geopolitics.tools` once the domain points at the
  Worker; until then the workers.dev address is used), `SITE_INDEXABLE` (`true` at launch: removes `noindex` and
  opens `robots.txt`).

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
