---
title: "Methodology"
lede: "How each measure is worked out, what the labels mean, and what the figures cannot tell you."
description: "How geopolitics.tools works out import reliance, supplier shares, five-year arms totals, common years and coverage, and the limits of the figures."
updated: '2026-10-25'
approved: false
---

## How to read our figures

Every figure names its source, the year it covers and the date we last refreshed it. Figures that are not final, reported actuals carry a tag with its own symbol and word: **Estimate**, **Projection**, **Preliminary** or **Not yet reported**. Colour is never the only sign.

Rankings compare countries on one common year by default, so a country is never ranked against another's older figure. "Latest available" uses each country's most recent year instead, up to two years earlier; the table then marks the older years and says how many there are.

A rank says where a country falls on one measure, largest first. It is not a judgement, and "Higher" on Compare pages only marks the larger number.

## Import reliance

Import reliance is the share of what a country uses that it buys from abroad, after taking off what it sells.

| Term | How it is worked out |
| --- | --- |
| Import reliance | (imports − exports) ÷ use |
| Use | production + imports − exports (FAOSTAT publishes use directly for crops and fertilisers, and we use its figure) |

A negative value means the country sells more than it buys. We then show exports as a share of production instead ("Exports 60% of what it produces").

| Import reliance | Label |
| --- | --- |
| 50% or more | Imports most |
| 15% to 50% | Imports some |
| Between −15% and 15% | Roughly self-sufficient |
| Below −15% | Exporter |

A country that uses none of a resource, by its source, gets no share and the table says so.

The Dependencies tool splits these further, to show where a country sits: imports 75% or more, 50% to 75%, 15% to 50%, roughly self-sufficient (±15%), and, for exporters, exports of 15% to 50% or over 50% of what it produces.

## Supplier concentration

For arms and chips the sources give trade but not use, so we cannot say how much of what a country uses comes from abroad. These rows show the main supplier and its share of the country's imports instead, and the dependence column says "Supplier concentration only".

For food, fuel and fertiliser, the Dependencies tool also shows the main supplier's share of a country's imports, from the trade flows (FAOSTAT for crops, UN Comtrade for oil, gas and fertilisers). Their year can differ from the year of the import share.

A **single point of failure** is a country that imports at least half of what it uses of a resource, with at least half of those imports from one supplier.

## Five-year arms totals

SIPRI measures arms deliveries in trend-indicator values (TIV): a common unit based on the military capability of what is delivered, not its price. Yearly figures jump with single large orders, so we show totals over five years, as SIPRI recommends.

SIPRI's terms allow reuse of under 10% of its dataset, so we publish these derived totals only and offer no download of the underlying records.

## Supply chains

Each supply chain page shows one flow for one period: the latest year its source reports (for arms, the latest five-year total). We never mix years in one diagram, and flows from different sources can have different latest years, so each page says which year it shows.

The flows are the main bilateral flows each source publishes, not all trade. FAOSTAT's detailed trade matrix is cut to each importer's main suppliers; UN Comtrade's flows are as importers report them; UNHCR lists smaller origin and host pairs together. Totals on these pages are totals of the flows shown.

**Concentration** is the Herfindahl–Hirschman index on suppliers' shares of the flows shown: the sum of the squared percentage shares, from near 0 (many small suppliers) to 10,000 (one supplier). As in the 2023 US merger guidelines, 1,000 to 1,800 counts as moderately concentrated and above 1,800 as highly concentrated. For a country, it is worked out on its own suppliers. Refugee flows have no concentration: countries of origin are not suppliers.

## Common years, preliminary years and coverage

Sources publish in stages: a few countries report a year early, most report later. The common year on each indicator page is the latest year that at least 80% as many countries have reported as in the best of the five years before it. Later years that some countries have already reported are **preliminary**; the page lists them and never uses them as the default until coverage catches up.

Every ranking says how many countries and territories it covers, for example "142 of 217 countries and territories reported for 2025". Pages for measures that fewer than 20 places report are published but not offered to search engines.

## Countries, territories and borders

We show data for the unit the source reports and never move figures from one place to another. Where a source includes a territory in its parent's figures, or reports a disputed area separately, the country page says so in its coverage notes. Maps use Natural Earth's 1:50m boundaries, which follow the de facto line of control; boundaries shown do not imply endorsement.

## Summaries and sentences

The sentences at the top of country, Compare and indicator pages are written by templates from the figures on the page, not by AI. Each sentence names its source and year, and a sentence whose figure is missing is left out rather than guessed.

Some texts are drafted with AI and approved by the editor. The next section says how.

## AI drafting

These texts are drafted with AI: the summaries on the United States, China and Russia dossier pages, the notes on the alliance history pages and the summaries on the disputed river pages. The first drafts of About, Privacy, Methodology and the introductions to the five topic sections were made the same way. Dossier, history and river texts carry the label "Drafted with AI from cited sources and reviewed by the editor", which links here.

**Facts first.** Each text has a facts file kept with the site's code. Every fact in it has its value, unit and period, the name of its source, a link to it and a date. A dossier's facts are the figures its page already shows; a history's are the dated joins and departures of the grouping, each with a citation such as a treaty or an official announcement; a river's are its treaties, dam milestones and official statements, each dated and cited. A fact that has not yet been checked against its source is marked as unverified, and nothing is drafted from a file that has one.

**Drafting.** A script sends the facts file to Anthropic's Claude Sonnet 5.5 model (`claude-sonnet-5-5`) with a fixed prompt, kept with the code in `src/data/ai/prompt.md`. The prompt asks for plain, neutral text written only from the facts: no forecasts, no blame, no claims the facts do not support, no judging adjectives, and every figure with its unit and period.

**Checking.** A second script, which is not AI, reads every number, date and country name in the draft and looks for it in the facts file. A figure passes only if it is a fact's value, written exactly or rounded the way it is written to at least two significant figures, with the fact's unit and period in the same sentence. Dates must be dates in the facts, and countries must be countries the facts name, under any of their usual names. A draft that fails is sent back once with the list of what failed; if the second draft fails too, it is dropped and nothing is published.

**Approval.** Nothing drafted is published until the editor has read and approved it. Each approved text is stored with the date of approval and a fingerprint of the facts it was drafted from. When the facts change, for example when a source publishes a new year, the text is no longer shown until it has been redrafted and approved again. Texts that are not approved show nothing at all.

**The editor's own words.** The editor can replace any draft with text written by hand. Such a text is marked as hand-written, is never overwritten by the drafting script and carries no AI label.

The summaries at the top of other country pages, and every sentence on Compare and indicator pages, are written by templates, not by AI.

## Known limits

- **Sources revise their history.** We keep each release, so a figure you cited can be traced, but it may differ from today's.
- **Trade is recorded by country of origin or of consignment, depending on the source.** A supplier can be a trading hub rather than the producer.
- **Some countries publish little or nothing.** Their pages say which sources cover them and which do not, rather than filling the gaps.
- **Estimates carry uncertainty.** Figures for countries at war, or with large off-budget spending, are the source's estimates and carry the most.
