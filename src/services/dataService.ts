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
  explanation?: string | null;
}

export type FaultType = 'spike' | 'flatline' | 'dropout';
export type DetectionMode = 'rule' | 'ai';

// ─── API Configuration ────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ─── Fallback Static Stations (used if initial fetch fails) ───────────────────

const FALLBACK_STATIONS: Station[] = [
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

// In-memory cache for latest readings to support synchronous getLatestReading calls
const latestReadingsCache = new Map<string, Reading>();

// ─── API Methods with fetch() ─────────────────────────────────────────────────

export async function fetchStationList(): Promise<Station[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/stations`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch station list from backend:', err);
    return FALLBACK_STATIONS;
  }
}

export function getStationList(): Station[] {
  return FALLBACK_STATIONS;
}

export async function fetchLiveReading(stationId: string, mode: DetectionMode): Promise<Reading | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/stations/${stationId}/reading?mode=${mode}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const reading: Reading = await res.json();
    latestReadingsCache.set(stationId, reading);
    return reading;
  } catch (err) {
    console.error(`Failed to fetch live reading for station ${stationId}:`, err);
    return null;
  }
}

export function getLiveReading(stationId: string, mode: DetectionMode): Reading {
  // Synchronous shim that triggers the fetch in the background and returns cached value or safe fallback
  fetchLiveReading(stationId, mode).catch(() => {});
  const cached = latestReadingsCache.get(stationId);
  if (cached) return cached;

  return {
    stationId,
    timestamp: Date.now(),
    temperature: 30.0,
    pressure: 1000.0,
    humidity: 50.0,
    windSpeed: 5.0,
    isAnomaly: false,
    anomalyType: null,
    anomalyParameter: null,
    confidence: 0,
    correctedValue: null,
    aiOnly: false
  };
}

export async function fetchReadingsHistory(stationId: string): Promise<Reading[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/stations/${stationId}/history`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch history for station ${stationId}:`, err);
    return [];
  }
}

export function getReadingsHistory(stationId: string): Reading[] {
  // Sync version used directly by poll logic
  return [];
}

export async function fetchAnomalyEvents(): Promise<AnomalyEvent[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/events`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch anomaly events:', err);
    return [];
  }
}

export function getAnomalyEvents(): AnomalyEvent[] {
  return [];
}

export function getLatestReading(stationId: string): Reading | null {
  return latestReadingsCache.get(stationId) ?? null;
}

export async function triggerFault(stationId: string, type: FaultType): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/stations/${stationId}/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  } catch (err) {
    console.error(`Failed to trigger fault ${type} on station ${stationId}:`, err);
  }
}

export async function fetchNetworkHealth(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE_URL}/network-health`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch network health:', err);
    return 100;
  }
}

export function getNetworkHealth(): number {
  return 100;
}

export async function fetchStationStatus(stationId: string): Promise<StationStatus> {
  try {
    const res = await fetch(`${API_BASE_URL}/stations/${stationId}/status`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch station status for ${stationId}:`, err);
    return 'normal';
  }
}

export function getStationStatus(stationId: string): StationStatus {
  return 'normal';
}
