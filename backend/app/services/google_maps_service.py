import math
from typing import Any

import requests

from app.core.config import get_settings
from app.services.police_service import PoliceKNNService


class GoogleMapsService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.api_key = (self.settings.google_maps_api_key or "").strip()
        self.enabled = bool(self.settings.use_google_maps and self.api_key)
        self.police_fallback = PoliceKNNService()

    @staticmethod
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        earth_radius_km = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lambda = math.radians(lon2 - lon1)
        a = (
            math.sin(d_phi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return earth_radius_km * c

    def reverse_geocode(self, latitude: float, longitude: float) -> dict[str, Any]:
        fallback = {
            "formatted_address": "Location address unavailable",
            "locality": "",
            "city": "",
            "state": "",
            "country": "",
            "source": "fallback",
        }
        if not self.enabled:
            return fallback
        try:
            response = requests.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "latlng": f"{latitude},{longitude}",
                    "key": self.api_key,
                },
                timeout=6,
            )
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results") or []
            if not results:
                return fallback
            top = results[0]
            formatted = top.get("formatted_address") or "Location address unavailable"
            locality = ""
            city = ""
            state = ""
            country = ""
            for component in top.get("address_components", []):
                types = component.get("types", [])
                if "sublocality" in types or "sublocality_level_1" in types:
                    locality = locality or component.get("long_name", "")
                if "locality" in types:
                    city = city or component.get("long_name", "")
                if "administrative_area_level_1" in types:
                    state = state or component.get("long_name", "")
                if "country" in types:
                    country = country or component.get("long_name", "")
            if not locality:
                locality = city
            return {
                "formatted_address": formatted,
                "locality": locality,
                "city": city,
                "state": state,
                "country": country,
                "source": "google_maps",
            }
        except Exception:
            return fallback

    def find_nearby_police_stations(self, latitude: float, longitude: float) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        try:
            response = requests.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params={
                    "location": f"{latitude},{longitude}",
                    "radius": 7000,
                    "type": "police",
                    "key": self.api_key,
                },
                timeout=6,
            )
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results") or []
            normalized: list[dict[str, Any]] = []
            for item in results:
                geometry = (item.get("geometry") or {}).get("location") or {}
                station_lat = geometry.get("lat")
                station_lng = geometry.get("lng")
                if station_lat is None or station_lng is None:
                    continue
                distance_km = self._haversine_km(latitude, longitude, station_lat, station_lng)
                normalized.append(
                    {
                        "name": item.get("name", "Unknown station"),
                        "address": item.get("vicinity", "Address unavailable"),
                        "phone": "Not available",
                        "latitude": station_lat,
                        "longitude": station_lng,
                        "place_id": item.get("place_id", ""),
                        "distance_km": round(distance_km, 2),
                        "source": "google_maps",
                    }
                )
            normalized.sort(key=lambda station: station["distance_km"])
            return normalized[:3]
        except Exception:
            return []

    def get_best_police_station(self, latitude: float, longitude: float) -> dict[str, Any]:
        google_top_3 = self.find_nearby_police_stations(latitude, longitude)
        if google_top_3:
            return {
                "nearest_station": google_top_3[0],
                "top_3": google_top_3,
                "source": "google_maps",
            }

        static_result = self.police_fallback.nearest(latitude, longitude)
        static_top3: list[dict[str, Any]] = []
        for station in static_result.get("top_3", []):
            static_top3.append(
                {
                    "name": station.get("name", "Unknown station"),
                    "phone": station.get("phone", "Not available"),
                    "address": station.get("address", "Address unavailable"),
                    "latitude": station.get("latitude"),
                    "longitude": station.get("longitude"),
                    "place_id": "",
                    "distance_km": station.get("distance_km"),
                    "source": "static_fallback",
                }
            )
        nearest_station = static_top3[0] if static_top3 else None
        return {
            "nearest_station": nearest_station,
            "top_3": static_top3,
            "source": "static_fallback",
        }
