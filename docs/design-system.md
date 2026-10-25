# Design system in code

The Atlas design system (Claude Design, batches 1–7) as Astro components. Phase 2 of the development plan.

## Where things are

| Path | What |
|---|---|
| `src/design/tokens.json` | The design tokens, exported from the design system. Edit here only |
| `scripts/tokens.ts` | Checks the tokens and writes `src/styles/tokens.css`: `node scripts/tokens.ts` |
| `src/styles/tokens.css` | Generated CSS variables (light on `:root`; dark values ready under `[data-theme="dark"]`, not switched on) |
| `src/styles/fonts.css` | Self-hosted Newsreader (with optical sizes) and Source Sans 3, Latin and Latin Extended, from the `@fontsource-variable` packages |
| `src/styles/atlas/*.css` | Component styles, one file per component family, ported from the design system's `bundle.css`. Each component imports its own file, so a page only loads the styles it uses |
| `src/components/` | The components (below) |
| `src/scripts/` | Their small browser scripts (plain TypeScript, no framework) |
| `src/layouts/Base.astro`, `Page.astro` | Document shell; site page with header, page container and footer |
| `src/data/nav.ts`, `src/i18n/en.ts` | Menu structure; all interface words (another language is another file) |
| `/dev/components` | Hidden page with every component in its states at desktop and in a 390px frame. noindex, not linked, disallowed in robots.txt |

## Checks

- **Tokens** (`tests/unit/tokens.test.ts`): names, every colour readable and its references resolving, the contrast pairs the
  design system promises in both themes (ink, muted text, accent and focus, links, control borders, buttons, status tags,
  tooltip, chart colours and bars), the sequential scale growing step by step, no text style under 12px, `tokens.css` up to
  date, and every `var(--…)` used in `src/` defined somewhere.
- **Sample tag**: the build fails if any page outside `/dev/` shows a Sample tag (`scripts/check-dist.mjs`).
- **Browser** (`tests/e2e/smoke.mjs`): `/dev/components` loads at 1440 and 390 px with no console errors, no sideways
  scroll and a noindex tag; screenshots are kept as CI artifacts.

## Components

Page frame: `Header` (mega menu; full-screen phone menu in a modal dialog), `PhoneMenu`, `Footer`, `Lockup` + `LogoSprite`,
`Breadcrumbs`, `PageToc`, `Icon`. Sources and status: `SourceLine`, `StatusTag` (also Sample), `Notice`. Data display:
`KeyFigure` (in a `.gt-kfrow`), `RankedBars`, `DataTable`, `ChartState`, buttons (`.gt-btn`, `.gt-btn--quiet`).
Filters: `SegmentedControl`, `Dropdown`, `CountrySearch`, `Chips`, `YearSlider`. Maps: `MapLegend`, `MapTooltip`,
`CountryPanel` + `PanelFacts`. Actions: `ShareRow`.

Controls tell the page what changed with bubbling events: `gt-change` (segmented control, chips, year slider) and `gt-pick`
(country search). The header's search buttons and the `/` key send `gt-search`, which site search (phase 8) will answer.

## Not in this phase

Page-specific blocks from design batches 2–7 (homepage hero and sections, This week cards, map view stage, country page
blocks, Explorer, Dependencies, Supply chains, Bloc overlap, hubs, long-read pages, Atlas, share images) are built with
the pages that use them in phases 3–8, from the same `bundle.css`. The main menu lists every wave 1 view until phase 3's
route registry can hide views that are not live.
