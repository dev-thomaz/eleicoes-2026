import type {
  CandidateKey,
  LeaderFilter,
  MunicipalityResult,
  Region,
  StateResult,
} from "./types";

export function getLeader<
  T extends { results: Record<CandidateKey, { votes: number }> },
>(result: T): CandidateKey {
  return result.results.lula.votes >= result.results.flavio.votes
    ? "lula"
    : "flavio";
}

export function getMarginPercentagePoints<
  T extends { results: Record<CandidateKey, { percentage: number }> },
>(result: T) {
  return Math.abs(result.results.lula.percentage - result.results.flavio.percentage);
}

export function filterMunicipalities(
  municipalities: MunicipalityResult[],
  filters: {
    region: Region | "all";
    uf: string;
    leader: LeaderFilter;
    query: string;
  },
) {
  return municipalities.filter((municipality) => {
    if (filters.region !== "all" && municipality.region !== filters.region) {
      return false;
    }

    if (filters.uf && municipality.uf !== filters.uf) {
      return false;
    }

    if (filters.leader !== "all" && municipality.leader !== filters.leader) {
      return false;
    }

    if (
      filters.query &&
      !`${municipality.name} ${municipality.uf} ${municipality.ibgeCode}`
        .toLowerCase()
        .includes(filters.query)
    ) {
      return false;
    }

    return true;
  });
}

export function filterStates(
  states: StateResult[],
  filters: {
    region: Region | "all";
    uf: string;
    leader: LeaderFilter;
  },
) {
  return states.filter((state) => {
    if (filters.region !== "all" && state.region !== filters.region) {
      return false;
    }

    if (filters.uf && state.uf !== filters.uf) {
      return false;
    }

    if (filters.leader !== "all" && state.leader !== filters.leader) {
      return false;
    }

    return true;
  });
}
