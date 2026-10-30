# Open questions

Decisions put off for later. Each says what the question is, what the site does now, and the options seen so far.

## Refugees hosted in Russia (raised 25 Oct 2026)

**The question.** UNHCR's figures stop counting Ukrainians in Russia from 2024. Russia's "refugees hosted" falls from 1.23 million (2023) to about 7,000 Ukrainians and 12,787 people in all (2025), and Ukraine's "fled from" total falls with it. On the map Russia looks as if it hosts almost no one, which reads as wrong.

**What the site does now.** It shows UNHCR's figures as published, with a note next to Russia (refugees hosted, per 1,000 residents) and Ukraine (fled from) in the panel, the tooltip and under the table (`PLACE_NOTES` in src/i18n/views.en.ts).

**Options.**
- Keep UNHCR's figures with the note (current).
- Show Russia's last reported figure (1.2 million, 2023), marked as an older year. This mixes years in the world total and the ranking.
- Mark Russia on the hosted maps as "not reported since 2023" (hatched, like "withheld by source") instead of shading it by the small figure.
- Use another source for Ukrainians in Russia, if one meets the source rules.

## Submarine cables: TeleGeography licence (raised 25 Oct 2026)

**The question.** The spec puts submarine cables at `/internet`. TeleGeography's Submarine Cable Map is the standard
source, but its data now needs a paid annual licence (the old CC BY-NC-SA terms covered only a GitHub repository that
was taken down in 2022). Justinas is asking TeleGeography for a price.

**What the site does now.** `/internet` waits (`rootWaits` in src/data/views.ts); internet outages are live at
`/internet/outages`. OpenStreetMap, the only open source tried, maps 819 cable ways, but 549 have no name and only 40
cross between countries. Finland shows 287 (mostly short lake and archipelago cables) and the United States 7, so a map
of cables by country, or of OSM's lines alone, would mislead.

**Options.**
- License TeleGeography, if the price fits, and build `/internet` from it.
- Keep `/internet` waiting and look for another open source of cable routes and landings.
- Show OSM's international cables only, with a caveat on coverage (judged too thin on 25 Oct 2026).

**Checked and ruled out (25 Oct 2026).** All three take their modern cables from TeleGeography, so they need its licence too:
lintaojlu/submarine_cable_information (crawled from TeleGeography's site), map.kmcd.dev (TeleGeography for current
cables, no licence stated) and EMODnet's schematic cables (TeleGeography's 2014 data, EU waters only, reuse needs
PriMetrica's written consent). EMODnet's separate "actual routes" layer, from European national sources, may be open but
covers European seas only.

## Multi-year supply chain flows (raised 28 Oct 2026)

