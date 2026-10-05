# Product overview

## Current implementation

This project is a web dashboard for exploring Brazilian presidential election results for 2026 in a geographic interface. The current product is implemented around a comparative view between two candidates:

- Lula
- Flávio Bolsonaro

The dashboard intentionally presents the leader inside this two-candidate comparison. It does not claim that the displayed leader is necessarily the official winner among all candidates in the election.

## Problem solved

The application helps a user inspect how the comparative vote distribution between Lula and Flávio Bolsonaro changes across:

- Brazil by state;
- all municipalities nationally;
- municipalities inside a selected state;
- regions;
- candidate leader;
- municipality search.

The app combines map exploration, summary metrics, rankings, details, and a paginated municipality table.

## Main user flow

1. Open the dashboard.
2. Select a map mode:
   - `Estados`;
   - `Estado detalhado`;
   - `Municípios`.
3. Optionally filter by region, state, leader, or municipality search.
4. Hover the map to inspect results.
5. Click a state to enter the municipality view for that state.
6. Click a municipality in the map, ranking, or table to populate the details panel.
7. Sort and page through the municipality table.

## Implemented features

- Static dashboard route at `/`.
- URL-backed filters through query parameters:
  - `level`;
  - `region`;
  - `state`;
  - `leader`;
  - `municipality`;
  - `q`.
- Client-side loading of generated static election datasets.
- Three map modes:
  - state-level choropleth;
  - national municipality-level detailed map;
  - municipality map scoped to one state.
- SVG-based map rendering with:
  - hover tooltip;
  - click selection;
  - zoom controls;
  - wheel/trackpad zoom;
  - drag pan while zoomed;
  - reset zoom;
  - highlighted capitals;
  - neutral gray for displayed `0,00 p.p.` margins;
  - opacity treatment for filtered-out leader groups.
- Summary metric cards for municipalities and states by comparative leader.
- Details panel for selected state or municipality.
- Municipality zone modal with per-zone comparison and aggregate section/turnout totals.
- Electorate profile section with:
  - compared votes by region;
  - sex distribution in territories where each candidate leads;
  - age distribution in territories where each candidate leads;
  - explanatory copy clarifying that demographic charts describe territories, not individual voters by candidate.
- Ranking panel:
  - most balanced municipalities;
  - largest margins for Lula;
  - largest margins for Flávio Bolsonaro.
- Paginated municipality table with sorting by:
  - largest margin;
  - smallest margin;
  - name;
  - Lula percentage;
  - Flávio percentage.
- Loading and error states for election data and map geometry.

## Terminology

- `Leader`: candidate with more votes in the two-candidate comparison.
- `Margin`: absolute difference between the two candidate percentages, in percentage points.
- `Estado detalhado`: national municipality-level map, colored by municipality leader.
- `Municípios`: map scoped to municipalities in a selected state.
- `0,00 p.p.` margin: displayed as neutral gray on the map, while remaining hoverable/clickable.

## Data scope

The generated dataset currently contains:

- 27 states;
- 5,571 municipalities;
- first turn presidential office (`officeCode: "0001"`);
- election ID `6257`;
- data source marked as `tse-divulgacao`;
- geographic meshes from IBGE.
- electorate profile aggregates from TSE.

## Known limitations

- The comparison is hard-coded to Lula and Flávio Bolsonaro.
- The current route surface is a single dashboard at `/`; there are no dedicated routes for state or municipality pages.
- Election data is loaded in the client from static JSON files.
- Zone breakdown data is fetched on demand through a Route Handler instead of being part of the generated static dataset.
- Demographic charts are ecological/territorial summaries. They should not be interpreted as the demographic composition of each candidate's voters.
- The municipality index is loaded as a single JSON file for the dashboard data table and filters.
- The map is custom SVG code rather than a GIS/map library.
- There are no automated unit, integration, or end-to-end tests.
- Accessibility is partially implemented but the map remains primarily visual.

## Future considerations

- Support configurable candidate comparisons.
- Add route-level pages for state and municipality deep links.
- Split or lazy-load municipality result data by state if initial payload becomes too large.
- Add automated tests around filtering, map interaction, data parsing, and generated data contracts.
- Add a public-facing root README with screenshots, demo link, stack summary, and technical case-study framing.
