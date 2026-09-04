import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as DS from './services/dataService';
import type { Station, Reading, AnomalyEvent, FaultType, DetectionMode } from './services/dataService';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const CLR = {
  blue:   '#00D4FF',
  amber:  '#FFB800',
  red:    '#FF3B5C',
  green:  '#00FFA3',
  dimBlue:'rgba(0,212,255,0.18)',
};

function statusColor(s: string) {
  if (s === 'critical') return CLR.red;
  if (s === 'offline')  return CLR.red;
  if (s === 'warning')  return CLR.amber;
  if (s === 'healed' || s === 'normal') return CLR.green;
  return CLR.blue;
}
function statusGlow(s: string) {
  if (s === 'critical' || s === 'offline') return 'glow-red';
  if (s === 'warning') return 'glow-amber';
  return 'glow-blue';
}

// India SVG map helpers (viewBox 0 0 400 500)
function mapX(lon: number) { return (lon - 68) / 30 * 380 + 10; }
function mapY(lat: number) { return (37 - lat) / 30 * 480 + 10; }

const INDIA_PATH =
  'M 12.5,226 L 29,202 L 41.7,154 L 54.3,122 L 67,66 L 86,50 L 92.3,34 L 105,18 ' +
  'L 124,10 L 143,34 L 162,50 L 187.3,106 L 212.7,146 L 232,162 L 251,162 ' +
  'L 270,170 L 276.4,170 L 289,170 L 314.7,162 L 333.4,178 L 346,170 L 364.7,162 ' +
  'L 377.3,170 L 377.3,202 L 364.7,218 L 352,234 L 339.3,226 L 326.7,210 ' +
  'L 307.7,186 L 295,210 L 289,234 L 276.4,234 L 270,226 L 263.3,242 ' +
  'L 251,274 L 238.4,290 L 225.3,306 L 212.7,338 L 200,378 L 168,394 ' +
  'L 162,434 L 155.3,450 L 136.7,458 L 130.3,463 L 117.7,450 L 98.7,418 ' +
  'L 92.3,354 L 79.7,330 L 67,306 L 70.8,274 L 48,258 L 35.3,234 L 16.3,218 Z';

// ─── ParticleBackground ───────────────────────────────────────────────────────
function ParticleBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-grid" />
      {/* Radar sweep centred in the page */}
      <div
        className="radar-sweep absolute"
        style={{ width: 900, height: 900, top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)' }}
      />
      {/* Ambient glow blobs */}
      <div className="absolute rounded-full opacity-10"
        style={{ width: 600, height: 600, top: -200, left: -100,
          background: 'radial-gradient(circle, #00D4FF 0%, transparent 70%)' }} />
      <div className="absolute rounded-full opacity-8"
        style={{ width: 400, height: 400, bottom: -100, right: -100,
          background: 'radial-gradient(circle, #00FFA3 0%, transparent 70%)' }} />
    </div>
  );
}

