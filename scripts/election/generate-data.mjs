import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const TSE_BASE_URL = "https://resultados.tse.jus.br/oficial";
const IBGE_MALHAS_URL = "https://servicodados.ibge.gov.br/api/v3/malhas";
const TSE_ELECTORATE_PROFILE_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2026.zip";
const ELECTORATE_PROFILE_DUPLICATE_FACTOR = 2;
const OUTPUT_ROOT = path.join(
  process.cwd(),
  "public/data/election/2026/president/turn-1",
);
const GEO_ROOT = path.join(process.cwd(), "public/data/geo");

const CANDIDATES = {
  lula: {
    candidateNumber: "13",
    candidateSequence: "280002542548",
  },
  flavio: {
    candidateNumber: "22",
    candidateSequence: "280002551544",
  },
};

const STATE_IBGE_BY_UF = {
  RO: "11",
  AC: "12",
  AM: "13",
  RR: "14",
  PA: "15",
  AP: "16",
  TO: "17",
  MA: "21",
  PI: "22",
  CE: "23",
  RN: "24",
  PB: "25",
  PE: "26",
  AL: "27",
  SE: "28",
  BA: "29",
  MG: "31",
  ES: "32",
  RJ: "33",
  SP: "35",
  PR: "41",
  SC: "42",
  RS: "43",
  MS: "50",
  MT: "51",
  GO: "52",
  DF: "53",
};

const REGION_BY_UF = {
  AC: "norte",
  AL: "nordeste",
  AM: "norte",
  AP: "norte",
  BA: "nordeste",
  CE: "nordeste",
  DF: "centro-oeste",
  ES: "sudeste",
  GO: "centro-oeste",
  MA: "nordeste",
  MG: "sudeste",
  MS: "centro-oeste",
  MT: "centro-oeste",
  PA: "norte",
  PB: "nordeste",
  PE: "nordeste",
  PI: "nordeste",
  PR: "sul",
  RJ: "sudeste",
  RN: "nordeste",
  RO: "norte",
  RR: "norte",
  RS: "sul",
  SC: "sul",
  SE: "nordeste",
  SP: "sudeste",
  TO: "norte",
};

function parseNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  return Number(String(value).replace(".", "").replace(",", "."));
}

function toIsoDate(date, time) {
  if (!date || !time) {
    return new Date().toISOString();
  }

  const [day, month, year] = String(date).split("/");
  return `${year}-${month}-${day}T${time}-03:00`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "eleicoes-2026-dashboard/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`);
}

async function downloadFile(url, filePath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "eleicoes-2026-dashboard/0.1",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      isQuoted = !isQuoted;
      continue;
    }

    if (char === ";" && !isQuoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);

  return cells;
}

function addBucketValue(bucket, rawLabel, value) {
  const label = String(rawLabel || "Não informado").trim();

  if (!label) {
    bucket["Não informado"] = (bucket["Não informado"] ?? 0) + value;
    return;
  }

  bucket[label] = (bucket[label] ?? 0) + value;
}

function createElectorateProfile(municipality) {
  return {
    id: municipality.ibgeCode,
    ibgeCode: municipality.ibgeCode,
    tseCode: municipality.tseCode,
    name: municipality.name,
    uf: municipality.uf,
    region: municipality.region,
    total: 0,
    byGender: {},
    byAge: {},
    byEducation: {},
  };
}

function normalizeElectorateProfile(profile) {
  if (ELECTORATE_PROFILE_DUPLICATE_FACTOR === 1) {
    return profile;
  }

  function normalizeBucket(bucket) {
    for (const [label, value] of Object.entries(bucket)) {
      bucket[label] = value / ELECTORATE_PROFILE_DUPLICATE_FACTOR;
    }
  }

  profile.total /= ELECTORATE_PROFILE_DUPLICATE_FACTOR;
  normalizeBucket(profile.byGender);
  normalizeBucket(profile.byAge);
  normalizeBucket(profile.byEducation);

  return profile;
}

