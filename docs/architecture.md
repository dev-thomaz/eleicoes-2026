# Architecture

## Current implementation

The application is a Next.js App Router project using:

- Next.js `16.3.8`;
- React `19.2.8`;
- TypeScript `^5`;
- Tailwind CSS `^4`;
- ESLint `^9`;
- pnpm `10.32.1`;
- Node `20.19.2` in the validated local environment.

`package.json` does not declare an `engines.node` field. In practice, Next.js 16 requires a Node 20 runtime; local validation used Node `20.19.2` through `nvm`.

## Directory structure

```text
src/
  app/
    api/election/zones/route.ts
    globals.css
    layout.tsx
    page.tsx
  features/
    election/
      calculations.ts
      components/
        ElectionDashboard.tsx
        ElectionMap.tsx
      constants.ts
      formatters.ts
      types.ts

scripts/
  election/
    generate-data.mjs

public/
  data/
    election/2026/president/turn-1/
    geo/
```

## App Router structure

`src/app/layout.tsx` is the root layout. It:

- sets `lang="pt-BR"`;
- configures Geist fonts through `next/font/google`;
- exports metadata:
  - title: `Eleições 2026 | Geografia eleitoral`;
  - description for the Lula x Flávio Bolsonaro comparison.

`src/app/page.tsx` is a Server Component by default. It renders `ElectionDashboard` inside `Suspense` because the dashboard uses `useSearchParams` in a Client Component.

`src/app/api/election/zones/route.ts` is a Route Handler used by the municipality details modal to fetch TSE zone-level breakdowns on demand.

## Server Components

Current Server Components:

- `RootLayout` in `src/app/layout.tsx`;
- `Home` in `src/app/page.tsx`.

They do not fetch election data on the server. They provide shell, metadata, fonts, and Suspense fallback.

Current server route handlers:

- `GET /api/election/zones`: fetches TSE municipality configuration and zone-level EA20 files for one selected municipality, then returns zone rows with candidate comparison, section totals, and electorate/turnout aggregates.

## Client Components

Current Client Components:

- `ElectionDashboard`;
- `ElectionMap`.

`ElectionDashboard` owns:

- data loading from generated static JSON files;
- URL search param parsing;
- filter state;
- ranking state;
- table sorting;
- pagination;
- selected state/municipality resolution;
- metric counts;
- rendering of header, filters, metric cards, details, rankings, map, and table.

`ElectionMap` owns:

- map geometry loading;
- SVG projection;
- map coloring;
- tooltip state;
- map zoom and pan;
- click/hover interactions;
- capital markers;
- state-boundary overlay in detailed mode.

## Data flow

```text
TSE and IBGE external data
        |
        v
scripts/election/generate-data.mjs
        |
        v
public/data static JSON and GeoJSON
        |
        v
ElectionDashboard client fetch
        |
        +--> filters, counts, rankings, table
        |
        v
ElectionMap client fetch for GeoJSON
        |
        v
SVG map interactions
```

## State management

There is no external state-management library. State is managed with React hooks:

- `useState`;
- `useMemo`;
- `useCallback`;
- `useEffect`;
- `useRef`.

## URL state

The dashboard reads URL state with `useSearchParams` and writes it through `router.replace`.

Implemented query parameters:

- `level`: `states`, `detailed`, or `municipalities`;
- `region`: one of the five region slugs;
- `state`: uppercase UF;
- `leader`: `lula`, `flavio`, or absent for all;
- `municipality`: IBGE municipality code;
- `q`: municipality search text.

When `level=states`, the `level` parameter is removed from the URL because `states` is the default view.

## Filter strategy

Filtering is client-side and happens after loading the generated result datasets.

`filterMunicipalities` supports:

- region;
- UF;
- leader;
- query string.

`filterStates` supports:

- region;
- UF;
- leader.

The map receives map-specific data with leader filtering removed, so filtered-out opponents can still be displayed in their candidate color with reduced opacity. Tables, metrics, and rankings continue to use leader-filtered data.

## Runtime data loading

`ElectionDashboard` fetches:

- `/data/election/2026/president/turn-1/metadata.json`;
- `/data/election/2026/president/turn-1/states.json`;
- `/data/election/2026/president/turn-1/municipalities-index.json`.

`ElectionMap` fetches:

- `/data/geo/states.geojson` in state mode;
- `/data/geo/municipalities/{uf}.geojson` in municipality mode;
- all 27 municipality GeoJSON files in detailed mode;
- `/data/geo/states.geojson` as a state-boundary overlay in detailed mode.

The zone modal fetches:

- `/api/election/zones?uf={UF}&tseCode={TSE_CODE}`.

That Route Handler fetches TSE official data at request time and does not use generated static zone datasets.

## Styling

The project uses Tailwind CSS classes directly in React components plus a small global stylesheet. There is no component library.

## Deploy assumptions

The implemented app can be served by any environment that supports Next.js App Router builds, static assets, and Route Handlers. There is no database or runtime secret dependency. The zone breakdown modal performs server-side TSE fetches on demand through `GET /api/election/zones`.

## Boundaries

- ETL/data generation lives in `scripts/election/generate-data.mjs`.
- Runtime UI reads generated files only.
- Election domain logic lives in `src/features/election`.
- Map rendering is intentionally local to `ElectionMap`.

## Future considerations

- Add a route layer for direct state and municipality pages.
- Extract complex map interaction logic into hooks if the map grows further.
- Add generated-data schema validation.
- Add explicit `engines.node` once runtime expectations are standardized.
