from datetime import datetime
from typing import Any, List, Literal

from pydantic import BaseModel, Field


class LocationPayload(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)


class GestureFeaturePayload(BaseModel):
    coordinates: List[List[float]]
    duration_ms: float
    average_speed: float
    max_speed: float
    total_distance: float
    direction_changes: int


class AlertCreate(BaseModel):
    request_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9._:-]+$")
    gesture_label: str
    confidence: float = Field(ge=0.0, le=1.0)
    location: LocationPayload
    features: GestureFeaturePayload
    metadata: dict[str, Any] | None = None
    triggered_at: datetime


class TrustedContactPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone_number: str = Field(min_length=5, max_length=20)
    relation: str = Field(min_length=1, max_length=50)


class EmergencyAlertCreate(BaseModel):
    request_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9._:-]+$")
    user_name: str = Field(min_length=1, max_length=100)
    user_phone: str = Field(min_length=5, max_length=20)
    trusted_contacts: List[TrustedContactPayload] = Field(default_factory=list)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    map_url: str | None = Field(default=None, max_length=500)
    location_source: Literal[
        "live_gps", "last_known", "cached", "configured_fallback", "unavailable"
    ] = "unavailable"


class ContactDeliveryResultUpdate(BaseModel):
    phone_number: str = Field(min_length=5, max_length=20)
    status: Literal["SENT", "FAILED", "PENDING_USER_CONFIRMATION", "PREPARED"]
    error: str = Field(default="", max_length=300)


class ContactDeliveryMarkRequest(BaseModel):
    results: List[ContactDeliveryResultUpdate] = Field(default_factory=list)
