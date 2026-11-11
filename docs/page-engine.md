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
4. `scripts/check-dist.mjs` checks the result: Cloudflare's limits, the required files, and no Sample tag on any page. For
   every page in `sitemap.xml` it fails on an empty or duplicate `<title>` or meta description, or more than one `<h1>`,
   and warns (listing the pages) on a title over 65 characters (the final `<title>`: `fullTitle` in `src/lib/site.ts` adds
   " | geopolitics.tools" only when the whole stays within 65) or a description outside 70–170. It also warns on indexed
   pages with fewer than 3 links in from other indexed pages (distinct pages, any `<a>` on them, header and footer
   included), to show pages that need more internal links. Descriptions aim for 160
   at most: country pages fit whole sentences with `fitSentences` (`src/lib/format.ts`), starting with the page's
   strongest figure (`lead` in `src/lib/country.ts`).

Without a snapshot the build stops and says what to do. `npm run build:sample` builds from the prototype's sample
files instead; every page then carries a Sample banner, and check-dist only allows that with `ALLOW_SAMPLE=1`.
CI uses the sample build only for pull requests from forks, which get no Cloudflare keys and are never deployed.

## The route registry

`src/lib/routes.ts` lists every page the site has or will have:

| Field | Meaning |
| --- | --- |
| `key` | Stable internal id: `country:DEU`, `indicator:milpct`, `compare:USA,CHN`, `page:about`. Slugs can change; keys do not |
| `path` | The address in each language (English only at launch, at the root) |
| `live` | Built and linked. Map views (the critical minerals views from phase 4 on), hubs and tools are registered but not live until their phase, so the menu and every link skip them. Views that failed the launch gate review stay hidden through `GATE_HIDDEN` in `src/lib/routes.ts` ([gate-review.md](gate-review.md)); take a key out of it once the view passes. A source whose licence is withheld (`WITHHELD` in `src/data/licences.ts`) reads as not in the snapshot, so nothing built from it is live |
| `indexed` | In the sitemap and without `noindex` |
| `aliases` | Old or alternative addresses, answered with a 301 (`/countries/usa`, `/compare/china-vs-united-states`) |
| `image`, `lastmod` | Share image, and when the page's data last changed (sitemap). About, Methodology and Privacy take the `updated` date in their Markdown front matter: change it with the text. Sources takes the snapshot date |

The build fails when two routes claim one path, an alias is also a page, a key is used twice, or a path is not a
clean lowercase path without a trailing slash. Slugs live in `src/i18n/slugs.en.ts`; another language is another
slug file.

Redirects go to `dist/_redirects` (Cloudflare reads it; the build fails above 2,000 lines). Old prototype hash links
(`/#/country/RUS`, `/#/compare/USA,CHN`) are moved by a few lines of JavaScript on the home and 404 pages, since
servers never see the part after `#`.

## Which pages exist

