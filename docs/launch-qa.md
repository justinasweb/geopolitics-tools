# Launch QA

Results of the launch QA run on 6 November 2026, on the full build (`npm run build`, not the holding page) served with `wrangler dev`. The scripts are in `tests/qa/` and run again with one npm script each, against `BASE` (default `http://localhost:8787`):

| Check | Command | What it does |
|---|---|---|
| Accessibility | `npm run qa:a11y` | axe (WCAG 2.1 A/AA and best practice) on every page below at 1440 and 390 px, with the search dialog and the correction form open; fails on serious or critical issues |
| Keyboard and motion | `npm run qa:keyboard` | Tab through the home page, a map view and Atlas (every stop visible, with a focus ring); open each dialog, sheet and menu from the keyboard and close it with Esc, checking focus goes back; with reduced motion, nothing left animating |
| Speed | `npm run qa:speed` | Lighthouse, mobile preset, on every page below, against the budget |
| Phone layout | `npm run qa:phone` | Full-page screenshots at 390 and 360 px (`shots/qa-phone/`); flags sideways scroll, text cut off by its box, text boxes under 120 px and overlapping controls |
| Links and sources | `npm run qa:crawl` | Crawls the site from `/`; internal links that answer 404, and any figure, chart, map or table without a source and date line next to it (JavaScript off) |

Pages: one of every template, listed in `tests/qa/pages.mjs`: home, a country profile (Germany), a dossier (China), Compare, a bloc and its history (NATO), Bloc overlap, every map view family, Atlas, the five hubs, an indicator ranking (GDP) and the indicators index, the countries index, a supply chain (gas) and the index, Explorer, Dependencies, This week and an archived week, Sources, Methodology and the 404 page; the correction form and search dialog are tested open.

The second-language test (decision D13) was left out of this run.

## Accessibility

92 scans (each page at 1440 and 390 px, plus the two dialogs): 0 with serious or critical issues after the fixes.

| Page | Result | Fix |
|---|---|---|
| Atlas (1440 and 390 px) | Play button of the year slider had no name (button-name, critical) | Given its label, as the other year sliders have it (`src/scripts/atlas.ts`) |
| Sources (390 px) | Corrections table could not be scrolled with the keyboard (scrollable-region-focusable, serious) | `tabindex`, `role="region"` and a label, as the sources table has (`SourcesPage.astro`) |
| Every other page and both dialogs (44 more) | No serious or critical issues at either width | None needed |

### Keyboard and reduced motion

| Area | Check | Result |
|---|---|---|
| Home | Tab reaches 119 stops | Pass |
| Home | every focused element is visible | Pass |
| Home | every focused element shows a focus ring | Pass |
| Country page | Search dialog: Enter opens, Esc closes, focus returns | Pass |
| Country page | Correction form: Enter opens, Esc closes, focus returns | Pass |
| Map view | Tab reaches 62 stops | Pass |
| Map view | every focused element is visible | Pass |
| Map view | every focused element shows a focus ring | Pass |
| Map view | country panel: N then Enter opens it, Esc closes it, focus stays on the map | Pass |
| Atlas | Tab reaches 112 stops | Pass |
| Atlas | every focused element is visible | Pass |
| Atlas | every focused element shows a focus ring | Pass |
| Atlas | Share panel: Enter opens, Esc closes, focus returns | Pass |
| Atlas | Menu: Enter opens, Esc closes, focus returns | Pass |
| Atlas | legend: Enter hides and shows it | Pass |
| Home, 390 px | Tab reaches 60 stops | Pass |
| Home, 390 px | every focused element is visible | Pass |
| Home, 390 px | every focused element shows a focus ring | Pass |
| Home, 390 px | Site menu: Enter opens, Esc closes, focus returns | Pass |
| Map view, 390 px | Full-screen map: Enter opens, Esc closes, focus returns | Pass |
| Reduced motion / | nothing animates after load and opening search | Pass |
| Reduced motion /minerals/lithium | nothing animates after load and opening search | Pass |
| Reduced motion /atlas | nothing animates after load and opening search | Pass |
| Reduced motion /this-week | nothing animates after load and opening search | Pass |

No fixes were needed. Map views keep focus on the map when Enter opens a country's panel, so N and P go on stepping through countries; Esc closes the panel.

## Speed

Budget (Lighthouse, mobile preset): LCP under 2.5 s, CLS under 0.1, TBT under 200 ms; JavaScript under 100 KB gzipped on pages without a map and under 450 KB on map pages; CSS under 50 KB gzipped. JS and CSS are what each page loads, gzipped by the script. On a phone, map views load MapLibre only when the reader taps Show map, so their figures here are without it.

