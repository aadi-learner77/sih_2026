import time
import random
import threading
from typing import Dict, List, Optional, Any
from app.models import ReadingModel, AnomalyEventModel
from app.stations import STATIONS, BASE_VALUES

class AppState:
    def __init__(self):
        self.lock = threading.Lock()
        self.readings_history: Dict[str, List[ReadingModel]] = {s['id']: [] for s in STATIONS}
        self.latest_readings: Dict[str, ReadingModel] = {}
        self.active_faults: Dict[str, Dict[str, Any]] = {}
        self.anomaly_events: List[AnomalyEventModel] = []
        self.event_id_counter: int = 0
        self.station_step_indices: Dict[str, int] = {s['id']: 0 for s in STATIONS}

    def trigger_fault(self, station_id: str, fault_type: str):
        with self.lock:
            self.active_faults[station_id] = {
                'type': fault_type,
                'startTime': int(time.time() * 1000),
                'duration': int((9 + random.random() * 4) * 1000)
            }

    def get_active_fault(self, station_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            fault = self.active_faults.get(station_id)
            if not fault:
                return None
            now = int(time.time() * 1000)
            if now - fault['startTime'] > fault['duration']:
                del self.active_faults[station_id]
                return None
            return fault

    def add_reading(self, station_id: str, reading: ReadingModel):
        with self.lock:
            hist = self.readings_history.setdefault(station_id, [])
            hist.append(reading)
            if len(hist) > 60:
                hist.pop(0)
            self.latest_readings[station_id] = reading
            self.station_step_indices[station_id] = self.station_step_indices.get(station_id, 0) + 1

    def get_history(self, station_id: str) -> List[ReadingModel]:
        with self.lock:
            return list(self.readings_history.get(station_id, []))

    def push_event(self, reading: ReadingModel, station_name: str):
        with self.lock:
            if not reading.isAnomaly or not reading.anomalyType or not reading.anomalyParameter:
                return

            now = int(time.time() * 1000)
            
            # Rate limit events per station (only if last event was > 3000 ms ago)
            recent_evts = [e for e in self.anomaly_events if e.stationId == reading.stationId]
            if recent_evts and (now - recent_evts[0].timestamp < 3000):
                return

            param = reading.anomalyParameter
            raw_val = getattr(reading, param, 0.0)

            self.event_id_counter += 1
            event = AnomalyEventModel(
                id=f"evt-{self.event_id_counter}-{now}",
                stationId=reading.stationId,
                stationName=station_name,
                timestamp=now,
                parameter=param,
                anomalyType=reading.anomalyType,
                rawValue=raw_val,
                correctedValue=reading.correctedValue,
                confidence=reading.confidence,
                status='detected',
                aiOnly=reading.aiOnly
            )

            self.anomaly_events.insert(0, event)
            if len(self.anomaly_events) > 60:
                self.anomaly_events.pop()

    def get_events(self) -> List[AnomalyEventModel]:
        with self.lock:
            now = int(time.time() * 1000)
            updated_events = []
            for e in self.anomaly_events:
                elapsed = now - e.timestamp
                if elapsed > 3000:
                    status = 'corrected'
                elif elapsed > 1200:
                    status = 'healing'
                else:
                    status = 'detected'
                
                # Copy with updated status
                updated_events.append(e.model_copy(update={'status': status}))
            return updated_events

    def get_network_health(self) -> int:
        with self.lock:
            now = int(time.time() * 1000)
            # Expire old faults
            expired = [sid for sid, f in self.active_faults.items() if now - f['startTime'] > f['duration']]
            for sid in expired:
                del self.active_faults[sid]

            fault_count = len(self.active_faults)
            total = len(STATIONS)
            return max(0, round(((total - fault_count) / total) * 100))

    def get_station_status(self, station_id: str) -> str:
        fault = self.get_active_fault(station_id)
        if not fault:
            return 'normal'
        f_type = fault['type']
        if f_type == 'dropout':
            return 'offline'
        if f_type == 'spike':
            return 'critical'
        return 'warning'

state = AppState()
