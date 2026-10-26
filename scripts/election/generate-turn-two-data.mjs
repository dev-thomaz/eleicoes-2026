import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TSE_BASE_URL = "https://resultados.tse.jus.br/oficial";
const CYCLE = "ele2026";
const ELECTION_ID = "6258";
const PADDED_ELECTION_ID = ELECTION_ID.padStart(6, "0");
const ELECTION_CODE = "3221";
const OFFICE_CODE = "0001";
const OUTPUT_ROOT = path.join(
  process.cwd(),
  "public/data/election/2026/president/turn-2",
);
const REQUEST_INTERVAL_MS = 50;
const MAX_FETCH_ATTEMPTS = 6;
const FETCH_TIMEOUT_MS = 30_000;

let nextRequestAt = 0;
let retryAfterAt = 0;

const STATE_IBGE_BY_UF = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27",
  SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41",
  SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

const REGION_BY_UF = {
  AC: "norte", AL: "nordeste", AM: "norte", AP: "norte", BA: "nordeste",
  CE: "nordeste", DF: "centro-oeste", ES: "sudeste", GO: "centro-oeste",
  MA: "nordeste", MG: "sudeste", MS: "centro-oeste", MT: "centro-oeste",
  PA: "norte", PB: "nordeste", PE: "nordeste", PI: "nordeste", PR: "sul",
  RJ: "sudeste", RN: "nordeste", RO: "norte", RR: "norte", RS: "sul",
  SC: "sul", SE: "nordeste", SP: "sudeste", TO: "norte",
};

function parseNumber(value, decimal = false) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const text = String(value);
  if (text.includes(",")) {
    return Number(text.replace(/\./g, "").replace(",", "."));
  }
  return Number(decimal ? text : text.replace(/\./g, ""));
}

function toIsoDate(date, time) {
  if (!date || !time) return new Date().toISOString();
  const [day, month, year] = String(date).split("/");
  return `${year}-${month}-${day}T${time}-03:00`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRequestSlot() {
  while (true) {
    const now = Date.now();
    const requestAt = Math.max(now, nextRequestAt, retryAfterAt);
    nextRequestAt = requestAt + REQUEST_INTERVAL_MS;
    if (requestAt > now) await wait(requestAt - now);
    if (Date.now() >= retryAfterAt) return;
  }
}

function retryDelay(response, attempt) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }

  if (response?.status === 429) return 60_000;
  return Math.min(30_000, 1_000 * 2 ** attempt);
}

