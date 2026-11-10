# Gate review

Phase 8 gate review, 9 November 2026, on snapshot `2026-11-09T1526Z`. Every view in the route registry
(`src/lib/routes.ts`), checked against the launch gates and the open items in [launch-qa.md](launch-qa.md). A view
that fails is hidden, so it leaves the menu, search, the sitemap, the hubs, the Atlas and every link:

- **A source whose licence is not cleared** is listed in `WITHHELD` (`src/data/licences.ts`). The build reads it as not
  in the snapshot, so its views, indicator pages, downloads, map layers and figures on every other page are not built,
  through the same path as a source with no data. This week names its events and links to the source (below).
  Fetching and importing go on, so taking the source out of the list brings everything back in the next build.
- **Any other failure** is listed in `GATE_HIDDEN` (`src/lib/routes.ts`); take the view's key out once it passes.

Follow-ups of 9 November (second and third passes) are in the rows and in "Licence removals", "AI texts" and "EU
sanctions list" below. `GATE_HIDDEN` is empty after the third pass.

Licence update of 10 November: WRI Aqueduct is recorded as checked (CC BY 4.0, confirmed by the WRI FAQ and the
Aqueduct request form; a courtesy note was sent to WRI), so water stress, 2050 and the eight Disputed rivers stay on.
GDACS, IODA, CelesTrak and AidData are now "permission asked" (asked 10 Nov; IODA at dainotti@gatech.edu after
ioda-info bounced).

**The gates** (spec, "Launch waves"): a live fetcher checked against the spec, licence and terms cleared, freshness
checks in place, a working phone layout. This review also checked the data, source lines, neutral wording, and the
empty and withheld states. How each gate was read:

- **Fetcher:** the source is fetched on schedule, or, where the spec itself names a manual import or a hand-kept facts
  file, it comes from a dated import or a checked facts file.
- **Licence:** passes when the publisher states an open licence or public domain, or when the site keeps within the
  stated terms (SIPRI, UN Comtrade, IMF WEO by hand, EuRepoC and IPC non-commercial). Fails when no licence is
  stated or permission is still pending. Most rows in [licences.md](licences.md) still say "To confirm" because the
  terms page has not been read in full; where the licence itself is stated (CC BY 4.0, OGL, public domain, CC0), that
  counts as a pass here.
- **Freshness:** fetched sources have a deadline and alert past it (`status.json`); imported ones show their edition
  and import date, as the spec's "Manual, on release" sets.
- **Phone:** the launch QA run at 390 and 360 px, which covered one page of every view family (no issues after its
  fixes).

## Results

