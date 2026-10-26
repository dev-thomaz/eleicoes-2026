"use client";

import { useMemo } from "react";
import { CANDIDATE_COLORS, CANDIDATE_LABEL, REGION_LABEL } from "../constants";
import { formatPercentage, formatVotes } from "../formatters";
import type { CandidateKey, ElectorateProfile, Region } from "../types";

type Bucket = Record<string, number>;
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

export type ElectorateMunicipalitySummary = {
  ibgeCode: string;
  region: Region;
  leader: CandidateKey | null;
  results: Record<CandidateKey, { votes: number }>;
};

function titleCaseLabel(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

function getAgeGroup(label: string) {
  const firstAge = Number(label.match(/\d+/)?.[0]);
  if (!Number.isFinite(firstAge)) return "Não informado";
  if (firstAge <= 24) return "16 a 24";
  if (firstAge <= 34) return "25 a 34";
  if (firstAge <= 44) return "35 a 44";
  if (firstAge <= 59) return "45 a 59";
  return "60+";
}

function addBucket(target: Bucket, source: Bucket, labelMapper = (label: string) => label) {
  for (const [label, value] of Object.entries(source)) {
    const mappedLabel = labelMapper(label);
    target[mappedLabel] = (target[mappedLabel] ?? 0) + value;
  }
}

function aggregateElectorateProfiles(
  municipalities: Pick<ElectorateMunicipalitySummary, "ibgeCode">[],
  profileByIbge: Map<string, ElectorateProfile>,
): ElectorateAggregate {
  const aggregate: ElectorateAggregate = { total: 0, byGender: {}, byAge: {} };
  for (const municipality of municipalities) {
    const profile = profileByIbge.get(municipality.ibgeCode);
    if (!profile) continue;
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
  if (order) return entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return entries.sort((a, b) => b.value - a.value);
}

function getRegionVoteRows(municipalities: ElectorateMunicipalitySummary[]) {
  const rows = new Map<Region, RegionVoteRow>();
  for (const municipality of municipalities) {
    const current = rows.get(municipality.region) ?? {
      region: municipality.region,
      lula: 0,
      flavio: 0,
    };
    current.lula += municipality.results.lula.votes;
    current.flavio += municipality.results.flavio.votes;
    rows.set(municipality.region, current);
  }
  return [...rows.values()].sort(
    (a, b) => Object.keys(REGION_LABEL).indexOf(a.region) - Object.keys(REGION_LABEL).indexOf(b.region),
  );
}

export function ElectorateProfilePanel({
  municipalities,
  profileByIbge,
  profileError,
}: {
  municipalities: ElectorateMunicipalitySummary[];
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
  const regionRows = useMemo(() => getRegionVoteRows(municipalities), [municipalities]);
  const coveredMunicipalities = municipalities.filter((municipality) =>
    municipality.leader !== null && profileByIbge.has(municipality.ibgeCode),
  ).length;
  const totalElectorate = lulaProfile.total + flavioProfile.total;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Perfil do eleitorado</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            Os gráficos mostram o perfil demográfico do eleitorado nos territórios do recorte atual. Eles não identificam o perfil individual de quem votou em cada candidato.
          </p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <strong className="text-slate-950">{formatVotes(totalElectorate)}</strong> eleitores em {coveredMunicipalities.toLocaleString("pt-BR")} municípios
        </div>
      </div>
      {profileError ? (
        <div className="m-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{profileError}</div>
      ) : (
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <RegionVoteChart rows={regionRows} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CandidateElectorateCard candidate="lula" municipalitiesCount={leaderGroups.lula.length} profile={lulaProfile} />
            <CandidateElectorateCard candidate="flavio" municipalitiesCount={leaderGroups.flavio.length} profile={flavioProfile} />
          </div>
        </div>
      )}
    </section>
  );
}

function RegionVoteChart({ rows }: { rows: RegionVoteRow[] }) {
  const maxVotes = Math.max(1, ...rows.flatMap((row) => [row.lula, row.flavio]));
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-950">Votos por região</h3>
        <p className="text-xs text-slate-500">Distribuição de votos no recorte filtrado.</p>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.region} className="grid gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>{REGION_LABEL[row.region]}</span>
              <span>{formatVotes(row.lula + row.flavio)} votos somados</span>
            </div>
            {(["lula", "flavio"] as CandidateKey[]).map((candidate) => (
              <div key={candidate} className="grid grid-cols-[88px_1fr_82px] items-center gap-2">
                <span className="text-xs text-slate-600">{CANDIDATE_LABEL[candidate]}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${((row[candidate] / maxVotes) * 100).toFixed(2)}%`, backgroundColor: CANDIDATE_COLORS[candidate] }} />
                </div>
                <span className="text-right text-xs font-medium text-slate-700">{formatVotes(row[candidate])}</span>
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
          <h3 className="text-sm font-semibold text-slate-950">Territórios pró-{CANDIDATE_LABEL[candidate]}</h3>
          <p className="text-xs text-slate-500">{municipalitiesCount.toLocaleString("pt-BR")} municípios no recorte</p>
        </div>
        <div className="rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: CANDIDATE_COLORS[candidate] }}>{formatVotes(profile.total)}</div>
      </div>
      {profile.total > 0 ? (
        <div className="grid gap-4">
          <BarList title="Sexo" rows={genderDistribution} color={CANDIDATE_COLORS[candidate]} />
          <BarList title="Idade" rows={ageDistribution} color={CANDIDATE_COLORS[candidate]} />
        </div>
      ) : (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">Sem dados demográficos para este recorte.</div>
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
      <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</h4>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-medium text-slate-800">{formatPercentage(row.percentage, 1)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${row.percentage.toFixed(2)}%`, backgroundColor: color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
