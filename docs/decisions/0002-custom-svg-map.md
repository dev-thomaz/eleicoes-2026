# ADR 0002 — Render maps with custom SVG instead of a map runtime

## Status

Accepted

## Context

The current implementation renders state and municipality maps in `ElectionMap.tsx` with SVG paths generated from IBGE GeoJSON.

The project does not currently depend on MapLibre, Leaflet, D3, TopoJSON, or another map runtime.

## Decision

Use a custom SVG renderer for the current dashboard map.

The component loads GeoJSON, computes a bounds-based projection into a fixed SVG view box, renders paths, and implements hover, click, zoom, pan, capital markers, and filter opacity locally.

## Alternatives considered

- MapLibre GL or another WebGL/vector-tile map runtime.
- Leaflet or another DOM/SVG map library.
- D3 geo utilities.
- Server-rendered static map images.

## Consequences

Positive:

- No map worker or map runtime dependency.
- No tile server or API key requirement.
- Easy static deployment.
- Full control over custom dashboard-specific layers and interactions.

Negative:

- Projection is simple and not a full GIS projection system.
- All path rendering and interactions are owned by application code.
- Detailed mode loads all municipality GeoJSON files in the browser.
- More advanced map behaviors would require additional custom code or a future migration.

