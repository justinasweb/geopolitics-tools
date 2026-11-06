# AI drafting

Phase 7 of the development plan (spec, D15): one pipeline drafts every AI-written text on the site. It goes facts →
draft → check → approve → publish, and nothing reaches a page without the owner's approval.

| Text | Facts file | Where it is kept | Approved | Label |
| --- | --- | --- | --- | --- |
| Dossier summaries (`dossier:USA`, `dossier:CHN`, `dossier:RUS`) | Generated from the figures the dossier page shows (`src/lib/ai/dossier-facts.ts`) | `src/data/ai/texts/dossiers/*.json` | The Telegram buttons ([telegram.md](telegram.md)), or `npm run ai:approve` | Yes |
| Alliance history notes (`history:nato` … 11) | By hand: every join and departure in `src/data/bloc-history.csv` with a citation, plus the year notes | `src/data/ai/texts/history/*.json` | Same | Yes |
| Disputed river summaries (`river:nile` … 8) | By hand: treaties, dam milestones, official statements, dated and cited | `src/data/ai/texts/rivers/*.json` | Same | Yes |
| This week's summary (`week:2026-45`, one per closed week) | Generated from the frozen week the archive page shows (`src/lib/ai/week-facts.ts`), by `npm run week:summary` | `src/data/ai/texts/weeks/*.json` | Same | Yes |
| About, Privacy, Methodology (`page:about` …) | Generated from the licence table, the site's rules in code and the territory notes (`src/lib/ai/page-facts.ts`) | `src/content/pages/*.md` | In a pull request | No |
| Hub intros (`hub:power` … 5) | Generated from the view registry (`src/lib/ai/page-facts.ts`) | `src/content/hubs/*.md` (`intro`) | In a pull request | No |

