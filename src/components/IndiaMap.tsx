import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import indiaGeoJson from '../assets/india_states.json';
import indiaDistrictsJson from '../assets/india_districts.json';
import type { Station, Reading, StationStatus } from '../services/dataService';

// Color tokens matching SkyGuard AI HUD theme
const CLR = {
  blue:    '#00D4FF',
  amber:   '#FFB800',
  red:     '#FF3B5C',
  green:   '#00FFA3',
  purple:  '#A855F7',
  dimBlue: 'rgba(0,212,255,0.18)',
};

function statusColor(s: StationStatus) {
  if (s === 'critical' || s === 'offline') return CLR.red;
  if (s === 'warning') return CLR.amber;
  if (s === 'normal') return CLR.green;
  return CLR.blue;
}

interface IndiaMapProps {
  stations: Station[];
  statuses: Record<string, StationStatus>;
  latest: Record<string, Reading | null>;
  selected: string;
  onSelect: (id: string) => void;
}

interface HoverStateInfo {
  name: string;
  stationsInState: Station[];
  avgTemp: number | null;
  avgPres: number | null;
  avgHum: number | null;
  worstStatus: StationStatus;
}

const UNION_TERRITORIES = new Set([
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]);

// Map station state names / search query aliases to GeoJSON state names
function normalizeStateName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed === 'J&K' || trimmed === 'Jammu & Kashmir' || trimmed === 'Ladakh') {
    return 'Jammu and Kashmir';
  }
  if (trimmed.includes('Andaman')) return 'Andaman and Nicobar Islands';
  if (trimmed.includes('Lakshadweep') || trimmed === 'Laccadive') return 'Lakshadweep';
  if (trimmed.includes('Dadra') || trimmed.includes('Daman')) return 'Dadra and Nagar Haveli and Daman and Diu';
  return trimmed;
}

// ─── Sub-Component 1: Memoized District Boundaries Layer (~760 paths) ───────
interface DistrictPathData {
  id: string;
  distName: string;
  stateName: string;
  d: string;
}

