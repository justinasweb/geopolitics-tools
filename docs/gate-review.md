# Gate review

Phase 8 gate review, 9 November 2026, on snapshot `2026-11-09T1526Z`. Every view in the route registry
(`src/lib/routes.ts`), checked against the launch gates and the open items in [launch-qa.md](launch-qa.md). A view
that fails is hidden through `GATE_HIDDEN` in `src/lib/routes.ts`, so it leaves the menu, search, the sitemap, the hubs,
the Atlas and every link; take its key out of that list once it passes.

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
| Water stress | /water, /water/2050 | WRI Aqueduct (import) | **Fail** | Licence: the dataset page states no licence (checked again 9 Nov) | WRI's written licence for Aqueduct 4.0 country rankings (usually CC BY 4.0), recorded in `src/data/licences.ts` |
| Water from abroad | /water/from-abroad | FAO AQUASTAT (import) | Pass | CC BY 4.0, checked. It is now the water family's first page | |
| Disputed rivers | /water/rivers/{8 rivers} | Global Dam Watch, AQUASTAT, Aqueduct, AI-drafted summaries | **Fail** | Each page shows the countries' Aqueduct water stress (licence as above). Dnipro's two facts are still unverified (open questions) | Aqueduct's licence, or the stress columns taken off the river pages; the owner's review of the Dnipro facts |
| Disasters | /disasters and 6 kinds | GDACS (USGS earthquakes on the earthquakes page) | **Fail** | Licence: GDACS's terms page is a disclaimer only, with no reuse terms (checked again 9 Nov). Every page counts GDACS alerts | The JRC's reuse terms for GDACS (the Commission's default reuse policy, if it applies, would be CC BY 4.0), recorded in `src/data/licences.ts` |
| Internet: outages | /internet/outages | IODA | **Fail** | Licence: no terms found on the project pages; the site would not load for this review | IODA's (Georgia Tech) reuse terms in writing |
| Internet: users, ICT exports | /internet/users, /internet/ict-exports | World Bank | Pass | CC BY 4.0 per series metadata. /internet/users is now the family's first page | |
| Internet: cyber operations | /internet/cyber-operations | EuRepoC 1.3.2 | Pass | CC BY-NC 4.0, checked; "attributed to" names who attributed | |
| AI and chips | /ai and 4 layers | Epoch AI, US CSL, UN Comtrade | Pass | | |
| Space | /space, /space/launches | CelesTrak SATCAT | **Fail** | Licence: CelesTrak states no terms for redistribution; its usage policy covers only query rates. The site would not load for this review | CelesTrak's written permission or terms for showing SATCAT counts |
| Conflict | /conflict | UCDP GED and Candidate | Pass | CC BY 4.0, checked; Candidate months labelled preliminary | |
| Refugees | /refugees and 3 layers | UNHCR | Pass | Russia shown as "Not reported since 2023" from 2024 | |
| Arms transfers | /arms, /arms/importers | SIPRI (import) | Pass | Derived five-year totals only, no download, as the terms allow | |
| Sanctions | /sanctions, /us, /eu, /uk | US CSL, EU FSF, UK Sanctions List | Pass | The EU list has failed 6 runs in a row (HTTP 500 from the Commission) but is within its 10-day deadline; the last good copy (6 Nov) stays. It is flagged on the page if it goes past the deadline | |
| Chinese lending | /chinese-lending and 5 sectors | AidData GCDF 3.0 (import) | **Fail** | Licence: the dataset page gives a citation but no licence (checked again 9 Nov). Which dataset is current is also open (the spec names CLG-Global 1.0) | AidData's licence for the dataset used, and the dataset choice confirmed |
| Nuclear: warheads | /nuclear | FAS via Our World in Data | Pass | CC BY 4.0, confirmed by FAS; every figure tagged Estimate; "estimated warheads" until OWID's stockpile definition is confirmed | |
| Nuclear: sharing | /nuclear/sharing | Facts file (governments, NATO, FAS) | **Fail** | Sources: the Russia–Belarus rows link to the Kremlin's news index and the Japan row to the Foreign Ministry's US page, not to the statements | The three links replaced with the statements themselves; a decision on RAF Lakenheath (FAS, 2025) as `reported`; `SHARING_CHECKED` set |
| Nuclear: treaties | /nuclear/treaties | Facts file (UNODA) | **Fail** (already hidden) | Data: compiled without UNODA, TPNW list and dates unchecked; UNODA terms not read | The file checked against treaties.unoda.org, `TREATIES_CHECKED` set, UN terms read |
| Blocs | /blocs and 19 groupings | Hand-kept member lists, World Bank, USGS | Pass | Six lists re-confirmed 5 Nov; the other 12 match current membership as this review reads it, but have not been checked against each grouping's own list (open questions). Shares say "today's members" | |
| Alliance history | /blocs/{11 blocs}/history | Facts files, AI-drafted, approved | Pass | SCO facts to re-check after launch (owner's decision, 5 Nov) | |
| Chokepoints | /chokepoints | IMF PortWatch | **Fail** (already hidden) | Licence: the IMF's permission for scheduled downloads not given | The IMF's permission |
| Ports | /ports | IMF PortWatch | **Fail** (already hidden) | As chokepoints | As chokepoints |
| Food crises | /food-crises | IPC | **Fail** (already hidden) | Fetcher: no API key | `IPC_API_KEY` |
| Explorer | /explorer, /over-time, /scatter | Every registry measure | Pass | Its measures include water stress, satellites, launches and Chinese lending (see below) | |
| Dependencies | /dependencies | FAOSTAT, EIA, UN Comtrade, SIPRI | Pass | | |
| Supply chains | /supply-chains and 11 flows | FAOSTAT, UN Comtrade, SIPRI, UNHCR | Pass | Latest year only, labelled | |
| Bloc overlap | /blocs/overlap | Member lists | Pass | As Blocs | |
| Atlas | /atlas | The live views' layers | Pass | Lists only live views' layers, so the hidden views' layers and the disaster-alert overlay are gone. Phone TBT is the accepted exception | |
| This week | /this-week, /this-week/2026-44, 2026-45 | GDACS, IODA, UCDP, Pink Sheet, sanctions lists | Pass | Its disaster and outage cards still show GDACS and IODA (see below); their links to the hidden views are gone | |
| Hubs | /resources, /technology, /climate, /security, /power | | Pass | Hidden views drop off their hubs; every hub keeps at least two live views | |

## Still showing the failing sources

Hiding a view takes its pages, layers and links off the site. It does not take the same source's figures off other
pages, which were outside this review. In the 9 November build:

| Source | Also shown on |
|---|---|
| GDACS | This week (disasters card), the homepage, country pages (disasters) |
| IODA | This week (outages card) |
| CelesTrak | Country pages, Explorer, the satellites and launches indicator pages |
| WRI Aqueduct | Country pages, Explorer, the water stress indicator page |
| AidData | Explorer, the Chinese lending indicator page |

To decide before launch: take these off too (the same licence gate applies to every page), or clear the licences
first. See open questions.

## Open items from launch QA

- **US → Mexico pipeline gas:** resolved (Gas, above).
- **Second-language test (D13):** dropped for now; not a gate.
- **Atlas TBT on phones:** the accepted exception; not a gate failure.

## Bringing a view back

Clear what its row needs, then remove its key from `GATE_HIDDEN` in `src/lib/routes.ts` and update its row here. The
menu, hubs, search, sitemap, Atlas and links pick it up in the next build.