async function generateElectorateProfiles(municipalitiesConfig) {
  const sourceUrl = TSE_ELECTORATE_PROFILE_URL;
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "eleitorado-2026-"));
  const zipPath = path.join(tmpRoot, "perfil_eleitorado_2026.zip");
  const configByTseKey = new Map(
    municipalitiesConfig.map((municipality) => [
      `${municipality.uf}:${municipality.tseCode}`,
      municipality,
    ]),
  );
  const profilesByKey = new Map();
  let generatedAt = "";
  let unmatchedRows = 0;
  let parsedRows = 0;

  try {
    console.log("Baixando perfil do eleitorado TSE...");
    await downloadFile(sourceUrl, zipPath);

    console.log("Agregando perfil do eleitorado por município...");
    const unzip = spawn("unzip", ["-p", zipPath], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    unzip.stdout.setEncoding("latin1");

    const reader = createInterface({
      input: unzip.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    let header = null;
    let indexes = null;

    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      const cells = parseCsvLine(line);

      if (!header) {
        header = cells;
        indexes = Object.fromEntries(cells.map((name, index) => [name, index]));
        continue;
      }

      const uf = cells[indexes.SG_UF]?.toUpperCase();
      const tseCode = String(cells[indexes.CD_MUNICIPIO] ?? "").padStart(5, "0");
      const municipality = configByTseKey.get(`${uf}:${tseCode}`);
      const voters = parseNumber(cells[indexes.QT_ELEITORES]);

      if (!municipality || voters <= 0) {
        unmatchedRows += 1;
        continue;
      }

      if (!generatedAt) {
        generatedAt = toIsoDate(cells[indexes.DT_GERACAO], cells[indexes.HH_GERACAO]);
      }

      const profileKey = municipality.ibgeCode;
      const profile =
        profilesByKey.get(profileKey) ?? createElectorateProfile(municipality);

      profile.total += voters;
      addBucketValue(profile.byGender, cells[indexes.DS_GENERO], voters);
      addBucketValue(profile.byAge, cells[indexes.DS_FAIXA_ETARIA], voters);
      addBucketValue(profile.byEducation, cells[indexes.DS_GRAU_ESCOLARIDADE], voters);
      profilesByKey.set(profileKey, profile);

      parsedRows += 1;

      if (parsedRows % 500000 === 0) {
        console.log(`Linhas de eleitorado agregadas: ${parsedRows}`);
      }
    }

    await new Promise((resolve, reject) => {
      unzip.on("error", reject);
      unzip.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`unzip exited with code ${code}`));
        }
      });
    });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }

  return {
    metadata: {
      appGeneratedAt: new Date().toISOString(),
      generatedAt,
      source: "tse-eleitorado",
      sourceUrl,
      normalization: {
        duplicateFactor: ELECTORATE_PROFILE_DUPLICATE_FACTOR,
      },
      profiles: profilesByKey.size,
      unmatchedRows,
    },
    profiles: [...profilesByKey.values()]
      .map(normalizeElectorateProfile)
      .sort((a, b) =>
        `${a.uf}-${a.name}`.localeCompare(`${b.uf}-${b.name}`, "pt-BR"),
      ),
  };
}

function flattenMunicipalConfig(config) {
  return config.abr.flatMap((state) => {
    const uf = state.cd.toUpperCase();

    return state.mu.map((municipality) => ({
      uf,
      stateName: state.ds,
      tseCode: municipality.cd,
      ibgeCode: municipality.cdi,
      name: municipality.nm,
      region: REGION_BY_UF[uf],
      zones: municipality.z ?? [],
    }));
  });
}

function extractComparedResult(ea20) {
  const candidates = {};
  const identities = {};

  for (const office of ea20.carg ?? []) {
    for (const aggregation of office.agr ?? []) {
      for (const party of aggregation.par ?? []) {
        for (const candidate of party.cand ?? []) {
          for (const [key, expected] of Object.entries(CANDIDATES)) {
            const sequenceMatches =
              String(candidate.sqcand) === expected.candidateSequence;
            const numberMatches = String(candidate.n) === expected.candidateNumber;

            if (!sequenceMatches && !numberMatches) {
              continue;
            }

            candidates[key] = {
              candidateSequence: String(candidate.sqcand),
              candidateNumber: String(candidate.n),
              votes: parseNumber(candidate.vap),
              percentage: parseNumber(candidate.pvapn ?? candidate.pvap),
            };

            identities[key] = {
              key,
              electionId: String(ea20.ele),
              officeCode: String(office.cd).padStart(4, "0"),
              candidateNumber: String(candidate.n),
              candidateSequence: String(candidate.sqcand),
              fullName: candidate.nm,
              ballotName: candidate.nmu,
              partyAcronym: party.sg,
            };
          }
        }
      }
    }
  }

  if (!candidates.lula || !candidates.flavio) {
    throw new Error(`Missing compared candidates in ${ea20.tpabr}:${ea20.cdabr}`);
  }

  const leader =
    candidates.lula.votes >= candidates.flavio.votes ? "lula" : "flavio";
  const marginPercentagePoints = Math.abs(
    candidates.lula.percentage - candidates.flavio.percentage,
  );

  return {
    results: candidates,
    identities,
    leader,
    marginPercentagePoints,
    sourceGeneratedAt: toIsoDate(ea20.dg, ea20.hg),
    aggregationStatus: ea20.and,
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );

  return results;
}

