# Maps

The interactive maps: one MapLibre map per map view page, drawing a layer file on a basemap of country shapes.
Phase 4 builds the engine and the critical minerals views (`/minerals/lithium` and the other seven); later views
and the Atlas use the same layer files.

## How a map is drawn

- **Projection.** The designs use Equal Earth. MapLibre draws only Web Mercator or a globe, so every coordinate is
  projected to Equal Earth at build time and then written as the longitude and latitude Web Mercator would put at
  that spot (`src/lib/map/projection.ts`). MapLibre then draws an exact, flat Equal Earth map. There are no tiles.
- **Basemap.** `/geo/basemap.json` (`src/lib/map/basemap.ts`): Natural Earth 1:50m admin-0 v5.1.2, Antarctica left
  out, simplified to about 1 px at the map's closest zoom (706 KB, about 260 KB gzipped). Each shape carries the
  internal place id it maps to (`codes.csv`, source `naturalearth`). The same file serves every map and language.
- **Disputed boundaries.** `scripts/natural-earth.ts` takes Natural Earth's breakaway and disputed areas and keeps
  only the parts of their outlines with land on both sides, so the map dashes land boundaries and never a coast.
  Written to `src/data/geo/ne_50m_disputed.json`; rerun it when the Natural Earth release changes.
- **Layer files.** `/map/<layer>.json` (`src/lib/map/layers.ts`, shape in `src/lib/map/types.ts`): for each year,
  each place's class on the colour scale, its figure, detail, status and rank, already formatted and worded; the
  rank order for keyboard stepping; one sentence per bloc; names, slugs, links, notes and interface words. A layer
  is data, not code, so the Atlas reads the same file. The lithium file is 29 KB (7 KB gzipped). Each layer in the
  registry (`mapLayers()`) names its map view's route key and its family (the menu's view id in `src/data/nav.ts`:
  `minerals`, `oil`, `food`…), and each file carries its own `name` ("Lithium", "Wheat production"), the words its
  kicker starts with.
- **Shading** uses MapLibre feature state, so a new year, a selection or a bloc outline never rebuilds the map.
  Withheld and not-yet-reported places are patterns (hatching, dots), never a colour of the scale, so they cannot
  be read as zero; every colour also has its figure in the tooltip, the panel and the table.
- **Overlays** (`src/lib/map/overlays.ts`): flow arcs (curved, bent to one side so a flow and its reverse never
  overlap, widths by amount), lines (solid, or dashed), and points (dots, hollow dots, triangles, diamonds,
  squares). `/dev/map` (hidden, noindex) shows every kind on the lithium layer.

## The map view page

`src/templates/MineralView.astro`, with `MapControls` and `MapStage` (`src/components/`). Everything but the map
canvas is HTML: the answer, the world panel per year, the legend, the summary and the full table, so the page reads
before and without the map script.

- **Loading.** `src/scripts/map/view.ts` fetches the layer file at once. MapLibre (about 280 KB gzipped, plus its
  worker) and the basemap load only when the map is shown: on desktop when the stage nears the screen, on a phone
  when "Show map" opens it full screen. If the map cannot load (no WebGL), the stage says so and points to the table.
