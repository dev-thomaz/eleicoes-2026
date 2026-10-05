# Current status

The project is already implemented and functional as an interactive Next.js dashboard for exploring 2026 Brazilian presidential election data in a two-candidate comparison between Lula and Flávio Bolsonaro.

This document tracks current status, known gaps, technical debt, risks, and future work. It is not a plan to build the product from scratch.

## Completed capabilities

- Next.js App Router application at `/`.
- Election dashboard with header, source metadata, filters, map, metric cards, details panel, rankings, and table.
- Client-side loading of generated TSE result datasets.
- Static data generation script for TSE result JSON and IBGE GeoJSON.
- TSE municipality code to IBGE municipality code mapping through the official TSE municipality configuration.
- State-level map.
- National municipality-level detailed map.
- State-scoped municipality map.
- SVG map rendering without external map runtime.
- Map hover, click, zoom, pan, and reset.
- Highlighted capital markers.
- Municipality zone/section-summary modal fetched on demand from TSE zone files.
- Electorate profile section with region vote distribution and age/sex charts for territories led by each compared candidate.
- Static generated electorate-profile JSON derived from the TSE 2026 electorate profile dataset.
- Neutral gray display for margins rendered as `0,00 p.p.`.
- URL-backed filters and selections.
- Candidate leader filtering with map opacity treatment for filtered-out opponents.
- Metrics, rankings, and paginated table.
- Domain structure under `src/features/election`.
- Modular documentation under `docs/`.

## Known gaps

- No automated unit, integration, or end-to-end test suite.
- No generated-data schema validation.
- No formal accessibility audit.
- No visual regression tests for map behavior.
- Root `README.md` still contains the default create-next-app content.
- Candidate comparison is hard-coded to Lula and Flávio Bolsonaro.
- No dedicated routes for state or municipality pages.
- No visible map legend explaining color, opacity, tie gray, and capital markers.
- No explicit no-results empty state for table/rankings.
- Electorate profile charts describe territories where a candidate leads; they do not identify the demographic profile of each candidate's voters, because individual vote choice is secret.

## Technical debt

- `ElectionDashboard` contains many responsibilities:
  - data loading;
  - filter parsing/writing;
  - derived datasets;
  - table/ranking logic;
  - layout rendering.
- `ElectionMap` contains projection, data matching, zoom/pan, tooltip, capital markers, coloring, and rendering in one component.
- UF/region/IBGE mappings exist in both runtime constants and the generation script.
- The detailed map mode fetches all municipality GeoJSON files in the client.
- The main municipality index loads all municipality result records at once.
- Zone breakdowns are fetched at request time and are not cached or generated as static artifacts.
- Electorate profile generation depends on a large TSE ZIP and currently applies a duplicate-factor normalization observed against section-level data.
- The projection is a simple bounds-based SVG transform, not a formal geographic projection.

## Near-term improvements

- Add a map legend.
- Add unit tests for pure helper functions.
- Add schema validation for generated datasets.
- Rewrite the root README with project summary, screenshots, setup, data source, and documentation links.
- Improve map accessibility and keyboard alternatives.
- Add a no-results state for filters.
- Extract reusable hooks or helper modules if `ElectionDashboard` and `ElectionMap` continue growing.

## Future roadmap

- Support configurable candidate comparisons.
- Add routes such as:
  - `/estado/[uf]`;
  - `/municipio/[ibgeCode]`.
- Use per-UF result JSON files at runtime if initial municipality payload becomes a concern.
- Add E2E tests for core dashboard flows.
- Add visual regression checks for map modes.
- Consider TopoJSON, vector tiles, or a map library if map requirements grow beyond the current SVG strategy.
- Add a generated data manifest and mapping report.

## Risks

- Source TSE payload structure may change.
- Large client-side datasets may become expensive as more candidates, turns, or offices are added.
- Custom SVG map logic may become difficult to maintain if GIS interactions expand.
- Accessibility of the map remains weaker than the table/details alternatives.
- Generated data is committed as static assets without a validation manifest.

## Open decisions

- Whether to keep custom SVG map rendering long term.
- Whether to split result loading by UF in runtime.
- Whether to introduce a test framework first at unit level or E2E level.
- Whether candidate comparison should become URL/config driven.
- Whether to rewrite the root README in the next documentation pass.
