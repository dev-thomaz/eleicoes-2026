"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CANDIDATE_COLORS,
  CANDIDATE_LABEL,
  REGION_LABEL,
  UF_ORDER,
} from "../constants";
import { filterMunicipalities, filterStates } from "../calculations";
import {
  formatMargin,
  formatPercentage,
  formatVotes,
  normalizeSearch,
} from "../formatters";
import type {
  CandidateKey,
  ElectionMetadata,
  ElectorateProfile,
  FilterState,
  LeaderFilter,
  MunicipalityResult,
  Region,
  StateResult,
  ViewLevel,
} from "../types";
import { loadElectionTurnData } from "../turn-data";
import { ElectionMap } from "./ElectionMap";
import { ElectorateProfilePanel } from "./ElectorateProfilePanel";

const PAGE_SIZE = 24;

type SortKey =
  | "name"
  | "lula-votes"
  | "flavio-votes"
  | "lula-percentage"
  | "flavio-percentage"
  | "margin-desc"
  | "margin-asc";
type RankingKey = "largest-lula" | "largest-flavio" | "balanced";
type ZoneBreakdown = {
  municipality: {
    tseCode: string;
    ibgeCode: string;
    name: string;
    uf: string;
  };
  zones: Array<{
    zoneCode: string;
    sourceGeneratedAt: string;
    aggregationStatus: string;
    sections: {
      total: number;
      totalized: number;
      notTotalized: number;
      totalizedPercentage: number;
    };
    electorate: {
      eligible: number;
      turnout: number;
      turnoutPercentage: number;
      abstentions: number;
      abstentionPercentage: number;
    };
    results: MunicipalityResult["results"];
    leader: CandidateKey;
    marginPercentagePoints: number;
  }>;
};

type TurnTwoZoneCandidate = {
  candidateSequence: string;
  candidateNumber: string;
  label: string;
  votes: number;
  percentage: number;
};

type TurnTwoZoneBreakdown = Omit<ZoneBreakdown, "zones"> & {
  zones: Array<
    Omit<ZoneBreakdown["zones"][number], "results" | "leader" | "marginPercentagePoints"> & {
      selectedCandidate: TurnTwoZoneCandidate;
      opponentCandidate?: TurnTwoZoneCandidate;
    }
  >;
};

function getParamLevel(value: string | null): ViewLevel {
  if (value === "detailed") {
    return "detailed";
  }

  return value === "municipalities" ? "municipalities" : "states";
}

function getParamRegion(value: string | null): Region | "all" {
  if (
    value === "norte" ||
    value === "nordeste" ||
    value === "centro-oeste" ||
    value === "sudeste" ||
    value === "sul"
  ) {
    return value;
  }

  return "all";
}

function getParamLeader(value: string | null): LeaderFilter {
  return value === "lula" || value === "flavio" ? value : "all";
}

function toDisplayDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getAggregationStatusLabel(status: string) {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "f") {
    return "Totalização finalizada";
  }

  if (normalizedStatus === "p") {
    return "Totalização parcial";
  }

  if (!normalizedStatus) {
    return "Totalização sem status";
  }

  return `Status ${status}`;
}

function getLeaderCounts<T extends { leader: CandidateKey }>(items: T[]) {
  return items.reduce(
    (acc, item) => {
      acc[item.leader] += 1;
      return acc;
    },
    { lula: 0, flavio: 0 } satisfies Record<CandidateKey, number>,
  );
}

function getSortedAreas(
  areas: Array<StateResult | MunicipalityResult>,
  sortKey: SortKey,
) {
  const sorted = [...areas];

  sorted.sort((a, b) => {
    if (sortKey === "name") {
      return `${a.uf}-${a.name}`.localeCompare(`${b.uf}-${b.name}`, "pt-BR");
    }

    if (sortKey === "margin-desc") {
      return b.marginPercentagePoints - a.marginPercentagePoints;
    }

    if (sortKey === "margin-asc") {
      return a.marginPercentagePoints - b.marginPercentagePoints;
    }

    const [candidate, metric] = sortKey.split("-") as [
      CandidateKey,
      "votes" | "percentage",
    ];
    return b.results[candidate][metric] - a.results[candidate][metric];
  });

  return sorted;
}

