export type CandidateKey = "lula" | "flavio";

export type Region =
  | "norte"
  | "nordeste"
  | "centro-oeste"
  | "sudeste"
  | "sul";

export type ViewLevel = "states" | "detailed" | "municipalities";

export type LeaderFilter = CandidateKey | "all";

export interface CandidateIdentity {
  key: CandidateKey;
  electionId: string;
  officeCode: string;
  candidateNumber: string;
  candidateSequence: string;
  fullName: string;
  ballotName: string;
  partyAcronym: string;
}

export interface CandidateResult {
  candidateSequence: string;
  candidateNumber: string;
  votes: number;
  percentage: number;
}

export interface ComparedResult {
  results: Record<CandidateKey, CandidateResult>;
  leader: CandidateKey;
  marginPercentagePoints: number;
}

export interface StateResult extends ComparedResult {
  uf: string;
  ibgeCode: string;
  name: string;
  region: Region;
  municipalitiesCount: number;
  sourceGeneratedAt: string;
  aggregationStatus: "n" | "p" | "f" | string;
}

export interface MunicipalityResult extends ComparedResult {
  id: string;
  ibgeCode: string;
  tseCode: string;
  name: string;
  uf: string;
  region: Region;
  sourceGeneratedAt: string;
  aggregationStatus: "n" | "p" | "f" | string;
}

export interface ElectionMetadata {
  generatedAt: string;
  appGeneratedAt: string;
  source: "tse-divulgacao";
  environment: "oficial";
  cycle: string;
  electionId: string;
  officeCode: string;
  officeName: string;
  turn: 1 | 2;
  aggregationStatus: string;
  sourceUrls: string[];
  candidates: Record<CandidateKey, CandidateIdentity>;
  summary: {
    states: number;
    municipalities: number;
    failedMunicipalities: number;
    warnings: string[];
  };
}

export interface MunicipalityDataset {
  metadata: Pick<
    ElectionMetadata,
    | "appGeneratedAt"
    | "cycle"
    | "electionId"
    | "environment"
    | "officeCode"
    | "source"
    | "turn"
  >;
  municipalities: MunicipalityResult[];
}

export interface ElectorateProfile {
  id: string;
  ibgeCode: string;
  tseCode: string;
  name: string;
  uf: string;
  region: Region;
  total: number;
  byGender: Record<string, number>;
  byAge: Record<string, number>;
  byEducation: Record<string, number>;
}

export interface ElectorateProfileDataset {
  metadata: {
    appGeneratedAt: string;
    generatedAt: string;
    source: "tse-eleitorado";
    sourceUrl: string;
    normalization?: {
      duplicateFactor: number;
    };
    profiles: number;
    unmatchedRows: number;
  };
  profiles: ElectorateProfile[];
}

export interface FilterState {
  level: ViewLevel;
  region: Region | "all";
  uf: string;
  leader: LeaderFilter;
  municipality: string;
  query: string;
}