// ─── LiveClock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const fmt = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="font-mono text-right">
      <div className="text-lg font-semibold" style={{ color: CLR.blue }}>
        {fmt(time.getHours())}:{fmt(time.getMinutes())}:{fmt(time.getSeconds())} IST
      </div>
      <div className="text-xs opacity-50">
        {time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

// ─── HealthRing ───────────────────────────────────────────────────────────────
function HealthRing({ value }: { value: number }) {
  const r = 26; const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const color = value > 85 ? CLR.green : value > 60 ? CLR.amber : CLR.red;
  return (
    <div className="flex items-center gap-3">
      <svg width={70} height={70} viewBox="0 0 70 70">
        <circle cx={35} cy={35} r={r} fill="none" stroke="rgba(255,255,255,0.06)"
          strokeWidth={5} />
        <circle cx={35} cy={35} r={r} fill="none" stroke={color}
          strokeWidth={5} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 35 35)"
          style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s ease',
            filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x={35} y={40} textAnchor="middle" className="font-mono"
          style={{ fontSize: 14, fontWeight: 600, fill: color, fontFamily: "'JetBrains Mono'" }}>
          {value}%
        </text>
      </svg>
      <div>
        <div className="font-display text-xs font-semibold tracking-widest opacity-50 uppercase">
          Network Health
        </div>
        <div className="font-display text-sm font-semibold" style={{ color }}>
          {value > 85 ? 'ALL SYSTEMS GO' : value > 60 ? 'DEGRADED' : 'CRITICAL'}
        </div>
      </div>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ readings, color, w = 72, h = 22 }: { readings: Reading[]; color: string; w?: number; h?: number }) {
  if (readings.length < 2) return <svg width={w} height={h} />;
  const vals = readings.map(r => r.temperature);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * (w - 4) + 2},${h - 2 - ((v - mn) / rng) * (h - 4)}`
  ).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ─── StationCard (sidebar) ────────────────────────────────────────────────────
function StationCard({
  station, status, latest, history, selected, onClick,
}: {
  station: Station; status: DS.StationStatus; latest: Reading | null;
  history: Reading[]; selected: boolean; onClick: () => void;
}) {
  const color = statusColor(status);
  const prev = useRef(latest?.temperature ?? 0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (latest && Math.abs(latest.temperature - prev.current) > 0.3) {
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
      prev.current = latest.temperature;
    }
  }, [latest?.temperature]);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg p-2.5 mb-1.5 transition-all duration-200 ${
        selected ? 'glass ' + statusGlow(status) : 'hover:bg-white/5'
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="font-mono text-xs font-semibold" style={{ color }}>{station.name}</div>
          <div className="text-xs opacity-50 font-display">{station.location}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className={`w-2 h-2 rounded-full ${status !== 'normal' ? 'blink' : ''}`}
            style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          <div className={`font-mono text-sm font-semibold ${flash ? 'num-flash' : ''}`}
            style={{ color }}>
            {latest ? `${latest.temperature.toFixed(1)}°` : '--.-°'}
          </div>
        </div>
      </div>
      <Sparkline readings={history} color={color} />
    </button>
  );
}

// ─── ArcGauge ─────────────────────────────────────────────────────────────────
function ArcGauge({
  value, min, max, label, unit, status, anomalous,
}: {
  value: number; min: number; max: number; label: string; unit: string;
  status: DS.StationStatus; anomalous: boolean;
}) {
  const progress = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r = 70; const cx = 100; const cy = 95;
  const arcLen = Math.PI * r; // semicircle
  const dash = progress * arcLen;
  const color = anomalous ? CLR.red : statusColor(status);
  // Tip of the filled arc
  const tipAngle = (progress - 1) * Math.PI; // from -π to 0
  const tx = cx + r * Math.cos(tipAngle);
  const ty = cy + r * Math.sin(tipAngle);

  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (anomalous) {
      setShake(true);
      setTimeout(() => setShake(false), 560);
    }
  }, [anomalous]);

  return (
    <div className={`glass rounded-xl p-3 ${shake ? 'shake' : ''} transition-all duration-300 ${
      anomalous ? 'glow-red' : ''}`}>
      <svg viewBox="0 0 200 110" className="w-full" style={{ overflow: 'visible' }}>
        {/* Track */}
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} strokeLinecap="round" />
        {/* Bands: min zone (0-20%) */}
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx - r + 2 * r * 0.2},${cy}`}
          fill="none" stroke="rgba(0,212,255,0.12)" strokeWidth={7} strokeLinecap="round" />
        {/* Bands: max zone (80-100%) */}
        <path d={`M ${cx + r * Math.cos(-0.2 * Math.PI)},${cy + r * Math.sin(-0.2 * Math.PI)} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
          fill="none" stroke="rgba(255,59,92,0.14)" strokeWidth={7} strokeLinecap="round" />
        {/* Value arc */}
        <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
          fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
          style={{
            transition: 'stroke-dasharray 0.55s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease',
            filter: `drop-shadow(0 0 5px ${color})`,
          }} />
        {/* Tip dot */}
        {progress > 0.02 && progress < 0.98 && (
          <circle cx={tx} cy={ty} r={4} fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})`,
              transition: 'cx 0.55s cubic-bezier(0.4,0,0.2,1), cy 0.55s cubic-bezier(0.4,0,0.2,1)' }} />
        )}
        {/* Value */}
        <text x={cx} y={cy - 12} textAnchor="middle"
          style={{ fontSize: 22, fontWeight: 700, fill: color, fontFamily: "'JetBrains Mono'" }}>
          {value.toFixed(1)}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle"
          style={{ fontSize: 10, fill: 'rgba(200,216,240,0.55)', fontFamily: 'Inter' }}>
          {unit}
        </text>
        {/* Min / Max labels */}
        <text x={cx - r} y={cy + 16} textAnchor="middle"
          style={{ fontSize: 9, fill: 'rgba(200,216,240,0.35)', fontFamily: "'JetBrains Mono'" }}>
          {min}
        </text>
        <text x={cx + r} y={cy + 16} textAnchor="middle"
          style={{ fontSize: 9, fill: 'rgba(200,216,240,0.35)', fontFamily: "'JetBrains Mono'" }}>
          {max}
        </text>
      </svg>
      <div className="text-center font-display text-xs font-semibold tracking-widest uppercase opacity-60 -mt-1">
        {label}
      </div>
    </div>
  );
}

