# Data Sourcing Documentation

## Overview

SkyGuard AI uses **real historical weather data** from NOAA's Integrated Surface Database (ISD) to establish realistic baseline patterns for 15 Indian Automatic Weather Stations (AWS). Simulated anomalies are then injected on top of these realistic baselines to demonstrate the anomaly detection system.

## Data Source

**Primary Source:** NOAA ISD / ERA5 Reanalysis via Open-Meteo Historical Weather API  
**Coverage Period:** May 2023 (1 full month of hourly data, 744 readings per station)  
**Parameters:** Temperature (2m), Surface Pressure, Relative Humidity (2m), Wind Speed (10m)  
**Access Method:** Public HTTPS API (no authentication required)  
**Fallback:** If NOAA ISD access is unreliable, the system uses cached profiles from the May 2023 dataset already fetched and stored in `backend/app/real_climate_profiles.json`.

## Station Mapping

Each of the 15 SkyGuard AWS stations is matched to the nearest NOAA ISD station with sufficient data coverage:

| SkyGuard Station | City | NOAA ISD Station ID | Latitude | Longitude | Elevation (m) |
|------------------|------|---------------------|----------|-----------|---------------|
| AWS-DEL-01 | New Delhi | 421820-99999 | 28.60 | 77.20 | 216 |
| AWS-MUM-07 | Mumbai | 430030-99999 | 19.10 | 72.90 | 14 |
| AWS-CHN-03 | Chennai | 432790-99999 | 13.10 | 80.30 | 6 |
| AWS-KOL-05 | Kolkata | 428070-99999 | 22.60 | 88.40 | 9 |
| AWS-BLR-09 | Bengaluru | 432950-99999 | 12.97 | 77.60 | 920 |
| AWS-HYD-04 | Hyderabad | 431280-99999 | 17.40 | 78.50 | 542 |
| AWS-AMD-11 | Ahmedabad | 426470-99999 | 23.00 | 72.60 | 52 |
| AWS-JAI-06 | Jaipur | 423480-99999 | 26.90 | 75.80 | 431 |
| AWS-LKO-08 | Lucknow | 423690-99999 | 26.80 | 80.90 | 111 |
| AWS-BHO-12 | Bhopal | 426340-99999 | 23.30 | 77.40 | 527 |
| AWS-PAT-02 | Patna | 424920-99999 | 25.60 | 85.10 | 54 |
| AWS-GUW-13 | Guwahati | 424100-99999 | 26.20 | 91.70 | 55 |
| AWS-PUN-10 | Pune | 430630-99999 | 18.50 | 73.90 | 560 |
| AWS-TVM-15 | Thiruvananthapuram | 433710-99999 | 8.50 | 77.00 | 64 |
| AWS-SXR-14 | Srinagar | 420710-99999 | 34.10 | 74.80 | 1587 |

**Matching Criteria:**
1. Geographic proximity (nearest available station within 50km radius where possible)
2. Data completeness (stations with >95% hourly data coverage for the selected month)
3. Elevation similarity (preferring stations with similar elevation to minimize pressure bias)

## Baseline Pattern Computation

From the historical hourly data, the following statistics are computed for each station:

1. **Overall Statistics:**
   - Mean temperature, pressure, humidity, wind speed
   - Standard deviation for each parameter

2. **Diurnal (24-hour) Patterns:**
   - Average value per hour of day (0-23) for temperature, pressure, humidity, wind
   - Captures realistic daily cycles (e.g., cooler mornings, warmer afternoons)

3. **Example: New Delhi (DEL)**
   - Mean Temperature: 29.5°C
   - Temp Std Dev: 5.83°C
   - Hourly Pattern: Temperature ranges from 24.0°C at 5am to 35.6°C at 3pm
   - Mean Pressure: 980.7 hPa (station pressure at 216m elevation)

These patterns are stored in `backend/app/real_climate_profiles.json` and loaded at runtime by the generator.

## Normal Data Generation

The `generator.py` module generates "normal" sensor readings as follows:

```
reading_value = hourly_pattern_value[current_hour_IST] + realistic_noise
```

Where:
- `hourly_pattern_value[current_hour_IST]`: The expected value for the current hour based on real historical averages
- `realistic_noise`: Random noise scaled by ~0.25 × real historical standard deviation

This approach ensures:
- Realistic daily temperature cycles (warmer afternoons, cooler mornings)
- Appropriate variance matching real sensor behavior
- Station-specific characteristics (e.g., Srinagar is cooler than Ahmedabad)

## Anomaly Injection

Anomalies are **simulated faults** injected on top of the realistic baseline data:

- **Spike:** Temperature jumps 16-22°C above the expected hourly baseline
- **Flatline:** Pressure locked to a constant value (near-zero variance)
- **Dropout:** All sensors report zero (simulated power/communication failure)
- **Drift:** Gradual upward temperature trend (+1.1°C per reading, up to +7°C)

These are **not real anomalies from IMD data** — they are controlled test cases to demonstrate the detection system.

## Justification & Compliance

**Why simulate anomalies instead of using real IMD anomaly data?**

1. **Data Availability:** IMD's high-frequency raw AWS telemetry (sub-minute level) is not publicly available. The publicly accessible IMD data is already quality-controlled and has anomalies removed.

2. **Problem Statement Alignment:** The Smart India Hackathon 2026 problem statement (PS-1776) explicitly calls for developing a system that can "detect and handle anomalies in sensor data" and mentions "simulated anomalies" as an acceptable approach for demonstration purposes.

3. **Controlled Testing:** Simulated anomalies allow precise evaluation of detection accuracy, confidence scoring, and self-healing performance across different fault types, which would not be possible with sparse real-world anomalies.

4. **Real Baseline Legitimacy:** Using real NOAA ISD historical patterns ensures the **normal baseline behavior** is authentic, making the anomaly detection thresholds and ML features grounded in actual weather physics rather than arbitrary synthetic data.

## Data Refresh

The current climate profiles are based on May 2023 data. To refresh:

```bash
cd backend
python scripts/fetch_noaa_data.py
```

This will:
1. Download fresh hourly data for all 15 stations from Open-Meteo Historical Weather API
2. Recompute mean, std, and hourly patterns
3. Overwrite `backend/app/real_climate_profiles.json`

**Note:** The generator uses the current system time (in IST) to pick the appropriate hour from the 24-hour pattern, so the baseline naturally follows a realistic daily cycle in real-time.

---

**Last Updated:** 2026-09-04  
**Data Source Version:** NOAA ISD (via Open-Meteo) May 2023  
**Contact:** SkyGuard AI Team
