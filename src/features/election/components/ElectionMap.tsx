"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  CANDIDATE_COLORS,
  CANDIDATE_LABEL,
  CAPITAL_NAME_BY_UF,
  UF_ORDER,
} from "../constants";
import {
  formatMargin,
  formatPercentage,
  formatVotes,
  normalizeSearch,
} from "../formatters";
import type {
  CandidateKey,
  LeaderFilter,
  MunicipalityResult,
  StateResult,
  ViewLevel,
} from "../types";

type MapDatum = StateResult | MunicipalityResult;

interface ElectionMapProps {
  level: ViewLevel;
  uf: string;
  states: StateResult[];
  municipalities: MunicipalityResult[];
  leaderFilter: LeaderFilter;
  selectedMunicipality: string;
  onStateClick: (uf: string) => void;
  onMunicipalityClick: (ibgeCode: string) => void;
}

interface TooltipState {
  x: number;
  y: number;
  datum: MapDatum;
}

interface MapTransform {
  scale: number;
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
}

interface PendingMapClick {
  datum: MapDatum;
}

type GeoJsonFeature = {
  id?: string;
  type: string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

const INITIAL_TRANSFORM: MapTransform = {
  scale: 1,
  x: 0,
  y: 0,
};
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.6;
const EVEN_MARGIN_COLOR = "#94a3b8";

function isMunicipality(datum: MapDatum): datum is MunicipalityResult {
  return "tseCode" in datum;
}

function hasEvenDisplayedMargin(datum: MapDatum) {
  return Math.round(datum.marginPercentagePoints * 100) === 0;
}

function getDatumColor(datum: MapDatum) {
  return hasEvenDisplayedMargin(datum)
    ? EVEN_MARGIN_COLOR
    : CANDIDATE_COLORS[datum.leader];
}

function getRawBounds(geoJson: GeoJsonFeatureCollection) {
  const bounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };

  function visit(coordinates: unknown) {
    if (!Array.isArray(coordinates)) {
      return;
    }

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      bounds.minLng = Math.min(bounds.minLng, coordinates[0]);
      bounds.maxLng = Math.max(bounds.maxLng, coordinates[0]);
      bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
      bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);
      return;
    }

    for (const child of coordinates) {
      visit(child);
    }
  }

  for (const feature of geoJson.features) {
    visit(feature.geometry.coordinates);
  }

  return bounds;
}