function enrichStateGeoJson(geoJson) {
  const ufByIbge = Object.fromEntries(
    Object.entries(STATE_IBGE_BY_UF).map(([uf, ibge]) => [ibge, uf]),
  );

  geoJson.features = geoJson.features.map((feature) => {
    const ibgeCode = String(feature.properties.codarea);
    const uf = ufByIbge[ibgeCode];

    return {
      ...feature,
      id: uf,
      properties: {
        ...feature.properties,
        ibgeCode,
        uf,
      },
    };
  });

  return geoJson;
}

function enrichMunicipalityGeoJson(geoJson) {
  geoJson.features = geoJson.features.map((feature) => {
    const ibgeCode = String(feature.properties.codarea);

    return {
      ...feature,
      id: ibgeCode,
      properties: {
        ...feature.properties,
        ibgeCode,
      },
    };
  });

  return geoJson;
}

async function main() {
  const warnings = [];
  const sourceUrls = [];

  await mkdir(path.join(OUTPUT_ROOT, "municipalities"), { recursive: true });
  await mkdir(path.join(GEO_ROOT, "municipalities"), { recursive: true });

  const configUrl = `${TSE_BASE_URL}/comum/config/ele-c.json`;
  sourceUrls.push(configUrl);
  const electionConfig = await fetchJson(configUrl);

  const federalElection =
    electionConfig.pl
      ?.flatMap((pleito) => pleito.e ?? [])
      .find((election) => String(election.cd) === "6257") ??
    electionConfig.pl?.flatMap((pleito) => pleito.e ?? []).find((election) => {
      return (
        String(election.tp) === "8" &&
        String(election.t) === "1" &&
        election.abr?.some((scope) =>
          scope.cp?.some((office) => String(office.cd) === "1"),
        )
      );
    });

  if (!federalElection) {
    throw new Error("Federal presidential election was not found in EA11");
  }

  const cycle = electionConfig.c || "ele2026";
  const electionId = String(federalElection.cd);
  const paddedElectionId = electionId.padStart(6, "0");
  const officeCode = "0001";
  const municipalityConfigUrl = `${TSE_BASE_URL}/${cycle}/${electionId}/config/mun-e${paddedElectionId}-cm.json`;
  const nationalUrl = `${TSE_BASE_URL}/${cycle}/${electionId}/dados/br/br-c${officeCode}-e${paddedElectionId}-u.json`;
  sourceUrls.push(municipalityConfigUrl, nationalUrl);

  const [municipalityConfig, nationalResult] = await Promise.all([
    fetchJson(municipalityConfigUrl),
    fetchJson(nationalUrl),
  ]);

  const nationalComparison = extractComparedResult(nationalResult);
  const municipalitiesConfig = flattenMunicipalConfig(municipalityConfig).filter(
    (municipality) => municipality.region,
  );
  sourceUrls.push(TSE_ELECTORATE_PROFILE_URL);

  console.log(`Municípios no EA12: ${municipalitiesConfig.length}`);

  const states = await runPool(Object.keys(STATE_IBGE_BY_UF), 8, async (uf) => {
    const lowerUf = uf.toLowerCase();
    const url = `${TSE_BASE_URL}/${cycle}/${electionId}/dados/${lowerUf}/${lowerUf}-c${officeCode}-e${paddedElectionId}-u.json`;
    const result = extractComparedResult(await fetchJson(url));
    const municipalitiesCount = municipalitiesConfig.filter(
      (municipality) => municipality.uf === uf,
    ).length;

    return {
      uf,
      ibgeCode: STATE_IBGE_BY_UF[uf],
      name: municipalitiesConfig.find((municipality) => municipality.uf === uf)
        ?.stateName,
      region: REGION_BY_UF[uf],
      municipalitiesCount,
      ...result,
    };
  });

  let processed = 0;
  const failedMunicipalities = [];
  const municipalities = (
    await runPool(municipalitiesConfig, 24, async (municipality) => {
      const lowerUf = municipality.uf.toLowerCase();
      const url = `${TSE_BASE_URL}/${cycle}/${electionId}/dados/${lowerUf}/${lowerUf}${municipality.tseCode}-c${officeCode}-e${paddedElectionId}-u.json`;

      try {
        const result = extractComparedResult(await fetchJson(url));
        processed += 1;

        if (processed % 250 === 0) {
          console.log(`Resultados municipais processados: ${processed}`);
        }

        return {
          id: municipality.ibgeCode,
          ibgeCode: municipality.ibgeCode,
          tseCode: municipality.tseCode,
          name: municipality.name,
          uf: municipality.uf,
          region: municipality.region,
          ...result,
        };
      } catch (error) {
        failedMunicipalities.push({
          ...municipality,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })
  ).filter(Boolean);

  if (failedMunicipalities.length > 0) {
    warnings.push(`${failedMunicipalities.length} municípios não foram processados.`);
  }

  const metadata = {
    generatedAt: nationalComparison.sourceGeneratedAt,
    appGeneratedAt: new Date().toISOString(),
    source: "tse-divulgacao",
    environment: "oficial",
    cycle,
    electionId,
    officeCode,
    officeName: "Presidente",
    turn: Number(nationalResult.t),
    aggregationStatus: nationalResult.and,
    sourceUrls,
    candidates: nationalComparison.identities,
    summary: {
      states: states.length,
      municipalities: municipalities.length,
      failedMunicipalities: failedMunicipalities.length,
      warnings,
    },
  };

  await writeJson(path.join(OUTPUT_ROOT, "metadata.json"), metadata);
  await writeJson(path.join(OUTPUT_ROOT, "states.json"), states);
  await writeJson(path.join(OUTPUT_ROOT, "municipalities-index.json"), {
    metadata: {
      appGeneratedAt: metadata.appGeneratedAt,
      cycle,
      electionId,
      environment: "oficial",
      officeCode,
      source: "tse-divulgacao",
      turn: metadata.turn,
    },
    municipalities,
  });

  try {
    const electorateProfiles =
      await generateElectorateProfiles(municipalitiesConfig);
    await writeJson(
      path.join(OUTPUT_ROOT, "electorate-profile.json"),
      electorateProfiles,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Perfil do eleitorado não processado.";
    warnings.push(`Perfil do eleitorado não foi processado: ${message}`);
    console.warn(message);
  }

  for (const uf of Object.keys(STATE_IBGE_BY_UF)) {
    await writeJson(
      path.join(OUTPUT_ROOT, "municipalities", `${uf.toLowerCase()}.json`),
      {
        metadata: {
          appGeneratedAt: metadata.appGeneratedAt,
          cycle,
          electionId,
          environment: "oficial",
          officeCode,
          source: "tse-divulgacao",
          turn: metadata.turn,
        },
        municipalities: municipalities.filter(
          (municipality) => municipality.uf === uf,
        ),
      },
    );
  }

  console.log("Baixando malhas IBGE...");
  const statesGeoJson = enrichStateGeoJson(
    await fetchJson(
      `${IBGE_MALHAS_URL}/paises/BR?intrarregiao=UF&formato=application/vnd.geo+json&qualidade=minima`,
    ),
  );
  await writeJson(path.join(GEO_ROOT, "states.geojson"), statesGeoJson);

  await runPool(Object.entries(STATE_IBGE_BY_UF), 4, async ([uf, ibgeCode]) => {
    const geoJson = enrichMunicipalityGeoJson(
      await fetchJson(
        `${IBGE_MALHAS_URL}/estados/${ibgeCode}?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima`,
      ),
    );
    await writeJson(
      path.join(GEO_ROOT, "municipalities", `${uf.toLowerCase()}.geojson`),
      geoJson,
    );
  });

  console.log("Resumo:");
  console.log(`Estados processados: ${states.length}`);
  console.log(`Municípios processados: ${municipalities.length}`);
  console.log(`Mappings TSE -> IBGE encontrados: ${municipalitiesConfig.length}`);
  console.log(`Erros: ${failedMunicipalities.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
