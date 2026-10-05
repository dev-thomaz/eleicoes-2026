# Data pipeline

## Current implementation

The data pipeline is implemented in `scripts/election/generate-data.mjs` and exposed through:

```bash
pnpm election:generate
```

The pipeline is not executed at application runtime. It generates static JSON and GeoJSON files under `public/data`.

The exception to the static-data runtime model is the zone breakdown modal: `GET /api/election/zones` fetches TSE zone-level files on demand for the selected municipality. Those zone-level rows are not generated into `public/data`.

## Sources

### TSE results

Base URL:

```text
https://resultados.tse.jus.br/oficial
```

The script fetches:

- election configuration:
  - `/comum/config/ele-c.json`;
- municipality configuration:
  - `/{cycle}/{electionId}/config/mun-e{paddedElectionId}-cm.json`;
- national result:
  - `/{cycle}/{electionId}/dados/br/br-c{officeCode}-e{paddedElectionId}-u.json`;
- state results:
  - `/{cycle}/{electionId}/dados/{uf}/{uf}-c{officeCode}-e{paddedElectionId}-u.json`;
- municipality results:
  - `/{cycle}/{electionId}/dados/{uf}/{uf}{tseCode}-c{officeCode}-e{paddedElectionId}-u.json`.

Current election parameters in the implementation:

- election ID: `6257`;
- office code: `0001`;
- office name: `Presidente`;
- turn: first turn in the generated metadata;
- cycle discovered from TSE config, currently `ele2026`.

### IBGE geographic meshes

Base URL:

```text
https://servicodados.ibge.gov.br/api/v3/malhas
```

The script fetches:

- state GeoJSON:
  - `/paises/BR?intrarregiao=UF&formato=application/vnd.geo+json&qualidade=minima`;
- municipality GeoJSON by UF:
  - `/estados/{ibgeCode}?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima`.

### TSE electorate profile

The pipeline also downloads and aggregates the TSE 2026 electorate profile ZIP:

```text
https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2026.zip
```

The raw file is large and is not served to the browser. The script streams the CSV from the ZIP, aggregates rows by municipality, and writes a compact static JSON file with:

- total electorate;
- electorate by sex;
- electorate by age bucket;
- electorate by education bucket.

The current generated file applies a duplicate-factor normalization of `2`, validated against the UF section-level profile data for Acrelândia/AC. This keeps the dashboard totals aligned with the section-level electorate profile source while preserving a lightweight national file for the SPA.

## Processing flow

```text
TSE election config
        |
        v
Find presidential federal election
        |
        +--> TSE municipality config
        |          |
        |          v
        |    TSE code -> IBGE code mapping
        |
        +--> TSE national result
        |
        +--> TSE state results
        |
        +--> TSE municipality results
                   |
                   v
         normalized comparison results
                   |
                   +------ TSE electorate profile
                   |          |
                   |          v
                   |    municipality demographic aggregates
                   |
                   +------ IBGE malhas
                   |          |
                   |          v
                   |    enriched GeoJSON properties
                   |
                   v
              public/data
```

## Candidate extraction

The script currently compares two configured candidates:

- Lula:
  - number `13`;
  - sequence `280002542548`;
- Flávio Bolsonaro:
  - number `22`;
  - sequence `280002551544`.

Candidate matching accepts either:

- matching `sqcand`;
- matching ballot number `n`.

For each result file, `extractComparedResult` extracts:

- votes;
- percentages;
- candidate identities;
- leader;
- margin in percentage points;
- source generation timestamp;
- aggregation status.

## Concurrency

The script uses a simple `runPool` helper:

- state result fetches: concurrency `8`;
- municipality result fetches: concurrency `24`;
- IBGE municipality mesh fetches: concurrency `4`.

## Outputs

Election results:

```text
public/data/election/2026/president/turn-1/
  metadata.json
  states.json
  municipalities-index.json
  electorate-profile.json
  municipalities/
    ac.json
    ...
    to.json
```

Geographic data:

```text
public/data/geo/
  states.geojson
  municipalities/
    ac.geojson
    ...
    to.geojson
```

Current generated dataset size is approximately:

- `public/data`: 18 MB;
- `public/data/election`: 15 MB;
- `public/data/geo`: 3.5 MB.

## Runtime consumption

The frontend currently loads:

- the national municipality index for table, rankings, filters, counts, and detailed mode data;
- the electorate profile index for the dashboard demographic charts;
- state results for state map and counts;
- GeoJSON files on demand for the selected map mode.

The per-UF election JSON files are generated but not currently used by the frontend.

For municipality zone breakdowns, the frontend calls the local Route Handler:

```text
/api/election/zones?uf={UF}&tseCode={TSE_CODE}
```

The handler fetches the TSE municipality config to obtain zone codes and then fetches each zone result file. The response includes per-zone candidate results plus aggregate section and turnout fields. It does not currently include one row per individual voting section.

## Validation currently implemented

The script fails if:

- the presidential federal election cannot be found;
- a compared candidate cannot be found in a result file;
- a fetched source returns a non-OK HTTP status.

The script records warnings if municipality result fetches fail.

## Gaps

- No schema validation for generated JSON outputs.
- No automated contract tests for TSE payload shape.
- No checksum/version manifest for generated static data.
- No cache layer for source downloads.
- No retry/backoff logic for external fetches.
- No explicit validation that every municipality GeoJSON feature has a matching result row.
- No automated validation that every electorate profile row maps to a generated municipality.
- Zone breakdowns are fetched at request time and are not cached or persisted in generated static data.

## Future considerations

- Add a generated manifest with data generation timestamp, source versions, file sizes, and counts.
- Validate generated outputs with a schema library or custom checks.
- Use per-UF election datasets in the frontend if initial load becomes too large.
- Add retry/backoff and source caching for repeatable generation.
