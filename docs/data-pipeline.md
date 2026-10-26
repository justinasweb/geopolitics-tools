# Data pipeline

How source data gets from 33 public sources into the site. Phase 1 of the development plan.

## In short

- **One hourly run** (`.github/workflows/data.yml`, minute 23) checks every source against its own schedule and
  fetches only what is due. Nothing runs on a laptop or a server of ours.
- **Each fetcher saves the source's own format**, trimmed but never reshaped (dropped columns, aggregates and
  bulky fields only). Turning it into the site's shape is the adapters' job, at build time. Where the prototype had
  a live fetcher, the files match its samples (FAOSTAT and the Pink Sheet included, whose sources are bulk files and
  Excel), so the adapters are tested on those samples.
- **Nothing is saved unless it passes its checks**: the expected fields are there, enough countries or rows, not far
  fewer values than the last good copy, and not older than it should be. A failed check keeps the last good copy, so
  the site never loses data because a source had a bad day.
- **Raw files and snapshots live in R2.** Every changed copy is kept, so a release can be rebuilt exactly and sources'
  revisions can be traced. A snapshot records which copies make up the data at one moment; the site builds from one.
- **An outside watch backs up the schedule.** GitHub's scheduled runs are best-effort and can be skipped, so the site's
  Worker has an hourly Cron Trigger (minute 41, `worker/watch.ts`): if no data run started in the last 50 minutes it
  starts one through the GitHub API, and if the published `status.json` is more than 6 hours old it alerts on
  Telegram (decision D11).
- **New data reaches the site only on a deploy** (a merge, or Run workflow on ci). The hourly run publishes snapshots
  but rebuilds nothing. Open question for launch: rebuild automatically (say once a day, when a snapshot changed),
  or keep rebuilds manual.
- **Alerts go to Telegram** when a source fails twice in a row or goes past its freshness deadline, then at most once a
  day while the problem lasts, and once more when it works again. The run also fails, so GitHub's failed-run email is a
  backup.

## Layout

