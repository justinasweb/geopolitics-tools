# Territory and code table

The table behind the territories policy (`06-territories-policy.md` in the project docs, decision D8): every place
the site can show, its names and codes, how each source's codes map to it, and the notes that go next to a source's
figures. It lives in `src/data/places/` as three CSV files, so it can be edited in a spreadsheet, and is read by
`src/lib/places.ts`.

## places.csv

One row per place: 249 ISO 3166-1 entries, Kosovo and 8 former states.

| Column | What |
|---|---|
| `id` | Internal id, never shown. The ISO 3166-1 alpha-3 code; for a former state its withdrawn ISO 3166-3 code (SUN, YUG, CSK, SCG, DDR, YMD); otherwise an X code of ours (XKX Kosovo, as the World Bank and EU use it; XWG West Germany; XSD Sudan before 2011) |
| `iso2`, `iso3`, `m49` | Codes. M49 is the ISO numeric code for current countries |
| `kind` | `country` (193 UN members, the Holy See, Palestine, Taiwan, Kosovo), `territory` (with its `parent`), `historical`, `other` (Antarctica). It sorts places; it says nothing about recognition |
| `name`, `short` | Display name, and a shorter one for tight spaces. ISO short names in their everyday form, as the policy sets out: "Russia", "Türkiye", "Taiwan", "Palestine" |
| `slug` | URL slug from the English name (`/countries/united-states`) |
| `iso_name` | The ISO 3166 short name, shown in source lines where it differs |
| `status` | Neutral status line for profile kickers ("Special administrative region of China") |
| `start`, `end`, `split_into` | Dates a place existed, and what a former state split into or joined |

Codes and ISO names come from ISO 3166-1 and 3166-3 (Debian iso-codes 4.16). Everyday names come from Unicode CLDR,
with "&" written out and the policy's decisions applied. Edit the CSV directly; nothing regenerates it.

## codes.csv

Source codes that are not plain ISO or M49 codes, or that map differently: OWID_KOS, the IMF's UVK and GADM's XKO for
Kosovo; UN Comtrade's "Other Asia, not elsewhere specified" (490) for Taiwan, and its country codes that include
territories; FAOSTAT's "China" (159), which adds the mainland, Hong Kong, Macao and Taiwan and is skipped; and name
variants for sources that use names (USGS, UK sanctions, the Treasury). A row with no `place` is an aggregate that is
skipped on purpose. `source` is a source id, or `*` for all sources. `start` and `end` limit a row to a period, so a
code can map to a former state before a split.

## notes.csv

The notes shown next to a figure when a source's unit differs from the map shape ("World Bank figures for Morocco
include Western Sahara"), and the short notes for disputed places. `checked` stays `no` until the fact is checked
against a cited source; the policy's section 4 notes are still drafts for Justinas to review.

## Matching in adapters

```ts
const m = new Matcher('worldbank', 'iso3');   // or 'iso2', 'm49', 'name'
const id = m.match(row.countryiso3code, row.date);   // null for aggregates and unknown codes
console.log(m.report());   // "worldbank: 2 unmatched iso3 code(s): WLD (26), EAS (26)"
```

A source's own rows are tried first, then the `*` rows, then the places table. Names are compared without case,
accents, punctuation, a leading "the", "&" or "St." for Saint. Every adapter prints its report in the build, so a new
code from a source shows up instead of silently dropping a country. All 160 USGS country names in the prototype's map
match without extra rows.
