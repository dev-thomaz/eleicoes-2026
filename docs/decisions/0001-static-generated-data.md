# ADR 0001 — Generate static election and geography datasets

## Status

Accepted

## Context

The application needs official election results and geographic meshes, but the runtime app does not need to fetch external TSE or IBGE services directly.

The current repository includes `scripts/election/generate-data.mjs`, which fetches TSE result/configuration files and IBGE malhas, normalizes them, and writes static assets under `public/data`.

## Decision

Generate election and geography datasets ahead of runtime and serve them as static files from `public/data`.

The Next.js application fetches those generated files from the same origin.

## Alternatives considered

- Fetch TSE and IBGE directly from the browser.
- Fetch TSE and IBGE through Next.js API routes at runtime.
- Commit hand-authored or mock data.
- Use a database-backed ingestion process.

## Consequences

Positive:

- Runtime app stays simple.
- No runtime secrets are required.
- Deployment can rely on static assets.
- Source URLs and generated metadata remain traceable.
- The frontend avoids thousands of direct TSE requests.

Negative:

- Generated files can become stale unless regenerated.
- There is no current schema validation for generated outputs.
- The municipality index is loaded as a large client-side JSON file.
- Regeneration depends on external source availability.

