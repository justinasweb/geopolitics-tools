# Page engine

Phase 3 of the development plan: every country, Compare, indicator and static page is generated at build time from
one data snapshot, through one route registry. Nothing on these pages is written by hand except the Markdown pages
(About, Methodology, Privacy) and the words in `src/i18n/`.

## How a build works

1. `npm run data:pull` (CI does this before building) downloads the latest snapshot from R2 into `data/raw/`:
   every source's raw files, `snapshot.json` (what was fetched and when) and `status.json` (the runner's public
   status, for Live and Delayed on the Sources page).
2. `npm run build` loads the snapshot once (`src/lib/data.ts`), runs the indicator registry and the adapters, and
   builds the route registry (`src/lib/routes.ts`).
3. `src/pages/[...path].astro` builds one page per live route with the template for its kind. Share images, CSVs,
   `sitemap.xml`, `robots.txt` and `_redirects` come from the same registry.
4. `scripts/check-dist.mjs` checks the result: Cloudflare's limits, the required files, and no Sample tag on any page.

Without a snapshot the build stops and says what to do. `npm run build:sample` builds from the prototype's sample
files instead; every page then carries a Sample banner, and check-dist only allows that with `ALLOW_SAMPLE=1`.
CI uses the sample build only for pull requests from forks, which get no Cloudflare keys and are never deployed.

## The route registry

`src/lib/routes.ts` lists every page the site has or will have:

| Field | Meaning |
| --- | --- |
| `key` | Stable internal id: `country:DEU`, `indicator:milpct`, `compare:USA,CHN`, `page:about`. Slugs can change; keys do not |
| `path` | The address in each language (English only at launch, at the root) |
| `live` | Built and linked. Map views (the critical minerals views from phase 4 on), hubs and tools are registered but not live until their phase, so the menu and every link skip them |
| `indexed` | In the sitemap and without `noindex` |
| `aliases` | Old or alternative addresses, answered with a 301 (`/countries/usa`, `/compare/china-vs-united-states`) |
| `image`, `lastmod` | Share image, and when the page's data last changed (sitemap) |

The build fails when two routes claim one path, an alias is also a page, a key is used twice, or a path is not a
clean lowercase path without a trailing slash. Slugs live in `src/i18n/slugs.en.ts`; another language is another
slug file.

Redirects go to `dist/_redirects` (Cloudflare reads it; the build fails above 2,000 lines). Old prototype hash links
(`/#/country/RUS`, `/#/compare/USA,CHN`) are moved by a few lines of JavaScript on the home and 404 pages, since
servers never see the part after `#`.

## Which pages exist

| Page | Rule |
| --- | --- |
| Country profile | Every country or territory with at least one figure from any source. Fewer than 4 measures: built, `noindex`, with the "few sources" box listing which sources cover it |
| Dossier | United States, China and Russia: the profile plus money, people, technology and climate sections |
| Compare | The three pairs of dossier countries |
| Indicator | Every registry measure with data in the snapshot. Fewer than 20 places reporting in the common year: built, `noindex`. Measures waiting on a key or permission have no page and are listed on the index as waiting |
| About, Methodology, Privacy | `src/content/pages/*.md`. Each shows the draft banner until its front matter says `approved: true` |
| Sources | Generated from the source registry, the licence table and the last snapshot; corrections from `src/data/corrections.csv` |
| Explorer | `/explorer` (table), `/explorer/over-time`, `/explorer/scatter`: every measure with an indicator page. See "Explorer" below |
| Dependencies | `/dependencies`: countries against the ten commodities of each country page's dependencies table, with the single points of failure. See "Dependencies" below |
| Bloc overlap | `/blocs/overlap`: shared members between blocs, bridge countries and every country's memberships, from `src/data/blocs.csv`. See "Bloc overlap" below |
| Supply chains | `/supply-chains` and `/supply-chains/{flow}` for each of the 11 flows whose source is in the snapshot with at least one pair; the index lists only those. See "Supply chains" below |

A sample build has 129 country pages and 37 indicator pages; the real snapshot has more sources and more places.

## Rules the templates follow

