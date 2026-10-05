# Accessibility

## Implemented

### Semantic structure

- The page uses `main`.
- Filter controls use native `select`, `input`, and `button` elements.
- The map SVG has `role="img"` and a mode-specific `aria-label`.
- Zoom buttons include explicit labels for `+` and `-`.
- Tables use native `table`, `thead`, `tbody`, `tr`, `th`, and `td`.

### Keyboard support

Native controls are keyboard-focusable:

- map mode buttons;
- reset filters button;
- select inputs;
- municipality search input;
- ranking selector;
- table pagination buttons.

### Pointer and touch

- Map supports pointer drag when zoomed.
- SVG has `touch-none` to allow custom pan/zoom behavior.
- Native controls remain touch-friendly.

### Text alternatives

- The map has an SVG accessible label.
- Most detailed data is also available in non-map UI:
  - details panel;
  - rankings;
  - table;
  - metric cards.

### Color and contrast

- Candidate colors are supplemented by text labels in cards, details, tooltips, and table badges.
- Capital labels use a white stroke for readability over the map.
- Filtered-out opponent areas are not only gray; they retain candidate color with reduced opacity.

## Gaps

- The map regions themselves are SVG paths without per-region keyboard navigation.
- Tooltip content is pointer-driven and not announced through a live region.
- Capital labels are visual only.
- The map zoom/pan controls do not expose current zoom level.
- Some clickable table rows rely on `tr` click handlers rather than explicit row buttons or links.
- No automated accessibility tests are configured.
- No formal WCAG conformance audit has been performed.
- Some information still depends heavily on map color/opacity interpretation unless the user consults the table/details.

## Recommended improvements

- Add a visible legend for candidate colors, tie gray, opacity semantics, and capital markers.
- Add keyboard-accessible alternatives for map selection, such as a searchable list synchronized with the map.
- Add `aria-live` support for selected region updates.
- Make table row actions explicit with buttons or links if keyboard row activation becomes a requirement.
- Add automated accessibility checks in future E2E tests.
- Review contrast for candidate-colored badges and capital labels against representative map backgrounds.