function geometryToPath(
  geometry: GeoJsonFeature["geometry"],
  project: (coordinate: [number, number]) => [number, number],
) {
  function ringToPath(ring: unknown) {
    if (!Array.isArray(ring)) {
      return "";
    }

    return ring
      .map((coordinate, index) => {
        if (
          !Array.isArray(coordinate) ||
          typeof coordinate[0] !== "number" ||
          typeof coordinate[1] !== "number"
        ) {
          return "";
        }

        const [x, y] = project([coordinate[0], coordinate[1]]);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ")
      .concat(" Z");
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(ringToPath).join(" ");
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .flatMap((polygon) => (Array.isArray(polygon) ? polygon.map(ringToPath) : []))
      .join(" ");
  }

  return "";
}

function getGeometryCenter(
  geometry: GeoJsonFeature["geometry"],
  project: (coordinate: [number, number]) => [number, number],
) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  function visit(coordinates: unknown) {
    if (!Array.isArray(coordinates)) {
      return;
    }

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      const [x, y] = project([coordinates[0], coordinates[1]]);
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
      return;
    }

    for (const child of coordinates) {
      visit(child);
    }
  }

  visit(geometry.coordinates);

  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return null;
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function getGeoUrl(level: ViewLevel, uf: string) {
  if (level === "states") {
    return "/data/geo/states.geojson";
  }

  return uf ? `/data/geo/municipalities/${uf.toLowerCase()}.geojson` : "";
}

async function loadAllMunicipalityGeoJson() {
  const responses = await Promise.all(
    UF_ORDER.map((stateUf) =>
      fetch(`/data/geo/municipalities/${stateUf.toLowerCase()}.geojson`),
    ),
  );
  const failedResponse = responses.find((response) => !response.ok);

  if (failedResponse) {
    throw new Error(`Falha ao carregar geometria (${failedResponse.status})`);
  }

  const collections = await Promise.all(
    responses.map((response) => response.json() as Promise<GeoJsonFeatureCollection>),
  );

  return {
    type: "FeatureCollection",
    features: collections.flatMap((collection) => collection.features),
  } satisfies GeoJsonFeatureCollection;
}

function getProjector(
  geoJson: GeoJsonFeatureCollection,
  width: number,
  height: number,
  padding: number,
) {
  const bounds = getRawBounds(geoJson);

  if (
    !Number.isFinite(bounds.minLng) ||
    !Number.isFinite(bounds.minLat) ||
    !Number.isFinite(bounds.maxLng) ||
    !Number.isFinite(bounds.maxLat)
  ) {
    return null;
  }

  const lngRange = bounds.maxLng - bounds.minLng;
  const latRange = bounds.maxLat - bounds.minLat;
  const scale = Math.min(
    (width - padding * 2) / Math.max(lngRange, 1),
    (height - padding * 2) / Math.max(latRange, 1),
  );
  const projectedWidth = lngRange * scale;
  const projectedHeight = latRange * scale;
  const offsetX = (width - projectedWidth) / 2;
  const offsetY = (height - projectedHeight) / 2;

  return ([lng, lat]: [number, number]): [number, number] => [
    offsetX + (lng - bounds.minLng) * scale,
    offsetY + (bounds.maxLat - lat) * scale,
  ];
}

function clampTransform(
  transform: MapTransform,
  width: number,
  height: number,
): MapTransform {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.scale));

  if (scale === MIN_ZOOM) {
    return INITIAL_TRANSFORM;
  }

  return {
    scale,
    x: Math.min(0, Math.max(width * (1 - scale), transform.x)),
    y: Math.min(0, Math.max(height * (1 - scale), transform.y)),
  };
}