| Page | LCP | CLS | TBT | JS (gz) | CSS (gz) | Score | Result | Fix |
|---|---|---|---|---|---|---|---|---|
| Home | 1.1 s | 0 | 0 ms | 9 KB | 12 KB | 100 | Within budget |  |
| Country profile | 1.5 s | 0 | 0 ms | 11 KB | 41 KB | 100 | Within budget |  |
| Dossier | 1.5 s | 0 | 0 ms | 11 KB | 41 KB | 100 | Within budget |  |
| Compare | 1.4 s | 0 | 0 ms | 8 KB | 41 KB | 100 | Within budget |  |
| Bloc | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Bloc history | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Bloc overlap | 1.4 s | 0 | 0 ms | 24 KB | 41 KB | 100 | Within budget |  |
| Map: minerals | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: emissions | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: refugees | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: disasters | 1.4 s | 0.001 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: food | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: electricity | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: oil | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: gas | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: water | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: river | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: conflict | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: space | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: AI | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: sanctions | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: internet | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: Chinese lending | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: arms | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Map: nuclear | 1.4 s | 0 | 0 ms | 19 KB | 41 KB | 100 | Within budget |  |
| Map: blocs | 1.4 s | 0 | 0 ms | 17 KB | 41 KB | 100 | Within budget |  |
| Atlas | 1.4 s | 0 | 2641 ms | 441 KB | 41 KB | 70 | Within budget, with the accepted TBT exception (below) | First-visit hint shown while the page is parsed: LCP 6.3 s → 1.4 s |
| Hub: resources | 1.7 s | 0 | 0 ms | 8 KB | 41 KB | 99 | Within budget |  |
| Hub: technology | 1.4 s | 0 | 0 ms | 8 KB | 41 KB | 100 | Within budget |  |
| Hub: climate | 1.5 s | 0 | 0 ms | 8 KB | 41 KB | 99 | Within budget |  |
| Hub: security | 1.4 s | 0 | 0 ms | 8 KB | 41 KB | 100 | Within budget |  |
| Hub: power | 1.7 s | 0 | 0 ms | 8 KB | 41 KB | 99 | Within budget |  |
| Indicator ranking | 1.7 s | 0 | 0 ms | 10 KB | 41 KB | 99 | Within budget |  |
| Indicators index | 1.4 s | 0 | 0 ms | 7 KB | 41 KB | 100 | Within budget |  |
| Countries index | 1.4 s | 0 | 0 ms | 9 KB | 41 KB | 100 | Within budget |  |
| Supply chain | 1.4 s | 0 | 0 ms | 26 KB | 41 KB | 100 | Within budget |  |
| Supply chains index | 1.2 s | 0 | 0 ms | 7 KB | 41 KB | 100 | Within budget |  |
| Explorer | 1.4 s | 0 | 13 ms | 23 KB | 41 KB | 100 | Within budget |  |
| Dependencies | 1.5 s | 0 | 0 ms | 24 KB | 41 KB | 100 | Within budget |  |
| This week | 1.4 s | 0 | 0 ms | 10 KB | 41 KB | 100 | Within budget |  |
| This week archive | 1.4 s | 0 | 0 ms | 10 KB | 41 KB | 100 | Within budget |  |
| Sources | 1.4 s | 0 | 0 ms | 7 KB | 41 KB | 100 | Within budget |  |
| Methodology | 1.4 s | 0 | 0 ms | 7 KB | 41 KB | 100 | Within budget |  |

### Accepted exception

**Atlas on a phone: TBT about 2.6 s (budget 200 ms).** Almost all of it is the map library's start-up: MapLibre compiling
(280 KB) and setting up WebGL; the Atlas's own script takes about 50 ms. The map views meet the budget because on a phone
they load the map only when the reader taps Show map. The owner chose on 6 Nov 2026 to keep the Atlas map-first on phones,
so this is the speed budget's one accepted exception. `tests/qa/speed.mjs` allows the Atlas a TBT of up to 4 s
(`EXCEPTIONS`), so a real slowdown still fails the check. Its JavaScript, 441 KB gzipped, is within the 450 KB map budget.

## Phone layout

88 screenshots (every page at 390 and 360 px): 0 with issues after the fixes. The text-heavy templates (dossier, Compare, Dependencies, supply chain, This week, indicator ranking) were also checked by eye at 360 px.

| Page | Result | Fix |
|---|---|---|
| Atlas (390 and 360 px) | Zoom buttons sat 4 px under the year card; the first-visit hint covered the year slider and half the zoom buttons | Zoom buttons sit above the year card whatever its height; while the hint is up, the year card and zoom stay out of sight until "Got it" (`atlasmap.css`) |
| Indicator ranking (360 px) | "Find a country" box squeezed to 66 px and cut off beside the year buttons | The box keeps its 160 px minimum and wraps to its own line (`tools.css`: `.gt-field`'s min-width had cancelled it) |
| Every other page (42 more) | No sideways scroll, clipped text, squeezed text boxes or overlapping controls at either width | None needed |

## Links and sources

Crawled from `/`: every internal link and asset, then every page with JavaScript off. Result after the fixes: 0 links answer 404; 0 pages have a figure without a source and date next to it.

| Page | Result | Fix |
|---|---|---|
| All 543 internal addresses | No link answers 404 | None needed |
| /blocs | Every-grouping table showed population and GDP shares with only the member lists credited, and no year | Source line under the table: member lists and the World Bank, with the year of the shares (`BlocView.astro`) |
| Supply chains (all 11) | Flow table far below the header's source line on a long diagram | The table carries its own source line (`SupplyChainPage.astro`) |
| Indicator pages (all 55) | Ranking table (about 200 rows) had its source only in the header | Source line under the table (`IndicatorPage.astro`) |
| /blocs/overlap | Matrix and membership tables had their source only in the header | Source line after the matrix and after the tables (`BlocOverlapPage.astro`) |
| Every other page (448 checked) | Every figure, chart, map and table has a source and date line next to it | None needed |

## Open items

- **Second-language test (decision D13)** was not run this time.
