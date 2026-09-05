import json
import os
import random
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Tuple, Optional, Any

# Load real climate profiles from NOAA ISD historical data
_PROFILES_PATH = os.path.join(os.path.dirname(__file__), "real_climate_profiles.json")
with open(_PROFILES_PATH, "r", encoding="utf-8") as _f:
    CLIMATE_PROFILES: Dict[str, Any] = json.load(_f)

# IST timezone offset (+5:30)
_IST = timedelta(hours=5, minutes=30)

# Fallback base values (used only if a station has no climate profile)
_FALLBACK_BASE = {"temp": 30.0, "pressure": 1000.0, "humidity": 50.0, "wind": 5.0}


def _current_hour_ist() -> int:
    """Return the current hour (0-23) in IST."""
    utc_now = datetime.now(timezone.utc)
    ist_now = utc_now + _IST
    return ist_now.hour


def _get_hourly_baseline(station_id: str) -> Dict[str, float]:
    """
    Return baseline values for the current hour using real NOAA ISD
    diurnal patterns. Falls back to overall mean if hourly pattern is missing.
    """
    profile = CLIMATE_PROFILES.get(station_id)
    if not profile:
        return _FALLBACK_BASE.copy()

    hour = _current_hour_ist()

    temp = profile["temp_hourly_pattern"][hour]
    pressure = profile["pressure_hourly_pattern"][hour]
    humidity = profile["humidity_hourly_pattern"][hour]
    wind = profile.get("wind_hourly_pattern", [profile.get("wind_mean", 5.0)] * 24)[hour]

    return {"temp": temp, "pressure": pressure, "humidity": humidity, "wind": wind}


def _get_profile_std(station_id: str) -> Dict[str, float]:
    """Return real historical standard deviations for noise scaling."""
    profile = CLIMATE_PROFILES.get(station_id)
    if not profile:
        return {"temp": 1.4, "pressure": 1.8, "humidity": 2.5, "wind": 0.9}

    return {
        "temp": profile.get("temp_std", 1.4),
        "pressure": profile.get("pressure_std", 1.8),
        "humidity": profile.get("humidity_std", 2.5),
        "wind": profile.get("wind_std", 0.9),
    }


def get_base_for_station(station_id: str) -> Dict[str, float]:
    """
    Public accessor for the current baseline values of a station.
    Used by detector.py for Z-score calculations.
    """
    return _get_hourly_baseline(station_id)


def noise(amplitude: float) -> float:
    """Uniform noise in [-amplitude, +amplitude]."""
    return (random.random() - 0.5) * 2 * amplitude


def generate_raw_reading(
    station_id: str,
    active_fault: Optional[Dict[str, Any]] = None,
    step_index: int = 0,
) -> Tuple[float, float, float, float]:
    """
    Generate a raw sensor reading for a station.

    Uses real NOAA ISD historical hourly patterns as the baseline, with
    realistic random noise scaled by historical standard deviation (capped
    to keep readings plausible per-tick). Fault injection overrides are
    applied on top of this realistic baseline.
    """
    base = _get_hourly_baseline(station_id)
    std = _get_profile_std(station_id)

    # Noise amplitude: fraction of the real std to keep individual ticks realistic
    # (~0.25 std keeps readings close to expected hourly value while still varying)
    temp = base["temp"] + noise(std["temp"] * 0.25)
    pressure = base["pressure"] + noise(std["pressure"] * 0.25)
    humidity = base["humidity"] + noise(std["humidity"] * 0.25)
    wind_speed = max(0.0, base["wind"] + noise(std["wind"] * 0.25))

    # ── Fault injection (deviations FROM the realistic baseline) ──────────
    if active_fault:
        fault_type = active_fault.get("type")
        if fault_type == "spike":
            # Spike: temperature jumps 16-22°C above baseline
            temp = base["temp"] + 16.0 + random.uniform(0.0, 6.0)
        elif fault_type == "flatline":
            # Flatline: pressure locks to near-zero variance while inside normal-looking band
            pressure = base["pressure"] + 0.8
        elif fault_type == "dropout":
            # Dropout: all values drop to 0
            temp = 0.0
            pressure = 0.0
            humidity = 0.0
            wind_speed = 0.0
        elif fault_type == "drift":
            # Drift: gradual sustained trend over readings (e.g. +1.1°C per step up to +7°C)
            drift_step = min(6, step_index)
            temp = base["temp"] + (drift_step * 1.1) + noise(0.3)

    return round(temp, 1), round(pressure, 1), round(humidity, 1), round(wind_speed, 1)
