# Testing and validation

## Current coverage

There is no unit, integration, or end-to-end test framework configured in the current repository.

The current validation surface consists of:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

These commands were run during this documentation audit with Node `20.19.2` and pnpm `10.32.1`.

## Available scripts

From `package.json`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm election:generate
```

There is no `pnpm test` script.

## What each current check covers

### `pnpm lint`

Runs ESLint with:

- `eslint-config-next/core-web-vitals`;
- `eslint-config-next/typescript`.

This catches many React, Next.js, and TypeScript lint issues.

### `pnpm exec tsc --noEmit`

Runs the TypeScript compiler in strict mode without emitting files.

### `pnpm build`

Runs the Next.js production build. The latest audit build produced static routes for `/` and `/_not-found`, plus the dynamic Route Handler `/api/election/zones`.

## Data generation validation

`pnpm election:generate` fetches external TSE/IBGE sources and rewrites generated static data. The current pipeline also downloads the large TSE electorate profile ZIP and aggregates it into `electorate-profile.json`.

When the electorate profile feature was added, the command was rerun successfully and produced:

- 27 states;
- 5,571 municipalities;
- 5,571 electorate profiles;
- 0 failed municipality result fetches.

## Gaps

- No unit tests for:
  - filter helpers;
  - formatting helpers;
  - leader/margin calculations;
  - URL parameter behavior.
- No integration tests for dashboard loading and filter combinations.
- No E2E tests for map interactions, zoom, pan, details selection, rankings, and table pagination.
- No schema/contract tests for generated JSON.
- No visual regression tests for map modes.
- No accessibility automation.

## Future testing strategy

Recommended next steps:

1. Add unit tests for pure helpers in `calculations.ts` and `formatters.ts`.
2. Add generated-data schema validation for `metadata.json`, `states.json`, `municipalities-index.json`, and `electorate-profile.json`.
3. Add component or integration tests for filter/query-param behavior.
4. Add Playwright tests for:
   - loading state;
   - state and municipality selection;
   - detailed map mode;
   - leader filter opacity behavior;
   - zoom/pan controls;
   - table sorting and pagination.
5. Add basic automated accessibility checks as part of E2E.