| Page | Rule |
| --- | --- |
| Country page | Every country or territory with at least one figure from any source; the kind line says "Country page" or "Territory". The header's facts end with a "Member of" line: its groupings from blocs.csv, each linked to its bloc page, "as of" the bloc pages' date. Fewer than 4 measures: built, `noindex`, with the "few sources" box listing which sources cover it. Every page has money, technology and climate sections where the snapshot has their figures (spec, D20; each part and section left out with no figure; CO2 per person then moves from More figures to Climate), and the People section when WPP covers the place (spec, D16): population 1950–2100 with the UN range, the age pyramid, births per woman, median age, share aged 65+. People needs the three UN WPP imports (`wpp-total`, `wpp-indicators`, `wpp-age`); its age pyramid has a year slider in five-year steps, 1950–2100, every year drawn at build time on one scale |
| United States, China, Russia | The same country page, plus the approved AI-drafted summary and Compare links (`DOSSIERS` in `src/lib/country.ts`) |
| Compare | The three pairs of the United States, China and Russia, static and indexed with share images; and `/compare?a={slug}&b={slug}` for any two country pages (spec, D21). See "Compare" below |
| Indicator | Every registry measure with data in the snapshot. Fewer than 20 places reporting in the common year: built, `noindex`. Measures waiting on a key or permission have no page and are listed on the index as waiting |
| About, Methodology, Privacy | `src/content/pages/*.md`. Each shows the draft banner until its front matter says `approved: true` and its facts are unchanged since (see [ai-drafting.md](ai-drafting.md)) |
| Sources | Generated from the source registry, the licence table and the last snapshot; lists a source only while it has data, is not withheld and a live route reads it (`sourcesInUse` in `src/lib/sources.ts`, with each map layer's `source` and `reads`); corrections from `src/data/corrections.csv` |
| Explorer | `/explorer` (table), `/explorer/over-time`, `/explorer/scatter`: every measure with an indicator page. See "Explorer" below |
| Dependencies | `/dependencies`: countries against the ten commodities of each country page's dependencies table, with reliance on one supplier. See "Dependencies" below |
| Bloc overlap | `/blocs/overlap`: shared members between blocs, bridge countries and every country's memberships, from `src/data/blocs.csv`. See "Bloc overlap" below |
| Topic hubs | `/resources`, `/technology`, `/climate`, `/security`, `/power`: the parent page of a topic's map views. See "Topic hubs" below |
| Atlas | `/atlas`: every live map view's layer on one map, live when any map view is. Its states are noindex. See [maps.md](maps.md), "The Atlas" |
| This week | `/this-week`, live once one of its sources is in the snapshot, and `/this-week/{yyyy}-{ww}` for every closed ISO week the data run froze; an archived week is indexed once one of its cards has figures. See "This week" below |
| Homepage | `/`: hero option C, the This week strip, topics, questions, countries and rankings, trust strip. Production serves the holding page there until `SITE_HOLDING` is `false`. See "Homepage" below |
| Development index | `/dev`: every built page, noindex, disallowed in robots.txt; never linked |
| Supply chains | `/supply-chains` and `/supply-chains/{flow}` for each of the 11 flows whose source is in the snapshot with at least one pair; the index lists only those. See "Supply chains" below |

A sample build has 129 country pages and 37 indicator pages; the real snapshot has more sources and more places.

## Rules the templates follow

- **Every number shows its source and year.** Key figures, table rows and section footers all carry them.
- **Common year.** Indicator pages compare everyone on the latest year that at least 80% as many places have reported
  as in the best of the five years before (`defaultYear` in `src/lib/stats.ts`). Later years are preliminary and
  listed as such. "Latest available" reaches back two years and marks the older rows.
- **Dependence.** Net imports ÷ use: 50% or more "Imports most", 15% to under 50% "Imports some", −15% to under
  15% "Low net trade", below −15% "Exporter" (`src/lib/dependence.ts`). Arms and chips show the main supplier's share
  only. A row whose source is not in the snapshot says "No data yet". Potash and phosphate are a share of supply
  (production plus net imports), not of FAOSTAT's agricultural use, which leaves out industry and transit; their rows
  carry the Estimate label when FAOSTAT flags a figure as its estimate or imputation (E, I), as crop rows do. Net imports
  more than 10% above use (`THRESHOLDS.excess`), or exports above production plus imports at all (Morocco's phosphate;
  Canada's potash; Ukraine's maize 2024, an earlier harvest shipped), give no share: the row says "Imports exceed recorded
  use" (no tag) or "Exports exceed recorded supply" (tagged Exporter, with its buyers) with a caveat (for crops: "Exports
  can come from an earlier harvest or stocks…"); a crop's use for that year is not available on the maps, never 0, and is left out of the tool's sort and ranking by share, reliance
  on one supplier and a country page's lead imports. A balance more than 10 years before the latest any place has for
  its resource (`OLD_YEARS`; Martinique's oil 2010, Austria's phosphate 2001) is kept but marked old: "No recent data:
  the latest balance is from 2010" on the country page, "2010, no recent data" in the tool's cell, and left out of the
  sort, the phone ranking, reliance on one supplier, lead imports and the section's finding. Its position is written
  in the past tense with its year, so it never reads as current: "Imported 41% of the wheat it used in 2013",
  "Exported 36% of what it produced in 2001" (decided 10 Nov 2026); the tool's cell says "Imported all" or "Exported"
  and its title the same sentence. Compare shows no dependence shares. Partners more than 10 years newer than the
  balance say so ("Main partners are from 2023, 15 years after the balance").
  Potash production that is FAOSTAT's own estimate (E, I) and more than 2× from USGS's mine production in K2O for the
  same year is replaced by USGS's in `food()` itself (`usgsPotash`, `USGS_GAP` in `src/adapters/faostat.ts`;
  `potashOutput` in `src/adapters/minerals.ts`), so the balance rows, the potash maps, their world total, rankings,
  layer files and share images all read the same figure. The cell is marked in `Balance.usgs`, keeps USGS's own
  estimate flag ("USGS estimate" in the table), and the world total moves by the difference. Rows and the grid say
  "Production: USGS, as FAOSTAT's figure is an estimate far from it"; the potash maps carry a place note
  (`placeNotes` in `src/lib/food.ts`) and the share image's source names it; a change across a FAOSTAT and a USGS
  year is not shown (`comparable`, `worldChange`). China, 2024. Potash production is not an indicator, so Compare and
  the Explorer do not show it.
