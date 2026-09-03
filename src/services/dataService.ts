// ─── Types ────────────────────────────────────────────────────────────────────

export type StationStatus = 'normal' | 'warning' | 'critical' | 'offline';

export interface Station {
  id: string;
  name: string;
  location: string;
  state: string;
  lat: number;
  lon: number;
  elevation: number;
}

export interface Reading {
  stationId: string;
  timestamp: number;
  temperature: number;
  pressure: number;
  humidity: number;
  windSpeed: number;
  isAnomaly: boolean;
  anomalyType: 'spike' | 'flatline' | 'drift' | 'dropout' | null;
  anomalyParameter: 'temperature' | 'pressure' | 'humidity' | null;
  confidence: number;
  correctedValue: number | null;
  aiOnly: boolean;
}

export interface AnomalyEvent {
  id: string;
  stationId: string;
  stationName: string;
  timestamp: number;
  parameter: 'temperature' | 'pressure' | 'humidity';
  anomalyType: 'spike' | 'flatline' | 'drift' | 'dropout';
  rawValue: number;
  correctedValue: number | null;
  confidence: number;
  status: 'detected' | 'healing' | 'corrected';
  aiOnly: boolean;
}

export type FaultType = 'spike' | 'flatline' | 'dropout';
export type DetectionMode = 'rule' | 'ai';

// ─── Station catalogue ────────────────────────────────────────────────────────

const STATIONS: Station[] = [
  { id: 'DEL', name: 'AWS-DEL-01', location: 'New Delhi',           state: 'Delhi',          lat: 28.6,  lon: 77.2,  elevation: 216  },
  { id: 'MUM', name: 'AWS-MUM-07', location: 'Mumbai',              state: 'Maharashtra',    lat: 19.1,  lon: 72.9,  elevation: 14   },
  { id: 'CHN', name: 'AWS-CHN-03', location: 'Chennai',             state: 'Tamil Nadu',     lat: 13.1,  lon: 80.3,  elevation: 6    },
  { id: 'KOL', name: 'AWS-KOL-05', location: 'Kolkata',             state: 'West Bengal',    lat: 22.6,  lon: 88.4,  elevation: 9    },
  { id: 'BLR', name: 'AWS-BLR-09', location: 'Bengaluru',           state: 'Karnataka',      lat: 12.97, lon: 77.6,  elevation: 920  },
  { id: 'HYD', name: 'AWS-HYD-04', location: 'Hyderabad',           state: 'Telangana',      lat: 17.4,  lon: 78.5,  elevation: 542  },
  { id: 'AMD', name: 'AWS-AMD-11', location: 'Ahmedabad',           state: 'Gujarat',        lat: 23.0,  lon: 72.6,  elevation: 52   },
  { id: 'JAI', name: 'AWS-JAI-06', location: 'Jaipur',              state: 'Rajasthan',      lat: 26.9,  lon: 75.8,  elevation: 431  },
  { id: 'LKO', name: 'AWS-LKO-08', location: 'Lucknow',             state: 'Uttar Pradesh',  lat: 26.8,  lon: 80.9,  elevation: 111  },
  { id: 'BHO', name: 'AWS-BHO-12', location: 'Bhopal',              state: 'Madhya Pradesh', lat: 23.3,  lon: 77.4,  elevation: 527  },
  { id: 'PAT', name: 'AWS-PAT-02', location: 'Patna',               state: 'Bihar',          lat: 25.6,  lon: 85.1,  elevation: 54   },
  { id: 'GUW', name: 'AWS-GUW-13', location: 'Guwahati',            state: 'Assam',          lat: 26.2,  lon: 91.7,  elevation: 55   },
  { id: 'PUN', name: 'AWS-PUN-10', location: 'Pune',                state: 'Maharashtra',    lat: 18.5,  lon: 73.9,  elevation: 560  },
  { id: 'TVM', name: 'AWS-TVM-15', location: 'Thiruvananthapuram',  state: 'Kerala',         lat: 8.5,   lon: 77.0,  elevation: 64   },
  { id: 'SXR', name: 'AWS-SXR-14', location: 'Srinagar',            state: 'J&K',            lat: 34.1,  lon: 74.8,  elevation: 1587 },
];

