# Open questions

Decisions put off for later. Each says what the question is, what the site does now, and the options seen so far.

## Re-check bloc memberships before launch (raised 2 Nov 2026)

**The question.** The membership table (`src/data/blocs.csv`, `bloc-history.csv`) is kept by hand, and the
weekly Wikidata cross-check planned for phase 5a is not built yet. It was last checked in full on **21 October 2026**
(`BLOCS_CHECKED` in `src/lib/blocs.ts`), but it missed the United Arab Emirates leaving OPEC and OPEC+ on
1 May 2026 (announced on 28 April 2026, [WAM](https://www.wam.ae/en/article/bzxzuh7-uae-announces-decision-exit-opec-opec+)).
That was fixed on **2 November 2026**: the UAE was removed from OPEC (now 11 members) and OPEC+ (now 21), its OPEC
history ends in 2026, and the change is in Sources → Corrections. Only OPEC and OPEC+ were rechecked that day, so
`BLOCS_CHECKED` still says 21 October 2026.

**Bloc shares count today's members: decided 2 Nov 2026.** A bloc's share or total on a map, a bloc page or a share
image adds up its members as they are today, whatever year is shown, so OPEC's 2024 oil share leaves out the UAE,
which was a member then. At launch every such sentence says so ("Today's OPEC members produced 30% of the world's oil
in 2024."), built with one phrase (`todaysMembers` in `src/i18n/members.en.ts`); `tests/unit/bloc-lines.test.ts`
fails on a bloc share line without it. Lines that state no share over a year keep plain wording: overlap between
groupings, disaster alerts in the last days, treaty and sharing status, river disputes.
Post-launch option: count each year's members for the 11 groupings with a history (`bloc-history.csv`), and keep
"today's" for the other 8.

**Members that are not countries, and predecessors: decided 3 Nov 2026.** Counts are of countries, and a grouping
with other members names them in one template (`membersText` in `src/i18n/members.en.ts`): "19 countries, plus the
European Union and, since 2023, the African Union" (G20) and "7 countries, with the European Union taking part as a
non-enumerated member since 1977" (G7), on the bloc page, its title, panel, member table, history page, Bloc overlap
and share images. A history that began under another name says so (`BEGAN_AS` in `src/i18n/blocs.en.ts`): the SCO
(Shanghai Five, 1996), the EU (European Economic Community, 1958), the CSTO (Collective Security Treaty, 1992), BRICS
(BRIC, 2009; South Africa joined in 2010) and the G7 (a summit of six countries in 1975; Canada joined in 1976).
Confirmed by the owner on 3 Nov 2026: the EU's G7 participation **since 1977**, and calling the 1975 summit "a summit
of six countries" rather than a named "G6". `tests/unit/bloc-members.test.ts` holds the wording.

**Before launch.** Check every one of the 19 groupings against its own member list, update `BLOCS_CHECKED` to that
day, and log any change in `src/data/corrections.csv`. Known points to look at: BRICS (Saudi Arabia's status),
the CSTO (Armenia's frozen participation), OPEC+ (its list of non-OPEC producers) and the G20 (the African Union is
not a country, so not on the map).

## AI drafting: choices to confirm (raised 2 Nov 2026)

Made while building the drafting pipeline (docs/ai-drafting.md); each is easy to change.

- **Facts to verify before anything can be drafted.** Every alliance history and river fact is marked unverified:
  the official sites (nato.int and the others) could not be reached from the build session. Each fact has its
  official link and a note. A web search confirmed that the main cited pages exist, not what they say. Dates come
  from `src/data/bloc-history.csv` and `HISTORY_EVENTS`; a few links point to a site's home page because no exact
  page could be checked (ASEAN's Timor-Leste declaration, Ethiopia's Prime Minister's Office, Egypt's State
  Information Service, Xinhua, the MEA). Privacy and Methodology also wait on the Fathom, Cloudflare and SIPRI facts
  and the six territory notes.
- **Stale texts are hidden.** A short text whose facts changed disappears until it is redrafted; a long page shows
  the draft banner again. For dossiers this happens whenever a figure they cite gets a new year. The alternative is
  to keep showing the old text with its approval date until the redraft.
- **Approval dates for long pages** are typed by the owner (`approvedOn`) in the pull request; CI fails without one.
  A "approve" label or comment that fills it in would save the step.
- **Hand-written texts** carry no label and are never flagged as stale, even when their facts change.
- **Dossier summaries replace the template summary** in the dossier header once approved; the template summary stays
  until then.
- **Strictness.** The checker refuses "half", "doubled", rounding to one significant figure and any country the facts
  do not name, including demonyms ("Chinese company"). If good drafts are dropped too often, loosen it in
  `src/lib/ai/check.ts` with a test.

## This week: choices to confirm (raised 2 Nov 2026)

Made while building `/this-week` and its archive; each is easy to change.

- **Merging storms.** GDACS sometimes keeps one cyclone as two events. Tropical cyclones with the same GDACS name
  whose dates meet (within two days) are merged; the two red India rows reported on the Preview (1 Nov and since
  26 Oct) are merged only if GDACS gives them the same storm name. The data could not be checked from the build
  session (no R2 keys, GDACS not reachable); if they are two storms they stay apart, and the earlier one now sits
  under "Still active".
- **"Rose" has no exact day.** An earlier alert is counted when GDACS's copy from the period's first day shows a
  lower level; the card says it rose in the period, not on which day.
- **Live page and archive cover different days.** `/this-week` is the last 7 days; archived pages are ISO weeks. The
  live page shows the latest closed week's approved summary, labelled with that week; it could instead show none.
- **Still active.** Alerts GDACS lists as current count as still active even when GDACS's end date (for droughts, the
  last update) is weeks back. The three drought alerts that went missing in round 2 were most likely dropped by our
  filter (end date only) rather than closed by GDACS: the sample data's current droughts went missing the same way.
  The real file could not be read from the build session; check the Preview's "Still active" list.
- **No new data.** A card is "quiet" when its source's data last changed before the period began. Conflict and
  prices change monthly, so their cards are quiet about three weeks in four and show only the date and latest month.
- **The page refreshes on deploys.** The spec says it rebuilds after each data run; today pages refresh only on a
  deploy (see "New data reaches the site only on a deploy" in data-pipeline.md). Decide whether the data run should
  start a rebuild, say once a day when the snapshot changed.
- **Archive timing.** A closed week is frozen by the first data run on the Monday or Tuesday after it; a week the
  data run misses on both days is not archived. The first archived week is the one that closes after this is merged.
  Sanctions changes and alerts that rose need a copy from the week's own Monday, so the first full week after merge
  is the first with them. On the live page they need a copy from the first of its 7 days, so they appear about a week
  after merge.
- **Prices card.** Natural gas (Europe), wheat, maize, rice, copper and gold from the Pink Sheet files the pipeline
  keeps; Brent is not among them (it comes from EIA). There is no prices page or map, so the card has no "Open" link.
- **Sanctions.** US counts are the SDN list and the Entity List (the two US lists the site reads), not every list in
  the CSL. Sanctions changes are not in the Latest feed, which lists alerts, outages and the conflict and price releases.
- **Outages.** IODA's country-level outage events are called "national-scale" as in the design.
- **Shipping and food crises cards.** Not built: PortWatch and IPC wait on permission. Their place in the order, the
  glyphs, the `.gt-ref` bars (`RefBars`) and the counts' wording are ready; the model needs a builder for each in
  `src/lib/week/model.ts` once a source is live.

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
was taken down in 2022).

**Decided 2 Nov 2026.** TeleGeography quoted USD 25,000 a year, which is far over budget, so it is dropped. `/internet`
keeps waiting until a better open source of cable routes and landings turns up; outages stay live.

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

## Sources waiting on replies (raised 2 Nov 2026)

**The question.** Three requests sent on 26 Oct 2026 may never be answered: the IPC key (request form), the IMF's
permission for scheduled downloads (copyright@imf.org: WEO, reserves, PortWatch) and PeeringDB's permission
(support@peeringdb.com: exchange points). EIA, UN Comtrade, Ember and UCDP keys are in.

**Plan for launch without them.** None of the three blocks launch; each view stays hidden until its gates pass.
- IPC: food crises and the This week food card stay hidden. The food crises views switch on by themselves when
  `IPC_API_KEY` is set; the This week food card and its count still need building then (see "This week" below).
- IMF: chokepoints and ports stay hidden. WEO figures and reserves can be imported by hand instead, since the IMF's
  terms allow reuse with credit and only automated bulk downloads need permission.
- PeeringDB: the exchange points layer stays off, as already planned.

**Options.**
- Send one short follow-up to IPC and the IMF, then wait.
- Import WEO and reserves by hand when the IMF publishes (April and October for WEO).
- Import PortWatch by hand on a schedule (for example monthly), if its terms allow manual reuse; daily transits would
  then be up to a month old.

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


## Nuclear weapons: data to check before or after merging (raised 2 Nov 2026)

**The question.** The session that built the nuclear views could not reach fas.org, ourworldindata.org or
treaties.unoda.org, so some data and links need a human check.

**What the site does now.**
- **Treaties** (`src/data/nuclear-treaties.csv`): compiled from memory, not from UNODA. NPT status is straightforward
  (everyone a party except India, Israel, Pakistan and South Sudan; North Korea apart), but the TPNW list (76 parties,
  17 signed only) and most dates are unchecked. `/nuclear/treaties` stays hidden until someone checks the file against
  treaties.unoda.org/t/npt and /t/tpnw, fills in the dates and sets `TREATIES_CHECKED` in src/lib/nuclear.ts.
- **North Korea and the NPT**: shown as its own class, "Announced NPT withdrawal", with a note that UNODA still lists
  its 1985 accession. The alternative is to follow UNODA and show it as a party, with the note.
- **Sharing links**: the Russia–Belarus rows link to the Kremlin's news index and the Japan row to the Foreign
  Ministry's US page, not to the statements themselves; replace them with the exact pages.
- **The United Kingdom**: FAS reported in 2025 that US weapons may have returned to RAF Lakenheath. It is not in the
  sharing file; add it as `reported` if FAS's current estimate counts it.
- **OWID's files**: the first live check showed OWID's "nuclear warhead inventories" export holds only the latest
  year, so the series now comes from its "nuclear warhead stockpiles" chart and the inventories file gives the split.
  Both are read by column name. What the stockpile figure counts (military stockpile, or retired warheads too) is to
  confirm against OWID's chart notes once the files are in; the page says "estimated warheads" until then.
- **The FAS table** (`fas-forces`) is optional now: import it only when OWID's split lags FAS's page.

## Source count (raised 2 Nov 2026)

**The question.** The brief for the nuclear view said the source count goes from 33 to 35. The licence table had 32
rows before (docs/data-pipeline.md said 33; the Sources page showed 36, listing the four keyed sources twice), so with
FAS and UNODA it is 34.

**What the site does now.** The Sources page has one row per licence row (the FAS table imported by hand is part of
FAS's row), and docs/licences.md prints the number; nothing else states a count. If the 33rd source was meant to be one
the site uses without a licence row (Natural Earth's basemap, say), adding it to src/data/licences.ts updates every count.

## /nuclear page weight (raised 2 Nov 2026, for the launch performance check)

**The question.** `/nuclear` is about 282 KB of HTML (26 KB gzipped), because the world panel for every year from 1945
to 2026 (82 of them) is written into the page, so the panel reads without the map script and the slider only
shows and hides them. The other year views do the same, but with fewer years.

**Options.**
- Keep it: gzipped it is small, and the page reads with scripts off.
- Write only the latest year's panel into the HTML and draw the others from the layer file (`/map/nuclear-warheads.json`),
  as the Atlas panel does; years then need the script.
- Write every fifth year plus the latest, and draw the rest from the layer file.

## Correction form (raised 3 Nov 2026)

**What the site does now.** Reports go only to Telegram, from production. Open points for the owner:
- **Previews cannot send.** They have no Telegram secrets, so the form shows its "cannot be sent from here" message there.
  To try it end to end on a Preview, the Telegram secrets would need adding to Previews (or a separate test chat).
- **Rate limit binding.** The Cloudflare docs could not be read from the build session; the binding is configured from
  wrangler 4.152's own schema (`ratelimits`, 5 a minute), and `wrangler dev` loads it. If the first deploy rejects it
  on this plan, remove the `ratelimits` entries: the Worker then falls back to a weaker per-isolate limit by itself.
- **Minimum fill time** is 3 seconds and measured by the page, so a determined script can fake it; the rate limit is
  the real brake. A signed server timestamp would be stronger but needs a new secret.
- **Source line links.** Every source line now ends with "Report a correction". On pages with many charts that is a
  lot of repeated links; the alternative is the footer link alone plus one per section.
- **Privacy wording.** The Privacy page (still `approved: false`) and the form's email hint say reports are kept in the
  editor's Telegram and deleted within 90 days. Owner to confirm the 90-day period, and to delete reports older than
  that from the Telegram chat by hand (nothing deletes them automatically).


## Telegram review and weekly digest: choices to confirm (raised 3 Nov 2026)

Made while building the review buttons, This week's summary and the digest ([telegram.md](telegram.md)); each is easy
to change.

- **Edit asks for Approve again.** A correction that passes the check comes back with the buttons, so it is published
  only on Approve (one more tap). It could instead be published as soon as it passes, since the owner wrote it.
- **The correction is not held to 100–150 words.** Only drafts are; the owner's own wording is trusted on length.
- **Commits go straight to `main`** from `ai-review.yml` and `week.yml`, with the workflow's own token. If `main` gets
  a rule requiring pull requests, those pushes will fail; the runs would then need a bypass for GitHub Actions or a
  token allowed to push.
- **`TELEGRAM_CHAT_ID` must be the owner's private chat** with the bot. The Worker takes taps and replies only from a
  private chat whose id is that value. If alerts go to a group today, the secret needs changing (alerts then go to the
  private chat too).
- **The three counts** in a digest without a summary are new orange and red disaster alerts, national-scale internet
  outages and sanctions entries added (the page's count row shows only the first). A card with no new data that week
  is left out, so a digest can show fewer than three.
- **A summary approved after the digest's hour** is not in that week's digest, which then gives the counts. Running
  Actions → week → digest again (with the week) sends a new one; Monday 08:00 UTC leaves about eight hours after the
  week is archived. `DIGEST_AT` moves it.
- **A deploy after each archived week.** Since production rebuilds only on a deploy (see "The page refreshes on
  deploys" above), the summary run starts one so the archive page is live before the digest links to it. The digest
  checks the page answers and tells the owner if it does not.
- **Monthly figures in a weekly summary.** Conflict and price figures are monthly and enter the facts only when their
  card has new data that week; the summary names their month.
- **Link preview.** The channel post shows Telegram's preview of the archive page (its share image). It can be turned
  off in `worker/telegram.ts`.
