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
