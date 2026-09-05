# SkyGuard AI — Python Backend Service

A FastAPI & scikit-learn backend for **SkyGuard AI** that replaces local mock data generation with a real ML anomaly detection pipeline for Automatic Weather Stations (AWS).

---

## Features

1. **Station Catalogue**: Ports 15 Indian AWS stations and their baseline climate values (temperature, pressure, humidity, wind speed).
2. **Synthetic Telemetry & Fault Injection**: Generates realistic weather readings with normal baseline noise while supporting on-demand fault injection (`spike`, `flatline`, `dropout`, `drift`).
3. **Dual Detection Engine**:
   - **Rule-Based Layer**: Fast Z-score & thresholding checks for extreme spikes & dropouts. Intentionally misses flatlines that remain within normal operating ranges.
   - **ML Layer (IsolationForest)**: Trained at startup on normal telemetry windows using 9 engineered features (normalized raw values, rolling standard deviation, rolling slope/trend). Detects zero-variance flatlines and subtle drifts.
4. **Self-Healing & Imputation**: Computes `correctedValue` using rolling interpolation of non-anomalous history for that station.
5. **REST API & WebSockets**: REST endpoints matching `src/services/dataService.ts` 1:1, plus a `/ws/live` WebSocket feed.

---

## Endpoint Mapping to Mock Functions (`src/services/dataService.ts`)

| Frontend Mock Function | HTTP Method & Endpoint | Description |
| :--- | :--- | :--- |
| `getStationList()` | `GET /stations` | Returns list of 15 Indian AWS stations. |
| `getLiveReading(stationId, mode)` | `GET /stations/{station_id}/reading?mode=rule\|ai` | Evaluates live reading using selected detection mode. |
| `getReadingsHistory(stationId)` | `GET /readings/{station_id}/history` (or `GET /stations/{station_id}/history`) | Retrieves up to 60 recent readings for station. |
| `getAnomalyEvents()` | `GET /events` | Retrieves log of up to 60 anomaly events. |
| `triggerFault(stationId, type)` | `POST /stations/{station_id}/fault` | Injects fault (`spike`, `flatline`, `dropout`). |
| `getNetworkHealth()` | `GET /network-health` | Returns network health percentage (0-100). |
| `getStationStatus(stationId)` | `GET /stations/{station_id}/status` | Returns status string (`normal`, `warning`, `critical`, `offline`). |
| *Live Feed* | `WS /ws/live` | WebSocket broadcasting live readings for all stations every 1.5s. |

---

## How to Run

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start Server
```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

### 3. Run Automated ML Verification Suite
```bash
python test_backend.py
```

---

## Verification Test Results

```
======================================================================
 SKYGUARD AI ML BACKEND VERIFICATION SUITE 
======================================================================

[TEST 1] Testing Normal Reading (Condition a)...
  Station: DEL | Temp: 34.9 deg C | Pres: 1007.7 hPa
  isAnomaly: False | Mode: AI
  [PASS] Normal reading is NOT flagged as anomaly.

[TEST 2] Testing Injected Spike (Condition b)...
  Triggered 'spike' fault on station DEL.
  Rule Mode -> Temp: 55.6 deg C | isAnomaly: True | AnomalyType: spike
  AI Mode   -> Temp: 55.4 deg C | isAnomaly: True | AnomalyType: spike | Confidence: 0.9
  [PASS] Spike IS flagged by BOTH rule and AI mode.

[TEST 3 & 4] Testing Injected Flatline & Imputation (Conditions c & d)...
  Triggered 'flatline' fault on station DEL (pressure locked near baseline + 0.8).
  Simulating flatline sequence...
  Rule Mode -> Pres: 1009.8 hPa | isAnomaly: False
  AI Mode   -> Pres: 1009.8 hPa | isAnomaly: True | AnomalyType: flatline | aiOnly: True | Confidence: 0.79
  [PASS] Flatline IS flagged ONLY in AI mode and MISSED in rule mode.

[TEST 4] Imputation Verification (Condition d):
  Station Baseline Pressure: 1009.0 hPa
  Raw Flatline Pressure:     1009.8 hPa
  Imputed Corrected Value:   1009.1 hPa
  [PASS] Corrected/imputed value is sensible compared to station baseline.

[TEST 5] Verifying API Endpoints...
  Network Health: 93%
  Active Event Log Count: 1
  Station DEL Status: warning

======================================================================
 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 
======================================================================
```
