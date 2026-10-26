import { NextResponse } from "next/server";
import type { CandidateKey } from "@/features/election/types";

const TSE_BASE_URL = "https://resultados.tse.jus.br/oficial";
const CYCLE = "ele2026";
const ELECTION_ID = "6257";
const PADDED_ELECTION_ID = "006257";
const TURN_TWO_ELECTION_ID = "6258";
const TURN_TWO_PADDED_ELECTION_ID = "006258";
const OFFICE_CODE = "0001";
const TSE_FETCH_TIMEOUT_MS = 8_000;
const ZONE_FETCH_CONCURRENCY = 4;

const CANDIDATES = {
  lula: {
    candidateNumber: "13",
    candidateSequence: "280002542548",
  },
  flavio: {
    candidateNumber: "22",
    candidateSequence: "280002551544",
  },
} satisfies Record<
  CandidateKey,
  {
    candidateNumber: string;
    candidateSequence: string;
  }
>;

type TSECandidate = {
  nm?: string;
  nmu?: string;
  n?: string | number;
  sqcand?: string | number;
  vap?: string | number;
  pvap?: string | number;
  pvapn?: string | number;
};

type TSEParty = {
  cand?: TSECandidate[];
};

type TSEAggregation = {
  par?: TSEParty[];
};

type TSEOffice = {
  agr?: TSEAggregation[];
};

type TSEResultPayload = {
  tpabr?: string;
  cdabr?: string;
  dg?: string;
  hg?: string;
  and?: string;
  carg?: TSEOffice[];
  s?: Record<string, unknown>;
  e?: Record<string, unknown>;
};

type TSEMunicipalityConfig = {
  abr?: Array<{
    cd?: string;
    mu?: Array<{
      cd?: string;
      cdi?: string;
      nm?: string;
      z?: string[];
    }>;
  }>;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  return Number(String(value).replace(".", "").replace(",", "."));
}

function toIsoDate(date: unknown, time: unknown) {
  if (!date || !time) {
    return new Date().toISOString();
  }

  const [day, month, year] = String(date).split("/");
  return `${year}-${month}-${day}T${time}-03:00`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "eleicoes-2026-dashboard/0.1",
    },
    signal: AbortSignal.timeout(TSE_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      results.push(await worker(item));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()),
  );

  return results;
}

function extractComparedResult(ea20: TSEResultPayload) {
  const results: Partial<
    Record<
      CandidateKey,
      {
        candidateSequence: string;
        candidateNumber: string;
        votes: number;
        percentage: number;
      }
    >
  > = {};

  for (const office of ea20.carg ?? []) {
    for (const aggregation of office.agr ?? []) {
      for (const party of aggregation.par ?? []) {
        for (const candidate of party.cand ?? []) {
          for (const [key, expected] of Object.entries(CANDIDATES) as Array<
            [CandidateKey, (typeof CANDIDATES)[CandidateKey]]
          >) {
            const sequenceMatches =
              String(candidate.sqcand) === expected.candidateSequence;
            const numberMatches = String(candidate.n) === expected.candidateNumber;

            if (!sequenceMatches && !numberMatches) {
              continue;
            }

            results[key] = {
              candidateSequence: String(candidate.sqcand),
              candidateNumber: String(candidate.n),
              votes: parseNumber(candidate.vap),
              percentage: parseNumber(candidate.pvapn ?? candidate.pvap),
            };
          }
        }
      }
    }
  }

  if (!results.lula || !results.flavio) {
    throw new Error(`Missing compared candidates in ${ea20.tpabr}:${ea20.cdabr}`);
  }

  const leader = results.lula.votes >= results.flavio.votes ? "lula" : "flavio";
  const marginPercentagePoints = Math.abs(
    results.lula.percentage - results.flavio.percentage,
  );

  return {
    results: {
      lula: results.lula,
      flavio: results.flavio,
    },
    leader,
    marginPercentagePoints,
  };
}