**The question.** Should the supply chain pages let the reader pick earlier years, to see how a flow changed (who
bought Russia's wheat or gas before and after 2022)?

**What the site does now.** Each `/supply-chains/{flow}` page shows one period only: the latest year its source
reports (2023 for FAOSTAT's crops, 2025 for UNHCR on the current snapshot), labelled "2023, latest available", with no
year select. Flows with different latest years are labelled each with their own, and one Sankey never mixes years.
Arms show SIPRI's latest five-year total, as everywhere else on the site.

**Options.**
- Keep the latest year only (current).
- Add a year select fed by the years each source has in the snapshot, one year per diagram, with a note when a year
  covers fewer reporters. FAOSTAT's matrix and Comtrade's main flows are cut to each importer's main suppliers, so
  coverage can differ by year; that needs checking first.
- A small "change since" line in the panel (a country's top supplier then and now) instead of a full year switch.

## Supply chains: gas by pipeline and LNG (raised 28 Oct 2026)

**The question.** The SupplyChainPage design has a "Pipeline and LNG / Pipeline / LNG" switch on natural gas.

**What the site does now.** The gas page sums both routes, because the flows module (`src/data/flows.ts`) adds them
into one pair. Comtrade's gas rows keep the route (HS 271121 pipeline, 271111 LNG), so the switch can be added once
the gas flows are live on real data.

## Bloc overlap: which groupings count for bridge countries, and which partners to list (raised 28 Oct 2026)

**What the site does now.** Bridge countries are full members of at least one of NATO, the EU, the G7 and the Quad and at
least one of BRICS and the SCO; the page names the blocs and gives the two groups no labels. AUKUS, USMCA, CSTO, EAEU and CIS are in neither
group; adding them would change nothing today (India stays the only one). "Partners and invitees" lists the design's three (Türkiye,
Saudi Arabia, Malaysia), from `src/data/bloc-partners.csv`; BRICS's other partner countries (such as Belarus,
Kazakhstan, Thailand, Vietnam) are not listed.

**Options.** Keep as is; widen the two groups; list every BRICS partner country and SCO dialogue partner.

**Also.** The page has no Methodology section yet; the bridge rule is stated on the page. It can join the full
Methodology review.

## Government bitcoin holdings on country profiles (raised 28 Oct 2026)

**The question.** The prototype showed estimated government bitcoin holdings on country profiles. Should the site
show them?

**What the site does now.** Nothing. The spec dropped them ("weakest source, unclear terms"): the figures came from
tracker sites that estimate holdings from on-chain analysis and news reports, with no official or research source and
no clear licence for reuse, so they fail the source rules.

**Options.**
- Leave them out (current).
- Wave 2: show only what governments themselves disclose (for example the US Strategic Bitcoin Reserve, El Salvador's
  published holdings), with the date of each disclosure, for the few countries that publish. Needs a check that each
  disclosure is regular and citable, and a note that other countries' holdings are unknown, not zero.

## Atlas: short source names and the Map views link (raised 28 Oct 2026)

**The question.** The Atlas design lists short source names under each layer ("EIA; UN Comtrade"), and its bar links
to "Map views". The layer files carry the full source line ("U.S. Energy Information Administration (EIA),
International…"), and there is no page that lists every map view yet (the topic hubs are not built).

**What the site does now.** The list shows each layer file's own source line, cut to one line with an ellipsis. The
bar links to Countries and Explorer only; Map views is left out until a hub or index page is live.

**Options.**
- Add a short source name to each layer file (the source registry's `SOURCE_SHORT` where one exists).
- Link "Map views" to the topic hubs once they are live, or to a plain index of every map view.

## Atlas overlays without a live view (raised 28 Oct 2026)

**The question.** The Atlas design lists eight overlays. Four have nothing live to draw them from: pipelines and
terminals (GEM is imported, `src/adapters/gem.ts`, but no map view draws it yet), submarine cables (waiting on
TeleGeography, above), chokepoints (waiting on the IMF's terms) and internet outages as marks (the outages view
shades countries; it has no marks).

**What the site does now.** The Atlas lists only trade flows, launch sites, disaster alerts and the bloc outline.
The others appear on their own once a view draws them, since the Atlas reads overlays from the views' layer files.

**Options.**
- Add pipelines and LNG terminals to the gas and oil trade views (GEM, CC BY 4.0), which brings them to the Atlas.
- Give the outages view a mark per outage (it needs a location per outage; IODA reports by country and region).

## Map canvas: dark band on narrow maps (raised 28 Oct 2026)

**The question.** On a narrow desktop map (the Atlas at 1024px, where the map column is about 420px wide) the MapLibre
canvas draws a dark band at the top left, under the borders line. It is the canvas itself, not a page element, and it
was there before the Atlas bar changes. Wider maps do not show it.

**What the site does now.** Nothing yet; the borders line sits over most of it.

**Options.** Look at the engine's bounds and minimum zoom for narrow maps (the world fitted into a column narrower than
it is tall), and whether the area beyond Web Mercator's latitude limit is drawn in the sea colour.

## Topic hubs: Explorer links (raised 29 Oct 2026)

**Decided 29 Oct 2026.** The lead card stays the family's main view, the one the menu links to (Critical minerals
shows lithium). Hub intros carry no AI label once approved, like About and Methodology; until then they show the draft
banner.

**Still open.** Explorer has no presets for most topics (its four presets are on GDP, emissions, refugees and military
spending), so its tool entry on a hub has no links under it. Topic presets would give it some.