- **Opening view.** A map opens on the lived-in world (`HOME_BOUNDS` in `src/lib/map/projection.ts`: Alaska to
  Australia's east coast, 56°S to 80°N), not the whole 180°W–180°E strip, so countries fill the frame; reset returns
  there. A layer with its own `bounds` (a disputed river) opens on that instead.
- **Controls.** The mineral picker is a row of links (each mineral is its own page; a phone gets a select). The year
  slider plays through the years; estimated years carry the Estimate tag. "Outline a bloc" draws the members'
  borders and adds one sentence to the panel ("Today’s BRICS members mined 35%…": a bloc is its members today, for
  every year shown, said with `todaysMembers` in `src/i18n/members.en.ts`). On a phone, year and bloc sit in a
  Filters sheet.
- **URL state.** `?year=2024&country=australia&bloc=brics` (`src/scripts/map/state.ts`), kept with
  `history.replaceState`; defaults are left out and the canonical stays the bare path. A year a source does not
  cover moves to the nearest one it has, and the page says so. Switching mineral keeps the query.
- **Panel and sheet.** Clicking a country opens its panel: figure, detail, status, rank, the year before, notes,
  the source, and links to its page and its table row. On a phone the panel reads inline under the controls;
  on the full-screen map it is a bottom sheet.
- **Events over the sea.** Hover and click read the whole map, overlays first, so marks at sea answer too.
- **Keyboard.** The map canvas takes focus: arrows pan, plus and minus zoom, N and P step through the places with
  data in rank order with the tooltip, Enter opens the one shown, Escape clears. Selections are announced in the
  page's live region.
- **Reduced motion.** No fades, instant zooms, and a slower play.

Year sliders label up to six ticks, evenly spread, the first and the last always (`YearSlider`), so the first tick is
the slider's first year; the slider runs over every year with at least half the default year's coverage.

## The Atlas (phase 6)

`/atlas` (`src/templates/AtlasPage.astro`, `src/lib/atlas.ts`, `src/scripts/atlas.ts`): one full-screen map with the
shaded layer of every live map view. No data and no layer logic of its own: it lists the layer registry, keeps the
layers whose view is live, and loads their files (`/map/<id>.json`) as the views do.

- **Layer list.** The menu's topics, then one row per map view family, in menu order; a family with several layers
  (the minerals, the crops, the blocs) has one row with a select, shown when the row is on. Each row shows the layer's
  name (or, alone in its family, what it measures), then its source and years. Search matches family, topic and
  layer names; picking a row found by a layer's name ("wheat") opens that layer.
- **One map.** The engine draws the first layer, then `setLayer` swaps the shading, its scale and its overlays in
  place, so zoom and the selected country stay. Other countries stay at full strength when one is selected (design
  review decision 7.8; `dim: false`). The shaded layer's own marks are not drawn; overlays are toggles instead.
- **Overlays** (`atlasOverlays()` in `src/lib/atlas.ts`), each listed under its topic and drawn from the layer file of
  the live view that draws it: trade flows (the arcs of every layer that has them, one select: oil, gas, the six
  crops and fertilisers, chips, chip machines, arms; the same flows on two layers are offered once), launch sites
  (the launches view's marks), disaster alerts (the all-alerts view's orange and red alerts, last 30 days) and a bloc
  outline (one select of the 19 groupings). Pipelines, cables, chokepoints and outage marks are not listed: no live
  view draws them. Flows two layers share (arms exports and imports) are offered once, named for their family ("Arms
  transfers"). One choice per overlay. An overlay shows the step of its own layer nearest the map's year that has
  marks (`overlayStep`), with its masks taken off (`overlayAt`). Its legend title says the time actually drawn
  (`overlayTime`): the one year every mark carries (a crop's or a fuel's flows carry `year` in the layer file; their
  `label` has no year), else the step drawn ("Launch sites, 2025", "Disaster alerts, last 30 days"); a caption explains
  when that differs from the map's year. Turning trade flows on over a trade layer opens on that layer's own flows.
- **Legend box.** Bottom left: the shaded layer's legend (`legendHtml` in `src/scripts/map/legend.ts`, from the
  layer file; drawn at build time for lithium and in the browser after), then one section per overlay with its marks
  and an X that turns it off. Hide folds it to its bar for the session. Mark shapes are defined once (`markSvg`), and
  `MarkIcon` uses the same. Bloc and alliance-history layers carry their named classes (`categories`) in the layer
  file; their views' legends read them from there.
- **Address.** `?layer=&year=&country=&overlays=` (`src/scripts/map/atlas-state.ts`); overlays are written as their
  choices, `overlays=flows-oil-trade,launches,alerts,bloc-nato`. `layer` is the layer's view path
  without slashes (`oil-trade`, `minerals-lithium`, `blocs-nato-history`), so it follows the slugs; `country` is the
  internal id in capitals (ISO3), a slug also reads; `year` is written as the layer's view writes its step (2023,
  2026-03 on conflict, 90 days on disasters). Defaults are left out, so the opening state (lithium) is the bare /atlas.
- **Year across layers.** A year the reader chose is carried to the next layer that steps in years, shown at the
  nearest year it has; a reader who never chose sees each layer's own default year (its common year, not a thin
  latest one). The year slider comes in step 3.
- **Indexing.** /atlas is in the sitemap. Any address with a query gets `X-Robots-Tag: noindex, follow` from the
  Worker (`STATE_PAGES` in `worker/index.ts`), since a static page cannot see its query; the canonical is /atlas.
- **Panel.** No country: the layer and year, a hint, the ten largest (`worldPanelHtml`), the source and "See full
  page". A country: the map views' own panel (`countryPanelHtml`, with options for the Atlas: no table link, its own
  no-data block, a block after the facts, a first link), plus "On the layer you had before" (its value on the previous
  layer and year), "See full page: {layer}" opening the view with the same year and country (`viewHref`), and the
  country page. With no figure, the panel uses the layer's own words ("No production listed for 2024", "No IPC
  analysis"), says grey means that, not zero, and lists the country's figures on up to five other rows' current
  layers with their units ("222 outages"), nearest topic first, each a button that switches to it.
