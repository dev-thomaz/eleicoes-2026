# Project documentation

This directory documents the current implementation of the election geography dashboard. The code is the source of truth for current behavior; these documents explain what exists, why key decisions are reflected in the implementation, and which improvements remain future work.

## Product

- [Overview](./overview.md): product scope, user flow, features, limitations, and terminology.
- [Design](./design.md): implemented UI structure, responsive behavior, states, colors, and visual density.

## Engineering

- [Architecture](./architecture.md): Next.js architecture, app structure, state, filters, and data flow.
- [Data model](./data-model.md): TypeScript types, entities, IDs, derived fields, and relationships.
- [Data pipeline](./data-pipeline.md): current TSE/IBGE ingestion script and generated outputs.
- [TSE to IBGE mapping](./mapping-tse-ibge.md): how electoral municipality IDs are connected to geographic IDs.
- [Map strategy](./map-strategy.md): current SVG map implementation, interactions, performance trade-offs, and future options.

## Quality

- [Accessibility](./accessibility.md): implemented accessibility affordances, known gaps, and improvements.
- [Testing](./testing.md): available validation commands, current coverage, and missing test layers.

## Planning

- [Implementation plan](./implementation-plan.md): current status, known gaps, technical debt, roadmap, risks, and open decisions.

## Decisions

- [Architecture Decision Records](./decisions/): accepted technical decisions reflected in the implementation.

## AI-assisted development

- [AI development workflow](./ai-development.md): how coding agents should use repository context, documentation, ADRs, and task prompts.