const MemoizedDistrictsLayer = memo(
  function DistrictsLayer({
    districtPaths,
    showDistricts,
    hoveredStateName,
    selectedStateName,
  }: {
    districtPaths: DistrictPathData[];
    showDistricts: boolean;
    hoveredStateName: string | null;
    selectedStateName: string | null;
  }) {
    if (!showDistricts) return null;

    return (
      <g className="districts-layer pointer-events-none" style={{ willChange: 'transform' }}>
        {districtPaths.map((dist) => {
          const isStateHovered = hoveredStateName === dist.stateName;
          const isSelectedState = selectedStateName === dist.stateName;

          let strokeColor = 'rgba(0, 212, 255, 0.10)';
          let strokeWidth = 0.35;

          if (isSelectedState) {
            strokeColor = 'rgba(0, 212, 255, 0.28)';
            strokeWidth = 0.45;
          } else if (isStateHovered) {
            strokeColor = 'rgba(0, 255, 163, 0.25)';
            strokeWidth = 0.45;
          }

          return (
            <path
              key={dist.id}
              d={dist.d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.showDistricts === nextProps.showDistricts &&
      prevProps.hoveredStateName === nextProps.hoveredStateName &&
      prevProps.selectedStateName === nextProps.selectedStateName &&
      prevProps.districtPaths === nextProps.districtPaths
    );
  }
);

// ─── Sub-Component 2: Memoized State Boundaries Layer (35 features) ────────
interface StatePathData {
  id: string;
  name: string;
  d: string;
}

const MemoizedStatesLayer = memo(
  function StatesLayer({
    statePaths,
    stateStationMap,
    hoveredStateName,
    selectedStateName,
    searchQuery,
    onStateMouseEnter,
    onStateMouseLeave,
    onStateClick,
  }: {
    statePaths: StatePathData[];
    stateStationMap: Record<string, Station[]>;
    hoveredStateName: string | null;
    selectedStateName: string | null;
    searchQuery: string;
    onStateMouseEnter: (name: string, e: React.MouseEvent<SVGPathElement>) => void;
    onStateMouseLeave: () => void;
    onStateClick: (name: string) => void;
  }) {
    const q = searchQuery.trim().toLowerCase();

    return (
      <g className="states-layer">
        {statePaths.map((st) => {
          const isHovered = hoveredStateName === st.name;
          const hasStations = (stateStationMap[st.name] || []).length > 0;
          const containsSelected = selectedStateName === st.name;
          const isIsland = st.name === 'Andaman and Nicobar Islands' || st.name === 'Lakshadweep';
          const matchesSearch = q.length > 0 && st.name.toLowerCase().includes(q);

          let fillColor = isIsland ? 'rgba(0, 212, 255, 0.08)' : 'rgba(0, 212, 255, 0.04)';
          let strokeColor = isIsland ? 'rgba(0, 212, 255, 0.45)' : 'rgba(0, 212, 255, 0.25)';
          let strokeWidth = isIsland ? 1.0 : 0.8;

          if (containsSelected) {
            fillColor = 'rgba(0, 212, 255, 0.18)';
            strokeColor = CLR.blue;
            strokeWidth = 1.6;
          } else if (isHovered) {
            fillColor = 'rgba(0, 212, 255, 0.14)';
            strokeColor = '#00FFA3';
            strokeWidth = 1.4;
          } else if (matchesSearch) {
            fillColor = 'rgba(255, 184, 0, 0.22)';
            strokeColor = CLR.amber;
            strokeWidth = 1.6;
          } else if (hasStations) {
            fillColor = 'rgba(0, 212, 255, 0.08)';
            strokeColor = 'rgba(0, 212, 255, 0.35)';
          }

          return (
            <path
              key={st.id}
              d={st.d}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="transition-colors duration-150 cursor-pointer"
              onMouseEnter={(e) => onStateMouseEnter(st.name, e)}
              onMouseLeave={onStateMouseLeave}
              onClick={() => onStateClick(st.name)}
            />
          );
        })}
      </g>
    );
  }
);

// ─── Sub-Component 3: Memoized State Labels Overlay ─────────────────────────
const MemoizedStateLabelsLayer = memo(
  function StateLabelsLayer({
    statePaths,
    stateStationMap,
    showStateLabels,
    pathGenerator,
  }: {
    statePaths: StatePathData[];
    stateStationMap: Record<string, Station[]>;
    showStateLabels: boolean;
    pathGenerator: any;
  }) {
    if (!showStateLabels) return null;

    return (
      <g className="pointer-events-none opacity-40">
        {statePaths.map((st) => {
          const hasStations = (stateStationMap[st.name] || []).length > 0;
          const isIsland = st.name === 'Andaman and Nicobar Islands' || st.name === 'Lakshadweep';
          if (!hasStations && !isIsland && st.name.length > 12) return null;

          const feature = (indiaGeoJson as any).features.find(
            (f: any) => (f.properties.st_nm || f.properties.state_name) === st.name
          );
          if (!feature) return null;

          const centroid = pathGenerator.centroid(feature);
          if (!centroid || isNaN(centroid[0]) || isNaN(centroid[1])) return null;

          const labelText = st.name === 'Andaman and Nicobar Islands' ? 'A&N Islands' : st.name;

          return (
            <text
              key={`lbl-${st.id}`}
              x={centroid[0]}
              y={centroid[1]}
              textAnchor="middle"
              className="font-mono text-[7px] fill-cyan-200/60 font-semibold tracking-tighter"
              style={{ textShadow: '0 0 3px rgba(0,0,0,0.9)' }}
            >
              {labelText}
            </text>
          );
        })}
      </g>
    );
  }
);

// ─── Main Component ─────────────────────────────────────────────────────────
export default function IndiaMap({
  stations,
  statuses,
  latest,
  selected,
  onSelect,
}: IndiaMapProps) {
  const [hoveredStateInfo, setHoveredStateInfo] = useState<HoverStateInfo | null>(null);
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
  const [showStateLabels, setShowStateLabels] = useState(true);
  const [showDistricts, setShowDistricts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Ref for zero-re-render DOM tooltip mouse positioning
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // ─── D3 Mercator Projection centered to fit entire country & island UTs ──
  const projection = useMemo(() => {
    return geoMercator()
      .center([82.5, 22.0])
      .scale(820)
      .translate([260, 260]);
  }, []);

  const pathGenerator = useMemo(() => geoPath().projection(projection), [projection]);

  // Project state features into SVG path data & verify feature count
  const statePaths = useMemo(() => {
    const rawFeatures = (indiaGeoJson as any).features || [];
    return rawFeatures.map((feature: any) => {
      const name: string = feature.properties.st_nm || feature.properties.state_name;
      const d = pathGenerator(feature) || '';
      return { id: feature.id || name, name, d };
    });
  }, [pathGenerator]);

  // Project district features into SVG path data (~760 districts)
  const districtPaths = useMemo(() => {
    const rawFeatures = (indiaDistrictsJson as any).features || [];
    return rawFeatures.map((feature: any, idx: number) => {
      const distName: string =
        feature.properties.district || feature.properties.dtname || feature.properties.DISTRICT || `Dist_${idx}`;
      const stateName: string = normalizeStateName(
        feature.properties.st_nm || feature.properties.state_name || feature.properties.NAME_1 || ''
      );
      const d = pathGenerator(feature) || '';
      return { id: feature.id || `dist-${idx}`, distName, stateName, d };
    });
  }, [pathGenerator]);

  // Log dataset feature counts vs rendered path counts on mount
  useEffect(() => {
    const totalStateFeatures = (indiaGeoJson as any).features?.length || 0;
    const validStatePathsCount = statePaths.filter((sp: { d: string }) => sp.d && sp.d.length > 0).length;
    console.log(`[IndiaMap] State Dataset Features: ${totalStateFeatures} | Rendered Path Elements: ${validStatePathsCount}`);

    const totalDistrictFeatures = (indiaDistrictsJson as any).features?.length || 0;
    const validDistrictPathsCount = districtPaths.filter((dp: { d: string }) => dp.d && dp.d.length > 0).length;
    console.log(`[IndiaMap] District Dataset Features: ${totalDistrictFeatures} | Rendered Path Elements: ${validDistrictPathsCount}`);
  }, [statePaths, districtPaths]);

  // Map stations to states by normalized name matching
  const stateStationMap = useMemo(() => {
    const map: Record<string, Station[]> = {};
    stations.forEach((s) => {
      const stName = normalizeStateName(s.state);
      if (!map[stName]) map[stName] = [];
      map[stName].push(s);
    });
    return map;
  }, [stations]);

  // Update mouse position via direct DOM transform (zero React re-renders on mousemove!)
  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!tooltipRef.current || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = Math.min(e.clientX - rect.left + 15, 300);
    const y = Math.max(e.clientY - rect.top - 20, 20);
    tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  // Mouse enter state -> calculate aggregate metrics once
  const handleMouseEnterState = useCallback(
    (stateName: string, e: React.MouseEvent<SVGPathElement>) => {
      const stationsInState = stateStationMap[stateName] || [];
      let sumTemp = 0, sumPres = 0, sumHum = 0, count = 0;
      let worst: StationStatus = 'normal';

      stationsInState.forEach((st: Station) => {
        const rd = latest[st.id];
        if (rd) {
          sumTemp += rd.temperature;
          sumPres += rd.pressure;
          sumHum += rd.humidity;
          count++;
        }
        const status = statuses[st.id] || 'normal';
        if (status === 'critical') worst = 'critical';
        else if (status === 'warning' && worst !== 'critical') worst = 'warning';
      });

      setHoveredStateInfo({
        name: stateName,
        stationsInState,
        avgTemp: count > 0 ? sumTemp / count : null,
        avgPres: count > 0 ? sumPres / count : null,
        avgHum: count > 0 ? sumHum / count : null,
        worstStatus: worst,
      });

      // Set initial tooltip position
      if (tooltipRef.current && mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        const x = Math.min(e.clientX - rect.left + 15, 300);
        const y = Math.max(e.clientY - rect.top - 20, 20);
        tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    },
    [stateStationMap, latest, statuses]
  );

  const handleMouseLeaveState = useCallback(() => {
    setHoveredStateInfo(null);
  }, []);

  const handleStateClick = useCallback(
    (stateName: string) => {
      const stationsInState = stateStationMap[stateName] || [];
      if (stationsInState.length > 0) {
        onSelect(stationsInState[0].id);
      }
    },
    [stateStationMap, onSelect]
  );

  // Selected station reference
  const selStation = useMemo(() => stations.find((s) => s.id === selected), [stations, selected]);
  const selectedStateName = useMemo(() => (selStation ? normalizeStateName(selStation.state) : null), [selStation]);

  return (
    <div
      ref={mapContainerRef}
      onMouseMove={handleContainerMouseMove}
      className="relative w-full h-full flex flex-col items-center justify-center p-2 select-none overflow-hidden"
    >
      {/* Search & Map Controls */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-2 glass rounded-lg px-2.5 py-1.5 border border-cyan-500/20">
        <input
          type="text"
          placeholder="Search State / UT..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-black/40 border border-white/10 text-xs text-cyan-300 placeholder-white/30 rounded px-2 py-0.5 outline-none font-mono w-36 focus:border-cyan-400/50 transition-colors"
        />
        <button
          onClick={() => setShowDistricts((v) => !v)}
          className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase border transition-all ${
            showDistricts
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
              : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
          }`}
        >
          Districts {showDistricts ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={() => setShowStateLabels((v) => !v)}
          className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase border transition-all ${
            showStateLabels
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
              : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
          }`}
        >
          Labels {showStateLabels ? 'ON' : 'OFF'}
        </button>
      </div>

      <svg
        viewBox="0 0 520 520"
        className="max-h-full max-w-full w-auto h-auto transition-transform duration-300"
      >
        <defs>
          <radialGradient id="selectedGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── State & UT Polygon Boundaries Layer ──────────────────────────────── */}
        <MemoizedStatesLayer
          statePaths={statePaths}
          stateStationMap={stateStationMap}
          hoveredStateName={hoveredStateInfo?.name || null}
          selectedStateName={selectedStateName}
          searchQuery={searchQuery}
          onStateMouseEnter={handleMouseEnterState}
          onStateMouseLeave={handleMouseLeaveState}
          onStateClick={handleStateClick}
        />

        {/* ── District-Level Internal Boundaries Layer (~760 Districts) ──────────── */}
        <MemoizedDistrictsLayer
          districtPaths={districtPaths}
          showDistricts={showDistricts}
          hoveredStateName={hoveredStateInfo?.name || null}
          selectedStateName={selectedStateName}
        />

        {/* ── State & Island Name Labels Overlay ───────────────────────────── */}
        <MemoizedStateLabelsLayer
          statePaths={statePaths}
          stateStationMap={stateStationMap}
          showStateLabels={showStateLabels}
          pathGenerator={pathGenerator}
        />

        {/* ── AWS Station Pin Markers ─────────────────────────────────────────── */}
        <g className="stations-layer">
          {stations.map((s) => {
            const projected = projection([s.lon, s.lat]);
            if (!projected) return null;
            const [x, y] = projected;
            const st = statuses[s.id] || 'normal';
            const color = statusColor(st);
            const isSelected = s.id === selected;
            const isHovered = hoveredStationId === s.id;
            const r = isSelected ? 6.5 : isHovered ? 5.5 : 4.5;

            return (
              <g
                key={s.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(s.id);
                }}
                onMouseEnter={() => setHoveredStationId(s.id)}
                onMouseLeave={() => setHoveredStationId(null)}
              >
                {/* Outer Radar Pulse Rings (GPU scale animation) */}
                <circle
                  cx={x}
                  cy={y}
                  r={r + 5}
                  fill={color}
                  opacity={0}
                  className="pin-pulse"
                  style={{ transformOrigin: `${x}px ${y}px`, willChange: 'transform, opacity' }}
                />
                {st !== 'normal' && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 10}
                    fill={color}
                    opacity={0}
                    className="pin-pulse-slow"
                    style={{ transformOrigin: `${x}px ${y}px`, willChange: 'transform, opacity' }}
                  />
                )}

                {/* Pin Point */}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={color}
                  stroke={isSelected ? '#FFFFFF' : 'rgba(0,0,0,0.6)'}
                  strokeWidth={isSelected ? 1.8 : 1}
                  style={{ transition: 'r 0.15s ease, fill 0.2s ease' }}
                />

                {/* Station Code Badge */}
                {(isSelected || isHovered) && (
                  <g transform={`translate(${x + 9}, ${y - 4})`}>
                    <rect
                      x={-2}
                      y={-9}
                      width={s.name.length * 6 + 10}
                      height={14}
                      rx={3}
                      fill="rgba(6, 10, 20, 0.90)"
                      stroke={color}
                      strokeWidth={1}
                    />
                    <text
                      x={3}
                      y={1}
                      className="font-mono text-[9px] font-bold"
                      fill={color}
                    >
                      {s.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* ── Legend ───────────────────────────────────────────────────────────── */}
        <g transform="translate(12, 455)">
          <rect
            x={0}
            y={0}
            width={120}
            height={55}
            rx={6}
            fill="rgba(6, 10, 20, 0.75)"
            stroke="rgba(0, 212, 255, 0.2)"
            strokeWidth={0.8}
          />
          <text x={8} y={12} className="font-mono text-[8px] font-bold fill-cyan-400 uppercase tracking-widest">
            AWS STATUS
          </text>
          {([['NORMAL', CLR.green], ['WARNING', CLR.amber], ['CRITICAL', CLR.red]] as const).map(
            ([label, color], i) => (
              <g key={label} transform={`translate(8, ${24 + i * 11})`}>
                <circle cx={3} cy={0} r={3} fill={color} />
                <text x={10} y={3} className="font-mono text-[8px] fill-slate-300">
                  {label}
                </text>
              </g>
            )
          )}
        </g>
      </svg>

      {/* ── High-Performance Zero-Re-Render DOM Tooltip Card ────────────────── */}
      {hoveredStateInfo && (
        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none glass rounded-xl p-3 shadow-2xl border border-cyan-400/30 transition-transform duration-75 ease-out"
          style={{
            background: 'rgba(6, 10, 20, 0.92)',
            backdropFilter: 'blur(12px)',
            minWidth: 200,
            willChange: 'transform',
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-cyan-500/20 pb-1.5 mb-2">
            <div>
              <div className="font-display text-sm font-bold text-white tracking-wide">
                {hoveredStateInfo.name}
              </div>
              <div className="font-mono text-[10px] text-cyan-400/70">
                {UNION_TERRITORIES.has(hoveredStateInfo.name) ? 'UNION TERRITORY' : 'STATE'}
              </div>
            </div>
            <div
              className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase"
              style={{
                background: `${statusColor(hoveredStateInfo.worstStatus)}22`,
                color: statusColor(hoveredStateInfo.worstStatus),
                border: `1px solid ${statusColor(hoveredStateInfo.worstStatus)}`,
              }}
            >
              {hoveredStateInfo.worstStatus}
            </div>
          </div>

          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Active AWS Stations:</span>
              <span className="text-cyan-300 font-bold">{hoveredStateInfo.stationsInState.length}</span>
            </div>

            {hoveredStateInfo.stationsInState.length > 0 ? (
              <>
                <div className="flex justify-between text-slate-400">
                  <span>Avg Temp:</span>
                  <span className="text-cyan-400 font-semibold">
                    {hoveredStateInfo.avgTemp !== null ? `${hoveredStateInfo.avgTemp.toFixed(1)}°C` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Avg Pressure:</span>
                  <span className="text-amber-400 font-semibold">
                    {hoveredStateInfo.avgPres !== null ? `${hoveredStateInfo.avgPres.toFixed(1)} hPa` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Avg Humidity:</span>
                  <span className="text-emerald-400 font-semibold">
                    {hoveredStateInfo.avgHum !== null ? `${hoveredStateInfo.avgHum.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="mt-2 pt-1 border-t border-white/10 text-[10px] text-cyan-300/80">
                  Stations: {hoveredStateInfo.stationsInState.map((st: Station) => st.name).join(', ')}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-500 italic mt-1">
                No active station deployed in region
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