| Path | What |
|---|---|
| `pipeline/run.ts` | The runner's command line (options at the top of the file) |
| `pipeline/import.ts` | The import tool's command line, for sources with no API |
| `pipeline/sources/` | One file per source: schedule, deadline, credit, licence and its fetcher |
| `pipeline/sources/imported.ts` | The imported sources and the file kinds each takes: columns kept, row filter, checks |
| `pipeline/lib/runner.ts` | One run: due sources, checks, saving, state, alerts, snapshot |
| `pipeline/lib/state.ts` | Scheduling and alert rules (pure functions, unit tested) |
| `pipeline/lib/store.ts` | R2 through the Cloudflare API, or a local folder |
| `pipeline/lib/zip.ts`, `pipeline/lib/xlsx.ts` | Zip files (in memory, or streamed from disk for FAOSTAT's bulk files) and Excel sheets |
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
| GDACS disaster alerts | 1 hour | 3 days | Orange and red alerts for 365 days, green for 30 (each hour asks for the last 3 days of green and keeps the rest; the 00 UTC run asks for all 30) |
| USGS earthquakes | 1 hour | 3 days | Magnitude 5.5+ for 365 days |
| IODA internet outages | 1 hour | 3 days | Country outage events for 365 days (each hour asks for the last 30 days and keeps the rest; the 00 UTC run asks for the year) |
| CelesTrak SATCAT | 1 day | 10 days | The whole satellite catalogue |
| US Consolidated Screening List | 1 day | 10 days | All records, trimmed to list, programmes, country, dates |
| EU sanctions list | 1 day | 10 days | Entity rows: type, programme, dates, countries |
| World Bank Indicators | 7 days | 45 days | 14 indicators since 2000, aggregates dropped |
| US Treasury TIC | 7 days | 45 days | Table 5, major foreign holders, last 13 months |
| Epoch AI | 7 days | 60 days | Notable AI models, GPU clusters |
| Our World in Data CO2 | 30 days | 400 days | 20 columns from 1990 |
| UNHCR | 30 days | 200 days | Totals by origin and by host, and origin–host pairs, since 2015 |
| UK Sanctions List | 1 day | 10 days | Designations: type, regime, dates, countries |
| World Bank Pink Sheet | 7 days | 45 days | Monthly food, fertiliser, metals and gas prices from 2010, in three files; refuses a workbook more than 3 months old |
| Submarine cables (OpenStreetMap) | 30 days | 120 days | Underwater communication cables and cable landing stations, from one Overpass query |
| FAOSTAT | 30 days | 400 days | Wheat, maize, rice and soybean production and trade, nitrogen, phosphate and potash, since 2015, by ISO3 code; each importer's 10 main suppliers in the latest well-reported year |
| IMF World Economic Outlook | 30 days | 200 days | **Off** until the IMF allows scheduled downloads. Growth, inflation, debt, deficit, unemployment, current account; country groups dropped |
| IMF PortWatch chokepoints | 20 hours | 10 days | **Off**, as above. The chokepoints and their daily transits for 400 days |
| EIA | 7 days | 60 days | **Off** until `EIA_API_KEY` is set. Crude oil and all liquids production, oil consumption, dry gas production and consumption, by country since 2000 (the API no longer has reserves); Brent and WTI monthly from 2010 |
| UN Comtrade | 7 days | 60 days | **Off** until `COMTRADE_API_KEY` is set. Imports and exports by partner, one file per group and year (crude, gas, potash and phosphate, chips and chipmaking machines, total trade), 2015 to last year: the latest three years each run, older years once, at most `COMTRADE_MAX_CALLS` calls a run (default 90) |
| Ember | 7 days | 60 days | **Off** until `EMBER_API_KEY` is set. Yearly generation by source, every country and the world, since 2000 |
| UCDP | 7 days | 45 days | **Off** until `UCDP_TOKEN` is set. Events since 2023 from the latest yearly release (GED) and the monthly Candidate releases after it, one file per release; a release already saved is carried over |
| IPC | 1 day | 14 days | **Off** until `IPC_API_KEY` is set. Every country-level acute food insecurity analysis (IPC and Cadre Harmonisé), current period |

A failed source is retried after 1, 2, 4… hours, never later than its normal interval.

Sources with no API are imported by hand when they publish (see "Importing a file" below). Still to come in phase 1:
IMF reserves (gold in tonnes needs the IMF's new SDMX
service checked first).

**Keyed sources.** EIA, UN Comtrade, Ember, UCDP and IPC each switch on when their key is a repository secret
(`EIA_API_KEY`, `COMTRADE_API_KEY`, `EMBER_API_KEY`, `UCDP_TOKEN`, `IPC_API_KEY`); the data workflow passes all five,
and the live check runs Comtrade with `COMTRADE_MAX_CALLS=8`. Until then their views build from the prototype's sample
files in `tests/fixtures/prototype/` (`npm run build:sample`) and are not in a live build. EIA's key goes in the query
string and Ember's as `api_key`; errors are logged without query strings. Comtrade's key goes in the
`Ocp-Apim-Subscription-Key` header and UCDP's in `x-ucdp-access-token`. Each fetcher refuses an answer that is cut off
or much smaller than the last good copy. FAOSTAT has no fertiliser trade matrix, so potash and phosphate flows come
from UN Comtrade (HS 3104; phosphate is HS 3103 plus DAP 310530 and MAP 310540, not all of 3105, which includes
NPK blends).

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
on the source's side only show as a warning, since the hourly run retries them anyway. Pull requests that change only
adapters or place codes skip the live fetch: ci's check job runs the adapters on the latest snapshot it pulls for the
build (`node pipeline/adapter-check.ts data/raw`), which takes seconds and spends no API quota.

Every fetcher takes its address from an environment variable when set (`WORLDBANK_BASE`, `GDACS_BASE`,
`USGS_EQ_BASE`, `UNHCR_BASE`, `IODA_BASE`, `TIC_URL`, `OWID_URL`, `CELESTRAK_URL`, `CSL_URL`, `EU_FSF_URL`,
`UK_SANCTIONS_URL`, `PINKSHEET_URL`, `OVERPASS_URL`, `FAOSTAT_BASE`, `IMF_DATAMAPPER_BASE`, `PORTWATCH_URL`), so it
can be pointed at a stub.

## Importing a file

Nine sources have no API or refuse scripts, so their files are downloaded by hand on release and imported:

```sh
node pipeline/import.ts --list                                   # the kinds, and which download each expects
node pipeline/import.ts sipri ~/Downloads/trade-register.csv     # into .data/, to try it
node pipeline/import.ts wpp-age WPP2024_PopulationByAge5GroupSex_Medium.csv.gz --store=r2
```

| Source | Kinds | Released |
|---|---|---|
| SIPRI Arms Transfers | `sipri` | Each March |
| UN World Population Prospects | `wpp-total`, `wpp-indicators`, `wpp-age` | Every two years |
| Global Energy Monitor | `gem-coal`, `gem-nuclear`, `gem-lng`, `gem-pipelines` | About twice a year |
| WRI Aqueduct | `aqueduct-baseline`, `aqueduct-future` | Rarely |
| FAO AQUASTAT | `aquastat` | Rarely |
| Global Dam Watch | `gdw` | Rarely |
| AidData | `aiddata` | Every few years |
| USGS Mineral Commodity Summaries | `usgs` (one file per edition, so older ones can be added) | Each January |
| US Treasury holdings, history | `treasury-history` | Built once |

Without a local copy of the repository, the **import** workflow does the same with the repository's secrets: Actions
tab → import → Run workflow, with the kind and the file's download address (and `name` when the address does not end
in the file's own name, as USGS needs `MCS2026_Commodities_Data.csv`). Then run the **ci** workflow on `main` to
rebuild the site from the new snapshot.

It takes the file as downloaded: CSV, JSON or an Excel workbook (the sheet with the needed columns is found, or name
it with `--sheet=`), gzipped or zipped (`--entry=` picks the file when a zip holds several); Windows text is turned
into UTF-8. It stops with the file's own columns listed if one it needs is missing, keeps only the needed columns,
applies the kind's filter (countries only, for instance), and refuses fewer than 10 rows or far fewer than the last
import (`--allow-shrink` when that is real). Columns we keep by hand, such as a GEM terminal's stop year, are added
empty when the file lacks them. The file is then saved like a fetched one, recorded with its download name and date,
and published in a new snapshot; the hourly run keeps it in every snapshot after that. `--store=r2` needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment, as for the runner.

## Settings

| Repository secret | Needed for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | R2 (already set for deploys) |
| `GH_DISPATCH_TOKEN` | The Worker's outside watch, to start a run GitHub skipped (fine-grained, this repository, "Actions: read and write") |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alerts. Without them alerts are only printed in the run log, and the run fails so GitHub emails. To check them: Run workflow with "test alert" ticked |

Errors are written without query strings, so an API key in an address never reaches a log or `status.json`.

## Adding a source

1. Add `pipeline/sources/<id>.ts` exporting a `Source` (copy a similar one), and list it in `pipeline/sources/index.ts`.
2. Save the source's own format; check fields, a minimum size and shrink against `ctx.previous()`; throw on anything odd.
3. Add a stub test in `tests/unit/pipeline/sources.test.ts`, then open a pull request: its live check runs the new
   fetcher against the real service.
4. The adapter that reads the file goes in `src/adapters/`. The live check also runs every indicator and flow on the
   files it fetched (`node pipeline/adapter-check.ts <dir>`, which works on any folder `pipeline/pull.ts` wrote) and
   prints each adapter's unmatched codes; add those to `src/data/places/codes.csv`. Every ci run does the same on the
   latest snapshot.