// Realistic base values per station
const BASE: Record<string, { temp: number; pressure: number; humidity: number; wind: number }> = {
  DEL: { temp: 34.2, pressure: 1009, humidity: 45, wind: 4.2 },
  MUM: { temp: 31.4, pressure: 1013, humidity: 78, wind: 6.8 },
  CHN: { temp: 33.1, pressure: 1011, humidity: 72, wind: 5.1 },
  KOL: { temp: 30.6, pressure: 1010, humidity: 80, wind: 3.7 },
  BLR: { temp: 26.3, pressure: 921,  humidity: 60, wind: 3.2 },
  HYD: { temp: 29.8, pressure: 960,  humidity: 55, wind: 4.5 },
  AMD: { temp: 35.7, pressure: 1007, humidity: 35, wind: 7.3 },
  JAI: { temp: 36.4, pressure: 992,  humidity: 30, wind: 8.1 },
  LKO: { temp: 32.5, pressure: 1005, humidity: 50, wind: 3.9 },
  BHO: { temp: 30.1, pressure: 965,  humidity: 52, wind: 4.0 },
  PAT: { temp: 31.2, pressure: 1008, humidity: 68, wind: 3.4 },
  GUW: { temp: 28.4, pressure: 1012, humidity: 85, wind: 5.5 },
  PUN: { temp: 28.9, pressure: 956,  humidity: 58, wind: 4.7 },
  TVM: { temp: 30.5, pressure: 1014, humidity: 82, wind: 7.2 },
  SXR: { temp: 18.2, pressure: 852,  humidity: 40, wind: 6.5 },
};

// ─── Internal state ───────────────────────────────────────────────────────────

interface ActiveFault { type: FaultType; startTime: number; duration: number }
const activeFaults = new Map<string, ActiveFault>();
const readingsHistory = new Map<string, Reading[]>();
const latestReadings = new Map<string, Reading>();
let anomalyEvents: AnomalyEvent[] = [];
let eventIdCounter = 0;

STATIONS.forEach(s => readingsHistory.set(s.id, []));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noise(amp: number) { return (Math.random() - 0.5) * 2 * amp; }

function setEventStatus(id: string, status: AnomalyEvent['status']) {
  anomalyEvents = anomalyEvents.map(e => e.id === id ? { ...e, status } : e);
}