- **Every number shows its source and year.** Key figures, table rows and section footers all carry them.
- **Common year.** Indicator pages compare everyone on the latest year that at least 80% as many places have reported
  as in the best of the five years before (`defaultYear` in `src/lib/stats.ts`). Later years are preliminary and
  listed as such. "Latest available" reaches back two years and marks the older rows.
- **Dependence.** Net imports ÷ use: 50% or more "Imports most", 15–50% "Imports some", within ±15% "Roughly
  self-sufficient", below −15% "Exporter" (`src/lib/dependence.ts`). Arms and chips show the main supplier's share
  only. A row whose source is not in the snapshot says "No data yet".
- **Neutral words.** Templates use plain verbs (mines, imports, hosts) and no adjectives that judge. "Higher" on
  Compare marks the larger value and says it is not a judgement. A sentence whose figure is missing is left out.
- **Colour is never the only cue.** Dependence tags have a glyph and a word, Compare countries have a marker and a
  name, lines are labelled at their ends, map classes are named in the legend.
- **Downloads follow the licence table.** An indicator page offers a CSV only when every source behind it allows
  downloads (`csvAllowed`); otherwise it says the figures are shown only.

## Words and other languages

All page text and sentence templates are in `src/i18n/pages.en.ts` (and the registry's labels in `src/i18n/en.ts`).
Templates take figures already formatted by `src/lib/format.ts` and return sentences, so another language is another
file with the same keys, written in that language from the same data.

## Explorer

Any registry measure as a table (up to 8 columns), over time (one measure, up to 8 countries) or as a scatter (two
measures, optional bubble size, year slider with Play). `src/lib/explorer.ts` writes one compact file per measure
(`/explorer/data/<id>.json`, six significant figures, counts whole) and the page's list of measures, places and blocs.
`src/lib/explorer/render.ts` draws every view as HTML strings: the build draws each view's default settings, so the
page reads without scripts, and `src/scripts/explorer.ts` redraws with the same code in the browser.

- **Address.** Every setting is in the query string (`m`, `sort`, `dir`, `bloc`, `year`, `find`; `c`, `index`, `log`;
  `x`, `y`, `size`, `pin`), rewritten with `history.replaceState`. Unknown measures or places are dropped. The canonical
  is the path without the query.
- **Years.** A table column shows the measure's common year (or the chosen year); a country missing it shows the
  latest of the two years before, marked with its year. A scatter year is offered when at least 20 countries have
  both figures; it opens on the latest such year no later than either measure's common year.
- **Log scale.** On when the values shown are all above zero and span more than 30 times; the reader can turn it off
  (`log=0`) or on (`log=1`).
- **Correlation.** Pearson's r of the points shown (of their logarithms on log axes), said in words, always with
  "A link between two measures is not proof that one causes the other."
- **CSV.** Built in the browser from the table shown; measures whose licence does not allow downloads are left out,
  with a note saying which.
- **Starting points.** `PRESETS` in `src/lib/explorer/model.ts`; one is offered only when all its measures are live.

## Dependencies

Every country with at least one share of use, against oil, gas, wheat, maize, rice, soybeans, potash, phosphate,
arms and chips. `src/lib/dependencies.ts` builds the grid from the same rows as the country pages
(`src/lib/dependence.ts`) and embeds it in the page; `src/lib/dependencies/render.ts` draws it, at build time for the
default settings and in the browser (`src/scripts/dependencies.ts`) as the reader changes them.

- **Cells.** Six bands on import reliance (75% or more, 50–75%, 15–50%, ±15%, exporting 15–50% or over 50% of
  output), each with its value written and, for importers, the main supplier and its share of imports (ISO code).
  Arms and chips show supplier concentration only, hatched. The cell's year is in its title.
- **Single points of failure.** Import reliance at least 50% and at least 50% of those imports from one supplier,
  largest supplier share first; eight shown (four on a phone) until "Show all". Computed from the rows in the bloc.
- **Address.** `bloc`, `sort`, `dir`, `find`, and on a phone `show` (country or commodity) and `c`; `all` for every
  single point of failure.
- **CSV.** The rows shown. Shares of use and output from EIA and FAOSTAT, and FAOSTAT's main suppliers for the crops;
  UN Comtrade suppliers and SIPRI arms are left out under their terms, with a note.

## Supply chains

One page per flow of `src/data/flows.ts` (crude oil, gas, wheat, maize, rice, soybeans, potash, phosphate, arms, chips,
refugees), suppliers to buyers as a Sankey with a side panel and the same flows as a table. `src/lib/supply-chains.ts`
embeds the flow's pairs and place names in its page; `src/lib/supply-chains/render.ts` draws it, at build time with no
country focused and in the browser (`src/scripts/supply-chains.ts`) when the reader focuses one.

- **One period.** The latest year the source reports (SIPRI: the latest five-year total), shown as a label
  ("2023, latest available"), not a select. Each flow keeps its own year; a diagram never mixes years. Multi-year
  flows are an open question.
- **Diagram.** The 7 largest suppliers and 10 largest buyers are named, the rest grouped as Others; bands are coloured
  by supplier and named at both ends with values, and hovering one writes its value under the diagram. A focused
  country is drawn on both sides when it imports and exports. Clicking a named node focuses it too.
- **Panel.** Total of the flows shown, concentration (Herfindahl index on supplier shares, the minerals views'
  thresholds; not for refugees), top suppliers and buyers; for a focused country its imports with their supplier shares
  and concentration, and its exports.
- **Address.** `country` (internal id). The flow switch opens the other flow's page with the same focus; the
  prototype's `#/chains/{flow}?country=` links move there.
- **Phone.** The top 10 flows as bars first; "Show diagram" opens the diagram, which keeps its size and scrolls
  sideways inside its own box.
- **CSV.** Every flow shown, when the source's licence allows downloads (FAOSTAT, UNHCR); UN Comtrade and SIPRI flows
  are shown only, with a note.

## Bloc overlap

`/blocs/overlap` reads the same membership table as the blocs views (`src/lib/blocs.ts`); `src/lib/overlap.ts` embeds
it in the page, and `src/lib/overlap/render.ts` draws it, at build time for the default settings and in the browser
(`src/scripts/overlap.ts`) as the reader chooses blocs. It is live whenever the membership table is.

- **Blocs.** All 19 as chips; NATO, EU, G7, G20, BRICS, SCO, ASEAN, OPEC and Quad are chosen by default
  (`OVERLAP_ORDER`, `DEFAULT_BLOCS` in `src/lib/overlap/model.ts`). At least two stay chosen.
- **Matrix.** Shared members for every pair of chosen blocs, bloc size on the diagonal, five shades (1–4, 5–9, 10–14,
  15–19, 20+) with the number in every cell. The line above names the pair sharing most, then the pair sharing most
  among the blocs left. When the chosen blocs make it wider than its half of the row, the script gives it the full
  width and the bridge countries go under it.
- **Bridge countries.** The strict rule (addendum section 4, 5.3): a full member of NATO, the EU, the G7 or the Quad
  and of BRICS or the SCO, over all members, whatever is chosen. Today: India. The page names the blocs; it does not
  call either group "Western-led" or "non-Western" (`BRIDGE_A`, `BRIDGE_B` in `src/lib/overlap/model.ts`). Partners and invitees come from
  `src/data/bloc-partners.csv` (`partner`, `dialogue`, `invited`, `offered` with a year); they are listed apart and
  never counted. The build fails on a partner row that is also a full membership.
- **Membership table.** Every country in a chosen bloc, most memberships first; shapes tell bloc groups apart without
  colour, in the bridge rule's groups: a square for NATO, EU, G7 and Quad, a triangle for BRICS and SCO, a dot for the
  G20 and every other bloc. CSV of the whole table with the member lists' date.
- **Phone.** Two blocs picked side by side (In both, Only A, Only B) instead of the matrix; the table shows the pair
  and the two chosen blocs sharing most members with it, 14 rows, until "Show all countries and blocs".
- **Address.** `blocs`, `a`, `b`, `sort`, `dir`, `all`. The prototype's `#/overlap?blocs=NATO,EU` lands here.

## Share images

`src/lib/og.ts` renders a 1200 × 630 PNG per page at build time with Satori and resvg, in the site's fonts and light
theme colours: kicker, title, the headline figure or answer, up to five bars, and the source.

## Not done in this phase

- Dossier summaries drafted with AI from a facts file (addendum, D15): the dossiers use the template summary for now.
- The age pyramid's year slider: the pyramid shows one year.
- Redeploying when new data arrives: today pages refresh on the next deploy.