function extractCandidateResult(ea20: TSEResultPayload, sequence: string) {
  for (const office of ea20.carg ?? []) {
    for (const aggregation of office.agr ?? []) {
      for (const party of aggregation.par ?? []) {
        for (const candidate of party.cand ?? []) {
          if (String(candidate.sqcand) !== sequence) {
            continue;
          }

          return {
            candidateSequence: sequence,
            candidateNumber: String(candidate.n ?? ""),
            label: String(candidate.nmu ?? candidate.nm ?? "Candidato"),
            votes: parseNumber(candidate.vap),
            percentage: parseNumber(candidate.pvapn ?? candidate.pvap),
          };
        }
      }
    }
  }

  throw new Error(`Candidato selecionado não encontrado na zona ${ea20.cdabr}.`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uf = searchParams.get("uf")?.toLowerCase();
  const tseCode = searchParams.get("tseCode");
  const turnTwo = searchParams.get("turn") === "2";
  const candidateSequence = searchParams.get("candidateSequence") ?? "";

  if (!uf || !tseCode || !/^[a-z]{2}$/.test(uf) || !/^\d+$/.test(tseCode)) {
    return NextResponse.json(
      { error: "Parâmetros inválidos para UF ou município." },
      { status: 400 },
    );
  }

  if (turnTwo && !/^\d+$/.test(candidateSequence)) {
    return NextResponse.json(
      { error: "Selecione um candidato válido para consultar as zonas." },
      { status: 400 },
    );
  }

  try {
    const electionId = turnTwo ? TURN_TWO_ELECTION_ID : ELECTION_ID;
    const paddedElectionId = turnTwo
      ? TURN_TWO_PADDED_ELECTION_ID
      : PADDED_ELECTION_ID;
    const configUrl = `${TSE_BASE_URL}/${CYCLE}/${electionId}/config/mun-e${paddedElectionId}-cm.json`;
    const municipalityConfig = (await fetchJson(configUrl)) as TSEMunicipalityConfig;
    const stateConfig = municipalityConfig.abr?.find(
      (state) => String(state.cd).toLowerCase() === uf,
    );
    const municipality = stateConfig?.mu?.find(
      (item) => String(item.cd) === tseCode,
    );
    const zones = (municipality?.z ?? []) as string[];

    if (!municipality || zones.length === 0) {
      return NextResponse.json(
        { error: "Zonas não encontradas para o município selecionado." },
        { status: 404 },
      );
    }

    const rows = await runPool(zones, ZONE_FETCH_CONCURRENCY, async (zoneCode) => {
      const normalizedZone = String(zoneCode).padStart(4, "0");
      const url = `${TSE_BASE_URL}/${CYCLE}/${electionId}/dados/${uf}/${uf}${tseCode}-z${normalizedZone}-c${OFFICE_CODE}-e${paddedElectionId}-u.json`;
      const zoneResult = (await fetchJson(url)) as TSEResultPayload;
      const result = turnTwo
        ? { selectedCandidate: extractCandidateResult(zoneResult, candidateSequence) }
        : extractComparedResult(zoneResult);

      return {
        zoneCode: normalizedZone,
        sourceGeneratedAt: toIsoDate(zoneResult.dg, zoneResult.hg),
        aggregationStatus: String(zoneResult.and ?? ""),
        sections: {
          total: parseNumber(zoneResult.s?.ts),
          totalized: parseNumber(zoneResult.s?.st),
          notTotalized: parseNumber(zoneResult.s?.snt),
          totalizedPercentage: parseNumber(zoneResult.s?.pstn ?? zoneResult.s?.pst),
        },
        electorate: {
          eligible: parseNumber(zoneResult.e?.te),
          turnout: parseNumber(zoneResult.e?.c),
          turnoutPercentage: parseNumber(zoneResult.e?.pcn ?? zoneResult.e?.pc),
          abstentions: parseNumber(zoneResult.e?.a),
          abstentionPercentage: parseNumber(zoneResult.e?.pan ?? zoneResult.e?.pa),
        },
        ...result,
      };
    });

    return NextResponse.json({
      municipality: {
        tseCode,
        ibgeCode: String(municipality.cdi ?? ""),
        name: String(municipality.nm ?? ""),
        uf: uf.toUpperCase(),
      },
      source: {
        configUrl,
      },
      turn: turnTwo ? 2 : 1,
      zones: rows.sort((a, b) => a.zoneCode.localeCompare(b.zoneCode)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar zonas eleitorais.",
      },
      { status: 502 },
    );
  }
}