export function ElectionMap({
  level,
  uf,
  states,
  municipalities,
  leaderFilter,
  selectedMunicipality,
  onStateClick,
  onMunicipalityClick,
}: ElectionMapProps) {
  const [geoJson, setGeoJson] = useState<GeoJsonFeatureCollection | null>(null);
  const [stateBoundaries, setStateBoundaries] = useState<GeoJsonFeature[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [transform, setTransform] = useState<MapTransform>(INITIAL_TRANSFORM);
  const [error, setError] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  const pendingClickRef = useRef<PendingMapClick | null>(null);
  const width = 840;
  const height = 620;
  const padding = 14;

  const visibleData = useMemo(() => {
    if (level === "states") {
      return states;
    }

    if (level === "detailed") {
      return municipalities;
    }

    return municipalities.filter((municipality) => municipality.uf === uf);
  }, [level, municipalities, states, uf]);

  useEffect(() => {
    let isCancelled = false;
    const geoUrl = getGeoUrl(level, uf);

    queueMicrotask(() => {
      if (!isCancelled) {
        setTooltip(null);
        setTransform(INITIAL_TRANSFORM);
        setIsDragging(false);
      }
    });

    if (!geoUrl && level !== "detailed") {
      queueMicrotask(() => {
        if (!isCancelled) {
          setGeoJson(null);
          setError("");
          setIsLoading(false);
        }
      });
      return;
    }

    async function loadGeoJson() {
      try {
        setIsLoading(true);
        setError("");
        let rawGeoJson: GeoJsonFeatureCollection;

        if (level === "detailed") {
          rawGeoJson = await loadAllMunicipalityGeoJson();
        } else {
          const response = await fetch(geoUrl);

          if (!response.ok) {
            throw new Error(`Falha ao carregar geometria (${response.status})`);
          }

          rawGeoJson = (await response.json()) as GeoJsonFeatureCollection;
        }

        if (!isCancelled) {
          setGeoJson(rawGeoJson);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setGeoJson(null);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadGeoJson();

    return () => {
      isCancelled = true;
    };
  }, [level, uf]);

  useEffect(() => {
    let isCancelled = false;

    if (level !== "detailed") {
      queueMicrotask(() => {
        if (!isCancelled) {
          setStateBoundaries([]);
        }
      });
      return;
    }

    async function loadStateBoundaries() {
      try {
        const response = await fetch("/data/geo/states.geojson");

        if (!response.ok) {
          throw new Error("Falha ao carregar divisas estaduais.");
        }

        const stateGeoJson = (await response.json()) as GeoJsonFeatureCollection;

        if (!isCancelled) {
          setStateBoundaries(stateGeoJson.features);
        }
      } catch {
        if (!isCancelled) {
          setStateBoundaries([]);
        }
      }
    }

    void loadStateBoundaries();

    return () => {
      isCancelled = true;
    };
  }, [level]);

  const dataById = useMemo(() => {
    const map = new Map<string, MapDatum>();

    for (const datum of visibleData) {
      map.set(datum.ibgeCode, datum);
    }

    return map;
  }, [visibleData]);

  const projectedFeatures = useMemo(() => {
    if (!geoJson) {
      return [];
    }

    const project = getProjector(geoJson, width, height, padding);

    if (!project) {
      return [];
    }

    return geoJson.features.map((feature) => {
      const id = String(feature.properties?.ibgeCode ?? feature.properties?.uf ?? "");
      const datum = dataById.get(id);
      const isCapital =
        datum && isMunicipality(datum)
          ? normalizeSearch(datum.name) ===
            normalizeSearch(CAPITAL_NAME_BY_UF[datum.uf] ?? "")
          : false;

      return {
        id,
        datum,
        center: isCapital ? getGeometryCenter(feature.geometry, project) : null,
        isCapital,
        path: geometryToPath(feature.geometry, project),
      };
    });
  }, [dataById, geoJson]);

  const capitalFeatures = useMemo(() => {
    return projectedFeatures.filter(
      (feature): feature is typeof feature & {
        datum: MunicipalityResult;
        center: { x: number; y: number };
      } => Boolean(feature.datum) && feature.isCapital && Boolean(feature.center),
    );
  }, [projectedFeatures]);

  const projectedStateBoundaries = useMemo(() => {
    if (!geoJson || level !== "detailed" || stateBoundaries.length === 0) {
      return [];
    }

    const project = getProjector(geoJson, width, height, padding);

    if (!project) {
      return [];
    }

    return stateBoundaries.map((feature) => ({
      id: String(feature.properties?.uf ?? feature.id ?? ""),
      path: geometryToPath(feature.geometry, project),
    }));
  }, [geoJson, level, stateBoundaries]);

  const hasGeoUrl = level === "detailed" || Boolean(getGeoUrl(level, uf));

  const zoomAtPoint = useCallback(
    (nextScale: number, point = { x: width / 2, y: height / 2 }) => {
      setTransform((current) => {
        const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
        const mapX = (point.x - current.x) / current.scale;
        const mapY = (point.y - current.y) / current.scale;

        return clampTransform(
          {
            scale,
            x: point.x - mapX * scale,
            y: point.y - mapY * scale,
          },
          width,
          height,
        );
      });
    },
    [],
  );

  useEffect(() => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const mapElement = svg;

    function handleNativeWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = mapElement.getBoundingClientRect();
      const point = {
        x: ((event.clientX - rect.left) / rect.width) * width,
        y: ((event.clientY - rect.top) / rect.height) * height,
      };
      const direction = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;

      setTooltip(null);
      setTransform((current) => {
        const scale = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, current.scale * direction),
        );
        const mapX = (point.x - current.x) / current.scale;
        const mapY = (point.y - current.y) / current.scale;

        return clampTransform(
          {
            scale,
            x: point.x - mapX * scale,
            y: point.y - mapY * scale,
          },
          width,
          height,
        );
      });
    }

    mapElement.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      mapElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (transform.scale === MIN_ZOOM) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      didDragRef.current = false;
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: transform.x,
        originY: transform.y,
      };
      setIsDragging(true);
    },
    [transform],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const dx = ((event.clientX - drag.startClientX) / rect.width) * width;
      const dy = ((event.clientY - drag.startClientY) / rect.height) * height;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        didDragRef.current = true;
      }

      setTransform(
        clampTransform(
          {
            scale: transform.scale,
            x: drag.originX + dx,
            y: drag.originY + dy,
          },
          width,
          height,
        ),
      );
    },
    [transform.scale],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      const pendingClick = pendingClickRef.current;

      if (drag?.pointerId === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        dragRef.current = null;
        setIsDragging(false);
      }

      if (!didDragRef.current && pendingClick) {
        if (isMunicipality(pendingClick.datum)) {
          onMunicipalityClick(pendingClick.datum.ibgeCode);
        } else {
          onStateClick(pendingClick.datum.uf);
        }
      }

      pendingClickRef.current = null;
      setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    },
    [onMunicipalityClick, onStateClick],
  );

  const handlePointerCancel = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    pendingClickRef.current = null;
    didDragRef.current = false;
    setIsDragging(false);
  }, []);

  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <svg
        ref={svgRef}
        className={`h-[460px] w-full touch-none select-none md:h-[620px] ${
          transform.scale > MIN_ZOOM
            ? isDragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : ""
        }`}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-label={
          level === "states"
            ? "Mapa eleitoral por estados"
            : level === "detailed"
              ? "Mapa eleitoral detalhado por municípios"
              : `Mapa eleitoral municipal ${uf ? `de ${uf}` : ""}`
        }
      >
        <rect width={width} height={height} fill="#f8fafc" />
        <g
          transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
        >
          {projectedFeatures.map((feature) => {
            const datum = feature.datum;
            const isFilteredOut =
              Boolean(datum) &&
              leaderFilter !== "all" &&
              datum?.leader !== leaderFilter;
            const selected =
              datum && !isFilteredOut && isMunicipality(datum)
                ? datum.ibgeCode === selectedMunicipality
                : false;

            return (
              <path
                key={feature.id}
                d={feature.path}
                fill={datum ? getDatumColor(datum) : "#cbd5e1"}
                fillOpacity={datum ? (isFilteredOut ? 0.22 : 0.84) : 0.1}
                stroke={selected ? "#111827" : "#ffffff"}
                strokeWidth={selected ? 2.8 : level === "detailed" ? 0.35 : 0.8}
                strokeOpacity={isFilteredOut ? 0.18 : level === "detailed" ? 0.58 : 1}
                vectorEffect="non-scaling-stroke"
                onPointerDown={() => {
                  if (!datum || isFilteredOut) {
                    pendingClickRef.current = null;
                    return;
                  }

                  pendingClickRef.current = { datum };
                }}
                onMouseEnter={(event) => {
                  if (!datum || isFilteredOut || isDragging) {
                    return;
                  }

                  const rect =
                    event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  setTooltip({
                    x: event.clientX - (rect?.left ?? 0),
                    y: event.clientY - (rect?.top ?? 0),
                    datum,
                  });
                }}
                onMouseMove={(event) => {
                  if (!datum || isFilteredOut || isDragging) {
                    return;
                  }

                  const rect =
                    event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  setTooltip({
                    x: event.clientX - (rect?.left ?? 0),
                    y: event.clientY - (rect?.top ?? 0),
                    datum,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                className={
                  datum && !isFilteredOut
                    ? "cursor-pointer transition-opacity hover:opacity-80"
                    : ""
                }
              />
            );
          })}
          {projectedStateBoundaries.map((feature) => (
            <path
              key={`state-boundary-${feature.id}`}
              d={feature.path}
              fill="none"
              stroke="#334155"
              strokeOpacity={0.5}
              strokeWidth={0.85}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
          {capitalFeatures.map((feature) => {
            const isFilteredOut =
              leaderFilter !== "all" && feature.datum.leader !== leaderFilter;
            const markerScale = 1 / transform.scale;

            return (
              <g
                key={`capital-${feature.datum.ibgeCode}`}
                transform={`translate(${feature.center.x} ${feature.center.y})`}
                opacity={isFilteredOut ? 0.48 : 1}
                pointerEvents="none"
              >
                <circle
                  r={5.4 * markerScale}
                  fill="white"
                  stroke={getDatumColor(feature.datum)}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  r={2.1 * markerScale}
                  fill={getDatumColor(feature.datum)}
                />
                <text
                  x={8 * markerScale}
                  y={-7 * markerScale}
                  fill={getDatumColor(feature.datum)}
                  fontSize={11 * markerScale}
                  fontWeight={700}
                  paintOrder="stroke"
                  stroke="white"
                  strokeLinejoin="round"
                  strokeWidth={4 * markerScale}
                >
                  {feature.datum.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/80 bg-white/90 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur">
        {level === "states"
          ? "Mapa por estados"
          : level === "detailed"
            ? "Detalhado por municípios"
            : `Municípios ${uf ? `- ${uf}` : ""}`}
      </div>

      <div className="absolute right-4 top-4 flex items-center overflow-hidden rounded-md border border-white/80 bg-white/90 text-sm shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => zoomAtPoint(transform.scale * ZOOM_STEP)}
          disabled={transform.scale >= MAX_ZOOM}
          aria-label="Aproximar mapa"
          className="h-9 w-9 border-r border-slate-200 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomAtPoint(transform.scale / ZOOM_STEP)}
          disabled={transform.scale <= MIN_ZOOM}
          aria-label="Afastar mapa"
          className="h-9 w-9 border-r border-slate-200 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => setTransform(INITIAL_TRANSFORM)}
          disabled={transform.scale === MIN_ZOOM}
          className="h-9 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      {isLoading ? (
        <div className="absolute bottom-4 left-4 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow">
          Carregando mapa...
        </div>
      ) : null}

      {!hasGeoUrl ? (
        <div className="absolute bottom-4 left-4 rounded-md bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm">
          Selecione um estado para ver os municípios.
        </div>
      ) : null}

      {error ? (
        <div className="absolute bottom-4 right-4 rounded-md bg-red-700 px-3 py-2 text-xs font-medium text-white shadow">
          {error}
        </div>
      ) : null}

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg"
          style={{
            left: Math.min(tooltip.x + 14, 520),
            top: Math.max(tooltip.y - 12, 12),
          }}
        >
          <div className="mb-2 font-semibold text-slate-950">
            {isMunicipality(tooltip.datum)
              ? `${tooltip.datum.name} - ${tooltip.datum.uf}`
              : `${tooltip.datum.name} - ${tooltip.datum.uf}`}
          </div>
          {(["lula", "flavio"] as CandidateKey[]).map((candidate) => (
            <div key={candidate} className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CANDIDATE_COLORS[candidate] }}
                />
                {CANDIDATE_LABEL[candidate]}
              </span>
              <span className="font-medium text-slate-950">
                {formatPercentage(tooltip.datum.results[candidate].percentage)}
              </span>
            </div>
          ))}
          <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
            Líder no comparativo:{" "}
            <strong className="text-slate-950">
              {CANDIDATE_LABEL[tooltip.datum.leader]}
            </strong>{" "}
            por {formatMargin(tooltip.datum.marginPercentagePoints)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatVotes(tooltip.datum.results[tooltip.datum.leader].votes)} votos
          </div>
        </div>
      ) : null}
    </div>
  );
}