function getRanking(
  municipalities: MunicipalityResult[],
  ranking: RankingKey,
) {
  const sorted = [...municipalities];

  if (ranking === "largest-lula") {
    return sorted
      .filter((municipality) => municipality.leader === "lula")
      .sort((a, b) => b.marginPercentagePoints - a.marginPercentagePoints)
      .slice(0, 8);
  }

  if (ranking === "largest-flavio") {
    return sorted
      .filter((municipality) => municipality.leader === "flavio")
      .sort((a, b) => b.marginPercentagePoints - a.marginPercentagePoints)
      .slice(0, 8);
  }

  return sorted
    .sort((a, b) => a.marginPercentagePoints - b.marginPercentagePoints)
    .slice(0, 8);
}

export function ElectionDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedTurn = searchParams.get("turn") === "2" ? "2" : "1";

  function changeTurn(turn: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (turn === "2") {
      next.set("turn", "2");
      next.delete("leader");
      next.delete("candidate");
    } else {
      next.delete("turn");
      next.delete("candidate");
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      <div className="bg-[#f6f7f9] pt-4">
        <div className="mx-auto flex w-full max-w-[1480px] justify-end px-4 md:px-6 lg:px-8">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            Turno
            <select
              aria-label="Turno da eleição"
              value={selectedTurn}
              onChange={(event) => changeTurn(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
            >
              <option value="1">1º turno</option>
              <option value="2">2º turno</option>
            </select>
          </label>
        </div>
      </div>
      <ElectionResultsDashboard turn={selectedTurn === "2" ? 2 : 1} />
    </>
  );
}

function ElectionResultsDashboard({ turn }: { turn: 1 | 2 }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [metadata, setMetadata] = useState<ElectionMetadata | null>(null);
  const [states, setStates] = useState<StateResult[]>([]);
  const [municipalities, setMunicipalities] = useState<MunicipalityResult[]>([]);
  const [electorateProfiles, setElectorateProfiles] = useState<ElectorateProfile[]>([]);
  const [electorateProfileError, setElectorateProfileError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("margin-desc");
  const [ranking, setRanking] = useState<RankingKey>("balanced");
  const [mapFocusSelection, setMapFocusSelection] = useState<{
    turn: 1 | 2;
    value: CandidateKey | "leader";
  }>(() => ({ turn, value: "leader" }));
  const mapFocus = mapFocusSelection.turn === turn
    ? mapFocusSelection.value
    : "leader";
  const [zonesMunicipality, setZonesMunicipality] =
    useState<MunicipalityResult | null>(null);
  const [page, setPage] = useState(1);

  const filters: FilterState = useMemo(
    () => ({
      level: getParamLevel(searchParams.get("level")),
      region: getParamRegion(searchParams.get("region")),
      uf: searchParams.get("state")?.toUpperCase() ?? "",
      leader: getParamLeader(searchParams.get("leader")),
      municipality: searchParams.get("municipality") ?? "",
      query: searchParams.get("q") ?? "",
    }),
    [searchParams],
  );

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const currentSearch =
        typeof window === "undefined" ? searchParams.toString() : window.location.search;
      const next = new URLSearchParams(currentSearch);

      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === "all" || (key === "level" && value === "states")) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const resetFilters = useCallback(() => {
    const query = turn === 2 ? "?turn=2" : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  }, [pathname, router, turn]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadData() {
      try {
        setIsLoading(true);
        setError("");
        const dataset = await loadElectionTurnData(turn, controller.signal);
        if (cancelled) return;
        setMetadata(dataset.metadata);
        setStates(dataset.states);
        setMunicipalities(dataset.municipalities);
        setElectorateProfiles(dataset.electorateProfiles);
        setElectorateProfileError(dataset.electorateProfileError);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [turn]);

  const normalizedQuery = normalizeSearch(filters.query);

  const filteredMunicipalities = useMemo(() => {
    return filterMunicipalities(municipalities, {
      region: filters.region,
      uf: filters.uf,
      leader: filters.leader,
      query: "",
    }).filter((municipality) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeSearch(
        `${municipality.name} ${municipality.uf} ${municipality.ibgeCode}`,
      ).includes(normalizedQuery);
    });
  }, [filters.leader, filters.region, filters.uf, municipalities, normalizedQuery]);

  const mapMunicipalities = useMemo(() => {
    return filterMunicipalities(municipalities, {
      region: filters.region,
      uf: filters.uf,
      leader: "all",
      query: "",
    }).filter((municipality) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeSearch(
        `${municipality.name} ${municipality.uf} ${municipality.ibgeCode}`,
      ).includes(normalizedQuery);
    });
  }, [filters.region, filters.uf, municipalities, normalizedQuery]);

  const filteredStates = useMemo(
    () =>
      filterStates(states, {
        region: filters.region,
        uf: filters.uf,
        leader: filters.leader,
      }).filter((state) => {
        if (filters.level !== "states" || !normalizedQuery) return true;
        return normalizeSearch(`${state.name} ${state.uf} ${state.ibgeCode}`).includes(normalizedQuery);
      }),
    [filters.leader, filters.level, filters.region, filters.uf, normalizedQuery, states],
  );

  const mapStates = useMemo(
    () => filterStates(states, {
        region: filters.region,
        uf: filters.uf,
        leader: "all",
      }).filter((state) => {
        if (filters.level !== "states" || !normalizedQuery) return true;
        return normalizeSearch(`${state.name} ${state.uf} ${state.ibgeCode}`).includes(normalizedQuery);
      }),
    [filters.level, filters.region, filters.uf, normalizedQuery, states],
  );

  const availableStates = useMemo(() => {
    return states.filter(
      (state) => filters.region === "all" || state.region === filters.region,
    );
  }, [filters.region, states]);

  const municipalityCounts = getLeaderCounts(filteredMunicipalities);
  const stateCounts = getLeaderCounts(filteredStates);
  const selectedMunicipality = municipalities.find(
    (municipality) => municipality.ibgeCode === filters.municipality,
  );
  const selectedState = states.find((state) => state.uf === filters.uf);
  const resultRows = filters.level === "states" ? filteredStates : filteredMunicipalities;
  const sortedRows = getSortedAreas(resultRows, sortKey);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const currentRows = sortedRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const rankingRows = getRanking(filteredMunicipalities, ranking);
  const electorateProfileByIbge = useMemo(() => {
    return new Map(
      electorateProfiles.map((profile) => [profile.ibgeCode, profile] as const),
    );
  }, [electorateProfiles]);
  const demographicMunicipalities = selectedMunicipality
    ? [selectedMunicipality]
    : filteredMunicipalities;

  const handleStateClick = useCallback(
    (uf: string) => {
      updateParams({
        state: uf,
        level: "municipalities",
        municipality: "",
        q: "",
      });
    },
    [updateParams],
  );

  const handleMunicipalityClick = useCallback(
    (ibgeCode: string) => {
      const municipality = municipalities.find((item) => item.ibgeCode === ibgeCode);

      updateParams({
        municipality: ibgeCode,
        state: municipality?.uf ?? filters.uf,
        level: "municipalities",
      });
    },
    [filters.uf, municipalities, updateParams],
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          Carregando dados oficiais do TSE...
        </div>
      </main>
    );
  }

  if (error || !metadata) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white px-5 py-4 text-sm text-red-700 shadow-sm">
          {error || "Dados indisponíveis."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-5 md:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Eleição presidencial 2026
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Resultados de Lula x Flávio Bolsonaro · {metadata.turn}º turno
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Dados oficiais de divulgação do TSE. Explore votos, percentuais e
              diferenças por estado e município.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div className="font-medium text-slate-950">
              Fonte: TSE {metadata.environment}
            </div>
            <div>Gerado pelo TSE: {toDisplayDate(metadata.generatedAt)}</div>
            <div>Status nacional: {getAggregationStatusLabel(metadata.aggregationStatus)}</div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ["states", "Estados"],
                      ["detailed", "Estado detalhado"],
                      ["municipalities", "Municípios"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          if (value === "states") {
                            resetFilters();
                            return;
                          }

                          if (value === "detailed") {
                            updateParams({
                              level: value,
                              state: "",
                              municipality: "",
                              q: "",
                            });
                            return;
                          }

                          updateParams({ level: value });
                        }}
                        className={`h-11 rounded-md border px-3 text-sm font-semibold transition ${
                          filters.level === value
                            ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={resetFilters}
                    className="h-10 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 md:w-auto"
                  >
                    Limpar filtros
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  Região
                  <select
                    value={filters.region}
                    onChange={(event) =>
                      updateParams({
                        region: event.target.value,
                        state: "",
                        municipality: "",
                        q: "",
                      })
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500"
                  >
                    <option value="all">Todas</option>
                    {Object.entries(REGION_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  Estado
                  <select
                    value={filters.uf}
                    onChange={(event) =>
                      updateParams({
                        state: event.target.value,
                        level: event.target.value ? "municipalities" : filters.level,
                        municipality: "",
                        q: "",
                      })
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500"
                  >
                    <option value="">Todos</option>
                    {availableStates
                      .sort(
                        (a, b) => UF_ORDER.indexOf(a.uf) - UF_ORDER.indexOf(b.uf),
                      )
                      .map((state) => (
                        <option key={state.uf} value={state.uf}>
                          {state.uf} - {state.name}
                        </option>
                      ))}
                  </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  Líder
                  <select
                    value={filters.leader}
                    onChange={(event) =>
                      updateParams({
                        leader: event.target.value,
                        municipality: "",
                      })
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500"
                  >
                    <option value="all">Todos</option>
                    <option value="lula">Lula</option>
                    <option value="flavio">Flávio Bolsonaro</option>
                  </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  Destaque no mapa
                  <select
                    value={mapFocus}
                    onChange={(event) => setMapFocusSelection({
                      turn,
                      value: event.target.value as CandidateKey | "leader",
                    })}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500"
                  >
                    <option value="leader">Líder do território</option>
                    <option value="lula">Lula</option>
                    <option value="flavio">Flávio Bolsonaro</option>
                  </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  {filters.level === "states" ? "Estado" : "Município"}
                  <input
                    value={filters.query}
                    onChange={(event) =>
                      updateParams({
                        q: event.target.value,
                        municipality: "",
                      })
                    }
                    placeholder={filters.level === "states" ? "Buscar por nome ou UF" : "Buscar por nome ou IBGE"}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                  />
                  </label>
                </div>
              </div>
            </div>

            <ElectionMap
              level={filters.level}
              uf={filters.uf || selectedMunicipality?.uf || ""}
              states={mapStates}
              municipalities={mapMunicipalities}
              leaderFilter={filters.leader}
              focusCandidate={mapFocus === "leader" ? undefined : mapFocus}
              selectedMunicipality={filters.municipality}
              onStateClick={handleStateClick}
              onMunicipalityClick={handleMunicipalityClick}
            />
            {mapFocus === "leader" ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Líder por localidade</span>
                {(["lula", "flavio"] as CandidateKey[]).map((candidate) => (
                  <span key={candidate} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CANDIDATE_COLORS[candidate] }} />
                    {CANDIDATE_LABEL[candidate]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  Empate
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">{CANDIDATE_LABEL[mapFocus]}</span>
                <span>Percentual de votos</span>
                <span
                  className="h-2.5 w-28 rounded-sm"
                  style={{ background: `linear-gradient(to right, ${CANDIDATE_COLORS[mapFocus]}33, ${CANDIDATE_COLORS[mapFocus]})` }}
                  aria-hidden="true"
                />
                <span>0% a 100%</span>
              </div>
            )}
          </div>

          <aside className="grid content-start gap-4">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Municípios pró-Lula"
                value={municipalityCounts.lula}
                color={CANDIDATE_COLORS.lula}
              />
              <MetricCard
                label="Municípios pró-Flávio"
                value={municipalityCounts.flavio}
                color={CANDIDATE_COLORS.flavio}
              />
              <MetricCard
                label={filters.uf ? "UF selecionada pró-Lula" : "Estados pró-Lula"}
                value={stateCounts.lula}
                color={CANDIDATE_COLORS.lula}
              />
              <MetricCard
                label={
                  filters.uf ? "UF selecionada pró-Flávio" : "Estados pró-Flávio"
                }
                value={stateCounts.flavio}
                color={CANDIDATE_COLORS.flavio}
              />
            </div>

            <DetailsPanel
              selectedMunicipality={selectedMunicipality}
              selectedState={selectedState}
              onOpenZones={setZonesMunicipality}
            />

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">Rankings</h2>
                <select
                  value={ranking}
                  onChange={(event) => setRanking(event.target.value as RankingKey)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-500"
                >
                  <option value="balanced">Mais equilibrados</option>
                  <option value="largest-lula">Maiores margens Lula</option>
                  <option value="largest-flavio">Maiores margens Flávio</option>
                </select>
              </div>
              <div className="grid gap-2">
                {rankingRows.map((municipality) => (
                  <button
                    key={municipality.ibgeCode}
                    type="button"
                    onClick={() => handleMunicipalityClick(municipality.ibgeCode)}
                    className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-slate-100 px-3 py-2 text-left text-sm hover:border-slate-300"
                  >
                    <span>
                      <span className="font-medium text-slate-950">
                        {municipality.name}
                      </span>{" "}
                      <span className="text-slate-500">{municipality.uf}</span>
                    </span>
                    <span className="font-medium text-slate-700">
                      {formatMargin(municipality.marginPercentagePoints)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <ElectorateProfilePanel
          municipalities={demographicMunicipalities}
          profileByIbge={electorateProfileByIbge}
          profileError={electorateProfileError}
        />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                {filters.level === "states" ? "Resultados por estado" : "Resultados por município"}
              </h2>
              <p className="text-sm text-slate-600">
                {resultRows.length.toLocaleString("pt-BR")} localidades no recorte atual
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">
                Ordenar por
              </label>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-950 outline-none focus:border-slate-500"
              >
                <option value="margin-desc">Maior margem</option>
                <option value="margin-asc">Menor margem</option>
                <option value="name">Nome</option>
                <option value="lula-votes">Votos · Lula</option>
                <option value="flavio-votes">Votos · Flávio</option>
                <option value="lula-percentage">% Lula</option>
                <option value="flavio-percentage">% Flávio</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{filters.level === "states" ? "Estado" : "Município"}</th>
                  {filters.level !== "states" ? <th className="px-4 py-3 font-semibold">UF</th> : null}
                  <th className="px-4 py-3 font-semibold">Região</th>
                  <th className="px-4 py-3 text-right font-semibold">Lula</th>
                  <th className="px-4 py-3 text-right font-semibold">Flávio</th>
                  <th className="px-4 py-3 font-semibold">Líder</th>
                  <th className="px-4 py-3 text-right font-semibold">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentRows.map((area) => {
                  const isMunicipality = "tseCode" in area;
                  const onSelect = () => isMunicipality
                    ? handleMunicipalityClick(area.ibgeCode)
                    : handleStateClick(area.uf);
                  return (
                    <tr
                      key={area.ibgeCode}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={onSelect}
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">{area.name}</td>
                      {filters.level !== "states" ? <td className="px-4 py-3 text-slate-700">{area.uf}</td> : null}
                      <td className="px-4 py-3 text-slate-700">{REGION_LABEL[area.region]}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatVotes(area.results.lula.votes)}
                        <div className="text-xs text-slate-500">{formatPercentage(area.results.lula.percentage)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatVotes(area.results.flavio.votes)}
                        <div className="text-xs text-slate-500">{formatPercentage(area.results.flavio.percentage)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-1 text-xs font-semibold text-white"
                          style={{ backgroundColor: CANDIDATE_COLORS[area.leader] }}
                        >
                          {CANDIDATE_LABEL[area.leader]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-950">
                        {formatMargin(area.marginPercentagePoints)}
                      </td>
                    </tr>
                  );
                })}
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan={filters.level === "states" ? 6 : 7} className="px-4 py-8 text-center text-sm text-slate-500">
                      Nenhuma localidade encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-md border border-slate-200 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {safePage} de {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage === pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              className="rounded-md border border-slate-200 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </section>
        {zonesMunicipality ? (
          <ZonesModal
            municipality={zonesMunicipality}
            turn={turn}
            candidateSequences={{
              lula: metadata.candidates.lula.candidateSequence,
              flavio: metadata.candidates.flavio.candidateSequence,
            }}
            onClose={() => setZonesMunicipality(null)}
          />
        ) : null}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 h-1.5 w-10 rounded-full" style={{ backgroundColor: color }} />
      <div className="text-2xl font-semibold text-slate-950">
        {value.toLocaleString("pt-BR")}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

function DetailsPanel({
  selectedMunicipality,
  selectedState,
  onOpenZones,
}: {
  selectedMunicipality?: MunicipalityResult;
  selectedState?: StateResult;
  onOpenZones: (municipality: MunicipalityResult) => void;
}) {
  const datum = selectedMunicipality ?? selectedState;

  if (!datum) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Selecione um estado ou município no mapa/tabela para ver os detalhes.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-950">
            {"tseCode" in datum
              ? `${datum.name} - ${datum.uf}`
              : `${datum.name} - ${datum.uf}`}
          </h2>
          {"tseCode" in datum ? (
            <button
              type="button"
              onClick={() => onOpenZones(datum)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Zonas e seções
            </button>
          ) : null}
        </div>
        <p className="text-sm text-slate-600">
          {REGION_LABEL[datum.region]} · Líder no comparativo:{" "}
          <strong>{CANDIDATE_LABEL[datum.leader]}</strong>
        </p>
      </div>
      <div className="grid gap-3">
        {(["lula", "flavio"] as CandidateKey[]).map((candidate) => (
          <div key={candidate} className="rounded-md border border-slate-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-slate-950">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: CANDIDATE_COLORS[candidate] }}
                />
                {CANDIDATE_LABEL[candidate]}
              </span>
              <span className="font-semibold">
                {formatPercentage(datum.results[candidate].percentage)}
              </span>
            </div>
            <div className="text-sm text-slate-600">
              {formatVotes(datum.results[candidate].votes)} votos
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Diferença:{" "}
        <strong className="text-slate-950">
          {formatMargin(datum.marginPercentagePoints)} {CANDIDATE_LABEL[datum.leader]}
        </strong>
      </div>
      {datum.sections && datum.electorate ? (
        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
          <DetailStat label="Comparecimento" value={formatVotes(datum.electorate.turnout)} />
          <DetailStat
            label="Seções totalizadas"
            value={`${formatVotes(datum.sections.totalized)} / ${formatVotes(datum.sections.total)}`}
          />
        </dl>
      ) : null}
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function ZonesModal({
  municipality,
  turn,
  candidateSequences,
  onClose,
}: {
  municipality: MunicipalityResult;
  turn: 1 | 2;
  candidateSequences: Record<CandidateKey, string>;
  onClose: () => void;
}) {
  const [data, setData] = useState<ZoneBreakdown | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);

    async function loadZones() {
      try {
        setIsLoading(true);
        setError("");
        setData(null);

        const params = new URLSearchParams({
          uf: municipality.uf,
          tseCode: municipality.tseCode,
        });
        if (turn === 2) {
          params.set("turn", "2");
          params.set("candidateSequence", candidateSequences.lula);
          params.set("opponentCandidateSequence", candidateSequences.flavio);
        }
        const response = await fetch(`/api/election/zones?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível carregar zonas.");
        }

        if (isCancelled) return;
        if (turn === 1) {
          setData(payload as ZoneBreakdown);
        } else {
          const secondTurnPayload = payload as TurnTwoZoneBreakdown;
          setData({
            ...secondTurnPayload,
            zones: secondTurnPayload.zones.map((zone) => {
              const candidates = [zone.selectedCandidate, zone.opponentCandidate]
                .filter((candidate): candidate is TurnTwoZoneCandidate => Boolean(candidate));
              const candidateResult = (key: CandidateKey) => {
                const result = candidates.find(
                  (candidate) => candidate.candidateSequence === candidateSequences[key],
                );
                return {
                  candidateSequence: candidateSequences[key],
                  candidateNumber: key === "lula" ? "13" : "22",
                  votes: result?.votes ?? 0,
                  percentage: result?.percentage ?? 0,
                };
              };
              const results = {
                lula: candidateResult("lula"),
                flavio: candidateResult("flavio"),
              };
              return {
                ...zone,
                results,
                leader: results.lula.votes >= results.flavio.votes ? "lula" : "flavio",
                marginPercentagePoints: Math.abs(
                  results.lula.percentage - results.flavio.percentage,
                ),
              };
            }),
          });
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(
            loadError instanceof DOMException && loadError.name === "AbortError"
              ? "A consulta à TSE demorou demais. Tente novamente em alguns segundos."
              : loadError instanceof Error
                ? loadError.message
                : String(loadError),
          );
        }
      } finally {
        window.clearTimeout(timeoutId);

        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadZones();

    return () => {
      isCancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [candidateSequences, municipality.tseCode, municipality.uf, reloadKey, turn]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zones-modal-title"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <div
        className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="zones-modal-title" className="text-lg font-semibold text-slate-950">
              Zonas e seções de {municipality.name} - {municipality.uf}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {turn}º turno · votação por candidato e resumo das seções totalizadas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="max-h-[calc(86vh-88px)] overflow-auto p-5">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Carregando zonas eleitorais...
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
                className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!data && !isLoading && !error ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Nenhuma zona carregada para este município.
            </div>
          ) : null}

          {data && !isLoading && !error ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Zona</th>
                    <th className="px-3 py-3 text-right font-semibold">Seções</th>
                    <th className="px-3 py-3 text-right font-semibold">Comparec.</th>
                    <th className="px-3 py-3 text-right font-semibold">Lula</th>
                    <th className="px-3 py-3 text-right font-semibold">Flávio</th>
                    <th className="px-3 py-3 font-semibold">Líder</th>
                    <th className="px-3 py-3 text-right font-semibold">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.zones.map((zone) => (
                    <tr key={zone.zoneCode}>
                      <td className="px-3 py-3 font-semibold text-slate-950">
                        {zone.zoneCode}
                        <div className="text-xs font-normal text-slate-500">
                          {getAggregationStatusLabel(zone.aggregationStatus)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {formatVotes(zone.sections.totalized)} /{" "}
                        {formatVotes(zone.sections.total)}
                        <div className="text-xs text-slate-500">
                          {formatPercentage(zone.sections.totalizedPercentage)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {formatVotes(zone.electorate.turnout)}
                        <div className="text-xs text-slate-500">
                          {formatPercentage(zone.electorate.turnoutPercentage)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {formatVotes(zone.results.lula.votes)}
                        <div className="text-xs text-slate-500">
                          {formatPercentage(zone.results.lula.percentage)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {formatVotes(zone.results.flavio.votes)}
                        <div className="text-xs text-slate-500">
                          {formatPercentage(zone.results.flavio.percentage)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="rounded-full px-2 py-1 text-xs font-semibold text-white"
                          style={{ backgroundColor: CANDIDATE_COLORS[zone.leader] }}
                        >
                          {CANDIDATE_LABEL[zone.leader]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-950">
                        {formatMargin(zone.marginPercentagePoints)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