- **One rounding for shares.** Every share on every page, tool, map and share image goes through `formatShare`
  (`src/lib/format.ts`; `formatValue` uses it for share indicators): whole percent from 10%, one decimal below,
  "<0.1%" for a share above zero that would read as zero, and one decimal for a share under 100% that would read
  100% (BRICS's 99.7% of primary gallium). Data files keep shares to six significant figures, so a
  share is not rounded twice (India's gas, 0.49498, read 49% on its page and 50% in Dependencies when the tool kept
  four decimals; a test now checks every cell against the country rows).
- **Neutral words.** Templates use plain verbs (mines, imports, hosts) and no adjectives that judge. "Higher" on
  Compare marks the larger value and says it is not a judgement. A sentence whose figure is missing is left out.
- **Colour is never the only cue.** Dependence tags have a glyph and a word, Compare's first and second country have
  a marker, a line style and a name, lines are labelled at their ends, map classes are named in the legend.
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
- **CSV.** Built in the browser from the view shown (`viewCsv`); measures whose licence does not allow downloads are
  left out, with a note saying which, and none is downloaded when all are. Table: the rows and columns shown, each
  measure's credit and retrieval date in its header. Over time: one row per country and year drawn (indexed values
  when indexed, "index, 2010 = 100"), with status, source and retrieved columns. Scatter: one row per point drawn in
  the year shown, each measure's value, year, status, source and retrieval date (decided 10 Nov 2026).
- **Starting points.** `PRESETS` in `src/lib/explorer/model.ts`; one is offered only when all its measures are live.

## Dependencies

Every country with at least one share of use, against oil, gas, wheat, maize, rice, soybeans, potash, phosphate,
arms and chips. `src/lib/dependencies.ts` builds the grid from the same rows as the country pages
(`src/lib/dependence.ts`) and embeds it in the page; `src/lib/dependencies/render.ts` draws it, at build time for the
default settings and in the browser (`src/scripts/dependencies.ts`) as the reader changes them.

- **Cells.** Six bands on import reliance (75% or more, 50–75%, 15–50%, ±15%, exporting 15–50% or over 50% of
  output), each with its value written and, for importers, the main supplier and its share of imports (ISO code).
  Arms and chips show supplier concentration only, hatched. The cell's year is in its title.
- **Reliance on one supplier.** Import reliance at least 50% and at least 50% of those imports from one supplier,
  largest supplier share first; eight shown (four on a phone) until "Show all". Computed from the rows in the bloc.
- **Address.** `bloc`, `sort`, `dir`, `find`, and on a phone `show` (country or commodity) and `c`; `all` for every
  case of reliance on one supplier.
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

