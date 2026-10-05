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
  ElectorateProfileDataset,
  FilterState,
  LeaderFilter,
  MunicipalityDataset,
  MunicipalityResult,
  Region,
  StateResult,
  ViewLevel,
} from "../types";
import { ElectionMap } from "./ElectionMap";

const DATA_ROOT = "/data/election/2026/president/turn-1";
const PAGE_SIZE = 24;

type SortKey = "name" | "lula" | "flavio" | "margin-desc" | "margin-asc";
type RankingKey = "largest-lula" | "largest-flavio" | "balanced";
type Bucket = Record<string, number>;
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

type ElectorateAggregate = {
  total: number;
  byGender: Bucket;
  byAge: Bucket;
};

type RegionVoteRow = {
  region: Region;
  lula: number;
  flavio: number;
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

function getSortedMunicipalities(
  municipalities: MunicipalityResult[],
  sortKey: SortKey,
) {
  const sorted = [...municipalities];

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

    return b.results[sortKey].percentage - a.results[sortKey].percentage;
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

function titleCaseLabel(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

function createElectorateAggregate(): ElectorateAggregate {
  return {
    total: 0,
    byGender: {},
    byAge: {},
  };
}

function addBucket(target: Bucket, source: Bucket, labelMapper = (label: string) => label) {
  for (const [label, value] of Object.entries(source)) {
    const mappedLabel = labelMapper(label);
    target[mappedLabel] = (target[mappedLabel] ?? 0) + value;
  }
}

function getAgeGroup(label: string) {
  const firstAge = Number(label.match(/\d+/)?.[0]);

  if (!Number.isFinite(firstAge)) {
    return "Não informado";
  }

  if (firstAge <= 24) {
    return "16 a 24";
  }

  if (firstAge <= 34) {
    return "25 a 34";
  }

  if (firstAge <= 44) {
    return "35 a 44";
  }

  if (firstAge <= 59) {
    return "45 a 59";
  }

  return "60+";
}

function aggregateElectorateProfiles(
  municipalities: MunicipalityResult[],
  profileByIbge: Map<string, ElectorateProfile>,
) {
  const aggregate = createElectorateAggregate();

  for (const municipality of municipalities) {
    const profile = profileByIbge.get(municipality.ibgeCode);

    if (!profile) {
      continue;
    }

    aggregate.total += profile.total;
    addBucket(aggregate.byGender, profile.byGender, titleCaseLabel);
    addBucket(aggregate.byAge, profile.byAge, getAgeGroup);
  }

  return aggregate;
}

function getDistribution(bucket: Bucket, total: number, order?: string[]) {
  const entries = Object.entries(bucket).map(([label, value]) => ({
    label,
    value,
    percentage: total > 0 ? (value / total) * 100 : 0,
  }));

  if (order) {
    return entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }

  return entries.sort((a, b) => b.value - a.value);
}

function getRegionVoteRows(municipalities: MunicipalityResult[]) {
  const rows = new Map<Region, RegionVoteRow>();

  for (const municipality of municipalities) {
    const current =
      rows.get(municipality.region) ??
      ({
        region: municipality.region,
        lula: 0,
        flavio: 0,
      } satisfies RegionVoteRow);

    current.lula += municipality.results.lula.votes;
    current.flavio += municipality.results.flavio.votes;
    rows.set(municipality.region, current);
  }

  return [...rows.values()].sort(
    (a, b) =>
      Object.keys(REGION_LABEL).indexOf(a.region) -
      Object.keys(REGION_LABEL).indexOf(b.region),
  );
}

export function ElectionDashboard() {
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

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError("");

        const [
          metadataResponse,
          statesResponse,
          municipalitiesResponse,
          electorateProfileResponse,
        ] =
          await Promise.all([
            fetch(`${DATA_ROOT}/metadata.json`),
            fetch(`${DATA_ROOT}/states.json`),
            fetch(`${DATA_ROOT}/municipalities-index.json`),
            fetch(`${DATA_ROOT}/electorate-profile.json`),
          ]);

        if (!metadataResponse.ok || !statesResponse.ok || !municipalitiesResponse.ok) {
          throw new Error("Não foi possível carregar os dados gerados.");
        }

        const municipalityDataset =
          (await municipalitiesResponse.json()) as MunicipalityDataset;

        setMetadata((await metadataResponse.json()) as ElectionMetadata);
        setStates((await statesResponse.json()) as StateResult[]);
        setMunicipalities(municipalityDataset.municipalities);

        if (electorateProfileResponse.ok) {
          const electorateDataset =
            (await electorateProfileResponse.json()) as ElectorateProfileDataset;
          setElectorateProfiles(electorateDataset.profiles);
          setElectorateProfileError("");
        } else {
          setElectorateProfiles([]);
          setElectorateProfileError("Perfil do eleitorado ainda não foi gerado.");
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, []);

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
      }),
    [filters.leader, filters.region, filters.uf, states],
  );

  const mapStates = useMemo(
    () =>
      filterStates(states, {
        region: filters.region,
        uf: filters.uf,
        leader: "all",
      }),
    [filters.region, filters.uf, states],
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
  const sortedMunicipalities = getSortedMunicipalities(
    filteredMunicipalities,
    sortKey,
  );
  const pageCount = Math.max(1, Math.ceil(sortedMunicipalities.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const currentRows = sortedMunicipalities.slice(
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
              Geografia do comparativo Lula x Flávio Bolsonaro
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Dados oficiais de divulgação do TSE. O mapa mostra quem lidera
              dentro deste recorte comparativo, não o vencedor oficial entre todos
              os candidatos.
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
                            router.replace(pathname, { scroll: false });
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
                    onClick={() =>
                      router.replace(pathname, {
                        scroll: false,
                      })
                    }
                    className="h-10 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 md:w-auto"
                  >
                    Limpar filtros
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
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
                  Município
                  <input
                    value={filters.query}
                    onChange={(event) =>
                      updateParams({
                        q: event.target.value,
                        municipality: "",
                      })
                    }
                    placeholder="Buscar por nome ou IBGE"
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
              selectedMunicipality={filters.municipality}
              onStateClick={handleStateClick}
              onMunicipalityClick={handleMunicipalityClick}
            />
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
                Municípios
              </h2>
              <p className="text-sm text-slate-600">
                {filteredMunicipalities.length.toLocaleString("pt-BR")} municípios no
                recorte atual
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
                <option value="lula">% Lula</option>
                <option value="flavio">% Flávio</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Município</th>
                  <th className="px-4 py-3 font-semibold">UF</th>
                  <th className="px-4 py-3 font-semibold">Região</th>
                  <th className="px-4 py-3 text-right font-semibold">Lula</th>
                  <th className="px-4 py-3 text-right font-semibold">Flávio</th>
                  <th className="px-4 py-3 font-semibold">Líder</th>
                  <th className="px-4 py-3 text-right font-semibold">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentRows.map((municipality) => (
                  <tr
                    key={municipality.ibgeCode}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => handleMunicipalityClick(municipality.ibgeCode)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {municipality.name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{municipality.uf}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {REGION_LABEL[municipality.region]}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatVotes(municipality.results.lula.votes)}
                      <div className="text-xs text-slate-500">
                        {formatPercentage(municipality.results.lula.percentage)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatVotes(municipality.results.flavio.votes)}
                      <div className="text-xs text-slate-500">
                        {formatPercentage(municipality.results.flavio.percentage)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-1 text-xs font-semibold text-white"
                        style={{
                          backgroundColor: CANDIDATE_COLORS[municipality.leader],
                        }}
                      >
                        {CANDIDATE_LABEL[municipality.leader]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-950">
                      {formatMargin(municipality.marginPercentagePoints)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <button
              type="button"
              disabled={page === 1}
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
              disabled={page === pageCount}
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

function ElectorateProfilePanel({
  municipalities,
  profileByIbge,
  profileError,
}: {
  municipalities: MunicipalityResult[];
  profileByIbge: Map<string, ElectorateProfile>;
  profileError: string;
}) {
  const leaderGroups = useMemo(
    () => ({
      lula: municipalities.filter((municipality) => municipality.leader === "lula"),
      flavio: municipalities.filter((municipality) => municipality.leader === "flavio"),
    }),
    [municipalities],
  );
  const lulaProfile = useMemo(
    () => aggregateElectorateProfiles(leaderGroups.lula, profileByIbge),
    [leaderGroups.lula, profileByIbge],
  );
  const flavioProfile = useMemo(
    () => aggregateElectorateProfiles(leaderGroups.flavio, profileByIbge),
    [leaderGroups.flavio, profileByIbge],
  );
  const regionRows = useMemo(
    () => getRegionVoteRows(municipalities),
    [municipalities],
  );
  const coveredMunicipalities = municipalities.filter((municipality) =>
    profileByIbge.has(municipality.ibgeCode),
  ).length;
  const totalElectorate = lulaProfile.total + flavioProfile.total;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Perfil do eleitorado
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            Os gráficos mostram o perfil demográfico do eleitorado nos territórios
            do recorte atual. Eles não identificam o perfil individual de quem
            votou em cada candidato.
          </p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <strong className="text-slate-950">{formatVotes(totalElectorate)}</strong>{" "}
          eleitores em {coveredMunicipalities.toLocaleString("pt-BR")} municípios
        </div>
      </div>

      {profileError ? (
        <div className="m-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {profileError}
        </div>
      ) : null}

      {!profileError ? (
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <RegionVoteChart rows={regionRows} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CandidateElectorateCard
              candidate="lula"
              municipalitiesCount={leaderGroups.lula.length}
              profile={lulaProfile}
            />
            <CandidateElectorateCard
              candidate="flavio"
              municipalitiesCount={leaderGroups.flavio.length}
              profile={flavioProfile}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RegionVoteChart({ rows }: { rows: RegionVoteRow[] }) {
  const maxVotes = Math.max(
    1,
    ...rows.flatMap((row) => [row.lula, row.flavio]),
  );

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-950">
          Votos por região
        </h3>
        <p className="text-xs text-slate-500">
          Distribuição de votos no recorte filtrado.
        </p>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.region} className="grid gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>{REGION_LABEL[row.region]}</span>
              <span>{formatVotes(row.lula + row.flavio)} votos comparados</span>
            </div>
            {(["lula", "flavio"] as CandidateKey[]).map((candidate) => (
              <div key={candidate} className="grid grid-cols-[88px_1fr_82px] items-center gap-2">
                <span className="text-xs text-slate-600">
                  {CANDIDATE_LABEL[candidate]}
                </span>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${((row[candidate] / maxVotes) * 100).toFixed(2)}%`,
                      backgroundColor: CANDIDATE_COLORS[candidate],
                    }}
                  />
                </div>
                <span className="text-right text-xs font-medium text-slate-700">
                  {formatVotes(row[candidate])}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateElectorateCard({
  candidate,
  municipalitiesCount,
  profile,
}: {
  candidate: CandidateKey;
  municipalitiesCount: number;
  profile: ElectorateAggregate;
}) {
  const ageOrder = ["16 a 24", "25 a 34", "35 a 44", "45 a 59", "60+", "Não informado"];
  const genderDistribution = getDistribution(profile.byGender, profile.total);
  const ageDistribution = getDistribution(profile.byAge, profile.total, ageOrder);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            {`Territórios pró-${CANDIDATE_LABEL[candidate]}`}
          </h3>
          <p className="text-xs text-slate-500">
            {municipalitiesCount.toLocaleString("pt-BR")} municípios no recorte
          </p>
        </div>
        <div
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: CANDIDATE_COLORS[candidate] }}
        >
          {formatVotes(profile.total)}
        </div>
      </div>

      {profile.total > 0 ? (
        <div className="grid gap-4">
          <BarList
            title="Sexo"
            rows={genderDistribution}
            color={CANDIDATE_COLORS[candidate]}
          />
          <BarList
            title="Idade"
            rows={ageDistribution}
            color={CANDIDATE_COLORS[candidate]}
          />
        </div>
      ) : (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Sem dados demográficos para este recorte.
        </div>
      )}
    </div>
  );
}

function BarList({
  title,
  rows,
  color,
}: {
  title: string;
  rows: Array<{ label: string; value: number; percentage: number }>;
  color: string;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
        {title}
      </h4>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-medium text-slate-800">
                {formatPercentage(row.percentage, 1)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${row.percentage.toFixed(2)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        ))}
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
    </div>
  );
}

function ZonesModal({
  municipality,
  onClose,
}: {
  municipality: MunicipalityResult;
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
        const response = await fetch(`/api/election/zones?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível carregar zonas.");
        }

        if (!isCancelled) {
          setData(payload as ZoneBreakdown);
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
  }, [municipality.tseCode, municipality.uf, reloadKey]);

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
              Recorte por zona eleitoral com resumo agregado das seções totalizadas.
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
