import type {
  CandidateIdentity,
  CandidateKey,
  CandidateResult,
  ElectionMetadata,
  ElectorateProfile,
  ElectorateProfileDataset,
  MunicipalityDataset,
  MunicipalityResult,
  Region,
  StateResult,
} from "./types";

const DATA_ROOT = "/data/election/2026/president";
const CANDIDATE_NUMBER: Record<CandidateKey, string> = {
  lula: "13",
  flavio: "22",
};

type TurnTwoCandidate = CandidateResult & {
  fullName: string;
  ballotName: string;
  partyAcronym: string;
  status: string;
};

type TurnTwoArea = {
  ibgeCode: string;
  name: string;
  region: Region | null;
  generatedAt: string;
  aggregationStatus: string;
  sections: NonNullable<StateResult["sections"]>;
  electorate: NonNullable<StateResult["electorate"]>;
  candidates: TurnTwoCandidate[];
};

type TurnTwoState = TurnTwoArea & {
  uf: string;
  municipalitiesCount: number;
};

type TurnTwoMunicipality = TurnTwoArea & {
  id: string;
  tseCode: string;
  uf: string;
};

type TurnTwoMetadata = {
  generatedAt: string;
  appGeneratedAt: string;
  source: "tse-divulgacao";
  environment: "oficial";
  cycle: string;
  electionId: string;
  officeCode: string;
  officeName: string;
  turn: 2;
  sourceUrls: string[];
  summary: ElectionMetadata["summary"];
};

type TurnTwoNational = TurnTwoArea & {
  candidates: TurnTwoCandidate[];
};

type TurnTwoMunicipalityDataset = {
  municipalities: TurnTwoMunicipality[];
};

export interface ElectionTurnDataset {
  metadata: ElectionMetadata;
  states: StateResult[];
  municipalities: MunicipalityResult[];
  electorateProfiles: ElectorateProfile[];
  electorateProfileError: string;
}

function getCandidateKey(candidateNumber: string): CandidateKey | null {
  if (candidateNumber === CANDIDATE_NUMBER.lula) return "lula";
  if (candidateNumber === CANDIDATE_NUMBER.flavio) return "flavio";
  return null;
}

function toCandidateIdentity(
  candidate: TurnTwoCandidate,
  metadata: TurnTwoMetadata,
): CandidateIdentity {
  const key = getCandidateKey(candidate.candidateNumber);
  if (!key) throw new Error(`Candidato não suportado: ${candidate.candidateNumber}`);

  return {
    key,
    electionId: metadata.electionId,
    officeCode: metadata.officeCode,
    candidateNumber: candidate.candidateNumber,
    candidateSequence: candidate.candidateSequence,
    fullName: candidate.fullName,
    ballotName: candidate.ballotName,
    partyAcronym: candidate.partyAcronym,
  };
}

function normalizeCandidates(candidates: TurnTwoCandidate[]) {
  const results: Partial<Record<CandidateKey, CandidateResult>> = {};

  for (const candidate of candidates) {
    const key = getCandidateKey(candidate.candidateNumber);
    if (key) {
      results[key] = {
        candidateSequence: candidate.candidateSequence,
        candidateNumber: candidate.candidateNumber,
        votes: candidate.votes,
        percentage: candidate.percentage,
      };
    }
  }

  if (!results.lula || !results.flavio) {
    throw new Error("Os dados do turno não incluem os dois candidatos esperados.");
  }

  const leader: CandidateKey = results.lula.votes >= results.flavio.votes ? "lula" : "flavio";

  return {
    results: { lula: results.lula, flavio: results.flavio },
    leader,
    marginPercentagePoints: Math.abs(
      results.lula.percentage - results.flavio.percentage,
    ),
  };
}

function normalizeTurnTwoState(state: TurnTwoState): StateResult {
  return {
    ...normalizeCandidates(state.candidates),
    uf: state.uf,
    ibgeCode: state.ibgeCode,
    name: state.name,
    region: state.region as Region,
    municipalitiesCount: state.municipalitiesCount,
    sourceGeneratedAt: state.generatedAt,
    aggregationStatus: state.aggregationStatus,
    sections: state.sections,
    electorate: state.electorate,
  };
}

function normalizeTurnTwoMunicipality(
  municipality: TurnTwoMunicipality,
): MunicipalityResult {
  return {
    ...normalizeCandidates(municipality.candidates),
    id: municipality.id,
    ibgeCode: municipality.ibgeCode,
    tseCode: municipality.tseCode,
    name: municipality.name,
    uf: municipality.uf,
    region: municipality.region as Region,
    sourceGeneratedAt: municipality.generatedAt,
    aggregationStatus: municipality.aggregationStatus,
    sections: municipality.sections,
    electorate: municipality.electorate,
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Não foi possível carregar ${url}.`);
  return response.json() as Promise<T>;
}

async function loadProfiles(signal: AbortSignal) {
  try {
    const dataset = await fetchJson<ElectorateProfileDataset>(
      `${DATA_ROOT}/turn-1/electorate-profile.json`,
      signal,
    );
    return { profiles: dataset.profiles, error: "" };
  } catch {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return { profiles: [], error: "Perfil do eleitorado ainda não foi gerado." };
  }
}

async function loadFirstTurn(signal: AbortSignal): Promise<ElectionTurnDataset> {
  const [metadata, states, municipalities, profiles] = await Promise.all([
    fetchJson<ElectionMetadata>(`${DATA_ROOT}/turn-1/metadata.json`, signal),
    fetchJson<StateResult[]>(`${DATA_ROOT}/turn-1/states.json`, signal),
    fetchJson<MunicipalityDataset>(
      `${DATA_ROOT}/turn-1/municipalities-index.json`,
      signal,
    ),
    loadProfiles(signal),
  ]);

  return {
    metadata,
    states,
    municipalities: municipalities.municipalities,
    electorateProfiles: profiles.profiles,
    electorateProfileError: profiles.error,
  };
}

async function loadSecondTurn(signal: AbortSignal): Promise<ElectionTurnDataset> {
  const root = `${DATA_ROOT}/turn-2`;
  const [metadata, national, states, municipalities, profiles] = await Promise.all([
    fetchJson<TurnTwoMetadata>(`${root}/metadata.json`, signal),
    fetchJson<TurnTwoNational>(`${root}/national.json`, signal),
    fetchJson<TurnTwoState[]>(`${root}/states.json`, signal),
    fetchJson<TurnTwoMunicipalityDataset>(
      `${root}/municipalities-index.json`,
      signal,
    ),
    loadProfiles(signal),
  ]);
  const identities: Partial<Record<CandidateKey, CandidateIdentity>> = {};

  for (const candidate of national.candidates) {
    const identity = toCandidateIdentity(candidate, metadata);
    identities[identity.key] = identity;
  }

  if (!identities.lula || !identities.flavio) {
    throw new Error("Os dados do segundo turno não incluem os dois candidatos esperados.");
  }

  const normalizedMetadata: ElectionMetadata = {
    ...metadata,
    aggregationStatus: national.aggregationStatus,
    candidates: { lula: identities.lula, flavio: identities.flavio },
  };

  return {
    metadata: normalizedMetadata,
    states: states.map(normalizeTurnTwoState),
    municipalities: municipalities.municipalities.map(normalizeTurnTwoMunicipality),
    electorateProfiles: profiles.profiles,
    electorateProfileError: profiles.error,
  };
}

export function loadElectionTurnData(
  turn: 1 | 2,
  signal: AbortSignal,
): Promise<ElectionTurnDataset> {
  return turn === 2 ? loadSecondTurn(signal) : loadFirstTurn(signal);
}
