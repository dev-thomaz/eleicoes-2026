# Design

## Current implementation

The interface is a dense dashboard designed for exploration rather than a marketing landing page.

The UI is implemented directly with Tailwind CSS classes in React components. There is no component library.

## Desktop layout

Approximate implemented structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: title, explanation, source metadata                  │
├──────────────────────────────────────────────┬───────────────┤
│ Filters                                      │ Metric cards  │
│ ┌ map mode buttons + reset ┐                 │ Details       │
│ └ region/state/leader/q ───┘                 │ Rankings      │
│                                              │               │
│ Map                                          │               │
├──────────────────────────────────────────────┴───────────────┤
│ Municipality table with sorting and pagination                │
└──────────────────────────────────────────────────────────────┘
```

The main content uses a max width of `1480px`.

## Header

The header includes:

- election context;
- title;
- explanatory copy that the map shows the comparative leader, not the official winner among all candidates;
- source panel with:
  - TSE environment;
  - TSE generation timestamp;
  - national aggregation status.

## Filters

The filter panel is split into:

- map mode buttons:
  - `Estados`;
  - `Estado detalhado`;
  - `Municípios`;
- `Limpar filtros` action;
- grid of filters:
  - region;
  - state;
  - leader;
  - municipality search.

Changing region or state clears municipality search to reduce stale-filter friction.

## Map

The map card contains:

- SVG map;
- current mode label;
- zoom controls;
- loading/error/empty state overlays;
- hover tooltip.

Map visual conventions:

- red for Lula;
- green for Flávio Bolsonaro;
- gray for displayed `0,00 p.p.` margins;
- reduced opacity for filtered-out opponent areas;
- capital markers with leader-colored circle and label.

## Metric cards

Four metric cards summarize counts in the current filter context:

- municipalities led by Lula;
- municipalities led by Flávio;
- states or selected UF led by Lula;
- states or selected UF led by Flávio.

Each card uses a small color bar.

## Details panel

When nothing is selected, the panel asks the user to select a state or municipality.

When selected, it shows:

- name and UF;
- region;
- comparative leader;
- per-candidate percentage;
- per-candidate votes;
- margin.

## Rankings

The ranking panel lets the user choose:

- most balanced municipalities;
- largest margins for Lula;
- largest margins for Flávio.

Rows are clickable and select the municipality.

## Table

The municipality table includes:

- municipality;
- UF;
- region;
- Lula votes and percentage;
- Flávio votes and percentage;
- leader badge;
- margin;
- pagination;
- sorting by name, margins, and candidate percentages.

Rows are clickable and select the municipality.

## Responsive behavior

Implemented responsive behavior is mostly Tailwind-driven:

- header becomes a single column on smaller screens;
- main map/sidebar grid collapses when below the large breakpoint;
- filter grid changes from four columns to two columns and then one column;
- table supports horizontal overflow;
- map height uses `460px` by default and `620px` on medium screens.

## Loading, error, and empty states

Implemented:

- page-level loading card while election data loads;
- page-level error card if election datasets fail to load;
- map loading overlay while geometry loads;
- map error overlay if geometry fails;
- map notice when municipality mode has no selected UF.

Not separately implemented:

- no-results empty state for table/rankings beyond naturally rendering no rows;
- skeleton loading.

## Typography and color

The app uses Geist fonts through `next/font/google`.

The visual style is neutral and utilitarian:

- light gray page background;
- white panels;
- slate borders and text;
- strong candidate colors only where they carry data meaning.

## Future considerations

- Add a compact legend explaining color, opacity, and gray/tie semantics.
- Add a dedicated no-results state for filters.
- Add screenshots to the root README after the UI stabilizes.
- Consider extracting repeated card/select/button styling if the interface grows.

