import time
import asyncio
from contextlib import asynccontextmanager
from typing import List, Literal, Optional
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.models import StationModel, ReadingModel, AnomalyEventModel, FaultRequest
from app.stations import STATIONS
from app.generator import generate_raw_reading
from app.detector import detector_instance
from app.state import state

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Seed initial normal readings history for all stations
    for s in STATIONS:
        sid = s['id']
        for _ in range(10):
            temp, pres, hum, wind = generate_raw_reading(sid)
            hist = [r.model_dump() for r in state.get_history(sid)]
            eval_res = detector_instance.evaluate_reading(sid, (temp, pres, hum, wind), hist, mode='ai')
            reading = ReadingModel(
                stationId=sid,
                timestamp=int(time.time() * 1000),
                temperature=temp,
                pressure=pres,
                humidity=hum,
                windSpeed=wind,
                isAnomaly=eval_res['isAnomaly'],
                anomalyType=eval_res['anomalyType'],
                anomalyParameter=eval_res['anomalyParameter'],
                confidence=eval_res['confidence'],
                correctedValue=eval_res['correctedValue'],
                aiOnly=eval_res['aiOnly']
            )
            state.add_reading(sid, reading)
    yield
    # Shutdown logic if any

app = FastAPI(
    title="SkyGuard AI Backend",
    description="Real ML Anomaly Detection Backend for Automatic Weather Stations (AWS)",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/stations", response_model=List[StationModel])
def get_station_list():
    return STATIONS

@app.get("/stations/{station_id}/reading", response_model=ReadingModel)
def get_live_reading(station_id: str, mode: Literal['rule', 'ai'] = Query('ai')):
    station = next((s for s in STATIONS if s['id'] == station_id), None)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    fault = state.get_active_fault(station_id)
    step_idx = state.station_step_indices.get(station_id, 0)
    temp, pres, hum, wind = generate_raw_reading(station_id, fault, step_index=step_idx)

    raw_history = [r.model_dump() for r in state.get_history(station_id)]
    eval_res = detector_instance.evaluate_reading(station_id, (temp, pres, hum, wind), raw_history, mode=mode)

    reading = ReadingModel(
        stationId=station_id,
        timestamp=int(time.time() * 1000),
        temperature=temp,
        pressure=pres,
        humidity=hum,
        windSpeed=wind,
        isAnomaly=eval_res['isAnomaly'],
        anomalyType=eval_res['anomalyType'],
        anomalyParameter=eval_res['anomalyParameter'],
        confidence=eval_res['confidence'],
        correctedValue=eval_res['correctedValue'],
        aiOnly=eval_res['aiOnly']
    )

    state.add_reading(station_id, reading)
    if reading.isAnomaly:
        state.push_event(reading, station['name'])

    return reading

@app.get("/stations/{station_id}/history", response_model=List[ReadingModel])
def get_readings_history(station_id: str):
    return state.get_history(station_id)

@app.get("/events", response_model=List[AnomalyEventModel])
def get_anomaly_events():
    return state.get_events()

@app.post("/stations/{station_id}/fault")
def trigger_fault(station_id: str, req: FaultRequest):
    station = next((s for s in STATIONS if s['id'] == station_id), None)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    state.trigger_fault(station_id, req.type)
    return {"status": "ok", "message": f"Fault '{req.type}' triggered for station {station_id}"}

@app.get("/health")
def health_check():
    """Health check endpoint for deployment platforms (Render, etc.)"""
    return {"status": "ok", "message": "SkyGuard AI Backend is running"}

@app.get("/network-health")
def get_network_health() -> int:
    return state.get_network_health()

@app.get("/stations/{station_id}/status")
def get_station_status(station_id: str):
    status_str = state.get_station_status(station_id)
    return JSONResponse(content=status_str)

@app.websocket("/ws/live")
async def websocket_live_feed(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Broadcast live reading for all stations every 1.5 seconds
            readings = []
            for s in STATIONS:
                sid = s['id']
                fault = state.get_active_fault(sid)
                step_idx = state.station_step_indices.get(sid, 0)
                temp, pres, hum, wind = generate_raw_reading(sid, fault, step_index=step_idx)
                raw_history = [r.model_dump() for r in state.get_history(sid)]
                eval_res = detector_instance.evaluate_reading(sid, (temp, pres, hum, wind), raw_history, mode='ai')

                reading = ReadingModel(
                    stationId=sid,
                    timestamp=int(time.time() * 1000),
                    temperature=temp,
                    pressure=pres,
                    humidity=hum,
                    windSpeed=wind,
                    isAnomaly=eval_res['isAnomaly'],
                    anomalyType=eval_res['anomalyType'],
                    anomalyParameter=eval_res['anomalyParameter'],
                    confidence=eval_res['confidence'],
                    correctedValue=eval_res['correctedValue'],
                    aiOnly=eval_res['aiOnly']
                )

                state.add_reading(sid, reading)
                if reading.isAnomaly:
                    state.push_event(reading, s['name'])
                
                readings.append(reading.model_dump(by_alias=True))

            await websocket.send_json({"type": "live_update", "readings": readings})
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        pass