async function fetchJson(url) {
  let lastError;

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    await waitForRequestSlot();

    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": "eleicoes-2026-dashboard/0.1" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt === MAX_FETCH_ATTEMPTS - 1) break;
      await wait(retryDelay(null, attempt));
      continue;
    }

    if (response.ok) return response.json();

    lastError = new Error(`HTTP ${response.status} for ${url}`);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_FETCH_ATTEMPTS - 1) break;
    const delay = retryDelay(response, attempt);
    if (response.status === 429) {
      if (Date.now() >= retryAfterAt) {
        console.warn(`TSE respondeu HTTP 429; aguardando ${Math.ceil(delay / 1000)}s.`);
      }
      retryAfterAt = Math.max(retryAfterAt, Date.now() + delay);
    }
    await wait(delay);
  }

  throw lastError;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`);
}

function flattenMunicipalityConfig(config) {
  return (config.abr ?? []).flatMap((state) => {
    const uf = String(state.cd).toUpperCase();
    const region = REGION_BY_UF[uf];
    if (!region) return [];

    return (state.mu ?? []).map((municipality) => ({
      id: String(municipality.cdi),
      ibgeCode: String(municipality.cdi),
      tseCode: String(municipality.cd).padStart(5, "0"),
      name: String(municipality.nm),
      uf,
      region,
    }));
  });
}

function extractCandidateResults(payload) {
  const candidates = [];

  for (const office of payload.carg ?? []) {
    for (const aggregation of office.agr ?? []) {
      for (const party of aggregation.par ?? []) {
        for (const candidate of party.cand ?? []) {
          candidates.push({
            candidateSequence: String(candidate.sqcand ?? ""),
            candidateNumber: String(candidate.n ?? ""),
            fullName: String(candidate.nm ?? ""),
            ballotName: String(candidate.nmu ?? ""),
            partyAcronym: String(party.sg ?? ""),
            votes: parseNumber(candidate.vap),
            percentage: parseNumber(candidate.pvapn ?? candidate.pvap, true),
            status: String(candidate.st ?? ""),
          });
        }
      }
    }
  }

  return candidates;
}

function normalizeAreaResult(payload, identity) {
  return {
    ...identity,
    generatedAt: toIsoDate(payload.dg, payload.hg),
    aggregationStatus: String(payload.and ?? ""),
    sections: {
      total: parseNumber(payload.s?.ts),
      totalized: parseNumber(payload.s?.st),
      notTotalized: parseNumber(payload.s?.snt),
      totalizedPercentage: parseNumber(payload.s?.pstn ?? payload.s?.pst),
    },
    electorate: {
      eligible: parseNumber(payload.e?.te),
      turnout: parseNumber(payload.e?.c),
      turnoutPercentage: parseNumber(payload.e?.pcn ?? payload.e?.pc),
      abstentions: parseNumber(payload.e?.a),
      abstentionPercentage: parseNumber(payload.e?.pan ?? payload.e?.pa),
    },
    candidates: extractCandidateResults(payload),
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );
  return results;
}

async function main() {
  const configUrl = `${TSE_BASE_URL}/${CYCLE}/${ELECTION_ID}/config/mun-e${PADDED_ELECTION_ID}-cm.json`;
  const config = await fetchJson(configUrl);
  const municipalitiesConfig = flattenMunicipalityConfig(config);
  const failedMunicipalities = [];

  console.log(`Municípios no segundo turno: ${municipalitiesConfig.length}`);

  const states = await runPool(Object.entries(STATE_IBGE_BY_UF), 8, async ([uf, ibgeCode]) => {
    const lowerUf = uf.toLowerCase();
    const url = `${TSE_BASE_URL}/${CYCLE}/${ELECTION_ID}/dados/${lowerUf}/${lowerUf}-c${OFFICE_CODE}-e${PADDED_ELECTION_ID}-u.json`;
    const payload = await fetchJson(url);
    const municipalityCount = municipalitiesConfig.filter((item) => item.uf === uf).length;
    return normalizeAreaResult(payload, {
      uf,
      ibgeCode,
      name: config.abr.find((item) => String(item.cd).toUpperCase() === uf)?.ds ?? uf,
      region: REGION_BY_UF[uf],
      municipalitiesCount: municipalityCount,
    });
  });

  let processed = 0;
  const municipalities = (await runPool(municipalitiesConfig, 24, async (municipality) => {
    const lowerUf = municipality.uf.toLowerCase();
    const url = `${TSE_BASE_URL}/${CYCLE}/${ELECTION_ID}/dados/${lowerUf}/${lowerUf}${municipality.tseCode}-c${OFFICE_CODE}-e${PADDED_ELECTION_ID}-u.json`;

    try {
      const payload = await fetchJson(url);
      processed += 1;
      if (processed % 500 === 0) {
        console.log(`Municípios processados: ${processed}`);
      }
      return normalizeAreaResult(payload, municipality);
    } catch (error) {
      failedMunicipalities.push({
        ...municipality,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  })).filter(Boolean);

  const nationalUrl = `${TSE_BASE_URL}/${CYCLE}/${ELECTION_ID}/dados/br/br-c${OFFICE_CODE}-e${PADDED_ELECTION_ID}-u.json`;
  const national = normalizeAreaResult(await fetchJson(nationalUrl), {
    uf: "BR",
    ibgeCode: "BR",
    name: "Brasil",
    region: null,
  });
  const generatedAt = national.generatedAt;
  const metadata = {
    generatedAt,
    appGeneratedAt: new Date().toISOString(),
    source: "tse-divulgacao",
    environment: "oficial",
    cycle: CYCLE,
    electionId: ELECTION_ID,
    electionCode: ELECTION_CODE,
    officeCode: OFFICE_CODE,
    officeName: "Presidente",
    turn: 2,
    sourceUrls: [configUrl, nationalUrl],
    summary: {
      states: states.length,
      municipalities: municipalities.length,
      failedMunicipalities: failedMunicipalities.length,
      warnings: failedMunicipalities.length
        ? [`${failedMunicipalities.length} municípios não foram processados.`]
        : [],
    },
  };

  await writeJson(path.join(OUTPUT_ROOT, "metadata.json"), metadata);
  await writeJson(path.join(OUTPUT_ROOT, "national.json"), national);
  await writeJson(path.join(OUTPUT_ROOT, "states.json"), states);
  await writeJson(path.join(OUTPUT_ROOT, "municipalities-index.json"), {
    metadata: {
      appGeneratedAt: metadata.appGeneratedAt,
      cycle: CYCLE,
      electionId: ELECTION_ID,
      electionCode: ELECTION_CODE,
      environment: "oficial",
      officeCode: OFFICE_CODE,
      source: "tse-divulgacao",
      turn: 2,
    },
    municipalities,
  });

  for (const uf of Object.keys(STATE_IBGE_BY_UF)) {
    await writeJson(
      path.join(OUTPUT_ROOT, "municipalities", `${uf.toLowerCase()}.json`),
      {
        metadata: {
          appGeneratedAt: metadata.appGeneratedAt,
          electionId: ELECTION_ID,
          electionCode: ELECTION_CODE,
          turn: 2,
          source: "tse-divulgacao",
        },
        municipalities: municipalities.filter((item) => item.uf === uf),
      },
    );
  }

  console.log("Resumo do segundo turno:");
  console.log(`Estados processados: ${states.length}`);
  console.log(`Municípios processados: ${municipalities.length}`);
  console.log(`Municípios com falha: ${failedMunicipalities.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