// ─── IndiaMap ─────────────────────────────────────────────────────────────────
function IndiaMap({
  stations, statuses, latest, selected, onSelect,
}: {
  stations: Station[]; statuses: Record<string, DS.StationStatus>;
  latest: Record<string, Reading | null>; selected: string; onSelect: (id: string) => void;
}) {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <svg viewBox="0 0 400 500" className="max-h-full max-w-full" style={{ filter: 'drop-shadow(0 0 30px rgba(0,212,255,0.06))' }}>
        {/* India outline */}
        <path d={INDIA_PATH}
          fill="rgba(0,212,255,0.04)"
          stroke="rgba(0,212,255,0.22)"
          strokeWidth={1.2}
          strokeLinejoin="round" />
        {/* Station pins */}
        {stations.map(s => {
          const x = mapX(s.lon);
          const y = mapY(s.lat);
          const st = statuses[s.id] || 'normal';
          const color = statusColor(st);
          const isSelected = s.id === selected;
          const r = isSelected ? 5.5 : 4;
          return (
            <g key={s.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(s.id)}>
              {/* Pulse rings */}
              <circle cx={x} cy={y} r={r + 4} fill={color} opacity={0} className="pin-pulse"
                style={{ transformOrigin: `${x}px ${y}px` }} />
              {st !== 'normal' && (
                <circle cx={x} cy={y} r={r + 8} fill={color} opacity={0} className="pin-pulse-slow"
                  style={{ transformOrigin: `${x}px ${y}px` }} />
              )}
              {/* Pin */}
              <circle cx={x} cy={y} r={r} fill={color}
                stroke={isSelected ? 'white' : 'rgba(0,0,0,0.4)'} strokeWidth={isSelected ? 1.5 : 0.8}
                style={{ filter: `drop-shadow(0 0 ${isSelected ? 10 : 6}px ${color})`,
                  transition: 'r 0.2s ease' }} />
              {/* Label for selected */}
              {isSelected && (
                <text x={x + 8} y={y + 4}
                  style={{ fontSize: 9, fill: color, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>
                  {s.name}
                </text>
              )}
            </g>
          );
        })}
        {/* Legend */}
        {([['NORMAL', CLR.green], ['WARNING', CLR.amber], ['CRITICAL', CLR.red]] as const).map(([label, color], i) => (
          <g key={label} transform={`translate(8, ${460 + i * 13})`}>
            <circle cx={4} cy={4} r={3} fill={color} />
            <text x={12} y={8} style={{ fontSize: 8, fill: 'rgba(200,216,240,0.45)', fontFamily: 'Inter' }}>{label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────
function EventCard({ event, showAiOnly }: { event: AnomalyEvent; showAiOnly: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 10); }, []);

  const typeColor = event.anomalyType === 'spike' ? CLR.red
    : event.anomalyType === 'dropout' ? CLR.red
    : event.anomalyType === 'flatline' ? CLR.amber
    : CLR.amber;

  const statusEl = event.status === 'detected'
    ? <span className="font-mono text-xs blink" style={{ color: CLR.amber }}>● DETECTING…</span>
    : event.status === 'healing'
    ? (
        <span className="font-mono text-xs" style={{ color: CLR.blue }}>
          ⟳ SELF-HEALING…
          <span className="inline-block w-16 h-1 rounded ml-1 align-middle" style={{ background: 'rgba(0,212,255,0.2)' }}>
            <span className="block h-full rounded heal-bar" style={{ background: CLR.blue }} />
          </span>
        </span>
      )
    : (
        <span className="font-mono text-xs" style={{ color: CLR.green }}>
          ✓ CORRECTED
          {event.correctedValue && (
            <span className="ml-2">
              <span className="line-through opacity-40 mr-1">{event.rawValue.toFixed(1)}</span>
              <span style={{ color: CLR.green }}>{event.correctedValue.toFixed(1)}</span>
            </span>
          )}
        </span>
      );

  const glassClass = event.status === 'corrected' ? 'glass-green'
    : event.anomalyType === 'dropout' || event.anomalyType === 'spike' ? 'glass-red' : 'glass-amber';

  return (
    <div className={`${glassClass} rounded-lg p-2.5 mb-1.5 text-sm ${mounted ? 'event-enter' : 'opacity-0'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-semibold shrink-0" style={{ color: typeColor }}>
            {event.anomalyType.toUpperCase()}
          </span>
          <span className="font-display text-xs opacity-60 truncate">{event.stationName}</span>
          <span className="font-mono text-xs opacity-50">·</span>
          <span className="font-display text-xs capitalize opacity-70">{event.parameter}</span>
          {showAiOnly && event.aiOnly && (
            <span className="text-xs px-1 rounded font-mono shrink-0"
              style={{ background: 'rgba(0,212,255,0.15)', color: CLR.blue }}>AI</span>
          )}
        </div>
        <span className="font-mono text-xs opacity-40 shrink-0">
          {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {statusEl}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-xs opacity-40 font-mono">CONF</div>
          <div className="w-16 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${event.confidence * 100}%`, background: typeColor }} />
          </div>
          <div className="font-mono text-xs" style={{ color: typeColor }}>
            {(event.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TimeSeriesChart ──────────────────────────────────────────────────────────
function TimeSeriesChart({ readings }: { readings: Reading[] }) {
  const W = 580; const H = 130; const PAD = { t: 10, r: 10, b: 20, l: 40 };
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  if (readings.length < 2) {
    return (
      <div className="glass rounded-xl p-4 h-full flex items-center justify-center">
        <span className="font-mono text-xs opacity-30">AWAITING DATA…</span>
      </div>
    );
  }

  // Normalize three series
  function series(key: 'temperature' | 'pressure' | 'humidity', color: string, label: string) {
    const vals = readings.map(r => r[key] as number);
    const mn = Math.min(...vals); const mx = Math.max(...vals);
    const rng = mx - mn || 1;
    const pts = vals.map((v, i) => {
      const x = PAD.l + (i / (vals.length - 1)) * cw;
      const y = PAD.t + ch - ((v - mn) / rng) * ch;
      return { x, y, v, isAnomaly: readings[i].isAnomaly && readings[i].anomalyParameter === key };
    });
    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

    // Healing bands: consecutive anomaly regions
    const bands: { x1: number; x2: number }[] = [];
    let bandStart = -1;
    pts.forEach((p, i) => {
      if (p.isAnomaly && bandStart < 0) bandStart = i;
      if (!p.isAnomaly && bandStart >= 0) {
        bands.push({ x1: pts[bandStart].x, x2: pts[i - 1].x });
        bandStart = -1;
      }
      if (i === pts.length - 1 && bandStart >= 0) {
        bands.push({ x1: pts[bandStart].x, x2: p.x });
      }
    });

    return (
      <g key={key}>
        {bands.map((b, i) => (
          <rect key={i} x={b.x1 - 2} y={PAD.t} width={b.x2 - b.x1 + 4} height={ch}
            fill="rgba(255,59,92,0.08)" rx={2} />
        ))}
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 3px ${color}88)` }} />
        {pts.filter(p => p.isAnomaly).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={CLR.red}
            style={{ filter: 'drop-shadow(0 0 4px #FF3B5C)' }} />
        ))}
        {/* Y-axis label */}
        <text x={PAD.l - 6} y={PAD.t + 4}
          style={{ fontSize: 8, fill: color, fontFamily: "'JetBrains Mono'", textAnchor: 'end' }}>
          {label}
        </text>
      </g>
    );
  }

  const latest = readings[readings.length - 1];
  return (
    <div className="glass rounded-xl p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-xs font-semibold tracking-widest uppercase opacity-50">
          60-Point Time Series
        </div>
        <div className="flex gap-3">
          {[['TEMP', CLR.blue], ['PRES', CLR.amber], ['HUM', CLR.green]].map(([l, c]) => (
            <div key={l} className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded" style={{ background: c }} />
              <span className="font-mono text-xs opacity-50">{l}</span>
            </div>
          ))}
          <div className="w-3 h-3 rounded-sm flex items-center justify-center ml-1"
            style={{ background: 'rgba(255,59,92,0.2)', border: '1px solid rgba(255,59,92,0.4)' }}>
            <span className="font-mono" style={{ fontSize: 7, color: CLR.red }}>A</span>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="flex-1 w-full">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1={PAD.l} y1={PAD.t + ch * (1 - t)} x2={W - PAD.r} y2={PAD.t + ch * (1 - t)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="3,3" />
        ))}
        {/* X-axis ticks */}
        {[0, 14, 29, 44, 59].map(i => {
          if (i >= readings.length) return null;
          const x = PAD.l + (i / (readings.length - 1)) * cw;
          const ts = new Date(readings[i].timestamp);
          const lbl = `${String(ts.getMinutes()).padStart(2,'0')}:${String(ts.getSeconds()).padStart(2,'0')}`;
          return (
            <text key={i} x={x} y={H - 4} textAnchor="middle"
              style={{ fontSize: 7, fill: 'rgba(200,216,240,0.3)', fontFamily: "'JetBrains Mono'" }}>
              {lbl}
            </text>
          );
        })}
        {/* Y axis */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ch}
          stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {series('temperature', CLR.blue, 'T°C')}
        {series('pressure', CLR.amber, 'hPa')}
        {series('humidity', CLR.green, 'RH%')}
      </svg>
    </div>
  );
}

// ─── SimulateFault panel ──────────────────────────────────────────────────────
function SimulateFault({
  stations, onTrigger,
}: { stations: Station[]; onTrigger: (id: string, t: FaultType) => void }) {
  const [open, setOpen] = useState(false);
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [faultType, setFaultType] = useState<FaultType>('spike');
  const [injected, setInjected] = useState(false);

  function inject() {
    onTrigger(stationId, faultType);
    setInjected(true);
    setTimeout(() => { setInjected(false); setOpen(false); }, 1800);
  }

  const faultColors: Record<FaultType, string> = { spike: CLR.red, flatline: CLR.amber, dropout: CLR.red };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="glass rounded-xl p-4 mb-2 w-64 glow-red">
          <div className="font-display text-xs font-bold tracking-widest uppercase mb-3"
            style={{ color: CLR.red }}>
            ⚡ INJECT FAULT
          </div>
          <div className="mb-3">
            <div className="font-mono text-xs opacity-50 mb-1">STATION</div>
            <select
              className="w-full rounded-lg px-2 py-1.5 font-mono text-xs"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,59,92,0.2)',
                color: CLR.blue, outline: 'none' }}
              value={stationId} onChange={e => setStationId(e.target.value)}>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name} — {s.location}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <div className="font-mono text-xs opacity-50 mb-1">FAULT TYPE</div>
            <div className="flex gap-1">
              {(['spike', 'flatline', 'dropout'] as FaultType[]).map(t => (
                <button key={t}
                  onClick={() => setFaultType(t)}
                  className="flex-1 py-1 rounded font-mono text-xs font-semibold transition-all"
                  style={{
                    background: faultType === t ? `${faultColors[t]}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${faultType === t ? faultColors[t] : 'rgba(255,255,255,0.08)'}`,
                    color: faultType === t ? faultColors[t] : 'rgba(200,216,240,0.5)',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button onClick={inject} disabled={injected}
            className="w-full py-2 rounded-lg font-display text-xs font-bold tracking-widest uppercase transition-all"
            style={{ background: injected ? 'rgba(0,255,163,0.15)' : 'rgba(255,59,92,0.15)',
              border: `1px solid ${injected ? CLR.green : CLR.red}`,
              color: injected ? CLR.green : CLR.red }}>
            {injected ? '✓ FAULT INJECTED' : '⚡ INJECT NOW'}
          </button>
          <div className="mt-2 text-xs opacity-40 font-mono text-center">
            {faultType === 'flatline' ? 'AI-only detection · rule misses this' : 'Detected by both modes'}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-display text-xs font-bold tracking-widest uppercase transition-all"
        style={{ background: open ? 'rgba(255,59,92,0.2)' : 'rgba(255,59,92,0.1)',
          border: `1px solid ${CLR.red}`, color: CLR.red,
          boxShadow: open ? `0 0 20px rgba(255,59,92,0.3)` : 'none' }}>
        <span className={open ? 'blink' : ''}>⚡</span> SIMULATE FAULT
      </button>
    </div>
  );
}

// ─── DetectionToggle ──────────────────────────────────────────────────────────
function DetectionToggle({ mode, onChange }: { mode: DetectionMode; onChange: (m: DetectionMode) => void }) {
  return (
    <div className="flex items-center gap-1 glass rounded-lg p-1">
      {(['rule', 'ai'] as DetectionMode[]).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className="px-3 py-1 rounded-md font-display text-xs font-semibold tracking-widest uppercase transition-all duration-200"
          style={{
            background: mode === m ? (m === 'ai' ? `${CLR.blue}22` : 'rgba(255,255,255,0.06)') : 'transparent',
            border: `1px solid ${mode === m ? (m === 'ai' ? CLR.blue : 'rgba(255,255,255,0.15)') : 'transparent'}`,
            color: mode === m ? (m === 'ai' ? CLR.blue : 'white') : 'rgba(200,216,240,0.4)',
          }}>
          {m === 'rule' ? 'Rule-Based' : '✦ AI-Enhanced'}
        </button>
      ))}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const stations = useMemo(() => DS.getStationList(), []);
  const [selected, setSelected] = useState('DEL');
  const [mode, setMode] = useState<DetectionMode>('ai');
  const [history, setHistory] = useState<Record<string, Reading[]>>({});
  const [latest, setLatest] = useState<Record<string, Reading | null>>({});
  const [events, setEvents] = useState<AnomalyEvent[]>([]);
  const [health, setHealth] = useState(100);
  const [statuses, setStatuses] = useState<Record<string, DS.StationStatus>>({});

  // Main polling loop — WebSocket-equivalent simulation
  const poll = useCallback(() => {
    const newLatest: Record<string, Reading | null> = {};
    const newHistory: Record<string, Reading[]> = {};
    const newStatuses: Record<string, DS.StationStatus> = {};
    stations.forEach(s => {
      newLatest[s.id] = DS.getLiveReading(s.id, mode);
      newHistory[s.id] = DS.getReadingsHistory(s.id);
      newStatuses[s.id] = DS.getStationStatus(s.id);
    });
    setLatest(newLatest);
    setHistory(newHistory);
    setStatuses(newStatuses);
    setHealth(DS.getNetworkHealth());
  }, [stations, mode]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  // Faster event list refresh to catch healing status changes
  useEffect(() => {
    const id = setInterval(() => setEvents(DS.getAnomalyEvents()), 400);
    return () => clearInterval(id);
  }, []);

  // Filter events for current mode
  const visibleEvents = useMemo(
    () => mode === 'ai' ? events : events.filter(e => !e.aiOnly),
    [events, mode]
  );

  const selStation = stations.find(s => s.id === selected)!;
  const selLatest = latest[selected] ?? null;
  const selHistory = history[selected] ?? [];
  const selStatus = statuses[selected] ?? 'normal';

  // Gauge ranges per parameter
  const gaugeRanges = {
    temperature: { min: 0, max: 55, unit: '°C' },
    pressure: { min: 800, max: 1080, unit: 'hPa' },
    humidity: { min: 0, max: 100, unit: '%RH' },
  };

  const isAnomalous = (param: 'temperature' | 'pressure' | 'humidity') =>
    selLatest?.isAnomaly === true && selLatest.anomalyParameter === param;

  return (
    <div className="relative flex flex-col h-screen overflow-hidden"
      style={{ background: '#060A14', color: '#C8D8F0' }}>
      <ParticleBackground />

      {/* ── Top bar ────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-5 py-2.5 glass"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.12)', minHeight: 56 }}>
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,255,163,0.1) 100%)',
              border: '1px solid rgba(0,212,255,0.3)' }}>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
              <circle cx={10} cy={10} r={8} stroke={CLR.blue} strokeWidth={1.2} />
              <circle cx={10} cy={10} r={4} stroke={CLR.blue} strokeWidth={1.2} />
              <line x1={10} y1={2} x2={10} y2={18} stroke={CLR.blue} strokeWidth={0.8} opacity={0.5} />
              <line x1={2} y1={10} x2={18} y2={10} stroke={CLR.blue} strokeWidth={0.8} opacity={0.5} />
              <circle cx={10} cy={10} r={1.5} fill={CLR.green} />
            </svg>
          </div>
          <div>
            <div className="font-display text-base font-bold tracking-wide" style={{ color: 'white' }}>
              SkyGuard <span style={{ color: CLR.blue }}>AI</span>
            </div>
            <div className="font-mono text-xs opacity-40 -mt-0.5">
              AUTOMATIC WEATHER STATION NETWORK
            </div>
          </div>
        </div>
        {/* Center: detection toggle */}
        <div className="flex items-center gap-4">
          <DetectionToggle mode={mode} onChange={setMode} />
          <div className="font-mono text-xs opacity-30">|</div>
          <div className="font-mono text-xs" style={{ color: CLR.blue }}>
            <span className="opacity-50">STATIONS:</span> {stations.length} ACTIVE
          </div>
        </div>
        {/* Right: health + clock */}
        <div className="flex items-center gap-6">
          <HealthRing value={health} />
          <LiveClock />
        </div>
      </header>

      {/* ── Main content grid ───────────────────────────────────── */}
      <div className="relative z-10 flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: '240px 1fr 300px', gridTemplateRows: '1fr' }}>

        {/* Left sidebar */}
        <aside className="glass flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid rgba(0,212,255,0.1)' }}>
          <div className="px-3 pt-3 pb-2">
            <div className="font-display text-xs font-semibold tracking-widest uppercase opacity-40">
              AWS Network · India
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scroll-hide px-2 pb-2">
            {stations.map(s => (
              <StationCard key={s.id}
                station={s}
                status={statuses[s.id] ?? 'normal'}
                latest={latest[s.id] ?? null}
                history={history[s.id] ?? []}
                selected={s.id === selected}
                onClick={() => setSelected(s.id)} />
            ))}
          </div>
        </aside>

        {/* Center: map + bottom sections */}
        <div className="flex flex-col overflow-hidden">
          {/* India map */}
          <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
            <IndiaMap
              stations={stations}
              statuses={statuses}
              latest={latest}
              selected={selected}
              onSelect={setSelected} />
            {/* Selected station badge */}
            <div className="absolute top-3 left-3 glass rounded-lg px-3 py-1.5">
              <div className="font-mono text-xs" style={{ color: CLR.blue }}>
                {selStation.name}
              </div>
              <div className="font-display text-xs opacity-50">
                {selStation.location}, {selStation.state}
              </div>
              <div className="font-mono text-xs opacity-40">
                {selStation.lat.toFixed(1)}°N · {selStation.lon.toFixed(1)}°E · {selStation.elevation}m
              </div>
            </div>
          </div>

          {/* Bottom: event log + chart */}
          <div className="grid overflow-hidden" style={{ gridTemplateColumns: '1fr 1fr', height: 220,
            borderTop: '1px solid rgba(0,212,255,0.1)' }}>
            {/* Event log */}
            <div className="flex flex-col overflow-hidden"
              style={{ borderRight: '1px solid rgba(0,212,255,0.08)' }}>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="font-display text-xs font-semibold tracking-widest uppercase opacity-40">
                  Event Log
                </div>
                <div className="flex items-center gap-1.5">
                  {visibleEvents.filter(e => e.status !== 'corrected').length > 0 && (
                    <span className="blink w-1.5 h-1.5 rounded-full inline-block"
                      style={{ background: CLR.red }} />
                  )}
                  <span className="font-mono text-xs opacity-40">
                    {visibleEvents.length} events
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scroll-hide px-2 pb-2">
                {visibleEvents.length === 0 ? (
                  <div className="flex items-center justify-center h-16 font-mono text-xs opacity-20">
                    NO ANOMALIES DETECTED
                  </div>
                ) : (
                  visibleEvents.map(e => (
                    <EventCard key={e.id} event={e} showAiOnly={mode === 'ai'} />
                  ))
                )}
              </div>
            </div>

            {/* Time series chart */}
            <div className="p-3 overflow-hidden">
              <TimeSeriesChart readings={selHistory} />
            </div>
          </div>
        </div>

        {/* Right panel: gauges */}
        <aside className="glass flex flex-col overflow-hidden"
          style={{ borderLeft: '1px solid rgba(0,212,255,0.1)' }}>
          <div className="px-3 pt-3 pb-2">
            <div className="font-display text-xs font-semibold tracking-widest uppercase opacity-40">
              Live Telemetry
            </div>
            <div className="font-mono text-xs mt-0.5" style={{ color: statusColor(selStatus) }}>
              {selStation.name} · {selStatus.toUpperCase()}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-hide px-3 pb-3 flex flex-col gap-3">
            <ArcGauge
              value={selLatest?.temperature ?? 0}
              min={gaugeRanges.temperature.min}
              max={gaugeRanges.temperature.max}
              label="Temperature"
              unit={gaugeRanges.temperature.unit}
              status={selStatus}
              anomalous={isAnomalous('temperature')} />
            <ArcGauge
              value={selLatest?.pressure ?? 0}
              min={gaugeRanges.pressure.min}
              max={gaugeRanges.pressure.max}
              label="Pressure"
              unit={gaugeRanges.pressure.unit}
              status={selStatus}
              anomalous={isAnomalous('pressure')} />
            <ArcGauge
              value={selLatest?.humidity ?? 0}
              min={gaugeRanges.humidity.min}
              max={gaugeRanges.humidity.max}
              label="Humidity"
              unit={gaugeRanges.humidity.unit}
              status={selStatus}
              anomalous={isAnomalous('humidity')} />

            {/* Wind speed + extra stats */}
            <div className="glass rounded-xl p-3">
              <div className="font-display text-xs font-semibold tracking-widest uppercase opacity-40 mb-2">
                Wind Speed
              </div>
              <div className="flex items-end gap-1">
                <span className="font-mono text-2xl font-semibold" style={{ color: CLR.blue }}>
                  {selLatest?.windSpeed.toFixed(1) ?? '--.-'}
                </span>
                <span className="font-mono text-sm opacity-50 pb-0.5">m/s</span>
              </div>
              <div className="mt-2 w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((selLatest?.windSpeed ?? 0) / 20) * 100)}%`,
                    background: CLR.blue }} />
              </div>
            </div>

            {/* Status */}
            <div className={`rounded-xl p-3 ${selStatus !== 'normal' ? (selStatus === 'warning' ? 'glass-amber' : 'glass-red') : 'glass'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${selStatus !== 'normal' ? 'blink' : ''}`}
                  style={{ background: statusColor(selStatus), boxShadow: `0 0 8px ${statusColor(selStatus)}` }} />
                <div className="font-mono text-xs font-semibold" style={{ color: statusColor(selStatus) }}>
                  {selStatus === 'normal' ? 'ALL PARAMETERS NOMINAL' :
                   selStatus === 'warning' ? 'ANOMALY DETECTED · HEALING' :
                   selStatus === 'critical' ? 'CRITICAL FAULT · AUTO-HEAL ACTIVE' :
                   'STATION OFFLINE · RECONNECTING'}
                </div>
              </div>
              {selLatest?.isAnomaly && selLatest.anomalyType && (
                <div className="mt-1.5 font-mono text-xs opacity-60">
                  {selLatest.anomalyType.toUpperCase()} on {selLatest.anomalyParameter?.toUpperCase()}
                  {selLatest.aiOnly && <span style={{ color: CLR.blue }}> · AI-DETECTED</span>}
                  <div className="mt-0.5">
                    Confidence: {(selLatest.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Fault injection button */}
      <SimulateFault stations={stations} onTrigger={DS.triggerFault} />
    </div>
  );
}
