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
| Country profile | Every country or territory with at least one figure from any source. Fewer than 4 measures: built, `noindex`, with the "few sources" box listing which sources cover it. Every profile has the People section when WPP covers the place (spec, D16): population 1950–2100 with the UN range, the age pyramid, births per woman, median age, share aged 65+. People needs the three UN WPP imports (`wpp-total`, `wpp-indicators`, `wpp-age`); its age pyramid has a year slider in five-year steps, 1950–2100, every year drawn at build time on one scale |
| Dossier | United States, China and Russia: the profile plus money, technology and climate sections |
| Compare | The three pairs of dossier countries |
| Indicator | Every registry measure with data in the snapshot. Fewer than 20 places reporting in the common year: built, `noindex`. Measures waiting on a key or permission have no page and are listed on the index as waiting |
| About, Methodology, Privacy | `src/content/pages/*.md`. Each shows the draft banner until its front matter says `approved: true` and its facts are unchanged since (see [ai-drafting.md](ai-drafting.md)) |
| Sources | Generated from the source registry, the licence table and the last snapshot; corrections from `src/data/corrections.csv` |
| Explorer | `/explorer` (table), `/explorer/over-time`, `/explorer/scatter`: every measure with an indicator page. See "Explorer" below |
| Dependencies | `/dependencies`: countries against the ten commodities of each country page's dependencies table, with the single points of failure. See "Dependencies" below |
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

## Homepage

`src/templates/HomePage.astro`, model `src/lib/home.ts`, words in `src/i18n/home.en.ts` (the tool row's in
`src/i18n/en.ts`, `TRAIL_TEXT`). Hero option C (spec D19): everything is in the HTML, there is no map, and every
part links only to live pages; a part with nothing to show is left out.

- **Search.** A combobox (`src/scripts/controls.ts`, `data-rank="prefix"`: names starting with what was typed come
  first) over every live hub, tool, map view, mineral, bloc, river, supply chain, ranking and country; picking one or
  pressing Search opens it. Site search does not exist yet (phase 8), so on the homepage the header's search button
  and the `/` key (`gt-search`) bring the reader to this box. "Try" links are live pages only.
- **Tool row.** Atlas, Explorer, Dependencies, Supply chains, Bloc overlap, This week, in that order (`TRAIL`); a tool
  that is not live is left out. Bloc overlap is drawn as two circles here (`ToolIcon circles`); hubs keep the matrix.
  Supply chains counts its live flows of goods (refugees are not a good).
- **Worked questions.** Rare earths (USGS, the view's latest year, with its Estimate tag), US Treasury holders (TIC
  Table 5's latest month; links to the dossier of the first dossier country among the top three, China, since there
  is no Treasuries map) and Hungary's gas (the Dependencies tool's row: the main supplier's share of imports from
  UN Comtrade, and net imports against use from EIA, each with its own year, never multiplied together). Each card
  is left out when its data is missing.
- **This week strip.** The live week's dates and counts, as /this-week shows them; hidden until the data run has
  closed a week.
- **Topics.** One card per live hub, in menu order, with its live views. **Questions to start from:** the first six
  live of eight prepared questions (`QUESTIONS`).
- **Countries and rankings.** The three dossiers; then the six largest economies after them by GDP in the common year,
  a rule the page states (there is no traffic data, so nothing is "popular"); rankings for military spending, CO2 per
  person and refugees hosted, worded as on the hubs.
- **Trust strip.** The Sources page's count and the snapshot's time.

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
- **Countries.** By a rule the page states (no traffic data, so nothing is "popular"): the three dossiers, then the
  countries ranked first on most of the topic's maps of world shares, volumes and counts (layers marked `ranks` in the
  registry; not a share of a country's own total, a per-person figure, a score or a membership; default year; a
  first place shared with the next country does not count), up to ten, each with the maps it is first on.
- **Indicator rankings.** The indexed indicator pages of the topic's groups (`HUB_GROUPS`), named with what a share or
  rate is of (`rate` in `src/i18n/en.ts`: "CO2 imported in goods, % of own emissions"), each line starting with the
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
  (labelled with its week), only when the drafting pipeline's text `week:{id}` is approved and its facts unchanged
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

- **Bar labels** are measured in the font Satori draws them with (its own opentype.js, pinned in `package.json`) and
  fitted first: wrapped to two lines at spaces, or cut after a whole word with "…", keeping a trailing year or
  bracketed short name ("Treaty on the Non-Proliferation… (NPT)"). A word is never split, and a year never stands
  alone on the second line.
- **Rows** get the space left beside the figure column: the value column is as wide as the widest value, the label
  column up to 240px, the bar the rest. When five two-line rows would not fit under the title, the rows get tighter,
  then smaller, then one line each.
- `tests/unit/og.test.ts` checks every card the site builds, and the longest label of each view family five times
  over under its longest title, rendered with nothing in the card's margins.

## Not done in this phase

- Redeploying when new data arrives: today pages refresh on the next deploy (This week included; see open-questions.md).
