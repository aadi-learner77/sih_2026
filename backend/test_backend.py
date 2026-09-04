"""
SkyGuard AI Backend Automated Verification Test Suite
Proves:
  (a) Normal reading is NOT flagged
  (b) Injected spike IS flagged by BOTH rule and AI mode
  (c) Injected flatline IS flagged ONLY in AI mode and MISSED in rule mode
  (d) The corrected/imputed value is sensible compared to station baseline
"""

import sys
import os

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.stations import BASE_VALUES

client = TestClient(app)

def run_tests():
    print("=" * 70)
    print(" SKYGUARD AI ML BACKEND VERIFICATION SUITE ")
    print("=" * 70)

    station_id = "DEL"
    del_base_temp = BASE_VALUES["DEL"]["temp"]
    del_base_pres = BASE_VALUES["DEL"]["pressure"]

    # ── Test 1: Normal Reading (Condition a) ──────────────────────────────────
    print("\n[TEST 1] Testing Normal Reading (Condition a)...")
    res = client.get(f"/stations/{station_id}/reading?mode=ai")
    assert res.status_code == 200
    data = res.json()
    print(f"  Station: {data['stationId']} | Temp: {data['temperature']} deg C | Pres: {data['pressure']} hPa")
    print(f"  isAnomaly: {data['isAnomaly']} | Mode: AI")
    assert data['isAnomaly'] == False, "Normal reading should NOT be flagged!"
    print("  [PASS] Normal reading is NOT flagged as anomaly.")

    # ── Test 2: Injected Spike (Condition b) ──────────────────────────────────
    print("\n[TEST 2] Testing Injected Spike (Condition b)...")
    # Trigger Spike Fault
    fault_res = client.post(f"/stations/{station_id}/fault", json={"type": "spike"})
    assert fault_res.status_code == 200
    print("  Triggered 'spike' fault on station DEL.")

    # Check Rule Mode
    res_rule = client.get(f"/stations/{station_id}/reading?mode=rule")
    data_rule = res_rule.json()
    print(f"  Rule Mode -> Temp: {data_rule['temperature']} deg C | isAnomaly: {data_rule['isAnomaly']} | AnomalyType: {data_rule['anomalyType']}")
    assert data_rule['isAnomaly'] == True, "Spike MUST be flagged in Rule mode!"

    # Check AI Mode
    res_ai = client.get(f"/stations/{station_id}/reading?mode=ai")
    data_ai = res_ai.json()
    print(f"  AI Mode   -> Temp: {data_ai['temperature']} deg C | isAnomaly: {data_ai['isAnomaly']} | AnomalyType: {data_ai['anomalyType']} | Confidence: {data_ai['confidence']}")
    assert data_ai['isAnomaly'] == True, "Spike MUST be flagged in AI mode!"
    assert data_ai['aiOnly'] == False, "Spike is NOT aiOnly (rule caught it too)."
    print("  [PASS] Spike IS flagged by BOTH rule and AI mode.")

    # ── Test 3 & 4: Injected Flatline & Imputation (Conditions c & d) ─────────
    print("\n[TEST 3 & 4] Testing Injected Flatline & Imputation (Conditions c & d)...")
    # Reset faults and trigger Flatline Fault
    fault_res = client.post(f"/stations/{station_id}/fault", json={"type": "flatline"})
    assert fault_res.status_code == 200
    print("  Triggered 'flatline' fault on station DEL (pressure locked near baseline + 0.8).")

    # Generate flatline readings history
    print("  Simulating flatline sequence...")
    for _ in range(5):
        client.get(f"/stations/{station_id}/reading?mode=ai")

    # Evaluate Rule Mode on Flatline
    res_flat_rule = client.get(f"/stations/{station_id}/reading?mode=rule")
    data_flat_rule = res_flat_rule.json()
    print(f"  Rule Mode -> Pres: {data_flat_rule['pressure']} hPa | isAnomaly: {data_flat_rule['isAnomaly']}")
    assert data_flat_rule['isAnomaly'] == False, "Flatline MUST be MISSED in Rule mode (falls in normal Z-score range)!"

    # Evaluate AI Mode on Flatline
    res_flat_ai = client.get(f"/stations/{station_id}/reading?mode=ai")
    data_flat_ai = res_flat_ai.json()
    print(f"  AI Mode   -> Pres: {data_flat_ai['pressure']} hPa | isAnomaly: {data_flat_ai['isAnomaly']} | AnomalyType: {data_flat_ai['anomalyType']} | aiOnly: {data_flat_ai['aiOnly']} | Confidence: {data_flat_ai['confidence']}")
    assert data_flat_ai['isAnomaly'] == True, "Flatline MUST be flagged in AI mode!"
    assert data_flat_ai['anomalyType'] == 'flatline', "AnomalyType must be 'flatline'!"
    assert data_flat_ai['aiOnly'] == True, "Flatline MUST be flagged as aiOnly!"
    print("  [PASS] Flatline IS flagged ONLY in AI mode and MISSED in rule mode.")

    # Test Imputed / Corrected Value (Condition d)
    corrected_val = data_flat_ai['correctedValue']
    print(f"\n[TEST 4] Imputation Verification (Condition d):")
    print(f"  Station Baseline Pressure: {del_base_pres} hPa")
    print(f"  Raw Flatline Pressure:     {data_flat_ai['pressure']} hPa")
    print(f"  Imputed Corrected Value:   {corrected_val} hPa")
    assert corrected_val is not None, "Corrected value must not be None!"
    assert abs(corrected_val - del_base_pres) < 5.0, "Imputed value must be close to station baseline!"
    print("  [PASS] Corrected/imputed value is sensible compared to station baseline.")

    # ── Test REST Endpoints Catalogue & Health ───────────────────────────────
    print("\n[TEST 5] Verifying API Endpoints...")
    stations_res = client.get("/stations")
    assert len(stations_res.json()) == 15, "Expected 15 stations!"

    health_res = client.get("/network-health")
    print(f"  Network Health: {health_res.json()}%")

    events_res = client.get("/events")
    print(f"  Active Event Log Count: {len(events_res.json())}")

    status_res = client.get(f"/stations/{station_id}/status")
    print(f"  Station DEL Status: {status_res.json()}")

    print("\n" + "=" * 70)
    print(" ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