function pushEvent(reading: Reading, stationName: string) {
  if (!reading.isAnomaly || !reading.anomalyType || !reading.anomalyParameter) return;

  const param = reading.anomalyParameter;
  const raw = param === 'temperature' ? reading.temperature
    : param === 'pressure' ? reading.pressure : reading.humidity;

  const event: AnomalyEvent = {
    id: `evt-${++eventIdCounter}-${Date.now()}`,
    stationId: reading.stationId,
    stationName,
    timestamp: reading.timestamp,
    parameter: param,
    anomalyType: reading.anomalyType,
    rawValue: raw,
    correctedValue: reading.correctedValue,
    confidence: reading.confidence,
    status: 'detected',
    aiOnly: reading.aiOnly,
  };
  anomalyEvents = [event, ...anomalyEvents].slice(0, 60);

  setTimeout(() => setEventStatus(event.id, 'healing'), 900 + Math.random() * 300);
  setTimeout(() => setEventStatus(event.id, 'corrected'), 2400 + Math.random() * 600);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStationList(): Station[] { return STATIONS; }

export function getLiveReading(stationId: string, mode: DetectionMode): Reading {
  const base = BASE[stationId];
  const fault = activeFaults.get(stationId);
  const now = Date.now();

  // Expire old faults
  if (fault && now - fault.startTime > fault.duration) {
    activeFaults.delete(stationId);
  }

  const activeFault = activeFaults.get(stationId);

  let temp = base.temp + noise(1.4);
  let pressure = base.pressure + noise(1.8);
  let humidity = base.humidity + noise(2.5);
  const windSpeed = Math.max(0, base.wind + noise(0.9));

  if (activeFault) {
    switch (activeFault.type) {
      case 'spike':
        temp = base.temp + 16 + Math.random() * 6;
        break;
      case 'flatline':
        // Pressure locked to a flat value inside normal band — rule misses this
        pressure = base.pressure + 0.8;
        break;
      case 'dropout':
        temp = 0; pressure = 0; humidity = 0;
        break;
    }
  }

  // ── Anomaly detection ──────────────────────────────────────────
  let isAnomaly = false;
  let anomalyType: Reading['anomalyType'] = null;
  let anomalyParameter: Reading['anomalyParameter'] = null;
  let confidence = 0;
  let correctedValue: number | null = null;
  let aiOnly = false;

  if (activeFault?.type === 'dropout') {
    isAnomaly = true;
    anomalyType = 'dropout';
    anomalyParameter = 'temperature';
    confidence = 0.99;
    aiOnly = false;
  } else if (activeFault?.type === 'spike') {
    isAnomaly = true;
    anomalyType = 'spike';
    anomalyParameter = 'temperature';
    confidence = mode === 'ai' ? 0.97 : 0.88;
    correctedValue = +(base.temp + noise(1.2)).toFixed(1);
    aiOnly = false;
  } else if (activeFault?.type === 'flatline') {
    // Rule-based: pressure is inside normal range, so rule MISSES it
    // AI: detects zero-variance pattern
    if (mode === 'ai') {
      isAnomaly = true;
      anomalyType = 'flatline';
      anomalyParameter = 'pressure';
      confidence = 0.84 + Math.random() * 0.08;
      correctedValue = +(base.pressure + noise(1.5)).toFixed(1);
      aiOnly = true;
    }
  } else {
    // Occasional natural drift that only AI catches
    const history = readingsHistory.get(stationId) || [];
    if (history.length >= 6 && mode === 'ai') {
      const recent = history.slice(-6).map(r => r.temperature);
      const trend = recent[5] - recent[0];
      if (Math.abs(trend) > 5) {
        isAnomaly = true;
        anomalyType = 'drift';
        anomalyParameter = 'temperature';
        confidence = 0.68 + Math.random() * 0.14;
        correctedValue = +(base.temp + noise(1.5)).toFixed(1);
        aiOnly = true;
      }
    }
  }

  const reading: Reading = {
    stationId,
    timestamp: now,
    temperature: +temp.toFixed(1),
    pressure:    +pressure.toFixed(1),
    humidity:    +humidity.toFixed(1),
    windSpeed:   +windSpeed.toFixed(1),
    isAnomaly, anomalyType, anomalyParameter,
    confidence, correctedValue, aiOnly,
  };

  // Update history (last 60)
  const hist = readingsHistory.get(stationId)!;
  hist.push(reading);
  if (hist.length > 60) hist.shift();
  latestReadings.set(stationId, reading);

  // Fire event (rate-limit: only if last event was > 3 s ago)
  if (reading.isAnomaly) {
    const lastEvt = anomalyEvents.find(e => e.stationId === stationId && e.status !== 'corrected');
    if (!lastEvt || now - lastEvt.timestamp > 3000) {
      const station = STATIONS.find(s => s.id === stationId)!;
      pushEvent(reading, station.name);
    }
  }

  return reading;
}

export function getReadingsHistory(stationId: string): Reading[] {
  return readingsHistory.get(stationId) || [];
}

export function getAnomalyEvents(): AnomalyEvent[] { return anomalyEvents; }

export function getLatestReading(stationId: string): Reading | null {
  return latestReadings.get(stationId) ?? null;
}

export function triggerFault(stationId: string, type: FaultType): void {
  activeFaults.set(stationId, {
    type,
    startTime: Date.now(),
    duration: 9000 + Math.random() * 4000,
  });
}

export function getNetworkHealth(): number {
  const faultCount = activeFaults.size;
  const total = STATIONS.length;
  return Math.max(0, Math.round(((total - faultCount) / total) * 100));
}

export function getStationStatus(stationId: string): StationStatus {
  const fault = activeFaults.get(stationId);
  if (!fault) return 'normal';
  if (fault.type === 'dropout') return 'offline';
  if (fault.type === 'spike') return 'critical';
  return 'warning';
}
