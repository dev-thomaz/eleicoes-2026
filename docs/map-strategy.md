# Map strategy

## Current implementation

The current map is implemented as custom SVG rendering in `src/features/election/components/ElectionMap.tsx`.

No external map library is used. `maplibre-gl` was removed from `package.json`; the runtime dependencies are currently Next.js, React, and React DOM only.

## Geographic sources

The map consumes GeoJSON files generated from IBGE malhas:

```text
public/data/geo/states.geojson
public/data/geo/municipalities/{uf}.geojson
```

The data generator enriches features with `ibgeCode`, and state features also receive `uf`.

## Map modes

### `states`

Fetches:

```text
/data/geo/states.geojson
```

Renders state polygons colored by comparative leader.

### `detailed`

Fetches all 27 municipality GeoJSON files and merges their features in the browser.

Also fetches:

```text
/data/geo/states.geojson
```

State boundaries are drawn on top of municipality polygons.

### `municipalities`

Fetches one UF-level municipality GeoJSON file:

```text
/data/geo/municipalities/{uf}.geojson
```

If no UF is available, the map shows a prompt asking the user to select a state.

## Projection strategy

The component computes raw longitude/latitude bounds from the loaded GeoJSON and projects coordinates into a fixed SVG view box:

```text
width: 840
height: 620
padding: 14
```

The projection is a simple bounds-based linear transform. It is not a formal geographic projection. This is acceptable for the current simplified malhas and dashboard use case, but it is a trade-off.

## Layers

Rendered layers are:

1. background rectangle;
2. state or municipality polygons;
3. state boundary overlay in detailed mode;
4. capital markers and labels;
5. UI overlays outside the SVG:
   - map mode label;
   - zoom controls;
   - loading/error/empty notices;
   - tooltip.

## Coloring

Candidate colors:

- Lula: red (`#C1121F`);
- Flávio Bolsonaro: green (`#2E7D32`).

Special cases:

- displayed `0,00 p.p.` margin uses neutral gray (`#94a3b8`);
- leader-filtered-out regions keep the candidate color but with reduced opacity and no hover/click behavior;
- missing data uses pale gray.

## Interactions

Implemented interactions:

- hover tooltip for active map regions;
- click on a state to switch to municipality mode for that UF;
- click on a municipality to select it;
- zoom in/out buttons;
- reset zoom button;
- wheel/trackpad zoom using a native non-passive `wheel` listener to prevent page scroll while zooming the map;
- drag pan when zoomed.

## Tooltip content

Tooltip includes:

- state or municipality name and UF;
- both candidate percentages;
- comparative leader;
- margin;
- leader votes.

## Capital highlighting

Capitals are detected by comparing municipality names to `CAPITAL_NAME_BY_UF`.

Capital markers:

- render as circles over the municipality map;
- use the leader color or neutral gray for displayed ties;
- include a text label with white stroke for readability;
- do not capture pointer events, so the underlying municipality remains interactive.

## Performance

Current characteristics:

- state mode loads one GeoJSON file;
- municipality mode loads one UF GeoJSON file;
- detailed mode loads 27 municipality GeoJSON files and merges them in the client;
- all municipality result records are loaded by `ElectionDashboard` through `municipalities-index.json`;
- SVG path rendering is all client-side.

This is acceptable for the current project size but may become a bottleneck if additional map layers or comparisons are added.

## Trade-offs

- Custom SVG avoids a map worker, tile server, and third-party map runtime.
- Custom SVG keeps deployment simple with static assets.
- Custom projection and path rendering provide less GIS capability than MapLibre, Leaflet, or vector tiles.
- Detailed mode front-loads all municipality geometry when selected.
- There is no spatial indexing or viewport-based feature culling.

## Future considerations

- Add geometry simplification levels for different zoom/detail needs.
- Consider TopoJSON to reduce duplicated borders between adjacent municipalities.
- Consider vector tiles or a map library if pan/zoom complexity grows.
- Add automated visual regression checks for map modes.
- Improve keyboard and screen-reader alternatives for map exploration.