## Homepage

`src/templates/HomePage.astro`, model `src/lib/home.ts`, words in `src/i18n/home.en.ts` (the tool row's in
`src/i18n/en.ts`, `TRAIL_TEXT`). Hero option C (spec D19): everything is in the HTML, there is no map, and every
part links only to live pages; a part with nothing to show is left out.

- **Search.** Site search's large box (see Site search below), with "Try" links to live pages under it. On the
  homepage the header's search button and the `/` key (`gt-search`) bring the reader to this box instead of the dialog.
- **Tool row.** Atlas, Explorer, Dependencies, Supply chains, Bloc overlap, This week, in that order (`TRAIL`); a tool
  that is not live is left out. Bloc overlap is drawn as two circles here (`ToolIcon circles`); hubs keep the matrix.
  Supply chains counts its live flows of goods (refugees are not a good).
- **Worked questions.** Rare earths (USGS, the view's latest year, with its Estimate tag), US Treasury holders (TIC
  Table 5's latest month; links to the money section of the largest holder's country page and states its holding and month, since there
  is no Treasuries map) and Hungary's gas (the Dependencies tool's row: the main supplier's share of imports from
  UN Comtrade, and net imports against use from EIA, each with its own year, never multiplied together). Each card
  is left out when its data is missing.
- **This week strip.** The current week's dates, counts and sources, as /this-week shows them, between the hero and
  the topics; hidden when /this-week is not live or the week has no count.
- **Topics.** One card per live hub, in menu order, with its live views. **Questions to start from:** the first six
  live of eight prepared questions (`QUESTIONS`).
- **Countries and rankings.** The three largest economies by GDP in the common year as country page cards, each with
  the first sentence of its page's template summary (with the Estimate tag when that is USGS's estimated year; the
  plain line when there is none), then the next six as links, under one line naming the rule, year and source
  ("Largest economies by GDP, 2025 · World Bank"), a rule the page states (there is no traffic data, so nothing is "popular"); rankings for military spending, CO2 per
  person and refugees hosted, worded as on the hubs.
- **Trust strip.** The Sources page's count and the snapshot's time.

## Site search

One box, on the homepage (large, results under it) and in a dialog that the header's search button, the Atlas bar's
and the `/` key open (centred near the top; the whole screen under 760px). Component `src/components/SiteSearch.astro`
and `SearchDialog.astro` (in `Page.astro` and the Atlas), behaviour `src/scripts/search.ts`, words
`src/i18n/search.en.ts`.

- **Index.** `src/lib/search.ts` builds it from the route registry, so only live pages are in it, and the build serves
  it at `/search-index.json` (`?v=` the snapshot's time, so a new build is never answered from an old copy; robots.txt
  disallows it). No server and no third-party service: the browser fetches it on first use (or when a pointer reaches
  a search button) and searches it there. About 465 pages: **44 kB, 10.6 kB gzipped, 8.8 kB brotli** (6 Nov 2026);
  a test fails above 25 kB gzipped.
- **Groups.** Countries (country pages, Compare), Maps (each view family by its menu name, each page by its layer's
  name, with hub and family under it), Measures (indicator rankings), Places (disputed rivers; chokepoints and ports
  join by themselves when their routes go live), Blocs (each grouping with its full name, its history page), Tools
  (the tools, Explorer's views, Supply chains' flows, This week), Topics and pages. The group with the best match comes
  first; each shows its best five ("5 of 26" in its heading), more when only one group matches.
- **Matching** (`src/lib/search-match.ts`, shared with the tests). Accents, apostrophes and case are ignored
  ("turkiye", "cote divoire"). Typed words match the starts of words in a page's name or other names; one or two
  letters only the start of a name. ISO codes ("DE", "DEU") and short bloc ids ("eu", "g7") match only typed whole.
  Countries' other names come from the territory table's name codes (`codes.csv`: Burma, Turkey, Ivory Coast, Zaire),
  leaving out any that names another place it is not part of ("Taiwan Province of China" is never a way to China);
  other words for maps and measures ("corn", "defence", "LNG") are in `SEARCH_ALIASES`. A country typed in full is
  followed by the blocs it is a member of ("India is a member").
