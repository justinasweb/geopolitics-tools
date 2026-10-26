# Prototype sample files

Copied unchanged from the prototype's `public/data/mock/` (the v8 build of 2026-10-22). They are in the formats the
prototype's fetchers and import tool saved, and its adapters read, so the new pipeline is tested
against them: the import tool must accept each one and keep it as it is, and the adapters must read
them. The figures are illustrative, not real data.

`celestrak/` and `epoch/` were added later from the same build, and `comtrade/`, `eia/`, `ember/`, `ipc/` and `ucdp/` in phase 5b.
`comtrade/fertiliser_flows_2023.json` is ours: the FAOSTAT sample's potash and phosphate flows in Comtrade's row format,
turned from tonnes of nutrient into tonnes of product (potash at 60% K2O as HS 3104, phosphate at 46% P2O5 as DAP,
HS 310530), since the prototype had no Comtrade fertiliser sample.