- **Panel words (every map).** The year before is labelled with what it measures ("Share of world in 2024"); the
  country page and dossier links are named for screen readers with the place ("India country page"). An oil or gas
  place's balance is from the latest year with both its output and its use (`balanceYear`), so production, use and
  net trade show together, and the note on net trade appears only with a net trade row.
- **Year card.** Shown when the layer has more than one step; it steps by index, so years with gaps (launches), months
  and alert periods all work, with play (not for periods). After a layer change it says "Year kept from your last
  layer" or "2023 is the latest year in this source; you were on 2025" (`yearNote`); a year in the address the layer
  lacks says the same.
- **Bar.** Logo, "Atlas" with the layer and the selected country, then Menu (one panel with the main menu's topics and
  Tools, `menuGroups()` in `src/lib/menu.ts`, which the header uses too; the Atlas is marked as the current page, not
  linked), the header's top-row links (`menu().top`: Countries, Indicators, This week once it is live), the site
  search (a compact button sending the same `gt-search` event as the header's search and the "/" key) and Share. Its
  controls are 32px to the eye, centred above the double rule, each with a 44px hit area that is not drawn.
- **Share.** The bar's Share opens the full address, Copy, X and Telegram; Escape or a click outside closes it.
- **Narrower desktops (760–1199px of the Atlas).** Side columns 260px and 340px; the year card spans the foot of the
  map with the legend above it.
- **First visit.** "Pick a layer" beside the list (above the Layers button on a phone), gone for good after Got it
  (`localStorage`, a per-viewer convenience; without storage it shows each visit).
- **Loading.** A layer not yet fetched: after 120 ms the old map fades and stays, a card says what is loading and that
  the country stays selected, and the legend and panel show skeleton lines.
- **Phone (under 760px of the Atlas).** The map fills the screen under a 56px bar (back, Atlas and the layer, Share).
  The legend folds to one line (ramp, title, Show legend; the choice kept for the session). The Layers button opens
  the list as a sheet (78% high): overlays first as radio buttons, one at a time, then the shaded layers; picking a
  layer closes it. Tapping a country opens the panel as a second sheet; closing it keeps the layer. A compact year card
  sits above the Layers button (the design shows none on a phone). The map refits around the legend line, the card and
  the sheets. The borders line is not shown under the map; its words and the "How we treat borders" link are behind
  the map's ⓘ (the engine's `setAttribution`), folded until tapped, so the phone map carries them too.
- **Styles.** `src/styles/atlas/atlasmap.css`. The phone rules use the named container `atlas`, so cards and panels
  that are containers themselves do not match them.

## Territories: what the default map shows

Natural Earth's default, de facto map, as the territories policy names. Checked in this build:

| Place | On the map |
|---|---|
| Crimea | Inside Russia's shape, with a dashed land boundary |
| Donetsk, Luhansk | Inside Ukraine's shape, with dashed land boundaries |
| Western Sahara | Its own shape (`ESH`) with a dashed boundary; shaded only where a source reports it |
| Golan Heights | Inside Israel's shape, with a dashed land boundary |
| Somaliland, Northern Cyprus | Their own shapes, shaded with Somalia's and Cyprus's figures, as sources report them |
| Siachen Glacier | Its own shape, mapped to no place: the tooltip names it without a figure |
| Kuril Islands | Inside Russia's shape; no dashed line, as the boundary is at sea |
| Kashmir, Aksai Chin, Arunachal Pradesh, Abkhazia, South Ossetia, Transnistria | Dashed land boundaries (26 areas in all) |

Under every map: "Borders show who controls an area in practice, as drawn by Natural Earth. Disputed borders are
dashed. Borders shown do not imply endorsement." with a link to the methodology, until the policy's own wording is approved.

## Blocs