| View | Pages | Sources | Result | Reason | To pass |
|---|---|---|---|---|---|
| Critical minerals | /minerals/{8 minerals} | USGS MCS 2026 (import) | Pass | Public domain; edition named on every page; "Not listed by USGS" for a missing country; only 2024–2025 until older editions are imported, as the spec says | |
| Oil | /oil, /oil/consumption, /oil/trade | EIA, UN Comtrade | Pass | Both fetched and fresh. Flows checked against EIA production at build (one warning: Malaysia → China crude, re-exports) | |
| Natural gas | /gas, /gas/consumption, /gas/trade | EIA, UN Comtrade | Pass | US → Mexico, the launch QA open item, is now shown from the exporter's own report and labelled so | |
| Electricity | /electricity and 4 layers | Ember | Pass | CC BY 4.0 stated on Ember's API page; years missing a part are left out, not shown as partial totals | |
| Food and fertiliser | /food/{6 commodities}, /use, /trade | FAOSTAT, UN Comtrade | Pass | FAOSTAT's own estimates tagged Estimate | |
| Emissions | /emissions and 3 layers | Our World in Data (Global Carbon Budget) | Pass | CC BY 4.0 | |
| Water stress | /water, /water/2050 | WRI Aqueduct (import) | Pass (live again, third pass) | First review: no licence on the dataset page. The [Aqueduct FAQ](https://www.wri.org/aqueduct/faq), read 9 Nov, licenses the Aqueduct 4.0 database under the Creative Commons Attribution International 4.0 License and asks for the credit "Source: WRI Aqueduct, accessed on [date]" with a link to aqueduct.wri.org. Every source line now reads "WRI Aqueduct, accessed on 25 Oct 2026" (the import date), the name linking to aqueduct.wri.org. The FAQ also asks users who share or adapt the data to register with WRI and to share public work with its team, so the CSV download stays off until the site is registered (open questions). 10 Nov: the WRI FAQ and the Aqueduct request form both give CC BY 4.0 with the credit "Source: WRI Aqueduct, accessed on [date], aqueduct.wri.org (CC BY 4.0)"; the licence row says checked 10 Nov, and download notes fill the date from the fetch date. Courtesy note sent to WRI | |
| Water from abroad | /water/from-abroad | FAO AQUASTAT (import) | Pass | CC BY 4.0, checked | |
| Disputed rivers | /water/rivers/{8 rivers} | Global Dam Watch, AQUASTAT, Aqueduct, AI-drafted summaries | Pass (live again, third pass) | Aqueduct cleared (above). Dnipro's two facts checked on 9 Nov against the [Cabinet of Ministers' page for Resolution No. 1488 of 30 December 2022](https://www.kmu.gov.ua/npas/pro-prypynennia-dii-uhody-mizh-ukrainoiu-ta-rosiisk-a1488), which terminates the agreement on border water bodies "concluded on 19 October 1992 in Kyiv" (здійснену 19 жовтня 1992 р. у м. Києві); both now cite it, and the termination fact says the Cabinet *decided* on 30 December 2022 (the Rada's database records the agreement as ended from 4 January 2023). The Dnipro page has no AI summary yet; its Kakhovka fact still links to UN OCHA's Ukraine page, not the flash update itself | |
| Disasters | /disasters and 6 kinds | GDACS (USGS earthquakes on the earthquakes page) | **Fail** (withheld) | Licence: GDACS's terms page is a disclaimer only, with no reuse terms (checked again 9 Nov). Every page counts GDACS alerts | The JRC's reuse terms for GDACS (the Commission's default reuse policy, if it applies, would be CC BY 4.0), recorded in `src/data/licences.ts`. Asked 10 Nov |
| Internet: outages | /internet/outages | IODA | **Fail** (withheld) | Licence: no terms found on the project pages; the site would not load for this review | IODA's (Georgia Tech) reuse terms in writing. Asked 10 Nov (dainotti@gatech.edu; ioda-info bounced) |
| Internet: users, ICT exports | /internet/users, /internet/ict-exports | World Bank | Pass | CC BY 4.0 per series metadata. /internet/users is now the family's first page | |
| Internet: cyber operations | /internet/cyber-operations | EuRepoC 1.3.2 | Pass | CC BY-NC 4.0, checked; "attributed to" names who attributed | |
| AI and chips | /ai and 4 layers | Epoch AI, US CSL, UN Comtrade | Pass | | |
| Space | /space, /space/launches | CelesTrak SATCAT | **Fail** (withheld) | Licence: CelesTrak states no terms for redistribution; its usage policy covers only query rates. The site would not load for this review | CelesTrak's written permission or terms for showing SATCAT counts. Asked 10 Nov |
| Conflict | /conflict | UCDP GED and Candidate | Pass | CC BY 4.0, checked; Candidate months labelled preliminary | |
| Refugees | /refugees and 3 layers | UNHCR | Pass | Russia shown as "Not reported since 2023" from 2024 | |
| Arms transfers | /arms, /arms/importers | SIPRI (import) | Pass | Derived five-year totals only, no download, as the terms allow | |
| Sanctions | /sanctions, /us, /eu, /uk | US CSL, EU FSF, UK Sanctions List | Pass | The EU list failed 6 runs in a row (HTTP 500 from the Commission's server) but stayed within its 10-day deadline, and the copy it kept is the Commission's latest (see below) | |
| Chinese lending | /chinese-lending and 5 sectors | AidData GCDF 3.0 (import) | Pass (live again, third pass) | AidData's [LICENSE.md](https://github.com/aiddata/gcdf-geospatial-data/blob/main/LICENSE.md), read 9 Nov, puts the GCDF v3 dataset under ODC-By, with credit to AidData (its geospatial layer is ODbL and is not used). Source lines read "AidData, Global Chinese Development Finance Dataset 3.0"; the CSV download is on. The site stays on GCDF 3.0, not the spec's CLG-Global 1.0. 10 Nov: AidData asked for permission as well; the licence row says "permission asked" and the view stays live on ODC-By | |
| Nuclear: warheads | /nuclear | FAS via Our World in Data | Pass | CC BY 4.0, confirmed by FAS; every figure tagged Estimate; "estimated warheads" until OWID's stockpile definition is confirmed | |
| Nuclear: sharing | /nuclear/sharing | Facts file (governments, NATO, FAS) | Pass (live again 9 Nov) | First review: three rows cited index pages. Now each cites the statement, read on 9 Nov: Belarus hosting, [Kremlin, 16 Jun 2023](http://en.kremlin.ru/events/president/news/71445) ("The first nuclear warheads have been delivered to Belarus"; the row's date is now the day); Belarus guarantee, [Kremlin, 6 Dec 2024](http://en.kremlin.ru/events/president/news/75777) (the security guarantees treaty's obligations include "Russian tactical nuclear weapons, previously deployed on the territory of the Republic of Belarus"); Japan, the [United States–Japan Joint Leaders' Statement, 7 Feb 2025](https://www.whitehouse.gov/briefings-statements/2025/02/united-states-japan-joint-leaders-statement/) ("unwavering commitment to the defense of Japan", with all its capabilities, nuclear included). The Foreign Ministry's copy refuses scripted access, so the row cites the White House's. RAF Lakenheath is not added: no government statement (owner's decision, 9 Nov; open questions). `SHARING_CHECKED` (2 Nov) is left as it is because only these three rows were checked | |
| Nuclear: treaties | /nuclear/treaties | Facts file (UNODA) | **Fail** (already hidden) | Data: compiled without UNODA, TPNW list and dates unchecked; UNODA terms not read | The file checked against treaties.unoda.org, `TREATIES_CHECKED` set, UN terms read |
| Blocs | /blocs and 19 groupings | Hand-kept member lists, World Bank, USGS | Pass | Six lists re-confirmed 5 Nov; the other 12 match current membership as this review reads it, but have not been checked against each grouping's own list (open questions). Shares say "today's members" | |
| Alliance history | /blocs/{11 blocs}/history | Facts files, AI-drafted, approved | Pass | SCO facts to re-check after launch (owner's decision, 5 Nov) | |
| Chokepoints | /chokepoints | IMF PortWatch | **Fail** (already hidden) | Licence: the IMF's permission for scheduled downloads not given | The IMF's permission |
| Ports | /ports | IMF PortWatch | **Fail** (already hidden) | As chokepoints | As chokepoints |
| Food crises | /food-crises | IPC | **Fail** (already hidden) | Fetcher: no API key | `IPC_API_KEY` |
| Explorer | /explorer, /over-time, /scatter | Every registry measure | Pass | Satellites and launches are left out while CelesTrak is withheld | |
| Dependencies | /dependencies | FAOSTAT, EIA, UN Comtrade, SIPRI | Pass | | |
| Supply chains | /supply-chains and 11 flows | FAOSTAT, UN Comtrade, SIPRI, UNHCR | Pass | Latest year only, labelled | |
| Bloc overlap | /blocs/overlap | Member lists | Pass | As Blocs | |
| Atlas | /atlas | The live views' layers | Pass | Lists only live views' layers, so the hidden views' layers and the disaster-alert overlay are gone. Phone TBT is the accepted exception | |
| This week | /this-week, /this-week/2026-44, 2026-45 | GDACS, IODA, UCDP, Pink Sheet, sanctions lists | Pass | The disaster and outage cards only name events and link to GDACS and IODA (below) | |
| Hubs | /resources, /technology, /climate, /security, /power | | Pass | Hidden views drop off their hubs; every hub keeps at least two live views. The Climate and Technology intros are redrafted without the hidden views, waiting for approval (AI texts, below) | |

## Licence removals

`WITHHELD` in `src/data/licences.ts` holds GDACS, IODA and CelesTrak. WRI Aqueduct and AidData were on it from the
second pass until the third, when their licences were confirmed (above). Removed from the build:

| Where | Removed |
|---|---|
| Map views | Disasters (7 pages), internet outages, space (2); their share images and map layer files |
| Indicator pages and downloads | Satellites in orbit and orbital launches (pages, CSVs, rankings). The indicators index still lists them by name and source, with no figure, as it lists measures not in the data release |
| Explorer | The same two measures |
| Country pages and Compare | Disaster alerts, satellites and launches |
| Homepage | The This week strip (its one count was GDACS's alerts); it shows again when there is a count from a cleared source |
| Atlas | The layers of the views above and the disaster-alert overlay |
| Hubs and search | The views and indicator pages above |
| This week | The disaster and outage cards list up to 7 events by kind, country and date, each linking to GDACS's report or IODA's country page, with no alert levels, counts, lengths, table or map link. The "in numbers" count and the feed's disaster and outage items are gone. The share image leads with another card |

Kept on purpose: the Sources page lists the three sources with their licence status, and Methodology and About
describe them in words. USGS earthquakes (public domain) were shown only on the disasters pages, so they are off too.
The water adapter loads AQUASTAT and Global Dam Watch even without Aqueduct, so a withheld Aqueduct would not take
Water from abroad with it.

## AI texts

- **This week's summary** is drafted from facts that give a withheld source's events by kind, country and date only:
  no counts, alert levels or outage lengths (`weekFacts` in `src/lib/ai/week-facts.ts`, following `WITHHELD`). The
  Telegram digest keeps its counts (`weekCounts`). Week 45's facts were written again: it had no new alerts or outages,
  so GDACS and IODA drop out. Its summary was redrafted without them (prices and sanctions only, 142 words), passed the
  checker and is saved as a draft (`npm run ai:paste`, the manual path: there is no API key on this machine). The
  approved version is replaced, so week 45 shows the cards only until the new one is approved.
- **Hub intros.** Hub facts leave out a view whose source is withheld (`HUB_FACT_SOURCE` in
  `src/lib/ai/page-facts.ts`). Climate (without disasters) and Technology (without satellites and outages) were
  redrafted, passed the checker and are saved as drafts; their pages show the draft banner until approved. Power's
  intro describes Chinese lending, which is live again, so it stays approved.
- **About, Privacy and Methodology** keep their committed facts files. The generated facts now also list Aqueduct's and
  AidData's licences (they became "checked"), so `ai:status` says the files are out of date with the code; none of the
  three texts names either source or its licence, so they are left approved rather than redrafted.
- **Approval.** On merge, `ai-review.yml` sends the changed week summary to Telegram for Approve, Edit or Skip, as the
  pipeline does for any short-text draft pushed to `main`. Hub intros are approved in the pull request
  (`approved: true` and `approvedOn` in `src/content/hubs/climate.md` and `technology.md`), not on Telegram.

## EU sanctions list

The six failed runs (6 Nov 18:28 to 9 Nov 01:26 UTC) were HTTP 500 errors from the Commission's server
(webgate.ec.europa.eu) for the v1.1 CSV export; the pipeline retried each run as it does any server error and kept
the last good copy. On 9 Nov the same address answered again and a local run of the fetcher passed its checks
(6,269 entities). Nothing changed on our side, and no format change or blocking was seen. The Commission's RSS feed
of the list files gives 23 October 2026 as the latest publication for every format (PDF, CSV, XML), so the copy the
site kept is the current list; the other official exports come from the same server and would have failed with it.
No code change: the fetcher stays on the v1.1 CSV. The next scheduled run (10 Nov, 01:26 UTC) will record the success.

## Open items from launch QA

- **US → Mexico pipeline gas:** resolved (Gas, above).
- **Second-language test (D13):** dropped for now; not a gate.
- **Atlas TBT on phones:** the accepted exception; not a gate failure.

## Bringing a view back

Clear what its row needs, then take the source out of `WITHHELD` (`src/data/licences.ts`, and record the licence in
the same file) or the view's key out of `GATE_HIDDEN` (`src/lib/routes.ts`), and update its row here. The menu, hubs,
search, sitemap, Atlas, indicator pages, Explorer, country pages and This week pick it up in the next build.
