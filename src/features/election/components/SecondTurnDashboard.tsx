"use client";

import { useEffect, useMemo, useState } from "react";
import { CANDIDATE_COLORS, REGION_LABEL, UF_ORDER } from "../constants";
import { formatPercentage, formatVotes, normalizeSearch } from "../formatters";
import type { Region } from "../types";
import type { SingleCandidateMapMunicipality, SingleCandidateMapState } from "../types";
import { ElectionMap } from "./ElectionMap";

const DATA_ROOT = "/data/election/2026/president/turn-2";
const PAGE_SIZE = 24;

type TurnTwoCandidate = {
  candidateSequence: string;
  candidateNumber: string;
  fullName: string;
  ballotName: string;
  partyAcronym: string;
  votes: number;
  percentage: number;
  status: string;
};

type TurnTwoArea = {
  ibgeCode: string;
  name: string;
  region: Region | null;
  generatedAt: string;
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
  candidates: TurnTwoCandidate[];
};

type TurnTwoState = Omit<TurnTwoArea, "region"> & {
  uf: string;
  region: Region;
  municipalitiesCount: number;
};

type TurnTwoMunicipality = Omit<TurnTwoArea, "region"> & {
  id: string;
  tseCode: string;
  uf: string;
  region: Region;
};

type TurnTwoMetadata = {
  generatedAt: string;
  appGeneratedAt: string;
  source: string;
  environment: string;
  electionId: string;
  electionCode: string;
  officeName: string;
  turn: 2;
  summary: {
    states: number;
    municipalities: number;
    failedMunicipalities: number;
    warnings: string[];
  };
};

type MunicipalityDataset = {
  municipalities: TurnTwoMunicipality[];
};

type Scope = "states" | "municipalities";

type TurnTwoZone = {
  zoneCode: string;
  aggregationStatus: string;
  sections: {
    total: number;
    totalized: number;
    totalizedPercentage: number;
  };
  electorate: {
    turnout: number;
    turnoutPercentage: number;
  };
  selectedCandidate: {
    label: string;
    votes: number;
    percentage: number;
  };
};