- **Several words, typos and nothing found.** Several words that match nothing together are searched again with the
  words that match on their own (or the first of them, when those match nothing together), saying "No match for
  “ukraine war”. Showing results for Ukraine." Then the nearest page name within one or two edits (a swap of two
  letters counts as one) is searched instead, saying "Showing results for India." Only when no word matches does the
  box say nothing matches, how to search, and offer the Try pages as options. An empty dialog offers the same pages.
- **Keyboard.** An ARIA combobox over a listbox of groups: arrows move across every result, Enter opens the marked one
  (the best when none is marked, never a suggestion after no match), Ctrl/Cmd+Enter or click opens a new tab. Esc
  closes the dialog in one press and focus goes back where it was (the button that opened it, or the element focused
  before "/"); on the homepage Esc clears the box and closes its list. A polite status line says the count.
- **Not built:** the design's full results page (/search?q=, SiteStates); the box opens the best result instead.

## Who counts as a member

Counts on bloc pages, alliance histories, Bloc overlap and their share images are of countries, the units the map
can draw. The G20's and G7's other members are named next to the count in one template (`membersText`,
`src/i18n/members.en.ts`), with a note under the panel's count saying what the map outlines; shares of those
groupings say "today's member countries". A history whose first years belong to a predecessor names it
(`BEGAN_AS` in `src/i18n/blocs.en.ts`), with the founders' names as they were then (West Germany).

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
- **Bridge countries.** The strict rule (spec, design review decision 5.3): a full member of at least one of NATO, the EU, the G7 and the Quad
  and at least one of BRICS and the SCO, over all members, whatever is chosen. Today: India. The page names the blocs; it does not
  call either group "Western-led" or "non-Western" (`BRIDGE_A`, `BRIDGE_B` in `src/lib/overlap/model.ts`). Partners and invitees come from
  `src/data/bloc-partners.csv` (`partner`, `dialogue`, `invited`, `offered` with a year); they are listed apart and
  never counted. The build fails on a partner row that is also a full membership.
- **Membership table.** Every country in a chosen bloc, most memberships first; shapes tell bloc groups apart without
  colour, in the bridge rule's groups: a square for NATO, EU, G7 and Quad, a triangle for BRICS and SCO, a dot for the
  G20 and every other bloc. CSV of the whole table with the member lists' date.
- **Phone.** Two blocs picked side by side (In both, Only A, Only B) instead of the matrix; the table shows the pair
  and the two chosen blocs sharing most members with it, 14 rows, until "Show all countries and blocs".
- **Address.** `blocs`, `a`, `b`, `sort`, `dir`, `all`. The prototype's `#/overlap?blocs=NATO,EU` lands here.

## Topic hubs

`src/templates/HubPage.astro`, model `src/lib/hubs.ts`, lists in `src/data/hubs.ts`. A hub is built when it is in
`HUBS_BUILT` (`src/lib/routes.ts`) and live when one of its views is; it is then the first breadcrumb of its views
(`hubCrumb`, also in their JSON-LD) and heads its group in the header and phone menus (`menuGroups`).

- **Intro.** Two sentences in `src/content/hubs/<hub>.md`, an AI draft with the facts it was written from; the draft
  banner shows until `approved: true`, and no label after (decided 29 Oct 2026, like About and Methodology).
- **Cards.** One per view family of the hub with a live view, in menu order; the first is the full-width lead. The
  family's main view (the menu's link) gives the card: its main layer drawn small at build time from the layer file
  (`worldMap`, 600px for the lead, 400px otherwise) with every state the full map shows (withheld hatching, not-yet
  dots, no data) and a key naming each: the scale's ends or named classes, then those states; the view's own
  one-sentence answer as the headline (`answerOf`: the same function its page calls for the answer under its title;
  the disaster, conflict, bloc, alliance-history and river answers moved from their templates into their libraries
  for this); the legend title;
  the source, period and the date the site last refreshed it (each layer names its source in the registry); chips for
  the family's layers, worded as the view's picker (up to eight).
