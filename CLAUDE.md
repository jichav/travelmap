# Travelmap

Static site for GitHub Pages. Two pages, no build step, no framework: d3 + topojson from a CDN.

- `index.html` — countries of the world, by continent. Logic in `assets/app.js`, `countries.js`, `i18n.js`.
- `regions.html` — kraje and okresy of Czechia, Slovakia, Austria, Poland and Germany. Logic split under `assets/regions/`.

Data lives in `data/travel.json` and `data/regions.json`, written back through the GitHub
Contents API with a fine-grained token the user pastes at save time. Visits are binary for
regions; countries also carry a year.

`geocaching.html` — private, password-gated (`geovasek`, hash in `assets/config.js`), dark green
reverse of the public pages. Two levels, switched on the map: **kraj** records only the 9 × 9
difficulty/terrain matrix, **okres** records 9 cache types, 6 sizes (XS S M L O NCH), 9 terrain
and 9 difficulty steps. No stats strip and no unit lists — the map is full width and the only
way in; under it sits the analysis of the clicked unit, missing items large, found ones small.
The map carries no status fill (kraje alternate two tints for legibility); at okres level each
okres is labelled with what is still MISSING there — type icon, size code, T·/D· step.
Logic in `assets/gc/app.js`, styles in `assets/gc.css`, type icons in `assets/gc-icons/`
(pulled from the user's CHALLENGE.xlsx), data in `data/geocaching.json`
(`regions[id].matrix` + `districts[id]{types,sizes,terrain,diff}`). Reached only from
regions.html through the quiet locked button beside the country tabs, shown while Czechia is
selected. Czech-only copy, no i18n. Reuses `assets/regions-data.js` for the CZ tables.

## Which file to open

**regions.html work — read only what the change touches:**

| File | Holds |
| --- | --- |
| `assets/regions/core.js` | `window.R`, `R.s` state object, `R.t` translation, `applyStatic`, language switch, local + remote data load, sync status line |
| `assets/regions/geometry.js` | geoBoundaries fetch, ring rewinding, kraj merge from okres topology, seat placement |
| `assets/regions/map.js` | projection, framing, `R.drawMap` — unit paths, kraj mesh, seat dots and labels |
| `assets/regions/ui.js` | `R.render` and everything around the map: stats, country/kraj tabs, visited chips, tile lists, detail panel, level switch |
| `assets/regions/auth.js` | password gate, session chrome, GitHub push, token dialog |
| `assets/regions/export.js` | GeoJSON + raw JSON downloads |
| `assets/regions/boot.js` | load order and startup |
| `assets/regions-data.js` | Country list (id, flag, projection, unit counts), CZ tables (kraj codes, okres names, okres→kraj parents, seats), SK kraj table, okres names and capitals, AT Länder table, PL voivodeship table and capitals |
| `assets/i18n-regions.js` | strings unique to regions.html (falls back to `i18n.js`) |

Modules share state through `window.R`; `boot.js` must stay last in `regions.html`.
Do not read `assets/app.js`, `countries.js` or `i18n.js` for regions work — they belong to `index.html`.

## Conventions

- Colour: teal `#0e8b7e` on a light grey-green ground; rounded shapes; Figtree + Instrument Sans.
- Projections: countries in Equal Earth (EPSG:8857), continents in local conics, CZ regions in ETRS89 / UTM 33N (EPSG:25833).
- Comments explain why, not what. British spelling in code comments; UI copy is EN + CS.
- No new colours outside the palette; no emoji.

## Planned

Germany reads Länder from ADM1 and Kreise from ADM3 (ADM2 is the Regierungsbezirke). ADM3
gives 428 features, because Bremen, Hamburg, Mecklenburg, Schleswig-Holstein and Lower
Saxony are cut finer there; `mergeDuplicates` folds same-name features into one
MultiPolygon, which lands on the official 401. Okres seats exist for Czechia only — the other countries have
kraj capitals but no district towns; Natural Earth carries far too few places (58 for
Germany) to fill them in, so a hand-kept table or another source is needed. Germany needs another
source — geoBoundaries ADM2 only carries 38 units, not the 401 Kreise.
