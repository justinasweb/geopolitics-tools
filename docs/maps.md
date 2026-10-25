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
  is data, not code, so the Atlas reads the same file. The lithium file is 29 KB (7 KB gzipped).
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
- **Flows.** Crop trade maps draw the 20 largest importer-reported flows in the trade matrix's year as arcs, also listed in a table. FAOSTAT has no fertiliser trade matrix, so fertiliser trade maps have none (UN Comtrade, phase 5b).
- **Panel.** A selected country's balance in the latest year (production, imports, exports, use, production as a share of use), its main suppliers and buyers (crops), and the same measure for the other five commodities.
- **Not yet.** Prices (World Bank Pink Sheet) are not shown.

## Not done in this phase

- Refining shares and trade flows on the minerals views: later phases, once their sources are in.
- The Atlas (one map, every layer): it reads these layer files when it is built.