- **Tools.** The topic's tools from `HUB_TOOLS`, live ones only: Supply chains links the topic's flows, the Atlas its
  first two maps.
- **Countries.** By a rule the page states (no traffic data, so nothing is "popular"): the United States, China and Russia, then the
  countries ranked first on most of the topic's maps of world shares, volumes and counts (layers marked `ranks` in the
  registry; not a share of a country's own total, a per-person figure, a score or a membership; default year; a
  first place shared with the next country does not count), up to ten, each with the maps it is first on.
- **Indicator rankings.** The indexed indicator pages of the topic's groups (`HUB_GROUPS`), named with what a share or
  rate is of (`rate` in `src/i18n/en.ts`: "Net CO2 imports through trade, % of emissions inside the country"), each line starting with the
  year it ranks (so a one-year ranking reads apart from a card's total over years: Chinese lending, arms), then the top
  three; when
  several places share the first figure as the page shows it, they are named as tied first instead (`topLine`), on
  every hub.

## This week

`src/templates/WeekPage.astro`, model `src/lib/week.ts` (build side) and `src/lib/week/model.ts` (figures, shared with
the data run), words in `src/i18n/week.en.ts`. Built from data only.

- **Period.** `/this-week` covers the last 7 days to the snapshot's day ("Last 7 days: 27 October – 2 November
  2026"). Each closed ISO week, Monday to Sunday (UTC), is frozen by the data run at `/this-week/{yyyy}-{ww}` ("Week
  44: 26 October – 1 November 2026"; see data-pipeline.md, "This week's archive") and read as frozen. On each page the
  title, the counts and the cards name the same range; conflict and prices also give the month their figures are for.
- **Counts.** New orange and red GDACS alerts: those that began in the week, or began earlier and rose to orange or
  red in it (their level in GDACS's copy from the period's first day was lower). Orange and red alerts of every kind
  that began earlier and are still active (lasting into the period, or listed as current by GDACS: a drought's end
  date is its last update, often weeks back) are listed under "Still active" with their start dates and not counted. A named tropical cyclone that GDACS keeps as
  two events with dates that meet is merged into one; other kinds are never merged. The PortWatch and IPC counts are
  left out while those sources are hidden; the row works with one to three counts.
- **Cards**, in this order, each only when its source is in the snapshot: disasters (GDACS, up to seven alerts, level
  as a word and a solid or outline triangle, the first three countries and "+ 11 more" as a disclosure), conflict (UCDP events by country, latest month against the one before,
  Preliminary when the month comes from a Candidate release), prices (six Pink Sheet series, month and year changes),
  internet outages (IODA, began in the period, no cause) and sanctions (entries added and removed per list against
  the lists on the period's first day). Shipping and food crises wait on PortWatch and IPC. Every card gives its
  source, period and when the site last fetched it, and links to its map where there is one.
- **No new data.** When a source's data last changed before the period began, its card shows "No new data since
  {date}" and no figures, its box right under the headline.
- **Latest feed.** Orange and red alerts, outages, and the conflict and price releases (dated when the site's copy
  changed), newest first over 30 days (an archived week: its own days), filtered by kind; ten shown, then "Show older
  items" (`src/scripts/week.ts`). Without scripts every item shows.
- **The week in brief.** Per closed week: shown on that week's page, and on `/this-week` for the latest closed week
  (its dates in the heading, "The week in brief: 2–8 November"; the live page then says its counts and cards cover
  the last 7 days), only when the drafting pipeline's text `week:{id}` is approved and its facts unchanged
  (`src/data/ai/texts/weeks/{id}.json`, approved on Telegram: [telegram.md](telegram.md)); otherwise nothing, not an
  empty box and no notice. The label and "How this summary is made" link to Methodology's "AI drafting" section.
- **Earlier weeks.** `/this-week` links to the latest closed week ("Previous weeks: week 44 →") once one exists, and
  shows nothing before; an archived week links to the one before it. A week picker appears once there is a week to
  pick. Archived pages carry a note that they keep the figures as they stood.

## AI-drafted texts

Dossier summaries, alliance history notes, disputed river summaries and This week's summaries are drafted with AI
from facts files, checked and approved by the owner (on Telegram, [telegram.md](telegram.md)) before they show; unapproved texts show nothing. A dossier keeps its template summary until
its AI summary is approved. See [ai-drafting.md](ai-drafting.md).

## Share images

`src/lib/og.ts` renders a 1200 × 630 PNG per page at build time with Satori and resvg, in the site's fonts and light
theme colours: kicker, title, the headline figure or answer, up to five bars, and the source. What each page's card
says is in `src/lib/og-cards.ts`.

- **The lockup** is the header's artwork (`src/components/LogoSprite.astro`), its token colours resolved to the light
  theme and drawn as an SVG image (outlines, no font): 30px high at the right of the footer, beside the source line,
  on every card with a figure. Its clear space, the lowest band's height (7px in the footer), is kept on every side.
  Source lines must fit on one line beside it: about 805px at 20px (a test checks).
- **Fallback cards**: the site default and the six pages with no figure of their own (Countries, Indicators, About,
  Methodology, Privacy, Sources; `fallback: true` in `og-cards.ts`) follow ShareImages "fallback" in the design
  system: one centred group of the lockup (72px), the title (Newsreader 600, 96/100px, stepped down only when it
  would not fit on two lines; the site default's long title takes a smaller step) and one muted line, Source Sans 500
  at 26px: a short description and the page's address (`OG_TEXT.pageLine`, "How each measure is worked out ·
  geopolitics.tools/methodology"). No kicker or footer; the top double rule stays, as on the other cards.

- **Bar labels** are measured in the font Satori draws them with (its own opentype.js, pinned in `package.json`) and
  fitted first: wrapped to two lines at spaces, or cut after a whole word with "…", keeping a trailing year or
  bracketed short name ("Treaty on the Non-Proliferation… (NPT)"). A word is never split, and a year never stands
  alone on the second line.
- **Rows** get the space left beside the figure column: the value column is as wide as the widest value, the label
  column up to 240px, the bar the rest. When five two-line rows would not fit under the title, the rows get tighter,
  then smaller, then one line each.
- **Every figure has its own source and year.** Bars from a second source name it in the source line: a country
  card's mineral bars read "Gallium (primary production), 2025", "69% (estimate)" where USGS estimates, under
  "World Bank; USGS (mineral shares)". USGS cards give the data year, not the edition ("USGS, 2025, estimated"
  for Mineral Commodity Summaries 2026). A figure tagged on its page (Estimate, Projection, Preliminary) carries the
  word on the card.
- `tests/unit/og.test.ts` checks every card the site builds, and the longest label of each view family five times
  over under its longest title, rendered with nothing in the card's margins.
- **Alt text**: `og:image:alt` and `twitter:image:alt` say the card in one sentence (kicker, title, figure with its
  caption, source; `cardAlt` and `shareAlt` in `og-cards.ts`). `Base` finds the card from the image path in the route
  registry, and pages that name no image use the site default card's own wording. A page can pass `imageAlt` instead;
  "Share card: {title}" is left only for an image path with no card data.
- Every page also carries `twitter:site` (@geopolitools). This week archive pages are `og:type` article with
  `article:published_time` (the week's last day); everything else is website.

## Structured data

Base adds the Organization (logo: `public/logo-512.png`) to every page. Each page kind's own JSON-LD is built in
`src/lib/jsonld.ts` from the template's models (indicator Dataset with the source as creator and this site as
publisher, Country or Place, WebSite on the home page, breadcrumbs), with the builders in `src/lib/structured.ts`.
Google requires a link on every breadcrumb but the last, so the JSON-LD leaves out crumbs with no page of their own
("Tools", an indicator's group) and renumbers the rest; the visible breadcrumbs keep them. `tests/unit/structured.test.ts` checks the required fields for one page of each kind.
The logo is the design system's colour symbol (`src/design/symbol-color.svg`) on white, 512 × 512: after changing
the symbol, run `node scripts/logo.ts` (the test fails while the PNG is out of date).

## Compare

Any two countries side by side (spec, D21), without a page per pair.

- **Three static pairs.** `/compare/united-states-vs-china`, `/compare/united-states-vs-russia`, `/compare/china-vs-russia`
  (`COMPARE_PAIRS` in `src/lib/routes.ts`): built pages, indexed, with share images.
- **`/compare` for any other pair.** One page, route key `compare`; the pair is in the query string
  (`?a=germany&b=france`, country slugs). It is `noindex` and its canonical is `/compare`. The build draws the two
  country boxes and the ready-made pairs; `src/scripts/compare.ts` loads `/compare/data/{slug}.json` for the two
  countries and draws the sections. A pair that is one of the static three goes to its page (`location.replace`).
- **One model, one markup.** `src/lib/compare/model.ts` (rows, gaps, charts, mineral pairs) and
  `src/lib/compare/render.ts` (HTML strings) have no Node imports: the static pairs call them at build time with the
  same `CountryData` the JSON files hold (`compareData` in `src/lib/compare.ts`), so the two cannot drift. The line
  chart's markup is `src/lib/linechart.ts`, which the `LineChart` component also uses.
- **Country files.** One per country page, only what Compare uses: the latest figure and year of each key-figure
  measure, the GDP and military-spending series from 2000, and shares of world mineral production, rounded to six
  significant figures. With the 9 November snapshot: 238 files, 193 KB in all (0.8 KB each on average, 0.4 KB compressed).
- **Rows and charts only where both have data.** A key-figure row needs a figure for both countries; under the table
  one line, "Not available for both.", says what was not compared and why ("No data for Mali: satellites, launches
  (source: CelesTrak); for either: …"). A chart is drawn only when both countries have figures in the years both
  cover and the last of those is no more than 10 years before the latest any country has (`CHART_OLD_YEARS`, the
  measure's `latest` in the meta); otherwise the same line lists it ("Not drawn over time: military spending as a share
  of GDP (the latest year both have is 2013)", Laos and Bolivia; decided 10 Nov 2026).
- **A grouping typed into a country box.** "EU", "European Union", "NATO" and the other groupings with a page (id,
  name, full name, a few other names in `COMPARE_TEXT.blocAliases`) get "Compare works for two countries. See the
  European Union's page for its members and shares", linking the grouping's page, in place of "Try its English name"
  (`compareBlocNotes` in `src/lib/compare.ts`, shown by `src/scripts/controls.ts`; the link is reachable with Tab).
  Minerals: any mineral where either country has at least 1% of world production; the other shows "–" when USGS does
  not list it (decided 9 Nov 2026: not listed is not zero), read out as "Not listed by USGS" and explained in a note
  under the pairs.
- **Each figure in its own scale.** Money and counts carry their own unit, as on the country page ("342 million"
  beside "1.41 billion", "US$427 billion" beside "US$3.60 trillion"); units that do not scale ("% of GDP", "years")
  stay under the row's label (decided 10 Nov 2026, replacing one scale per row, which wrote "0.34 billion").
- **First and second.** The first country is `--cmp-first` (blue), a square, solid lines and bars; the second
  `--cmp-second` (orange), a triangle, dashed lines and hatched bars. `scripts/tokens.ts` checks the two stay apart
  (CIE ΔE ≥ 40) under protanopia, deuteranopia and tritanopia as well as normal vision, in both themes.
- **Pickers.** `ComparePicker`: two boxes on `/compare`, on `/countries` ("Pick any two countries", then the
  ready-made pairs) and under each static pair; one box ("Compare with…") on every country page.

## Not done in this phase

- Redeploying on every data run: production rebuilds at most once a day when the snapshot changed (This week included; see data-pipeline.md).
