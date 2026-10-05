# TSE to IBGE mapping

## Current implementation

The project has a real TSE-to-IBGE mapping step in `scripts/election/generate-data.mjs`.

The source of the mapping is the TSE municipality configuration file:

```text
https://resultados.tse.jus.br/oficial/{cycle}/{electionId}/config/mun-e{paddedElectionId}-cm.json
```

The script flattens this configuration through `flattenMunicipalConfig`.

## IDs used

### TSE municipality code

Source field:

```text
mu.cd
```

Runtime field:

```ts
tseCode: string
```

Used to construct municipality-level TSE result URLs.

### IBGE municipality code

Source field:

```text
mu.cdi
```

Runtime fields:

```ts
id: string
ibgeCode: string
```

Used to match election results to municipality geometry.

### UF

Source field:

```text
abr[].cd
```

The script uppercases UF codes before storing them.

### IBGE state code

The project maintains a static `STATE_IBGE_BY_UF` mapping in both the generation script and runtime constants.

Used to:

- fetch IBGE municipality meshes by state;
- enrich state GeoJSON features with UF;
- populate `StateResult.ibgeCode`.

## Mapping flow

```text
TSE municipality config
        |
        v
abr[] by UF
        |
        v
mu[]
        |
        +--> tseCode = mu.cd
        +--> ibgeCode = mu.cdi
        +--> name = mu.nm
        +--> uf = abr.cd
        +--> stateName = abr.ds
        +--> zones = mu.z
        |
        v
MunicipalityResult
        |
        v
GeoJSON feature properties.ibgeCode
```

## Geometry enrichment

State GeoJSON features from IBGE contain `properties.codarea`. The script maps this IBGE state code back to UF and adds:

```json
{
  "ibgeCode": "...",
  "uf": "..."
}
```

Municipality GeoJSON features from IBGE also contain `properties.codarea`. The script adds:

```json
{
  "ibgeCode": "..."
}
```

At runtime, `ElectionMap` matches:

- state features by `properties.ibgeCode` or `properties.uf`;
- municipality features by `properties.ibgeCode`.

## Fallbacks and exceptions

Current implementation:

- filters flattened municipality config entries without a known region;
- records municipality result fetch failures in `failedMunicipalities`;
- does not implement special-case handling for exterior results, Fernando de Noronha, or missing IBGE geometries;
- does not currently validate one-to-one result-to-geometry coverage after generation.

Current generated summary shows:

- 5,571 municipalities processed;
- 0 failed municipalities.

## Future considerations

- Add validation for unmatched TSE municipalities and unmatched IBGE geometries.
- Add explicit handling/documentation for any special electoral/geographic areas if they appear in source payloads.
- Generate a mapping report as part of `pnpm election:generate`.
- Remove duplicated UF/IBGE mappings between script and runtime by generating a shared artifact if that becomes valuable.

