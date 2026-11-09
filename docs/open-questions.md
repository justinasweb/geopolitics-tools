# Open questions

Decisions put off for later. Each says what the question is, what the site does now, and the options seen so far.
Launch QA lists what is still to check before launch; Wave 2 holds what waits until after it; Decided, at the end,
keeps one line per closed question.

## Launch QA

### Re-check bloc memberships before launch (raised 2 Nov 2026)

**The question.** The membership table (`src/data/blocs.csv`, `bloc-history.csv`) is kept by hand, and the
weekly Wikidata cross-check planned for phase 5a is not built yet. It was last checked in full on **21 October 2026**
(`BLOCS_CHECKED` in `src/lib/blocs.ts`), but it missed the United Arab Emirates leaving OPEC and OPEC+ on
1 May 2026 (announced on 28 April 2026, [WAM](https://www.wam.ae/en/article/bzxzuh7-uae-announces-decision-exit-opec-opec+)).
That was fixed on **2 November 2026**: the UAE was removed from OPEC (now 11 members) and OPEC+ (now 21), its OPEC
history ends in 2026, and the change is in Sources → Corrections. `BLOCS_CHECKED` still says 21 October 2026.

**Checked 5 Nov 2026 (launch review).** The member counts of ASEAN, NATO, the EU, the OECD, the CSTO and OPEC were
confirmed. BRICS is decided (see Decided).

**Still to check before launch.** The G7, the G20, the SCO and the Quad, and the 8 groupings without a history (APEC,
AUKUS, the CIS, the EAEU, OPEC+, RCEP, the UN Security Council's permanent members and USMCA), each against its own
member list. Then set `BLOCS_CHECKED` to that day and log any change in `src/data/corrections.csv`. Known points: the
CSTO (Armenia's frozen participation), OPEC+ (its list of non-OPEC producers) and the G20 (the African Union is not a
country, so not on the map).

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
(BRIC, 2009; South Africa joined in 2011) and the G7 (a summit of six countries in 1975; Canada joined in 1976).
Confirmed by the owner on 3 Nov 2026: the EU's G7 participation **since 1977**, and calling the 1975 summit "a summit
of six countries" rather than a named "G6". `tests/unit/bloc-members.test.ts` holds the wording.

### Withheld sources: what is left (raised 9 Nov 2026)

**The question.** GDACS, IODA, CelesTrak, WRI Aqueduct and AidData are withheld until their licences are cleared
(`WITHHELD` in `src/data/licences.ts`, [gate-review.md](gate-review.md)): no page shows their figures, and This week
names their events with links to the source. Three things still touch them.

- **Hub intros.** The approved AI intros of Climate ("how much of its available water it draws, which large dams stand
  on disputed rivers, and where disaster alerts were issued"), Technology ("own and launch satellites", "where the
  internet goes down") and Power ("which received loans and grants from China") describe views that are now hidden.
  They state no figures. Options: redraft them without those views (and approve again), or leave them until the
  licences are answered.
- **This week's AI summary and the Telegram digest.** The summary facts (`src/lib/ai/week-facts.ts`) and the digest's
  counts still include GDACS's alert count and IODA's outages. The approved 2026-45 summary says no new alerts were
  issued and no outages began. Leaving the facts as they are keeps that summary approved; taking the two cards out
  of the facts would mark it stale and hide it until it is redrafted.
- **Asking the publishers.** The JRC (GDACS), Georgia Tech (IODA), CelesTrak, WRI and AidData, for their reuse terms in
  writing.

### Map canvas: dark band on narrow maps (raised 28 Oct 2026)### Map canvas: dark band on narrow maps (raised 28 Oct 2026)

**The question.** On a narrow desktop map (the Atlas at 1024px, where the map column is about 420px wide) the MapLibre
canvas draws a dark band at the top left, under the borders line. It is the canvas itself, not a page element, and it
was there before the Atlas bar changes. Wider maps do not show it.

**What the site does now.** Nothing yet; the borders line sits over most of it.

**Options.** Look at the engine's bounds and minimum zoom for narrow maps (the world fitted into a column narrower than
it is tall), and whether the area beyond Web Mercator's latitude limit is drawn in the sea colour.

### Atlas: short source names and the Map views link (raised 28 Oct 2026)

**The question.** The Atlas design lists short source names under each layer ("EIA; UN Comtrade"), and its bar links
to "Map views". The layer files carry the full source line ("U.S. Energy Information Administration (EIA),
International…").

**What the site does now.** The list shows each layer file's own source line, cut to one line with an ellipsis. The
bar links to Countries and Explorer only.

**To do before launch.** Link "Map views" to the topic hubs, now that they are live. For the source names: add a
short name to each layer file (the source registry's `SOURCE_SHORT` where one exists), or keep the cut source line.

### Nuclear treaties and sharing links (raised 2 Nov 2026)

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

### Correction form: rate limit binding (raised 3 Nov 2026)

**The question.** The Cloudflare docs could not be read from the build session; the binding is configured from
wrangler 4.152's own schema (`ratelimits`, 5 a minute), and `wrangler dev` loads it. If the first deploy rejects it
on this plan, remove the `ratelimits` entries: the Worker then falls back to a weaker per-isolate limit by itself.

**Also about the form.** Reports go only to Telegram, from production.
- **Previews cannot send.** They have no Telegram secrets, so the form shows its "cannot be sent from here" message there.
  To try it end to end on a Preview, the Telegram secrets would need adding to Previews (or a separate test chat).
- **Minimum fill time** is 3 seconds and measured by the page, so a determined script can fake it; the rate limit is
  the real brake. A signed server timestamp would be stronger but needs a new secret.
- **Source line links.** Every source line now ends with "Report a correction". On pages with many charts that is a
  lot of repeated links; the alternative is the footer link alone plus one per section.

### Digest Post: two taps at the same instant (raised 6 Nov 2026)

**The question.** The Post button records each week in the SNAPSHOTS bucket before posting
(`worker/telegram.ts`), so a repeat tap or a Telegram retry answers "already posted". Two taps that reach the Worker
within the same few milliseconds could both find no record and both post. R2 has conditional writes
(`onlyIf` with `If-None-Match: *`) that would close this. They were left out because it was not confirmed that R2
honours the wildcard on a put: if it did not, every Post would be refused.

**Options.** Leave it as it is (the gap is milliseconds wide), or confirm `If-None-Match: *` on a Preview's bucket
and add it to the claim.

## Launch review leftovers (raised 5 Nov 2026)

- **G7 and Russia (decided 5 Nov 2026).** Russia joins in 1998, as the G8, per the G7 Research Group
  ([What is the G7?](https://g7.utoronto.ca/what_is_g8.html)), in the facts and `bloc-history.csv`. For 2014 the
  facts follow the [Hague Declaration](https://obamawhitehouse.archives.gov/the-press-office/2014/03/24/hague-declaration)
  of 24 March 2014: the other members suspended their participation in the G8. The declaration speaks of "Russia's
  illegal attempt to annex Crimea", not an annexation, so Crimea is no longer named.
- **NATO and Greece (decided 5 Nov 2026).** The 1974 and 1980 notes were removed, from the facts and from the history
  page's events: no NATO page stating them could be opened.
- **OPEC and G20 (verified 5 Nov 2026).** OPEC's facts cite [Member countries](https://www.opec.org/member-countries.html),
  checked on 5 November 2026. That page still lists the United Arab Emirates, so the UAE's exit stays on the WAM link,
  and `members-2026` (11) relies on it. The G20 founding countries and 1999 note cite the
  [1999 communiqué](https://www.g20.utoronto.ca/1999/1999communique.htm). The EU and the 2008 and 2023 notes cite
  [What is the G20?](https://www.g20.utoronto.ca/g20whatisit.html), both from the G20 Research Group. So do the 2026
  member counts (g20.org's About page is a 404). The founding member count keeps its g20.org link.
- **SCO.** eng.sectsco.org did not load for anyone on 5 November 2026, so every SCO fact is unverified again, to be
  checked after launch against the "General information" page.
- **Dnipro.** Cabinet of Ministers Resolution No. 1488 of 30 December 2022 ends the agreement "done on 19 October
  1992 in Kyiv", according to search excerpts of [zakon.rada.gov.ua](https://zakon.rada.gov.ua/laws/show/1488-2022-%D0%BF).
  The page refused the connection. The agreement's title is about *border* water bodies (прикордонних водних об'єктів),
  and the fact now says so. Both facts are unverified, for the owner to review.
- **World Bank notes for Ukraine and Morocco (removed 5 Nov 2026).** The WDI country metadata has no SpecialNotes for
  either country, so neither note could be confirmed, and both were deleted. China's note follows its SpecialNotes.
- **Kashmir.** Natural Earth's `KAS` shape is the Siachen Glacier, not Kashmir, and India holds the glacier, so
  "each administers part" does not fit it. No note was added. Kashmir as a whole lies in India's, Pakistan's and
  China's shapes. To decide: a note on the KAS shape in its own words, or on those three countries.
- **Crimea's note** is on Russia's shape, which contains Crimea on this map, and not on Ukraine's.
- **Methodology** was written before the checker and fails it on 27 points ("1:50m", "top", "first", "Sonnet 5.5",
  "blame"…). It keeps no facts hash until it is redrafted (Actions → ai-draft) or its facts cover those words.
- **The territories policy** (project docs, not in the repository) has the wrong map column for Western Sahara:
  Morocco's Natural Earth shape covers the Moroccan-administered part (to 21.4°N), and only the strip east of the
  berm is "W. Sahara".

## Wave 2

### Multi-year supply chain flows (raised 28 Oct 2026)

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

### Supply chains: gas by pipeline and LNG (raised 28 Oct 2026)

**The question.** The SupplyChainPage design has a "Pipeline and LNG / Pipeline / LNG" switch on natural gas.

**What the site does now.** The gas page sums both routes, because the flows module (`src/data/flows.ts`) adds them
into one pair. Comtrade's gas rows keep the route (HS 271121 pipeline, 271111 LNG), so the switch can be added once
the gas flows are live on real data.

### Government bitcoin holdings on country profiles (raised 28 Oct 2026)

**The question.** The prototype showed estimated government bitcoin holdings on country profiles. Should the site
show them?

**What the site does now.** Nothing. The spec dropped them ("weakest source, unclear terms"): the figures came from
tracker sites that estimate holdings from on-chain analysis and news reports, with no official or research source and
no clear licence for reuse, so they fail the source rules.

**Wave 2 option.** Show only what governments themselves disclose (for example the US Strategic Bitcoin Reserve,
El Salvador's published holdings), with the date of each disclosure, for the few countries that publish. Needs a check
that each disclosure is regular and citable, and a note that other countries' holdings are unknown, not zero.

### Atlas overlays without a live view (raised 28 Oct 2026)

**The question.** The Atlas design lists eight overlays. Four have nothing live to draw them from: pipelines and
terminals (GEM is imported, `src/adapters/gem.ts`, but no map view draws it yet), submarine cables (dropped, see
Decided), chokepoints (waiting on the IMF's terms) and internet outages as marks (the outages view shades countries;
it has no marks).

**What the site does now.** The Atlas lists only trade flows, launch sites, disaster alerts and the bloc outline.
The others appear on their own once a view draws them, since the Atlas reads overlays from the views' layer files.

**Options.**
- Add pipelines and LNG terminals to the gas and oil trade views (GEM, CC BY 4.0), which brings them to the Atlas.
- Give the outages view a mark per outage (it needs a location per outage; IODA reports by country and region).

### Explorer topic presets for the hubs (raised 29 Oct 2026)

Explorer has no presets for most topics (its four presets are on GDP, emissions, refugees and military spending), so
its tool entry on a hub has no links under it. Topic presets would give it some.

## Decided

- **Compare any two countries, follow-ups.** Decided 9 Nov 2026: mineral pairs keep "–" for a country USGS does not
  list (not the same as zero), explained on the page as "Not listed by USGS"; a static pair picked on /compare is
  redirected in the browser (the page is noindex, the static pages carry their own canonical); /compare uses the
  default share image for launch. Still as built: a picked name stays in its box, and focusing it lists only that
  name until the text is cleared.
- **Country pages for every country, follow-ups.** Decided 9 Nov 2026: the homepage shows the three largest economies'
  country pages by GDP, then the next six, under "Largest economies by GDP, {year} · World Bank", and links to
  /countries#compare. CO2 stays in Mt everywhere, with two significant figures below 1 Mt ("0.011 Mt"); only the
  Climate section's sentence writes tonnes. The US Treasuries question links to the largest holder in TIC's latest
  month (Japan in Aug 2026) and states its holding and month.
- **Submarine cables.** Decided 5 Nov 2026: dropped (TeleGeography asked USD 25,000 a year; no open source of routes
  and landings fits); `/internet` keeps waiting and outages stay live.
- **Sources waiting on replies.** Decided 5 Nov 2026: no follow-ups; IPC, PeeringDB and PortWatch are treated as no
  answer and their views stay hidden, and WEO is imported by hand (import kind `imf-weo`, docs/data-pipeline.md).
- **Refugees hosted in Russia.** Decided 5 Nov 2026: from 2024 Russia is marked "Not reported since 2023" on the
  refugees-hosted maps and its country page (`src/data/not-reported.ts`).
- **This week: the page refreshes on deploys.** Decided 5 Nov 2026: the data run starts a production rebuild at most
  once a day when the snapshot changed (docs/data-pipeline.md).
- **Correction form privacy wording.** Decided 5 Nov 2026: the 90-day period is confirmed; the owner deletes older
  reports from the Telegram chat by hand.
- **`TELEGRAM_CHAT_ID`.** Decided 5 Nov 2026: confirmed as the owner's private chat with the bot.
- **BRICS.** Decided 5 Nov 2026: 11 members, Saudi Arabia among them, with South Africa a member from 2011.
- **AI drafting choices** (stale texts hidden, typed approval dates, hand-written texts unlabelled, dossier summaries
  replacing the template, checker strictness). Decided 5 Nov 2026: kept as built (docs/ai-drafting.md).
- **This week's other choices** (merging storms, "rose" without a day, live page and archive periods, still active,
  quiet cards, archive timing, prices, sanctions, outages, the unbuilt shipping and food cards). Decided 5 Nov 2026:
  kept as built.
- **Telegram's other choices** (Edit asks for Approve again, corrections not held to length, commits straight to
  `main`, the digest's counts and timing, a deploy after each archived week, monthly figures, link preview). Decided
  5 Nov 2026: kept as built ([telegram.md](telegram.md)).
- **Bloc overlap** (the bridge rule, the three listed partners, no Methodology section yet). Decided 5 Nov 2026: kept
  as built.
- **Source count.** Decided 5 Nov 2026: kept as built; the count follows the licence rows in `src/data/licences.ts`.
- **/nuclear page weight** (every year's panel in the HTML). Decided 5 Nov 2026: kept as built.
- **Internet use and ICT service exports** (no Estimate tag, the BPM6 wording, 2024 default, Ireland's note,
  "under $1 m", the menu opening at outages). Decided 5 Nov 2026: kept as built.
- **Cyber incidents** (incident count, the country page block under More figures, state-affiliated groups and own
  state apart, every attribution shown, arcs, no severity). Decided 5 Nov 2026: kept as built.
- **Homepage, hero option C** (Treasuries card to the China dossier, Hungary's two gas shares, search as a jump list,
  the profiles and rankings rules, the left-out summary line and chokepoints question). Decided 5 Nov 2026: kept as
  built.
- **Topic hubs: lead card and intro labels.** Decided 29 Oct 2026: the lead card is the family's main view; approved
  hub intros carry no AI label.