Facts files are in `src/data/ai/facts/<kind>/<id>.json` (`weeks/` for This week's summaries). The code is in `src/lib/ai/`, the commands in `scripts/ai.ts`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run ai:status` | Every text: none, draft, approved, stale or owner; and its facts (how many, how many unverified, sample, out of date) |
| `npm run ai:facts [-- <id>…]` | Writes the generated facts files (dossiers need `npm run data:pull` first) and checks the hand-written ones |
| `npm run ai:draft -- <id>… \| --all [--pr]` | Drafts with the API, checks, redrafts once, saves passing drafts. `--pr` commits them on a new branch and opens a pull request listing every draft |
| `npm run ai:paste -- <id> <file>` | The manual path: checks a draft made in a Claude chat and saves it as a draft |
| `npm run ai:own -- <id> <file>` | Saves the owner's own text: marked `author: owner`, never overwritten, no AI label |
| `npm run ai:check [-- <id>…]` | Checks stored texts against their current facts; CI runs it with `--all` on every pull request |
| `npm run ai:approve -- <id> [--text-hash <h>] [--via cli\|telegram]` | Approves a short text |
| `npm run ai:review -- send\|approve\|skip\|edit …` | The Telegram review step ([telegram.md](telegram.md)): sends drafts with Approve, Edit and Skip, and records a decision |
| `npm run week:summary [-- --week 2026-45]` | Writes a closed week's facts, drafts its summary (100 to 150 words), checks it and sends it for review |
| `npm run week:digest [-- --week 2026-45]` | Sends the owner the weekly digest for the Telegram channel, with a Post button |

On GitHub: Actions → **ai-draft** → Run workflow does `ai:draft --pr` with the `ANTHROPIC_API_KEY` secret and the latest
data snapshot. Set `GH_PR_TOKEN` (fine-grained, this repository, Contents and Pull requests read and write) so the
pull request gets its checks and Preview; a pull request opened with the default token starts no workflows.

## 1. Facts first

A fact is one statement with its `value` and `unit` (a share as a percentage: 83 with unit `%`), its `period`
(YYYY, YYYY–YYYY, YYYY-MM or YYYY-MM-DD), the `places` it is about, and its `source`, `link` and `date`. A file also
lists the `countries` and `names` (treaties, dams, groupings) a text may name. One figure per fact:
`npm run ai:facts` warns about a statement with a number that is not its value.

- **`unverified: true`** marks a fact not yet checked against its source, with a `note` saying what to check. Nothing
  is drafted, pasted or approved from a file that has one. Remove the flag once checked.
- **The statement is what a text may say; the `note` is for the owner.** How or when something was checked ("as the
  membership table was checked on 21 October 2026") goes in the note, so it never ends up in a draft: a history's
  current count reads "Members of NATO in 2026." Names are the site's display names (`Türkiye`), a second join is
  "rejoined", and a territory note names its place ("Falkland Islands: …"), never only its id.
- **`sample: true`** marks a file generated from the sample data; it is refused the same way. Run `npm run data:pull`
  before `ai:facts` so the dossier files come from the real snapshot.
- **The hash** stored with each text (`factsHash`) covers the subject, places, names and facts, but not the facts'
  dates or notes, so a weekly refresh that changes no figure does not make a text stale.

Dossier facts are generated again at build time from the data being built, so a dossier summary disappears as soon as
a figure it was drafted from changes (a new year, a revision) until it is redrafted and approved. History and river
facts are only changed by hand. Page and hub facts are written by `ai:facts`; `ai:status` says when the code has moved
on from the committed file.

**The owner's own words on a page.** A page can hold passages the owner wrote inside an AI-drafted page (About's
"Who runs it"). They are listed in `OWNER_TEXT` (`src/lib/ai/page-facts.ts`) and become facts with `owner: true`, and
the page keeps them word for word between `<!-- owner -->` and `<!-- /owner -->`. The checker (`ownerProblems`)
fails a text that drops, changes or adds to them, and reads only the rest as a draft; the prompt tells the model to
copy them unchanged. Long pages carry no AI label, and these passages are never counted as drafted.

## 2. Draft

`src/lib/ai/draft.ts` sends the **System** section of `src/data/ai/prompt.md` and the text's **Task** section with the
facts (notes for the owner left out) to the model in `src/lib/ai/config.ts` (`AI_MODEL`, default
`claude-sonnet-5-5`), through the Anthropic SDK with the server-side refusal fallback on; the model that answered is
recorded with the text. The prompt is in the repository because Methodology describes it: change both together.

Without `ANTHROPIC_API_KEY` the script stops with a message pointing to the manual path: paste the facts file and
`prompt.md` into a Claude chat, save the reply to a file, and run `npm run ai:paste -- <id> <file>`. The same checker
runs on it, and the text is recorded as `manual (Claude chat)`. A pasted text can also be committed straight into the
text's file (with `author: ai`, `approved: false` and the hash `npm run ai:status` or `ai:check` prints): CI checks
it on the pull request. A week's summary without the key is simply not drafted: the week shows the cards only.

**Length.** `WORD_LIMITS` (`src/lib/ai/config.ts`) holds This week's summary to 100 to 150 words. A draft outside
it is sent back with the other problems; the owner's corrections through Edit are not held to it.

## 3. Check

`src/lib/ai/check.ts` reads every number, date and country name in the draft (Markdown and HTML read as plain text)
and compares it with the facts file. It is strict on purpose; its tests are in `tests/unit/ai-check.test.ts`.

- **Numbers** in digits, with scales (`1.2 million`, `$27 tn`, `3bn`), in words (`twenty-one`, `three million`),
  ordinals (`third`, `21st`) and fractions (`two-thirds`, as a percentage). A number inside an allowed name
  (`CC BY 4.0`) or a code (`G20`, `CO2`) is not a figure.
- **Rounding.** A figure may be rounded the way it is written, to at least two significant figures: `1.2 million`
  matches 1,234,567, `1.3 million` and `1 million` do not; `50%` does not match 47.3%. Signs are ignored ("down 3%").
- **Kind, unit and period.** A percentage matches only a fact in %, money only a fact in dollars, an ordinal only a
  rank. The fact's unit (or an alias) and every year of its period must be in the same sentence.
- **Ranges** give their scale and % to both ends (`15–20%`, `1.2 to 3.4 million`, `between 1,000 and 1,800`), and
  each end is checked.
- **Dates**: a day must be a day in the facts, a month a month, a year a year; a decade needs a fact in it.
- **Countries** by name, short name, ISO name, alias (`US`, `Turkey`, `Burma`) or demonym (`Chinese`), longest first
  (`South Sudan` before `Sudan`), with case (`Turkey` is a country, `turkey` is not). `Congo` and `Korea` alone fail:
  write the full name. Region and organisation names (`South America`, `European Union`) are skipped.
- **Words**: comparisons (`doubled`, `twice`) need a fact that says them; forecasts, blame and judging words
  (`STYLE` in check.ts) fail the draft, and so do words about the drafting material instead of the subject
  (`the facts`, `this summary`: `SELF_REFERENCE`).

A draft that fails is sent back once with the list of problems; a second failure drops it and nothing is saved.

## 4. Approve

`src/lib/ai/store.ts`. Each text records `author` (`ai` or `owner`), `model`, `factsHash`, `drafted`, `approved`,
`approvedOn` and `approvedVia`. A text is:

| State | Meaning | On the page |
| --- | --- | --- |
| `none` | Not drafted | Nothing |
| `draft` | Drafted, not approved (or drafted before this pipeline, with no hash) | Nothing; long pages show the draft banner |
| `approved` | Approved, and its facts are unchanged | The text, with the label |
| `skipped` | The owner tapped Skip on Telegram | Nothing; not sent for review again |
| `stale` | Approved, but its facts changed since | Nothing (short texts); the draft banner again (long pages). The build log and `ai:status` say so |
| `owner` | Written by the owner | The text, without the label |

**Short texts** are approved with `npm run ai:approve -- <id>` or on Telegram ([telegram.md](telegram.md)). The step
(`approveText`) approves only an AI draft whose facts are unchanged and verified and which still passes the check.
`--text-hash` makes it approve only the exact version the owner was shown: every draft sent for review carries its hash
(`textHash`) in its buttons, and a tap starts a workflow (`ai-review.yml`) that runs
`npm run ai:review -- approve <id> --text-hash <hash>` (the same step, `approvedVia: telegram`), commits the result and
starts the deploy. On Telegram the owner can also:

- **Skip** (`skipText`): the text records `skipped` and is neither published nor sent for review again. For This
  week's summary this means the week has no summary. A redraft from new facts clears it.
- **Edit** (`editText`): the owner's corrected text replaces the draft only if it passes the same checker (not the
  word limit), and is then a draft again, recorded with `edited`, and sent back for Approve.

**Long pages and hub intros** are approved in the pull request `ai:draft --pr` opens: the owner opens the pages on its
Preview, edits the file in the pull request to `approved: true` with `approvedOn: "YYYY-MM-DD"`, and merges.
`ai:check` in CI fails an approved page without `approvedOn`, or one whose facts or text no longer match.

## 5. Publish

Templates call `publishedText(id)` (`src/lib/ai/texts.ts`) and render `src/components/AiText.astro`: the dossier
header (instead of the template summary, which stays until a summary is approved), under the answer on alliance history
pages and on river pages. AI texts carry the label (`.gt-ailabel`, shared with This week's summary, now in
`src/styles/atlas/ailabel.css`) linking to Methodology's "AI drafting" section. Long pages and hubs call
`longApproved(id)` to decide on the draft banner. This week's summary is read by `weekSummary` (`src/lib/week.ts`)
through the same `publishedText`, and rendered in `WeekSummary.astro` with the week's own label.

## What the owner verifies

`npm run ai:status` lists the unverified facts per file. After the launch review (5 November 2026): the SCO (its site did
not load), the Quad (DFAT's page does not state the years), and the Dnipro agreement and its 2022 termination.
