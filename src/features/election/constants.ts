import type { CandidateKey, Region } from "./types";

export const CANDIDATE_LABEL: Record<CandidateKey, string> = {
  lula: "Lula",
  flavio: "Flávio Bolsonaro",
};

export const CANDIDATE_COLORS: Record<CandidateKey, string> = {
  lula: "#C1121F",
  flavio: "#2E7D32",
};

export const CAPITAL_NAME_BY_UF: Record<string, string> = {
  AC: "Rio Branco",
  AL: "Maceió",
  AM: "Manaus",
  AP: "Macapá",
  BA: "Salvador",
  CE: "Fortaleza",
  DF: "Brasília",
  ES: "Vitória",
  GO: "Goiânia",
  MA: "São Luís",
  MG: "Belo Horizonte",
  MS: "Campo Grande",
  MT: "Cuiabá",
  PA: "Belém",
  PB: "João Pessoa",
  PE: "Recife",
  PI: "Teresina",
  PR: "Curitiba",
  RJ: "Rio de Janeiro",
  RN: "Natal",
  RO: "Porto Velho",
  RR: "Boa Vista",
  RS: "Porto Alegre",
  SC: "Florianópolis",
  SE: "Aracaju",
  SP: "São Paulo",
  TO: "Palmas",
};

export const REGION_LABEL: Record<Region, string> = {
  norte: "Norte",
  nordeste: "Nordeste",
  "centro-oeste": "Centro-Oeste",
  sudeste: "Sudeste",
  sul: "Sul",
};

export const REGION_BY_UF: Record<string, Region> = {
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

export const STATE_IBGE_BY_UF: Record<string, string> = {
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

export const UF_BY_STATE_IBGE = Object.fromEntries(
  Object.entries(STATE_IBGE_BY_UF).map(([uf, ibge]) => [ibge, uf]),
) as Record<string, string>;

export const UF_ORDER = Object.keys(STATE_IBGE_BY_UF);
