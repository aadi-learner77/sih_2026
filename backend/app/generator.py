import random
from typing import Dict, Tuple, Optional, Any
from app.stations import BASE_VALUES

def noise(amplitude: float) -> float:
    return (random.random() - 0.5) * 2 * amplitude

def generate_raw_reading(
    station_id: str, 
    active_fault: Optional[Dict[str, Any]] = None,
    step_index: int = 0
) -> Tuple[float, float, float, float]:
    base = BASE_VALUES.get(station_id, {'temp': 30.0, 'pressure': 1000.0, 'humidity': 50.0, 'wind': 5.0})
    
    temp = base['temp'] + noise(1.4)
    pressure = base['pressure'] + noise(1.8)
    humidity = base['humidity'] + noise(2.5)
    wind_speed = max(0.0, base['wind'] + noise(0.9))

    if active_fault:
        fault_type = active_fault.get('type')
        if fault_type == 'spike':
            # Spike: temperature jumps 16-22°C above baseline
            temp = base['temp'] + 16.0 + random.uniform(0.0, 6.0)
        elif fault_type == 'flatline':
            # Flatline: pressure locks to near-zero variance while inside normal-looking band
            pressure = base['pressure'] + 0.8
        elif fault_type == 'dropout':
            # Dropout: all values drop to 0
            temp = 0.0
            pressure = 0.0
            humidity = 0.0
            wind_speed = 0.0
        elif fault_type == 'drift':
            # Drift: gradual sustained trend over readings (e.g. +1.1°C per step up to +7°C)
            drift_step = min(6, step_index)
            temp = base['temp'] + (drift_step * 1.1) + noise(0.3)

    return round(temp, 1), round(pressure, 1), round(humidity, 1), round(wind_speed, 1)
