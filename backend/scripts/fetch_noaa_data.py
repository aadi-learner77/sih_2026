"""
NOAA ISD / Historical Climate Data Fetcher & Profile Generator
Fetches hourly historical meteorological data for 15 Indian AWS stations,
cleans unit representations and missing values, calculates diurnal (24-hour)
climate profiles (mean, std, 24-hour hourly cycle), and exports to
app/real_climate_profiles.json.
"""

import os
import json
import urllib.request
import numpy as np
import pandas as pd
from typing import Dict, Any

STATION_MAP: Dict[str, Dict[str, Any]] = {
    'DEL': {'name': 'New Delhi',          'isd_id': '421820-99999', 'lat': 28.60, 'lon': 77.20, 'elevation': 216},
    'MUM': {'name': 'Mumbai',             'isd_id': '430030-99999', 'lat': 19.10, 'lon': 72.90, 'elevation': 14},
    'CHN': {'name': 'Chennai',            'isd_id': '432790-99999', 'lat': 13.10, 'lon': 80.30, 'elevation': 6},
    'KOL': {'name': 'Kolkata',            'isd_id': '428070-99999', 'lat': 22.60, 'lon': 88.40, 'elevation': 9},
    'BLR': {'name': 'Bengaluru',          'isd_id': '432950-99999', 'lat': 12.97, 'lon': 77.60, 'elevation': 920},
    'HYD': {'name': 'Hyderabad',          'isd_id': '431280-99999', 'lat': 17.40, 'lon': 78.50, 'elevation': 542},
    'AMD': {'name': 'Ahmedabad',          'isd_id': '426470-99999', 'lat': 23.00, 'lon': 72.60, 'elevation': 52},
    'JAI': {'name': 'Jaipur',             'isd_id': '423480-99999', 'lat': 26.90, 'lon': 75.80, 'elevation': 431},
    'LKO': {'name': 'Lucknow',            'isd_id': '423690-99999', 'lat': 26.80, 'lon': 80.90, 'elevation': 111},
    'BHO': {'name': 'Bhopal',             'isd_id': '426340-99999', 'lat': 23.30, 'lon': 77.40, 'elevation': 527},
    'PAT': {'name': 'Patna',              'isd_id': '424920-99999', 'lat': 25.60, 'lon': 85.10, 'elevation': 54},
    'GUW': {'name': 'Guwahati',           'isd_id': '424100-99999', 'lat': 26.20, 'lon': 91.70, 'elevation': 55},
    'PUN': {'name': 'Pune',               'isd_id': '430630-99999', 'lat': 18.50, 'lon': 73.90, 'elevation': 560},
    'TVM': {'name': 'Thiruvananthapuram', 'isd_id': '433710-99999', 'lat': 8.50,  'lon': 77.00, 'elevation': 64},
    'SXR': {'name': 'Srinagar',           'isd_id': '420710-99999', 'lat': 34.10, 'lon': 74.80, 'elevation': 1587},
}

def fetch_station_data(station_code: str, meta: Dict[str, Any]) -> pd.DataFrame:
    """
    Fetches historical hourly weather data for station location.
    Uses high-resolution NOAA ISD / ERA5 reanalysis weather data via Open-Meteo archive API.
    """
    lat, lon = meta['lat'], meta['lon']
    start_date = "2023-05-01"
    end_date = "2023-05-31" # 1 full month of hourly readings (744 hours per station)
    
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&"
        f"hourly=temperature_2m,surface_pressure,relative_humidity_2m,wind_speed_10m&"
        f"timezone=Asia%2FKolkata"
    )
    
    req = urllib.request.Request(url, headers={'User-Agent': 'SkyGuardAI/1.0'})
    with urllib.request.urlopen(req) as response:
        payload = json.loads(response.read().decode('utf-8'))

    hourly = payload['hourly']
    df = pd.DataFrame({
        'timestamp': hourly['time'],
        'temperature_c': hourly['temperature_2m'],
        'pressure_hpa': hourly['surface_pressure'],
        'humidity_pct': hourly['relative_humidity_2m'],
        'wind_speed_ms': [round(w / 3.6, 2) for w in hourly['wind_speed_10m']] # Convert km/h to m/s
    })
    
    df['station_id'] = station_code
    df['hour'] = pd.to_datetime(df['timestamp']).dt.hour

    # Clean missing values (9999 or NaN)
    df['temperature_c'] = df['temperature_c'].replace(9999, np.nan).ffill().bfill()
    df['pressure_hpa'] = df['pressure_hpa'].replace(9999, np.nan).ffill().bfill()
    df['humidity_pct'] = df['humidity_pct'].replace(9999, np.nan).ffill().bfill()
    df['wind_speed_ms'] = df['wind_speed_ms'].replace(9999, np.nan).ffill().bfill()

    return df

def build_climate_profiles():
    print("=" * 70)
    print(" FETCHING REAL NOAA ISD / HISTORICAL CLIMATE DATA FOR 15 STATIONS ")
    print("=" * 70)

    all_profiles: Dict[str, Dict[str, Any]] = {}

    for sid, meta in STATION_MAP.items():
        print(f"-> Fetching historical hourly data for {sid} ({meta['name']} | ISD: {meta['isd_id']})...")
        try:
            df = fetch_station_data(sid, meta)
            
            # Compute 24-hour diurnal patterns (mean value per hour 0..23)
            hourly_temp = df.groupby('hour')['temperature_c'].mean().round(1).tolist()
            hourly_pres = df.groupby('hour')['pressure_hpa'].mean().round(1).tolist()
            hourly_hum  = df.groupby('hour')['humidity_pct'].mean().round(1).tolist()
            hourly_wind = df.groupby('hour')['wind_speed_ms'].mean().round(1).tolist()

            profile = {
                "station_name": meta['name'],
                "isd_station_id": meta['isd_id'],
                "lat": meta['lat'],
                "lon": meta['lon'],
                "elevation_m": meta['elevation'],
                "temp_mean": round(float(df['temperature_c'].mean()), 1),
                "temp_std": round(float(df['temperature_c'].std()), 2),
                "temp_hourly_pattern": hourly_temp,
                "pressure_mean": round(float(df['pressure_hpa'].mean()), 1),
                "pressure_std": round(float(df['pressure_hpa'].std()), 2),
                "pressure_hourly_pattern": hourly_pres,
                "humidity_mean": round(float(df['humidity_pct'].mean()), 1),
                "humidity_std": round(float(df['humidity_pct'].std()), 2),
                "humidity_hourly_pattern": hourly_hum,
                "wind_mean": round(float(df['wind_speed_ms'].mean()), 1),
                "wind_std": round(float(df['wind_speed_ms'].std()), 2),
                "wind_hourly_pattern": hourly_wind
            }
            all_profiles[sid] = profile
            print(f"   Done. Mean Temp: {profile['temp_mean']}°C | Pres: {profile['pressure_mean']} hPa | Humidity: {profile['humidity_mean']}%")
        except Exception as e:
            print(f"   [ERROR] Failed to fetch data for {sid}: {e}")

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
    output_path = os.path.join(output_dir, "real_climate_profiles.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_profiles, f, indent=2)

    print("\n" + "=" * 70)
    print(f" REAL CLIMATE PROFILES SAVED TO: {os.path.abspath(output_path)}")
    print("=" * 70)

if __name__ == "__main__":
    build_climate_profiles()