type TurnTwoZoneDataset = {
  turn: 2;
  municipality: {
    name: string;
    uf: string;
  };
  zones: TurnTwoZone[];
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function aggregationLabel(status: string) {
  if (status.toLowerCase() === "f") return "Totalizada";
  if (status.toLowerCase() === "p") return "Parcial";
  return "Sem status";
}

function getCandidateResult(area: TurnTwoArea, sequence: string) {
  return area.candidates.find((candidate) => candidate.candidateSequence === sequence);
}

function getCandidateColor(candidateNumber: string) {
  if (candidateNumber === "13") return CANDIDATE_COLORS.lula;
  if (candidateNumber === "22") return CANDIDATE_COLORS.flavio;
  return "#0f766e";
}

export function SecondTurnDashboard() {
  const [metadata, setMetadata] = useState<TurnTwoMetadata | null>(null);
  const [national, setNational] = useState<TurnTwoArea | null>(null);
  const [states, setStates] = useState<TurnTwoState[]>([]);
  const [municipalities, setMunicipalities] = useState<TurnTwoMunicipality[]>([]);
  const [scope, setScope] = useState<Scope>("states");
  const [region, setRegion] = useState<Region | "all">("all");
  const [uf, setUf] = useState("");
  const [query, setQuery] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [zonesMunicipality, setZonesMunicipality] =
    useState<TurnTwoMunicipality | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setIsLoading(true);
        setError("");
        const responses = await Promise.all([
          fetch(`${DATA_ROOT}/metadata.json`),
          fetch(`${DATA_ROOT}/national.json`),
          fetch(`${DATA_ROOT}/states.json`),
          fetch(`${DATA_ROOT}/municipalities-index.json`),
        ]);

        const failed = responses.find((response) => !response.ok);
        if (failed) {
          throw new Error(
            "Os arquivos do segundo turno não foram encontrados. Execute pnpm election:generate:turn-2.",
          );
        }

        const [metadataData, nationalData, statesData, municipalitiesData] =
          await Promise.all(responses.map((response) => response.json()));

        if (cancelled) return;
        setMetadata(metadataData as TurnTwoMetadata);
        setNational(nationalData as TurnTwoArea);
        setStates(statesData as TurnTwoState[]);
        setMunicipalities(
          (municipalitiesData as MunicipalityDataset).municipalities,
        );
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
    };
  }, []);

  const candidates = national?.candidates ?? [];
  const [candidateSequence, setCandidateSequence] = useState("");
  const selectedCandidate =
    candidates.find((candidate) => candidate.candidateSequence === candidateSequence) ??
    candidates[0];
  const normalizedQuery = normalizeSearch(query);

  const availableStates = useMemo(
    () =>
      states
        .filter((state) => region === "all" || state.region === region)
        .sort((a, b) => UF_ORDER.indexOf(a.uf) - UF_ORDER.indexOf(b.uf)),
    [region, states],
  );

  const rows = useMemo(() => {
    const source = scope === "states" ? states : municipalities;
    return source
      .filter((area) => region === "all" || area.region === region)
      .filter((area) => !uf || ("uf" in area && area.uf === uf))
      .filter((area) => {
        if (!normalizedQuery) return true;
        const areaUf = "uf" in area ? area.uf : "";
        return normalizeSearch(`${area.name} ${areaUf} ${area.ibgeCode}`).includes(
          normalizedQuery,
        );
      })
      .sort((a, b) => {
        const ufA = "uf" in a ? a.uf : "";
        const ufB = "uf" in b ? b.uf : "";
        return `${ufA}-${a.name}`.localeCompare(`${ufB}-${b.name}`, "pt-BR");
      });
  }, [municipalities, normalizedQuery, region, scope, states, uf]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const nationalResult = national && selectedCandidate
    ? getCandidateResult(national, selectedCandidate.candidateSequence)
    : undefined;

  const mapStates = useMemo(() => {
    if (!selectedCandidate) return [];
    return states
      .filter((state) => region === "all" || state.region === region)
      .map((state): SingleCandidateMapState => ({
        ...state,
        selectedCandidate: {
          label: selectedCandidate.ballotName || selectedCandidate.fullName,
          color: getCandidateColor(selectedCandidate.candidateNumber),
          votes: getCandidateResult(state, selectedCandidate.candidateSequence)?.votes ?? 0,
          percentage: getCandidateResult(state, selectedCandidate.candidateSequence)?.percentage ?? 0,
        },
      }));
  }, [region, selectedCandidate, states]);

  const mapMunicipalities = useMemo(() => {
    if (!selectedCandidate) return [];
    return municipalities
      .filter((municipality) => region === "all" || municipality.region === region)
      .filter((municipality) => !uf || municipality.uf === uf)
      .filter((municipality) => {
        if (!normalizedQuery) return true;
        return normalizeSearch(
          `${municipality.name} ${municipality.uf} ${municipality.ibgeCode}`,
        ).includes(normalizedQuery);
      })
      .map((municipality): SingleCandidateMapMunicipality => ({
        ...municipality,
        selectedCandidate: {
          label: selectedCandidate.ballotName || selectedCandidate.fullName,
          color: getCandidateColor(selectedCandidate.candidateNumber),
          votes: getCandidateResult(municipality, selectedCandidate.candidateSequence)?.votes ?? 0,
          percentage: getCandidateResult(municipality, selectedCandidate.candidateSequence)?.percentage ?? 0,
        },
      }));
  }, [municipalities, normalizedQuery, region, selectedCandidate, uf]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          Carregando resultados do segundo turno...
        </div>
      </main>
    );
  }

  if (error || !metadata || !national) {
    return (
      <main className="min-h-screen bg-[#f6f7f9] p-6 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-white p-5 text-sm text-amber-900 shadow-sm">
          {error || "Dados do segundo turno indisponíveis."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Eleição presidencial 2026 · 2º turno
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">
              Resultados oficiais por território
            </h1>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div className="font-medium text-slate-950">Fonte: TSE {metadata.environment}</div>
            <div>Atualizado: {dateLabel(metadata.generatedAt)}</div>
            <div>
              Totalização nacional: {aggregationLabel(national.aggregationStatus)}
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.4fr)_repeat(2,minmax(180px,1fr))]">
          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            Candidato
            <select
              value={selectedCandidate?.candidateSequence ?? ""}
              onChange={(event) => {
                setPage(1);
                setCandidateSequence(event.target.value);
              }}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
            >
              {candidates.map((candidate) => (
                <option key={candidate.candidateSequence} value={candidate.candidateSequence}>
                  {candidate.ballotName || candidate.fullName}
                  {candidate.partyAcronym ? ` · ${candidate.partyAcronym}` : ""}
                </option>
              ))}
            </select>
          </label>
          <Metric label="Votos" value={formatVotes(nationalResult?.votes ?? 0)} />
          <Metric
            label="Percentual de votos válidos"
            value={formatPercentage(nationalResult?.percentage ?? 0)}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              Abrangência
              <select
                value={scope}
                onChange={(event) => {
                  setPage(1);
                  const nextScope = event.target.value as Scope;
                  setScope(nextScope);
                  setQuery("");
                  setSelectedMunicipality("");
                  if (nextScope === "states") setUf("");
                }}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
              >
                <option value="states">Estados</option>
                <option value="municipalities">Municípios</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              Região
              <select
                value={region}
                onChange={(event) => {
                  setPage(1);
                  setRegion(event.target.value as Region | "all");
                  setUf("");
                  setSelectedMunicipality("");
                }}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
              >
                <option value="all">Todas</option>
                {Object.entries(REGION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              Estado
              <select
                value={uf}
                onChange={(event) => {
                  setPage(1);
                  setUf(event.target.value);
                  setSelectedMunicipality("");
                }}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
              >
                <option value="">Todos</option>
                {availableStates.map((state) => (
                  <option key={state.uf} value={state.uf}>{state.uf} - {state.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              {scope === "states" ? "Buscar estado" : "Buscar município"}
              <input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder={scope === "states" ? "Nome ou UF" : "Nome ou código IBGE"}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-500"
              />
            </label>
          </div>
        </section>

        <ElectionMap
          level={scope === "states" ? "states" : uf ? "municipalities" : "detailed"}
          uf={uf}
          states={mapStates}
          municipalities={mapMunicipalities}
          leaderFilter="all"
          selectedMunicipality={selectedMunicipality}
          onStateClick={(stateUf) => {
            setScope("municipalities");
            setUf(stateUf);
            setQuery("");
            setSelectedMunicipality("");
            setPage(1);
          }}
          onMunicipalityClick={(ibgeCode) => {
            const municipality = municipalities.find((item) => item.ibgeCode === ibgeCode);
            if (!municipality) return;
            setScope("municipalities");
            setUf(municipality.uf);
            setQuery("");
            setSelectedMunicipality(ibgeCode);
            setPage(1);
          }}
        />
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-medium text-slate-700">
            {selectedCandidate?.ballotName || selectedCandidate?.fullName}
          </span>
          <span>Percentual de votos válidos</span>
          <span
            className="h-2.5 w-28 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${getCandidateColor(selectedCandidate?.candidateNumber ?? "")}33, ${getCandidateColor(selectedCandidate?.candidateNumber ?? "")})`,
            }}
            aria-hidden="true"
          />
          <span>0% a 100%</span>
        </div>

        {selectedMunicipality ? (() => {
          const municipality = municipalities.find(
            (item) => item.ibgeCode === selectedMunicipality,
          );
          const result = municipality && selectedCandidate
            ? getCandidateResult(municipality, selectedCandidate.candidateSequence)
            : undefined;
          if (!municipality || !result) return null;

          return (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    {municipality.name} - {municipality.uf}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {REGION_LABEL[municipality.region]} · código IBGE {municipality.ibgeCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setZonesMunicipality(municipality)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Zonas e seções
                </button>
              </div>
              <dl className="grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailStat label="Votos" value={formatVotes(result.votes)} />
                <DetailStat
                  label="Percentual de votos válidos"
                  value={formatPercentage(result.percentage)}
                />
                <DetailStat
                  label="Comparecimento"
                  value={formatVotes(municipality.electorate.turnout)}
                />
                <DetailStat
                  label="Seções totalizadas"
                  value={`${formatVotes(municipality.sections.totalized)} / ${formatVotes(municipality.sections.total)}`}
                />
              </dl>
            </section>
          );
        })() : null}

        {metadata.summary.failedMunicipalities > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            A geração não incluiu {metadata.summary.failedMunicipalities.toLocaleString("pt-BR")} municípios.
          </div>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-950">
              {scope === "states" ? "Resultados por estado" : "Resultados por município"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {rows.length.toLocaleString("pt-BR")} localidades
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{scope === "states" ? "Estado" : "Município"}</th>
                  {scope === "municipalities" ? <th className="px-4 py-3 font-semibold">UF</th> : null}
                  <th className="px-4 py-3 font-semibold">Região</th>
                  <th className="px-4 py-3 text-right font-semibold">Votos</th>
                  <th className="px-4 py-3 text-right font-semibold">% votos válidos</th>
                  <th className="px-4 py-3 text-right font-semibold">Seções totalizadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((area) => {
                  const result = selectedCandidate
                    ? getCandidateResult(area, selectedCandidate.candidateSequence)
                    : undefined;
                  const areaUf = "uf" in area ? area.uf : "";
                  return (
                    <tr key={area.ibgeCode}>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {scope === "states" && "uf" in area ? (
                          <button
                            type="button"
                            onClick={() => {
                              setScope("municipalities");
                              setUf(area.uf);
                              setQuery("");
                              setSelectedMunicipality("");
                              setPage(1);
                            }}
                            className="text-left hover:underline"
                          >
                            {area.name}
                          </button>
                        ) : "tseCode" in area ? (
                          <button
                            type="button"
                            onClick={() => setSelectedMunicipality(area.ibgeCode)}
                            className="text-left hover:underline"
                          >
                            {area.name}
                          </button>
                        ) : area.name}
                      </td>
                      {scope === "municipalities" ? (
                        <td className="px-4 py-3 text-slate-700">{areaUf}</td>
                      ) : null}
                      <td className="px-4 py-3 text-slate-700">
                        {area.region ? REGION_LABEL[area.region] : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatVotes(result?.votes ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatPercentage(result?.percentage ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatVotes(area.sections.totalized)} / {formatVotes(area.sections.total)}
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={scope === "states" ? 5 : 6} className="px-4 py-8 text-center text-sm text-slate-500">
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
            <span>Página {safePage} de {pageCount}</span>
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
        {zonesMunicipality && selectedCandidate ? (
          <SecondTurnZonesModal
            municipality={zonesMunicipality}
            candidateSequence={selectedCandidate.candidateSequence}
            candidateLabel={selectedCandidate.ballotName || selectedCandidate.fullName}
            onClose={() => setZonesMunicipality(null)}
          />
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase text-slate-500">{label}</div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function SecondTurnZonesModal({
  municipality,
  candidateSequence,
  candidateLabel,
  onClose,
}: {
  municipality: TurnTwoMunicipality;
  candidateSequence: string;
  candidateLabel: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TurnTwoZoneDataset | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    async function loadZones() {
      try {
        setIsLoading(true);
        setError("");
        setData(null);
        const params = new URLSearchParams({
          turn: "2",
          uf: municipality.uf,
          tseCode: municipality.tseCode,
          candidateSequence,
        });
        const response = await fetch(`/api/election/zones?${params}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível carregar as zonas.");
        }

        if (!cancelled) setData(payload as TurnTwoZoneDataset);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof DOMException && loadError.name === "AbortError"
              ? "A consulta ao TSE demorou demais. Tente novamente."
              : loadError instanceof Error
                ? loadError.message
                : String(loadError),
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadZones();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [candidateSequence, municipality.tseCode, municipality.uf, reloadKey]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="second-turn-zones-title"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="second-turn-zones-title" className="text-lg font-semibold text-slate-950">
              Zonas e seções de {municipality.name} - {municipality.uf}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {candidateLabel} · 2º turno
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
                className="h-9 rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}
          {data && !isLoading && !error ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Zona</th>
                    <th className="px-3 py-3 text-right font-semibold">Seções totalizadas</th>
                    <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Comparecimento</th>
                    <th className="px-3 py-3 text-right font-semibold">Votos</th>
                    <th className="px-3 py-3 text-right font-semibold">% válidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.zones.map((zone) => (
                    <tr key={zone.zoneCode}>
                      <td className="px-3 py-3 font-semibold text-slate-950">
                        {zone.zoneCode}
                        <div className="text-xs font-normal text-slate-500">
                          {aggregationLabel(zone.aggregationStatus)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {formatVotes(zone.sections.totalized)} / {formatVotes(zone.sections.total)}
                        <div className="text-xs text-slate-500">
                          {formatPercentage(zone.sections.totalizedPercentage)}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-right text-slate-700 sm:table-cell">
                        {formatVotes(zone.electorate.turnout)}
                        <div className="text-xs text-slate-500">
                          {formatPercentage(zone.electorate.turnoutPercentage)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-950">
                        {formatVotes(zone.selectedCandidate.votes)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-950">
                        {formatPercentage(zone.selectedCandidate.percentage)}
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
