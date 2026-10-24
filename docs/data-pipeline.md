# Data pipeline

How source data gets from 33 public sources into the site. Phase 1 of the development plan.

## In short

- **One hourly run** (`.github/workflows/data.yml`, minute 23) checks every source against its own schedule and
  fetches only what is due. Nothing runs on a laptop or a server of ours.
- **Each fetcher saves the source's own format**, trimmed but never reshaped (dropped columns, aggregates and
  bulky fields only). Turning it into the site's shape is the adapters' job, at build time.
- **Nothing is saved unless it passes its checks**: the expected fields are there, enough countries or rows, not far
  fewer values than the last good copy, and not older than it should be. A failed check keeps the last good copy, so
  the site never loses data because a source had a bad day.
- **Raw files and snapshots live in R2.** Every changed copy is kept, so a release can be rebuilt exactly and sources'
  revisions can be traced. A snapshot records which copies make up the data at one moment; the site builds from one.
- **Alerts go to Telegram** when a source fails twice in a row or goes past its freshness deadline, then at most once a
  day while the problem lasts, and once more when it works again. The run also fails, so GitHub's failed-run email is a
  backup.

## Layout

| Path | What |
|---|---|
| `pipeline/run.ts` | The runner's command line (options at the top of the file) |
| `pipeline/sources/` | One file per source: schedule, deadline, credit, licence and its fetcher |
| `pipeline/lib/runner.ts` | One run: due sources, checks, saving, state, alerts, snapshot |
| `pipeline/lib/state.ts` | Scheduling and alert rules (pure functions, unit tested) |
| `pipeline/lib/store.ts` | R2 through the Cloudflare API, or a local folder |
| `pipeline/pull.ts` | Downloads a snapshot's files to `data/raw/` for a build or local work |
| `pipeline/r2-check.ts` | Write-and-read test of both buckets, run on pull requests |
| `tests/unit/pipeline/` | The runner and every fetcher against stubs (no network) |

The pipeline uses only Node's built-in modules: the hourly job installs nothing.

## Storage

| Bucket | Key | What |
|---|---|---|
| `gt-raw` | `<source>/<run>/<file>.gz` | Every copy that differed from the one before, gzipped. Kept for good, except hourly sources (GDACS, USGS earthquakes, IODA): two weeks |
| `gt-raw` | `state/status.json` | The runner's memory: per source, last try, last success, failures in a row, open alert and which copy is the last good one |
| `gt-snapshots` | `snapshots/<run>.json` | A snapshot: for each source, its files (key, SHA-256, size), when fetched, latest period, credit and licence |
| `gt-snapshots` | `latest.json` | The newest snapshot; the site build uses it |
| `gt-snapshots` | `status.json` | Public summary per source (ok, stale, last success, last error), for the Sources page and the staleness check |

A run is named by its start time, such as `2026-10-24T1623Z`. A run in which nothing changed saves no copies and no
snapshot, only the state and status. The retention rules are created by the production deploy job from
`node pipeline/run.ts --retention`; a source under a rule re-saves its unchanged copy after half the period, so the
last good copy never expires.

**Rolling data back:** build with an earlier snapshot (`node pipeline/pull.ts --snapshot=<run>`). Pages and code roll
back separately, from Cloudflare's deployments.

## Schedules

`node pipeline/run.ts --list` prints the current table.

| Source | Every | Deadline | Saves |
|---|---|---|---|
| GDACS disaster alerts | 1 hour | 3 days | Orange and red alerts for 365 days, green for 30 |
| USGS earthquakes | 1 hour | 3 days | Magnitude 5.5+ for 365 days |
| IODA internet outages | 1 hour | 3 days | Country outage events for 365 days |
| CelesTrak SATCAT | 1 day | 10 days | The whole satellite catalogue |
| US Consolidated Screening List | 1 day | 10 days | All records, trimmed to list, programmes, country, dates |
| EU sanctions list | 1 day | 10 days | Entity rows: type, programme, dates, countries |
| World Bank Indicators | 7 days | 45 days | 14 indicators since 2000, aggregates dropped |
| US Treasury TIC | 7 days | 45 days | Table 5, major foreign holders, last 13 months |
| Epoch AI | 7 days | 60 days | Notable AI models, GPU clusters |
| Our World in Data CO2 | 30 days | 400 days | 20 columns from 1990 |
| UNHCR | 30 days | 200 days | Totals by origin and by host, and origin–host pairs, since 2015 |

A failed source is retried after 1, 2, 4… hours, never later than its normal interval.

Still to come in phase 1: FAOSTAT, World Bank Pink Sheet, UK sanctions, submarine cables, the import tool for
file-only sources (USGS minerals, SIPRI, UN population, Global Energy Monitor, water datasets, AidData), and IMF
WEO, reserves and PortWatch (built but switched off until the IMF answers on scheduled downloads). Keyed sources
(EIA, UN Comtrade, Ember, UCDP, IPC) follow as their keys arrive.

## Running it

| Command | What |
|---|---|
| `node pipeline/run.ts --only=owid` | Fetch one source into `.data/` (a local stand-in for both buckets) |
| `node pipeline/run.ts --force` | Every enabled source into `.data/` |
| `node pipeline/run.ts --store=r2` | Against the real buckets (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`) |
| `node pipeline/pull.ts --store=dir:.data --out=data/raw` | Unpack the latest local snapshot |

On GitHub: Actions → **data** → Run workflow, with optional sources and "force". Every pull request that touches
`pipeline/` runs all enabled sources against the real services (saved only inside that run) and an R2 write test.
It fails on a failed check or a client error (a wrong address, a changed format); network trouble and server errors
on the source's side only show as a warning, since the hourly run retries them anyway.

Every fetcher takes its address from an environment variable when set (`WORLDBANK_BASE`, `GDACS_BASE`,
`USGS_EQ_BASE`, `UNHCR_BASE`, `IODA_BASE`, `TIC_URL`, `OWID_URL`, `CELESTRAK_URL`, `CSL_URL`, `EU_FSF_URL`), so it can
be pointed at a stub.

## Settings

| Repository secret | Needed for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | R2 (already set for deploys) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alerts. Without them alerts are only printed in the run log, and the run fails so GitHub emails. To check them: Run workflow with "test alert" ticked |

Errors are written without query strings, so an API key in an address never reaches a log or `status.json`.

## Adding a source

1. Add `pipeline/sources/<id>.ts` exporting a `Source` (copy a similar one), and list it in `pipeline/sources/index.ts`.
2. Save the source's own format; check fields, a minimum size and shrink against `ctx.previous()`; throw on anything odd.
3. Add a stub test in `tests/unit/pipeline/sources.test.ts`, then open a pull request: its live check runs the new
   fetcher against the real service.
