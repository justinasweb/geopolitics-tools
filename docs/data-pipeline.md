# Data pipeline

How source data gets from the public sources in the licence table ([licences.md](licences.md), which gives their number) into the site. Phase 1 of the development plan.

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
  Telegram (decision D11). A missing, invalid or unreadable `status.json` alerts too, at most once in 24 hours; the
  time of the last such alert is kept in `gt-snapshots` as `watch/status-alert.json` (if that cannot be read or
  written, it alerts in the 08 UTC hour only).
- **New data reaches the site on a deploy, at least once a day.** Pages are built from the latest snapshot when the
  site deploys (a merge, Run workflow on ci, the week's deploy). After each hourly run, `data.yml` compares the latest
  snapshot (its id is its UTC time) with the last production deploy that passed or is still running: when the snapshot
  is newer and no deploy started in the last 23 hours, it starts one (`gh workflow run ci.yml`). So new data, fetched
  or imported, is live within about a day, and a failing deploy is not retried more than once a day.
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
| `pipeline/pull.ts` | Downloads a snapshot's files to `data/raw/` for a build or local work. Each source folder is replaced whole (written to `.<source>.new`, then swapped in once every file passed its checksum), so it holds only what that snapshot lists |
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
| `gt-snapshots` | `weeks/ledger.json` | This week's archive: the frozen weeks, and per day the raw copies of the three sanctions lists and of GDACS's alerts at that day's first run (45 days) |
| `gt-snapshots` | `weeks/<yyyy>-<ww>.json` | A closed ISO week's This week cards and feed, frozen once and never written again |

The run that freezes a week writes `frozen=<yyyy>-<ww>` to its step output, and `data.yml` then starts `week.yml` to
draft that week's summary ([telegram.md](telegram.md)). The summary itself is kept in the repository with the other AI
texts, not in R2.

A run is named by its start time, such as `2026-10-24T1623Z`. A run in which nothing changed saves no copies and no
snapshot, only the state and status. The snapshot and `latest.json` are written before the state, and every run
compares `latest.json`'s files with the state's: when a run saved new files but could not publish them, the next run
publishes a snapshot with them. The retention rules are created by the production deploy job from
`node pipeline/run.ts --retention`; a source under a rule re-saves its unchanged copy after half the period, so the
last good copy never expires.

**Rolling data back:** build with an earlier snapshot (`node pipeline/pull.ts --snapshot=<run>`). Pages and code roll
back separately, from Cloudflare's deployments.

## This week's archive

Each closed ISO week is kept at `/this-week/{yyyy}-{ww}` with the cards as they stood when it closed
(`pipeline/lib/weeks.ts`). At the start of every scheduled run (not `--only`), before any fetch:

1. **Daily copies.** On the day's first run it records which raw copies of the US, EU and UK lists and of GDACS's
   alerts are current (keys in `weeks/ledger.json`, no files copied: the lists' raw copies are kept for good,
   GDACS's for 14 days). A week compares with its own Monday's copies: entries added and removed, by each list's own
   ids, and alerts that were lower on Monday and rose to orange or red in the week. The live page's 7 days compare
   with the copy from their first day the same way.
2. **Freezing.** On the Monday or Tuesday after a week closes, it unpacks the last good copies of the page's sources,
   works the week out (`src/lib/week/model.ts`, the same code the live page uses) and writes `weeks/<id>.json` if it is
   not there yet. It never overwrites one, so revisions by a source later do not change an archived week.

A failure here is a warning in the run log and never holds up the data. `pipeline/pull.ts` brings the frozen weeks,
their summaries and the copies from the first of the live page's 7 days to `data/raw/weeks/`. Without a copy from
that day (the first days after this started), the sanctions card says there is nothing to compare yet and the
disasters card counts only alerts that began in the period.

**Why R2 and not files committed by the data run.** The archive sits beside the snapshots it is made from, in the
bucket the build already pulls, written by the same hourly job with the same token. Committing from the data run
would need write access to `main` for the job, put a bot commit on `main` every week (each one a production deploy),
and make the archive depend on the repository's history rather than the data store; R2 keeps data and code apart,
as the rest of the pipeline does. Week files are a few kilobytes and are never rewritten.

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
| World Bank Indicators | 7 days | 45 days | 17 indicators since 2000, aggregates dropped |
| US Treasury TIC | 7 days | 45 days | Table 5, major foreign holders, last 13 months |
| Epoch AI | 7 days | 60 days | Notable AI models, GPU clusters |
| Our World in Data CO2 | 30 days | 400 days | 20 columns from 1990 |
| EuRepoC cyber incidents | 30 days | 400 days | The pinned Zenodo version (1.3.2): incidents (id, start date, receiver countries and codes) and every attribution (basis, initiator, its kind), trimmed from the main and attribution CSVs, plus the version for the credit. A newer version on Zenodo sends a notice once and is never switched to by the fetcher (below) |
| FAS nuclear warheads (via Our World in Data) | 30 days | 400 days | Two OWID grapher CSVs crediting FAS, kept whole: estimated stockpiles, every state and year since 1945 (the series), and the latest estimate by status (deployed, reserve, retired). Each file's columns and years are logged before its checks |
| UNHCR | 30 days | 200 days | Totals by origin and by host, and origin–host pairs, since 2015 |
| UK Sanctions List | 1 day | 10 days | Designations: type, regime, dates, countries |
| World Bank Pink Sheet | 7 days | 45 days | Monthly food, fertiliser, metals and gas prices from 2010, in three files; refuses a workbook more than 3 months old |
| Submarine cables (OpenStreetMap) | 30 days | 120 days | Underwater communication cables and cable landing stations, from one Overpass query |
| FAOSTAT | 30 days | 400 days | Wheat, maize, rice and soybean production and trade, nitrogen, phosphate and potash, since 2015, by ISO3 code; each importer's 10 main suppliers in the latest well-reported year. Figures FAOSTAT flags as its own estimate or imputation (E, I) are tagged Estimate on the food views and, through `statusAt` (src/data/indicators.ts, `estimates`), on the indicator pages (table and lead), the country page, the Explorer's table and scatter tooltip (each measure's data file lists them as `e`) and the CSV's status column |
| IMF World Economic Outlook | 30 days | 200 days | **Off** until the IMF allows scheduled downloads; imported by hand instead (kind `imf-weo`, below). Growth, inflation, debt, deficit, unemployment, current account; country groups dropped |
| IMF PortWatch chokepoints | 20 hours | 10 days | **Off**, as above. The chokepoints and their daily transits for 400 days |
| EIA | 7 days | 60 days | **Off** until `EIA_API_KEY` is set. Crude oil and all liquids production, oil consumption, dry gas production and consumption, by country since 2000 (the API no longer has reserves); Brent and WTI monthly from 2010 |
| UN Comtrade | 7 days | 60 days | **Off** until `COMTRADE_API_KEY` is set. Imports and exports by partner, one file per group and year (crude, gas, potash and phosphate, chips and chipmaking machines, total trade), 2015 to last year: the latest three years each run, older years once, at most `COMTRADE_MAX_CALLS` calls a run (default 90) |
| Ember | 7 days | 60 days | **Off** until `EMBER_API_KEY` is set. Yearly generation by source, every country and the world, since 2000. A year that lacks a part the place reported above zero before is left out, total and shares (`src/adapters/ember.ts`; in the 6 Nov 2026 snapshot, Bosnia and Herzegovina 2008 and Colombia 2023) |
| UCDP | 7 days | 45 days | **Off** until `UCDP_TOKEN` is set. Events since 2023 from the latest yearly release (GED) and the monthly Candidate releases after it, one file per release; a release already saved is carried over. The adapter reads only the newest yearly release in `ucdp/` and the Candidate months after it, so an older yearly file never adds its events again |
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

**Notices.** A fetcher can return a `notice`: something to know that is not a failure. The runner sends it on
Telegram once, and again only when its wording changes; it is not an alert, so the run stays green. EuRepoC uses it
when Zenodo has a newer version of the dataset than the pinned one. To switch, change `RECORD` and `VERSION` in
`pipeline/sources/eurepoc.ts` in a pull request: the counts and the credit change with the version, so they are
reviewed like any other change.

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
`UK_SANCTIONS_URL`, `FAS_SERIES_URL`, `FAS_STATUS_URL`, `PINKSHEET_URL`, `OVERPASS_URL`, `FAOSTAT_BASE`, `IMF_DATAMAPPER_BASE`, `PORTWATCH_URL`, `ZENODO_BASE`), so it
can be pointed at a stub.

## Importing a file

Ten sources have no API, refuse scripts or need permission for scheduled downloads, so their files are downloaded by
hand on release and imported:

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
| FAS Status of World Nuclear Forces, current table | `fas-forces` | About twice a year: copy FAS's table by hand (below) |
| IMF World Economic Outlook | `imf-weo` | April and October (below) |

Without a local copy of the repository, the **import** workflow does the same with the repository's secrets: Actions
tab → import → Run workflow, with the kind and the file's download address (and `name` when the address does not end
in the file's own name, as USGS needs `MCS2026_Commodities_Data.csv`). The next hourly run starts a deploy with the new
snapshot within a day (above); run the **ci** workflow on `main` to rebuild sooner.

It takes the file as downloaded: CSV, tab-delimited text (`.tsv`, `.txt`, or the IMF's text `.xls`), JSON or an Excel workbook (the sheet with the needed columns is found, or name
it with `--sheet=`), gzipped or zipped (`--entry=` picks the file when a zip holds several); Windows text is turned
into UTF-8, as is UTF-16 with its byte-order mark. It stops with the file's own columns listed if one it needs is missing, keeps only the needed columns,
applies the kind's filter (countries only, for instance), and refuses fewer than 10 rows or far fewer than the last
import (`--allow-shrink` when that is real). Columns we keep by hand, such as a GEM terminal's stop year, are added
empty when the file lacks them. The file is then saved like a fetched one, recorded with its download name and date,
and published in a new snapshot; the hourly run keeps it in every snapshot after that. `--store=r2` needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment, as for the runner.

**The FAS table (`fas-forces`, optional).** OWID's status chart gives the split; FAS's own table at
fas.org/initiative/status-world-nuclear-forces can replace it when OWID lags. Copy the table, Total row included, into a CSV with the columns
`Country, Deployed strategic, Deployed nonstrategic, Reserve/Nondeployed, Military stockpile, Total inventory, As of, Source`
(`As of` the date FAS gives, as YYYY-MM or YYYY-MM-DD, the same on every row; `Source` the fas.org page), then import it
like any file. The check refuses a row whose deployed and reserve warheads do not add up to the military stockpile, a
stockpile above the total, a missing Total row or a link that is not fas.org. When its year is OWID's split's
year or later, it replaces OWID's split (never the series). It is kept under FAS's licence row (`LICENCE_OF` in src/data/licences.ts).

**The IMF World Economic Outlook (`imf-weo`).** Since October 2025 the WEO is downloaded from the IMF data portal
(data.imf.org, WEO dataset → Download, CSV), a file such as `dataset_…IMF.RES_WEO_9.0.0.csv`. Each row is one series:
`SERIES_CODE` is `<area>.<indicator>.A` (`USA.GGXWDG_NGDP.A`), with a column per year (`1980`…`2031`, empty when
missing), `LATEST_ACTUAL_ANNUAL_DATA` (the row's last actual year; a fiscal year such as `FY2025/26` counts as its first
year, the column the IMF puts it in) and `PUBLICATION_DATE` (`2026-10-13` → "October 2026"). The older "By Countries"
table is still read as a fallback: the tab-delimited `.xls` (which is text) or the Excel file such as
`WEOOct2026all.xlsx` (Countries sheet), with its "Estimates Start After" column and the release from its footer line or
the IMF's file name.

The import keeps government debt (`GGXWDG_NGDP`), the budget balance (`GGXCNL_NGDP`) and the current account
(`BCA_NGDPD`) for countries and territories only: country groups (`G001`, `GX123`…) are dropped, and the IMF's own
codes are matched through `src/data/places/codes.csv` (`KOS` and `UVK` Kosovo, `WBG` Palestine; Taiwan, Hong Kong and
Macao are their own places). It writes them as the API fetcher would, `imf-weo/<indicator>.json`, plus `release.json`:
the release and each row's last actual year. Every year is kept. Years after the most common last actual year (2025
in October 2026) are tagged Projection; a country whose own actual figures end earlier has its years in between
tagged Estimate (`statusAt` in src/data/indicators.ts), in the indicator page's table and chart, the country page, the
Explorer's table, lines and scatter tooltip, and the CSV's status column. Rankings use the common year as usual, so an
estimate is ranked with the actual figures and carries its tag. Source lines credit "IMF World Economic Outlook, October 2026". The API fetcher stays off (the IMF's
terms ask for permission before scheduled downloads). Growth, inflation and unemployment come from the World Bank.

**Hand-kept facts files.** Two sources are kept as dated, cited rows in the repository rather than fetched:
`src/data/nuclear-treaties.csv` (UNODA Treaties Database: NPT and TPNW status) and `src/data/nuclear-sharing.csv`
(hosted weapons and nuclear guarantees, from governments, NATO and FAS). Check both monthly against their sources and
set `TREATIES_CHECKED` or `SHARING_CHECKED` in src/lib/nuclear.ts; the Sources page shows the treaty check date.

## Settings

| Repository secret | Needed for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | R2 (already set for deploys) |
| `GH_DISPATCH_TOKEN` | The Worker's outside watch, to start a run GitHub skipped (fine-grained, this repository, "Actions: read and write"); also the Telegram review buttons and the weekly digest ([telegram.md](telegram.md)) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alerts. Without them alerts are only printed in the run log, and the run fails so GitHub emails. To check them: Run workflow with "test alert" ticked |

Errors are written without query strings or the bot token in a Telegram address (`/bot…/`), and the values of the secret env vars (Telegram, Cloudflare, GitHub, and any `*_KEY`, `*_TOKEN` or `*_SECRET`) are taken out of every HTTP error message, a server's own answer included, so a key never reaches a log or `status.json`.

## Adding a source

1. Add `pipeline/sources/<id>.ts` exporting a `Source` (copy a similar one), and list it in `pipeline/sources/index.ts`.
2. Save the source's own format; check fields, a minimum size and shrink against `ctx.previous()`; throw on anything odd.
3. Add a stub test in `tests/unit/pipeline/sources.test.ts`, then open a pull request: its live check runs the new
   fetcher against the real service.
4. The adapter that reads the file goes in `src/adapters/`. The live check also runs every indicator and flow on the
   files it fetched (`node pipeline/adapter-check.ts <dir>`, which works on any folder `pipeline/pull.ts` wrote) and
   prints each adapter's unmatched codes; add those to `src/data/places/codes.csv`. Every ci run does the same on the
   latest snapshot.