`src/data/blocs.csv` lists the members of 19 blocs by internal place id (`src/lib/blocs.ts`, checked 21 October
2026, from the prototype's list). Phase 5a adds the Wikidata cross-check, which this phase's network could not reach.

## Tests

`tests/unit/map.test.ts` covers the projection, the basemap's place ids and disputed lines, the bloc list, the
USGS adapter on the real MCS 2026 format, share classes, the layer file, the tooltip and panel, and the URL state.
`tests/e2e/smoke.mjs` opens `/minerals/lithium?country=australia` at desktop and phone width, checks the map draws
and the panel opens, and on the phone opens the full-screen map.

## The eight minerals (checked in phase 5a)

All eight views read the world production table of each chapter in the USGS data release (MCS 2026), checked
against the chapters themselves:

| Mineral | What USGS counts | Note |
|---|---|---|
| Lithium | Mine production, lithium content | The United States is withheld; the world total leaves it out |
| Cobalt | Mine production, cobalt content | |
| Rare earths | Mine production, rare-earth-oxide equivalent | China's figure is its production quota; several figures are estimated from China's import data |
| Gallium | **Primary** (low-purity) production, gallium content | Not mined on its own (a by-product of bauxite and zinc processing), so its view says "produces", not "mines" |
| Natural graphite | Mine production, tonnes (no content basis given) | |
| Nickel | Mine production, nickel content | |
| Palladium | Mine production, platinum-group-metal content | |
| Tungsten | Mine production, tungsten content | |

How the adapter (`src/adapters/minerals.ts`) reads them:

- **Shares** are of the world total, or of the countries plus USGS's own "Other countries" figure when those add up to
  more (USGS rounds world totals, to 190,000 t for palladium in 2025 when its parts add to 194,100 t).
- **"—" means zero.** A country USGS lists with "—" (the United States for gallium, graphite and tungsten) produced
  none, so it is not listed, ranked or shaded as a producer.
- **Notes.** USGS's note on a single figure is kept ("Production quota; …") and shown in the table's notes, and on the
  map when it holds for every year. The tonnage basis ("lithium content") is in the table caption and the summary;
  USGS's note on revised figures for the year before is in the caption.

## Disasters (phase 5a)

/disasters shows every kind of GDACS alert by country; /disasters/{earthquakes, cyclones, floods, droughts, wildfires, volcanoes} one kind each (src/lib/disasters.ts, src/templates/DisasterView.astro).

- **Periods, not years.** The slider is replaced by a choice of the last 30, 90 or 365 days (src/components/PeriodControl.astro, with the slider's contract). The layer file says `axis: "days"`, its `years` are the periods' lengths, each period has a `label` ("Last 30 days") that the panel, tooltip and kicker use, and the URL keeps the period in `?days=` (365, the default, is left out).
- **What a period counts.** Orange and red alerts, in every period, so a longer period never shows fewer. GDACS keeps green (low-impact) alerts for 30 days only, so the 30-day map draws them as small dots and the panel gives their number, but they are not counted or shaded. An alert counts in a period if the event lasted into it, once for each country it names. Country pages count their past-year alerts with the same function (`alertsIn`), so the two always agree.
- **Shading.** Alert counts in fixed classes: 1, 2–4, 5–9, 10–24, 25+. A country with no alert reads "No alerts", not "No data".
- **Marks.** Alerts are drawn by level as shapes: red a filled triangle, orange a diamond, green a small dot (30 days only, not counted). Each mark carries a bit mask `m` of the periods it shows in, and the engine filters point overlays on it when the period changes. On the earthquakes page the marks are USGS earthquakes of magnitude 5.5 and over (hollow circles sized by magnitude), since GDACS lists the same quakes; the shading is still GDACS alerts.

## Food and fertiliser (phase 5a)

/food/{wheat, maize, rice, soybeans, potash, phosphate} shows production, /use and /trade after each (18 pages; src/lib/food.ts, src/templates/FoodView.astro). Two pickers: the commodity, and the measure.

- **Data.** FAOSTAT, from 2015. Crop use is production plus imports minus exports (stock changes left out); a place FAOSTAT never lists for production grows none, and a missing export figure counts as none, because FAOSTAT leaves out years with no exports. Fertiliser use is FAOSTAT's agricultural use, in tonnes of nutrient (K2O, P2O5). Rice is milled rice throughout.
- **Snapshot format.** Snapshots fetched before the fetcher took the API's row format hold FAOSTAT's own CSV columns (faostat/crops.csv, trade.csv, fertilizers.csv, matrix.csv, places by M49 code); the adapter reads either, so the pages work on today's snapshot and on the next fetch.
- **Shading.** Production and use by share of the world, in the minerals' classes (under 1%, 1–5%, 5–10%, 10–25%, 25%+). Trade is exports minus imports on a diverging scale, net exporters at one end and net importers at the other; its edges are rounded (1, 2, 5) from that commodity's latest year and kept for every year.
- **Years still coming in.** The default year is the latest with 90% of the best coverage. A place with a figure in one of the two years before but none yet is hatched "Not yet reported", with its last figure.
- **Estimates and notes.** Figures FAOSTAT flags as its own estimate or imputation (flags E and I) carry the estimate tag and an "e" in the table; a use worked out from an estimate is one too. Most fertiliser figures are estimates. Notes on single places (Russia's trade since 2022, Morocco's 2024 phosphate exports, Belarus's potash) are in src/i18n/food.en.ts.
- **Flows.** Crop trade maps draw the 20 largest importer-reported flows in the trade matrix's year as arcs, also listed in a table. Fertiliser flows come from UN Comtrade, in tonnes of product (not nutrient), which the caveat says.
- **Panel.** A selected country's balance in the latest year (production, imports, exports, use, production as a share of use), its main suppliers and buyers (crops), and the same measure for the other five commodities.
- **Not yet.** Prices (World Bank Pink Sheet) are not shown.

## Blocs (phase 5a)

/blocs maps how many of the 19 groupings each country belongs to; /blocs/{bloc} maps one grouping's members (src/lib/blocview.ts, src/templates/BlocView.astro). Members come from src/data/blocs.csv, as of the date it was last checked; the layer has one "year" and no slider. A grouping's share of the world adds up its members' figures (population, GDP, military spending, CO2, the four crops, and each mineral's mine production where members mine at least 1%) against the sum for every country with a figure, a year back where the latest is missing. "Outline a bloc" on a grouping's page shows its overlap with a second one. A line on what each grouping is, and notes on single memberships (Armenia in the CSTO), are in src/i18n/blocs.en.ts. Alliance history (/blocs/{bloc}/history) is not built yet.

## Alliance history (phase 5a)

`/blocs/{bloc}/history` for 11 groupings (NATO, EU, G7, G20, BRICS, SCO, ASEAN, OPEC, CSTO, Quad, OECD). Spans come from
`src/data/bloc-history.csv` (`bloc,place,from,to`, years only, one row per membership; `to` is the year the country left), compiled
by hand from each grouping's own member list and history, because Wikidata is not reachable from the build. A test checks that the
spans still open match `src/data/blocs.csv`. The map shades, per year, who joined, who was a member, who left that year and who had
left before; countries are drawn on today's borders (West Germany appears as Germany), and a note says so next to the map.
Notes on changes that are not joins or exits (France and NATO's integrated command) are in `HISTORY_EVENTS`.

## Space (phase 5a)

`/space` (satellites in orbit by owning country) and `/space/launches` (orbital launches by the country of the launch
site), both registry views (`src/data/views.ts`) on CelesTrak's catalogue. Launches set `fullYears`, so the running year
is left out until it ends. Extras from `src/lib/space.ts`: each country's working satellites by orbit and constellation in
the panel, the largest constellations under the satellites table, and a mark per launch site per year (sized by launches)
with a sites table on the launches page. Satellites of international owners (ESA, Intelsat) count for no country.

## AI and chips (phase 5a)

`/ai` (share of known AI computing power, the registry's `aicompute`), `/ai/models` (notable models by country of the
developer, Epoch AI) and `/ai/export-controls` (US Entity List entries by country, from the CSL). Models and Entity List
counts are view-only measures (`src/data/view-measures.ts`): no indicator page, profile row or Compare column. The
computing power map marks each known supercomputer, with a table of the largest. `/ai/chips` and `/ai/chip-machines`
(phase 5b) map imports of integrated circuits (HS 8542) and chipmaking machines (HS 8486) as importers report them to UN
Comtrade, in US dollars, with each year's 20 largest flows as arcs and a buyer's main suppliers in its panel.

## Sanctions (phase 5a)

`/sanctions` (listings on the US SDN, EU and UK lists together, the registry's `sanctions`) and `/sanctions/{us,eu,uk}`
(each list alone, view-only measures). The panel splits a country's listings by list, by kind of target and by the main
programmes. Counts are of listings, so a target on two lists counts twice in the total; this is said next to the figure.

## Water and dams (phase 5a)

`/water` (WRI Aqueduct baseline water stress, fixed bands from the score: under 10% to over 80% withdrawn), `/water/2050`
(business-as-usual projection) and `/water/from-abroad` (AQUASTAT dependency ratio, latest year per country). The water
stress map marks dams in Global Dam Watch holding at least 1 km³, with a table of the largest. The importer reads the 2026
AQUASTAT bulk file (countries by M49 code) and the GDW v1.0 attribute table (`GDW_barriers_v1_0.txt`, GRanD dams only;
the dam's own position, else where it meets the river). The disputed rivers pages are not built yet.

## Disputed rivers (phase 5a)

`/water/rivers/{nile,indus,mekong,tigris-euphrates,brahmaputra,amu-darya,helmand,dnipro}`: the countries in each dispute
(src/data/rivers.ts, from the prototype's list) shaded by water stress, with the river's large dams from Global Dam Watch.
GDW names rivers in many spellings and gives a main basin for only a third of its dams, so a dam belongs to a river when
it is in one of the dispute's countries and its river name matches the main stem or a large tributary, or its basin
matches, less a short list of dams whose basin field is wrong. GDW 1.0 stops at about 2022, so the newest dams (Ethiopia's
Renaissance dam among them) are missing, and it does not mark destroyed dams (Kakhovka); the caveat says so. Each river's
summary is an AI draft for the owner to approve (D14) and comes in phase 7.

## Chinese lending (phase 5a)

`/chinese-lending` and `/chinese-lending/{energy,transport,mining,banking,other}`: AidData commitments 2000–2021 added up,
in 2021 dollars, records recommended for aggregates only. The panel splits a country's total by sector and by aid-like or
lending-like flows and lists its largest projects; the page lists the largest commitments. AidData 3.0 writes sectors in
capitals, so the sector groups match without case.

## Arms transfers (phase 5a)

`/arms` (exporters) and `/arms/importers`: SIPRI deliveries of major arms as five-year totals, the way SIPRI compares
them, with a picker for each five-year period the data covers. The import takes SIPRI's Import/Export values download
(supplier → recipient TIV by actual delivery year, `valuesToTable` in pipeline/sources/imported.ts). The trade register
(one row per deal) still works as a fallback: `registerToTable` splits a deal's delivered value evenly across its
delivery years, totals over a deal's years stay exact, single years become estimates, and only then do the indicator
pages say so. Only derived totals are shown, never the register's rows, and there is
no download, as SIPRI's terms ask. The panel lists a country's main partners and, for importers, its suppliers split
into the United States, China, Russia, European countries and others; the arcs and the table below the map show the
largest flows. Each layer compares with the period before (`span` in src/data/views.ts), not an overlapping one, so
supplier shifts show once the export reaches back at least ten years.

## Oil and gas (phase 5b)

`/oil` and `/gas` (production), then `/consumption`, `/trade` and `/reserves` after each (src/lib/energy.ts,
src/templates/EnergyView.astro). EIA International Energy Data from 2000: oil production is crude with lease condensate,
oil use is all petroleum products, net trade is all liquids produced minus use (so the United States is a net exporter),
gas is dry gas in billion cubic metres. The default year is the latest with 90% of the best coverage; later reporters are
listed as not yet reported. Trade maps draw the 20 largest UN Comtrade flows (crude in barrels a day at 7.33 barrels a
tonne; gas as pipeline and LNG, LNG dashed). `/oil` also shows Brent and WTI monthly prices. Reserves pages add years
of output at the latest rate; on live data they are left out, since EIA's API no longer has proved reserves (they show
only on the sample build).

## Electricity (phase 5b)

`/electricity` (low-carbon share), `/electricity/wind-solar`, `/coal`, `/gas` and `/nuclear`: Ember's yearly generation,
each source as a share of the country's own generation, on fixed bands. Ember's nine series fold into seven groups for
the mix (gas with other fossil, bioenergy with other renewables); the gas layer maps gas alone. The world figure is
Ember's own World total, and changes are in percentage points (`points` in src/data/views.ts). A country's panel shows
its mix in the default year only (every year would make the layer file several megabytes); the page has the world mix.

## Conflict (phase 5b)

`/conflict` (src/lib/conflict.ts, src/templates/ConflictView.astro): UCDP events since January 2023, the slider stepping
through months (`axis: 'months'`, numbered year × 12 + month − 1 so they run on; `?month=2026-03` in the URL). Countries
are shaded by deaths over the 12 months to the month, in UCDP's bands (25 deaths an armed conflict, 1,000 a war); the
month's events are marks, one shape per kind of violence, added up within cells of one degree, each shown in its month
only (`i` on a point). Months from the Candidate release are preliminary. UCDP numbers countries by Gleditsch–Ward code
(codes.csv, source `ucdp`); Gaza and West Bank events move to Palestine. The registry's `conflictdeaths` counts full
calendar years only.

## Food crises (phase 5b)

`/food-crises` (people in IPC Phase 3 or worse) and `/food-crises/share` (their share of the people analysed): each
country's latest IPC or Cadre Harmonisé analysis starting in the year. A country without an analysis reads "No IPC
analysis", never "No data" or zero. The total covers the countries analysed, which change from year to year, so its
change is not shown. A country's panel gives its latest analysis by phase; the page lists countries with people in
Phase 5, which counts people in catastrophe, not famine (an area classification this endpoint does not give).

## Internet (phase 6)

`/internet` itself waits for a cable source (`rootWaits`), so each layer has its own address: `/internet/outages`
(IODA, last 12 months), `/internet/users` and `/internet/ict-exports` (spec D18). Users is the registry's `netuser`,
ITU's share of people who used the internet in the last three months, as the World Bank publishes it
(`IT.NET.USER.ZS`), stored as a share so changes are in percentage points, on fixed bands of 20%. ICT exports is
`ictexp`, telecom, computer and information services exported, in current US$, from IMF balance-of-payments data via
the World Bank (`BX.GSR.CCIS.CD`); the total covers the countries that report, which change from year to year, so its
change is not shown (`noTotalChange`). A country's panel adds the same exports as a share of its service exports
(`ictshare`, `BX.GSR.CCIS.ZS`) in the year shown. Its money format has `millions`: figures under $1 m read "under $1 m"
and get no percentage change, which would otherwise run to thousands of percent (Sudan, $33,000 to $16 m). Ireland has
a place note on multinational firms' subsidiaries. The API marks no value as an estimate, so neither layer carries the
Estimate tag. Credits name the original publisher, then "via World Bank, CC BY 4.0".

## Cyber incidents (Internet, D18)

`/internet/cyber-operations` (layer `internet-cyber`, src/lib/cyber.ts, words in src/i18n/cyber.en.ts): EuRepoC's
Global Dataset of Cyber Incidents, the version pinned in pipeline/sources/eurepoc.ts, named in every credit.

- **Measure.** Publicly known incidents affecting each country, by the year the incident started; one incident
  affecting several countries counts once for each. Receivers are matched by ISO alpha-2; regions, the EU and unknown
  receivers are left out. The world figure is every incident starting in the year, counted once. The slider runs from
  2000 (`from` in src/data/views.ts) although the early years have few incidents; fixed classes 1, 2–4, 5–14, 15–49
  and 50 or more. A country with none reads "No incidents recorded", not "No data". **Method note** (in the summary):
  version 1.3.2's file has 3,414 incidents and 92 have no start date, so they are left off the map.
- **Change column.** Where the year before is under 10 incidents (`diffUnder`), the change is the difference in
  incidents ("+4"), not a percentage (Uruguay 1 → 5 would read +400%); the column still sorts by the percentage.
- **No ranking words** (`neutral` on the layer, `unranked` in the layer file): no rank in the panel, no ranking around
  the country, no numbers on the world panel's bars, "Incidents recorded, by country" instead of "Highest", no top
  three in the summary (what the year's incidents were attributed to instead), and no first places on the hub
  (`ranks: false`). Every panel carries the caveat beside the figure (`caveat` in the layer file).
- **Attributions.** Every attribution EuRepoC records, each said as "Attributed to {state}" with "by {who}" from its
  attribution basis (the affected country's government, IT-security firms or researchers, media reports…). When the
  source is the actor itself (a group, or a state agency), the note says "claimed by the actor itself", not
  "attributed … by". Only an
  initiator EuRepoC codes as a state counts for the state. Groups it codes as state-affiliated have their own row,
  "State-affiliated groups (EuRepoC links them to {state})", and stay out of the state arcs and the pairs table.
  Other non-state groups and individuals count by their kind (hacktivists, criminal groups), never by their country;
  an attribution naming none of these has its own row, and "Not attributed" is its own row. An incident with several
  attributions counts in each row.
- **Own state.** A state attributed with incidents in its own country (Serbia → Serbia) is labelled "(own state)" in
  the panel and left out of the arcs and the pairs table.
- **Panel.** For the year shown: the incidents affecting the country by who they were attributed to; the incidents
  attributed to it by the country affected; and the incidents attributed to groups EuRepoC links to it, by the country
  affected. **Arcs**: each year's 12 largest state → country pairs (states only), with a table of the 20 largest pairs
  and who attributed them under the main table.
- **Country pages.** A "Cyber incidents" block under More figures on every country page: incidents affecting it since
  2000, or "No publicly known incidents", the caveat's last sentence and a link to the map with the country selected.

## Nuclear weapons (phase 5a)

`/nuclear` (warheads), `/nuclear/treaties` and `/nuclear/sharing` (src/lib/nuclear.ts, src/templates/NuclearView.astro,
words in src/i18n/nuclear.en.ts), in the Power and alliances hub after Chinese lending (spec, D17).

- **Warheads.** FAS's estimated stockpile for each of the nine states, every year since 1945, from OWID's stockpile
  chart, which credits FAS (`fas`, `nuclear-warhead-stockpiles.csv`). OWID's "inventories" chart holds only the latest
  year (found by the first live check), so it gives the split, never the series; the slider steps through the years on one fixed scale
  (under 100, 100–300, 300–1,000, 1,000–5,000, 5,000+). Every figure carries the Estimate tag and "FAS estimate, as of
  early {year}". Figures are FAS's own, whole numbers; the world total is their sum, said as "about". The panel has
  the year's ranking, the inventories since 1945 (the four largest labelled) and FAS's current split; a state's
  panel adds its own split (deployed strategic and nonstrategic, reserve, military stockpile, retired, total). The
  split comes from OWID's status chart, or from FAS's own table (`fas-forces`) when that is imported and as new. When
  the split is newer than the series (OWID's split for 2026, its series to 2025), the split's year becomes the series'
  latest year, taking whichever of FAS's two totals the series counts (military stockpile, or total inventory with
  retired warheads), found by matching the figures (`seriesMeasure`), and the page says that year comes from FAS's
  current figures. The split sits beside the totals (panel and table columns) only when it is for the same year;
  otherwise it has its own table labelled with its year and date. The panel's chart names states by their short
  names (US, UK). The "Peak" line under it reads the highest world total in the series (the mid-1980s).
- **The Soviet Union.** OWID files the Soviet Union's warheads under Russia's code through 1991. The figures stay on
  Russia's shape (the basemap has no Soviet Union) and nothing moves between countries, but every place that shows a
  year says "Soviet Union" for 1949–1991 (`FORMER` in src/lib/nuclear.ts; `names` per year in the layer file): the
  panel, tooltip, ranking, the chart (a line of its own to 1991, then Russia's, in one colour) and the CSV (Soviet
  Union, SUN, "Russia from 1992"), with Russia's note "Figures to 1991 are the Soviet Union's, shown on Russia's shape;
  Russia from 1992."
- **Year labels.** Only the year of FAS's current page (its split's year) says "FAS estimate, as of early {year}";
  the historical series says "{year} · FAS, via Our World in Data". Every figure keeps the Estimate tag. A change from a
  world total under 100 is given in warheads ("Up 59 warheads from 1949"), not a percentage.
- **Sharing panel.** A country's arrangements are stacked full width (`stack` on the panel block): the arrangement and
  who it is with, then whether it is stated or not officially confirmed with its key (the hatch for a host only FAS
  reports), then the date and note. "Reported by FAS" is said once, in the headline. The table
  under the map has the split and each state's first estimate; a CSV of every figure shown is at
  `/downloads/nuclear-warheads.csv` (FAS confirmed CC BY 4.0 by email on 29 Oct 2026). The methodology note links to
  FAS's own explanation.
- **Treaties.** One map of the NPT and TPNW together, in five unordered classes: party to both, NPT party that signed
  the TPNW, NPT party only, not a party to the NPT, and North Korea's announced withdrawal (with a note). From
  `src/data/nuclear-treaties.csv` (place, treaty, status, date, source). **Hidden on real builds** until the file has
  been checked against the UNODA Treaties Database and `TREATIES_CHECKED` is set: it was compiled in a session that
  could not reach UNODA. Sample builds show it.
- **Sharing.** Countries with nuclear weapons, countries that host another state's weapons, and countries covered by an
  ally's guarantee, from `src/data/nuclear-sharing.csv` (place, provider, kind, status, date, source), one dated,
  cited row per arrangement, like the alliance histories. An arrangement is shown as fact (`stated`) only when a
  government or alliance has stated it (NATO's guarantee to its members, Russia on Belarus, the US to Japan, Korea and
  Australia); a host only FAS reports (`reported`: the five European hosts of US weapons, which NATO does not name) is
  drawn as a dense hatch of the stated hosts' colour over a light tint of it (class −2 and `hatch` in the layer file),
  says "reported by FAS", and keeps its borders, so it reads as a host, less certain, never as no data. The stripes are
  the colour with 15% ink: 3.4:1 against the no-data grey in the light theme (the plain colour is 2.75:1), 4.5:1 or more
  in the dark one. A place both hosting and covered is shaded as a host; its panel lists both, and the counts (answer
  and world panel, from `sharingCounts`) count it in both rows.
- **Neutral colours.** Treaty and sharing classes have no order, so their layer files set `palette: 'cat'` and the
  engine, legends and hub thumbnails draw them in the categorical colours (`--cat-1…`) rather than a sequential ramp.
  The Atlas panel lists the layer's counts (`tally` in the layer file) instead of a "largest" list for these layers.
- **Country pages.** The nine states' "More figures" section has a Nuclear weapons block: the latest estimate with its
  Estimate tag and a link to the map with the country selected.

## Not done in this phase

- Refining shares and trade flows on the minerals views: later phases, once their sources are in.
- Oil and gas reserves on live data: EIA's API dropped them (its international activities are now production,
  consumption, imports and OECD stocks). Left out for now by decision; the Energy Institute (to 2020 only) and OPEC
  (oil only, own terms) were the alternatives looked at.
- Live data for the phase 5b views: each goes live when its key is set and its gates pass on live data. The chokepoints
  and ports wait on the IMF's terms; submarine cables stay hidden.
