from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AgentAnalyzeRequest(BaseModel):
    user_name: str = Field(default="User", min_length=1, max_length=100)
    user_phone: str = Field(default="", max_length=20)
    trusted_contacts: list[dict[str, Any]] = Field(default_factory=list)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    map_url: str = Field(default="Location unavailable", max_length=500)
    location_address: str = Field(default="Location address unavailable", max_length=500)
    nearest_police_station_name: str | None = None
    nearest_police_station_phone: str | None = None
    nearest_police_station_address: str | None = None
    police_distance_km: float | None = None
    police_source: str = "static_fallback"
    maps_enrichment: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    location_source: str = "fallback"
