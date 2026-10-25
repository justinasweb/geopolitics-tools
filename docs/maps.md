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

## Not done in this phase

- The other seven minerals are built from the same template; their figures are checked in phase 5a.
- Refining shares and trade flows on the minerals views: later phases, once their sources are in.
- The Atlas (one map, every layer): it reads these layer files when it is built.
