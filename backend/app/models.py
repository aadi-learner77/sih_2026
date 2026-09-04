from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

class StationModel(BaseModel):
    id: str
    name: str
    location: str
    state: str
    lat: float
    lon: float
    elevation: float

class ReadingModel(BaseModel):
    stationId: str = Field(..., serialization_alias="stationId", alias="stationId")
    timestamp: int
    temperature: float
    pressure: float
    humidity: float
    windSpeed: float = Field(..., serialization_alias="windSpeed", alias="windSpeed")
    isAnomaly: bool = Field(..., serialization_alias="isAnomaly", alias="isAnomaly")
    anomalyType: Optional[Literal['spike', 'flatline', 'drift', 'dropout']] = Field(None, serialization_alias="anomalyType", alias="anomalyType")
    anomalyParameter: Optional[Literal['temperature', 'pressure', 'humidity']] = Field(None, serialization_alias="anomalyParameter", alias="anomalyParameter")
    confidence: float
    correctedValue: Optional[float] = Field(None, serialization_alias="correctedValue", alias="correctedValue")
    aiOnly: bool = Field(..., serialization_alias="aiOnly", alias="aiOnly")

    model_config = ConfigDict(populate_by_name=True)

class AnomalyEventModel(BaseModel):
    id: str
    stationId: str = Field(..., serialization_alias="stationId", alias="stationId")
    stationName: str = Field(..., serialization_alias="stationName", alias="stationName")
    timestamp: int
    parameter: Literal['temperature', 'pressure', 'humidity']
    anomalyType: Literal['spike', 'flatline', 'drift', 'dropout']
    rawValue: float = Field(..., serialization_alias="rawValue", alias="rawValue")
    correctedValue: Optional[float] = Field(None, serialization_alias="correctedValue", alias="correctedValue")
    confidence: float
    status: Literal['detected', 'healing', 'corrected']
    aiOnly: bool = Field(..., serialization_alias="aiOnly", alias="aiOnly")

    model_config = ConfigDict(populate_by_name=True)

class FaultRequest(BaseModel):
    type: Literal['spike', 'flatline', 'dropout']
