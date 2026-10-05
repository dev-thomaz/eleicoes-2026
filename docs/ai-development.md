# AI-assisted development workflow

## Purpose

This repository is intended to be understandable by both humans and coding agents. Agents may be used for:

- repository analysis;
- implementation planning;
- feature implementation;
- documentation;
- refactors;
- validation;
- review of code and docs.

The workflow should keep current implementation, accepted decisions, and future ideas separate.

## AGENTS.md

`AGENTS.md` is persistent context for coding agents. In the current repository it contains the Next.js generated agent rules:

- this Next.js version may differ from older assumptions;
- agents should read relevant local Next.js docs before writing code;
- the block is re-added by `next dev`;
- removing the block creates churn.

Future project-specific instructions can be added to `AGENTS.md`, but this documentation task did not modify it.

## Context hierarchy

Suggested context order for agents:

```text
AGENTS.md
    |
    v
docs/README.md
    |
    +--> architecture.md
    +--> data-pipeline.md
    +--> map-strategy.md
    +--> design.md
    +--> ADRs
    |
    v
Task-specific prompt
```

## Source of truth

- Code is the source of truth for current behavior.
- Generated static data is the source of truth for the current committed dataset.
- ADRs are the source of truth for accepted technical decisions.
- Documentation explains the current system and records gaps.
- `implementation-plan.md` tracks future work, debt, and open decisions.
- Task prompts are temporary instructions for the current change.

## Task scoping

Agents should load only the context needed for a task.

For a map change:

- `AGENTS.md`;
- `docs/map-strategy.md`;
- relevant ADRs;
- `src/features/election/components/ElectionMap.tsx`;
- relevant data/model docs if the change touches data matching.

For ingestion changes:

- `AGENTS.md`;
- `docs/data-pipeline.md`;
- `docs/mapping-tse-ibge.md`;
- relevant ADRs;
- `scripts/election/generate-data.mjs`;
- generated output samples.

For UX/layout changes:

- `AGENTS.md`;
- `docs/design.md`;
- `docs/accessibility.md`;
- affected components.

For documentation updates:

- `AGENTS.md`;
- relevant docs;
- code files needed to verify factual claims.

## Plan before execution

For larger tasks:

1. Inspect the code and docs.
2. Identify the current implementation.
3. Separate current behavior from desired changes.
4. Propose or write a short plan.
5. Implement.
6. Validate.
7. Summarize changed files and remaining risks.

For small targeted changes, avoid unnecessary ceremony but still validate.

## Agent safety rules

Agents should:

- not push automatically;
- not commit unless explicitly asked;
- not install dependencies without a clear need;
- not change the stack silently;
- not alter generated election data unless the task is specifically about ingestion;
- not invent election data;
- not document planned behavior as current behavior;
- avoid refactors unrelated to the task;
- run appropriate validation before finalizing;
- report files changed and checks run.

## Multi-agent compatibility

This documentation is intended to work conceptually with:

- Codex;
- Claude Code;
- Kiro;
- GitHub Copilot agents;
- other coding agents.

It avoids relying on private conversation history. A new agent should be able to understand the project by reading `AGENTS.md`, `docs/README.md`, the relevant topic docs, and the code.

## Documentation maintenance rule

When behavior changes, update the relevant document in the same change:

- map behavior: `map-strategy.md`;
- filter/URL/data flow: `architecture.md`;
- generated data or ingestion: `data-pipeline.md` and `mapping-tse-ibge.md`;
- UI behavior: `design.md`;
- accessibility behavior: `accessibility.md`;
- validation strategy: `testing.md`;
- accepted decisions: add or update an ADR.

