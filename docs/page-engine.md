# Page engine

Phase 3 of the development plan: every country, Compare, indicator and static page is generated at build time from
one data snapshot, through one route registry. Nothing on these pages is written by hand except the Markdown pages
(About, Methodology, Privacy) and the words in `src/i18n/`.

## How a build works

1. `npm run data:pull` (CI does this before building) downloads the latest snapshot from R2 into `data/raw/`:
   every source's raw files, `snapshot.json` (what was fetched and when) and `status.json` (the runner's public
   status, for Live and Delayed on the Sources page).
2. `npm run build` loads the snapshot once (`src/lib/data.ts`), runs the indicator registry and the adapters, and
   builds the route registry (`src/lib/routes.ts`).
3. `src/pages/[...path].astro` builds one page per live route with the template for its kind. Share images, CSVs,
   `sitemap.xml`, `robots.txt` and `_redirects` come from the same registry.
4. `scripts/check-dist.mjs` checks the result: Cloudflare's limits, the required files, and no Sample tag on any page.

Without a snapshot the build stops and says what to do. `npm run build:sample` builds from the prototype's sample
files instead; every page then carries a Sample banner, and check-dist only allows that with `ALLOW_SAMPLE=1`.
CI uses the sample build only for pull requests from forks, which get no Cloudflare keys and are never deployed.

## The route registry

`src/lib/routes.ts` lists every page the site has or will have:

| Field | Meaning |
| --- | --- |
| `key` | Stable internal id: `country:DEU`, `indicator:milpct`, `compare:USA,CHN`, `page:about`. Slugs can change; keys do not |
| `path` | The address in each language (English only at launch, at the root) |
| `live` | Built and linked. Map views (the critical minerals views from phase 4 on), hubs and tools are registered but not live until their phase, so the menu and every link skip them |
| `indexed` | In the sitemap and without `noindex` |
| `aliases` | Old or alternative addresses, answered with a 301 (`/countries/usa`, `/compare/china-vs-united-states`) |
| `image`, `lastmod` | Share image, and when the page's data last changed (sitemap) |

The build fails when two routes claim one path, an alias is also a page, a key is used twice, or a path is not a
clean lowercase path without a trailing slash. Slugs live in `src/i18n/slugs.en.ts`; another language is another
slug file.

Redirects go to `dist/_redirects` (Cloudflare reads it; the build fails above 2,000 lines). Old prototype hash links
(`/#/country/RUS`, `/#/compare/USA,CHN`) are moved by a few lines of JavaScript on the home and 404 pages, since
servers never see the part after `#`.

## Which pages exist

| Page | Rule |
| --- | --- |
| Country profile | Every country or territory with at least one figure from any source. Fewer than 4 measures: built, `noindex`, with the "few sources" box listing which sources cover it |
| Dossier | United States, China and Russia: the profile plus money, people, technology and climate sections |
| Compare | The three pairs of dossier countries |
| Indicator | Every registry measure with data in the snapshot. Fewer than 20 places reporting in the common year: built, `noindex`. Measures waiting on a key or permission have no page and are listed on the index as waiting |
| About, Methodology, Privacy | `src/content/pages/*.md`. Each shows the draft banner until its front matter says `approved: true` |
| Sources | Generated from the source registry, the licence table and the last snapshot; corrections from `src/data/corrections.csv` |

A sample build has 129 country pages and 37 indicator pages; the real snapshot has more sources and more places.

## Rules the templates follow

- **Every number shows its source and year.** Key figures, table rows and section footers all carry them.
- **Common year.** Indicator pages compare everyone on the latest year that at least 80% as many places have reported
  as in the best of the five years before (`defaultYear` in `src/lib/stats.ts`). Later years are preliminary and
  listed as such. "Latest available" reaches back two years and marks the older rows.
- **Dependence.** Net imports ÷ use: 50% or more "Imports most", 15–50% "Imports some", within ±15% "Roughly
  self-sufficient", below −15% "Exporter" (`src/lib/dependence.ts`). Arms and chips show the main supplier's share
  only. A row whose source is not in the snapshot says "No data yet".
- **Neutral words.** Templates use plain verbs (mines, imports, hosts) and no adjectives that judge. "Higher" on
  Compare marks the larger value and says it is not a judgement. A sentence whose figure is missing is left out.
- **Colour is never the only cue.** Dependence tags have a glyph and a word, Compare countries have a marker and a
  name, lines are labelled at their ends, map classes are named in the legend.
- **Downloads follow the licence table.** An indicator page offers a CSV only when every source behind it allows
  downloads (`csvAllowed`); otherwise it says the figures are shown only.

## Words and other languages

All page text and sentence templates are in `src/i18n/pages.en.ts` (and the registry's labels in `src/i18n/en.ts`).
Templates take figures already formatted by `src/lib/format.ts` and return sentences, so another language is another
file with the same keys, written in that language from the same data.

## Share images

`src/lib/og.ts` renders a 1200 × 630 PNG per page at build time with Satori and resvg, in the site's fonts and light
theme colours: kicker, title, the headline figure or answer, up to five bars, and the source.

## Not done in this phase

- Dossier summaries drafted with AI from a facts file (addendum, D15): the dossiers use the template summary for now.
- The age pyramid's year slider: the pyramid shows one year.
- Redeploying when new data arrives: today pages refresh on the next deploy.
