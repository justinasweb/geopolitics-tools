# Samples in the live formats

The prototype's sanctions samples (`public/data/mock/csl`, `eu`, `uk`, the v8 build of 2026-10-22) are
in the formats its own fetchers saved, which differ from what the new fetchers save. These files are
a slice of those samples (every 20th US record, every 10th EU and UK one) rewritten into the new
formats by a one-off script:

- `csl/consolidated.json`: the trimmed Consolidated Screening List records, plus one Denied Persons
  List record that the sanctions count must leave out.
- `eu-sanctions/sanctions.csv`: the trimmed FSF export, two rows (names) per entity, as the export
  repeats an entity once per name and address.
- `uk-sanctions/sanctions.csv`: the trimmed UK Sanctions List, countries written as names.

Names are placeholders and the figures are illustrative. The real formats are checked by the pull
request live check, which runs the adapters on the files it fetches (`pipeline/adapter-check.ts`).

`usgs-minerals/MCS2026_Commodities_Data.csv` is different: a slice of the real file USGS publishes with
Mineral Commodity Summaries 2026 (the lithium and gallium rows), kept to
test the real format: per-row "Estimated." notes, withheld figures and the "Excludes U.S. production."
world total. Figures in it are USGS's own.

`fas-forces/status-world-nuclear-forces.csv` is FAS's own table, Status of World Nuclear Forces 2026 (page updated
9 Jun 2026), copied whole with its Total row as the `fas-forces` import takes it; "n.a." cells are left empty. India's
deployed and reserve warheads (178) fall short of its military stockpile (190), as FAS gives them.
