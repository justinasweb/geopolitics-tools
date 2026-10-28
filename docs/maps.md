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
  borders and adds one sentence to the panel ("BRICS members mined 35%…"). On a phone, year and bloc sit in a
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

## The Atlas (phase 6)

`/atlas` (`src/templates/AtlasPage.astro`, `src/lib/atlas.ts`, `src/scripts/atlas.ts`): one full-screen map with the
shaded layer of every live map view. No data and no layer logic of its own: it lists the layer registry, keeps the
layers whose view is live, and loads their files (`/map/<id>.json`) as the views do. Built in steps; this is step 1.

- **Layer list.** The menu's topics, then one row per map view family, in menu order; a family with several layers
  (the minerals, the crops, the blocs) has one row with a select, shown when the row is on. Each row shows the layer's
  name (or, alone in its family, what it measures), then its source and years. Search matches family, topic and
  layer names; picking a row found by a layer's name ("wheat") opens that layer.
- **One map.** The engine draws the first layer, then `setLayer` swaps the shading, its scale and its overlays in
  place, so zoom and the selected country stay. Other countries stay at full strength when one is selected (design
  review decision 7.8; `dim: false`). Overlays are off for now (step 2 makes them their own toggles).
- **Address.** `?layer=&year=&country=&overlays=` (`src/scripts/map/atlas-state.ts`). `layer` is the layer's view path
  without slashes (`oil-trade`, `minerals-lithium`, `blocs-nato-history`), so it follows the slugs; `country` is the
  internal id in capitals (ISO3), a slug also reads; `year` is written as the layer's view writes its step (2023,
  2026-03 on conflict, 90 days on disasters). Defaults are left out, so the opening state (lithium) is the bare /atlas.
- **Year across layers.** A year the reader chose is carried to the next layer that steps in years, shown at the
  nearest year it has; a reader who never chose sees each layer's own default year (its common year, not a thin
  latest one). The year slider comes in step 3.
- **Indexing.** /atlas is in the sitemap. Any address with a query gets `X-Robots-Tag: noindex, follow` from the
  Worker (`STATE_PAGES` in `worker/index.ts`), since a static page cannot see its query; the canonical is /atlas.
- **Not yet.** Overlays and the stacked legend (step 2); the country panel, the year slider, Share and the phone
  sheets (step 3). On a phone the list sits under the map until then.

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

Under every map: "Borders show de facto control, as drawn by Natural Earth; disputed lines are dashed. Boundaries do
not imply endorsement." with a link to the methodology, until the policy's own wording is approved.

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
them, with a picker for each five-year period the data covers. The import takes SIPRI's trade register (one row per
deal) and turns it into supplier → recipient totals by year, splitting a deal's delivered value evenly across its
delivery years (`registerToTable` in pipeline/sources/imported.ts). Totals over a deal's years are exact; single years
are estimates, and the indicator pages say so. Only derived totals are shown, never the register's rows, and there is
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

## Not done in this phase

- Refining shares and trade flows on the minerals views: later phases, once their sources are in.
- Oil and gas reserves on live data: EIA's API dropped them (its international activities are now production,
  consumption, imports and OECD stocks). Left out for now by decision; the Energy Institute (to 2020 only) and OPEC
  (oil only, own terms) were the alternatives looked at.
- Live data for the phase 5b views: each goes live when its key is set and its gates pass on live data. The chokepoints
  and ports wait on the IMF's terms; submarine cables stay hidden.
