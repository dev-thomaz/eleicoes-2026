# ADR 0004 — Use TSE municipality configuration as the TSE to IBGE mapping source

## Status

Accepted

## Context

Election results are fetched from TSE files identified by electoral municipality codes, while geographic meshes are fetched from IBGE and keyed by IBGE codes.

The TSE municipality configuration file includes both:

- `mu.cd`: TSE municipality code;
- `mu.cdi`: IBGE municipality code.

## Decision

Use the TSE municipality configuration file as the mapping source between TSE result identifiers and IBGE geographic identifiers.

The generation script stores both `tseCode` and `ibgeCode` in generated municipality result records.

## Alternatives considered

- Match municipalities by name and UF.
- Maintain a manual mapping table.
- Use an external mapping dataset.

## Consequences

Positive:

- Mapping comes from an official TSE configuration source.
- Runtime matching to geometry uses stable IBGE codes.
- Names remain display fields rather than primary keys.
- The pipeline can construct TSE municipality result URLs and still join to IBGE GeoJSON.

Negative:

- The pipeline depends on the TSE configuration payload structure.
- There is no current generated mapping report.
- There is no current full validation report for unmatched TSE or IBGE records.

