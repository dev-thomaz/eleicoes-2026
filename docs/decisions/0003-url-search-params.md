# ADR 0003 — Keep dashboard filters in URL search params

## Status

Accepted

## Context

The dashboard supports several user-controlled filters and selections:

- map level;
- region;
- state;
- leader;
- selected municipality;
- municipality search.

The current implementation reads these through `useSearchParams` and writes changes through `router.replace`.

## Decision

Use URL search params as the shareable state layer for dashboard filters and selections.

## Alternatives considered

- Local React-only state with no URL synchronization.
- A global state-management library.
- Dedicated route segments for each state/municipality/filter combination.

## Consequences

Positive:

- Filter state is shareable by URL.
- Reloading the page preserves context.
- No external state-management library is needed.
- The implementation stays compatible with a single dashboard route.

Negative:

- Query-param update logic is concentrated in `ElectionDashboard`.
- Some interactions require explicit cleanup of stale params to avoid friction.
- Dedicated semantic routes may still be desirable later for portfolio/readability and SEO.

