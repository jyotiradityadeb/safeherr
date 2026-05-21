import json
import math
from pathlib import Path


class PoliceKNNService:
    def __init__(self, data_path: str | None = None):
        default_path = Path(__file__).resolve().parents[2] / "data" / "police_stations.json"
        self.data_path = Path(data_path) if data_path else default_path
        self._stations = self._load_stations()

    def _load_stations(self) -> list[dict]:
        if not self.data_path.exists():
            return []
        with self.data_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, list) else []

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

    def nearest(self, latitude: float, longitude: float) -> dict:
        if not self._stations:
            return {"nearest_station": None, "top_3": []}

        ranked = []
        for station in self._stations:
            distance_km = self._haversine_km(
                latitude,
                longitude,
                station["latitude"],
                station["longitude"],
            )
            ranked.append(
                {
                    **station,
                    "distance_km": round(distance_km, 2),
                }
            )

        ranked.sort(key=lambda item: item["distance_km"])
        nearest_station = ranked[0]
        top_3 = ranked[:3]
        return {
            "nearest_station": nearest_station,
            "top_3": top_3,
        }
