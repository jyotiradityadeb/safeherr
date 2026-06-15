from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from bson import ObjectId
from fastapi import UploadFile
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.schemas.alert import AlertCreate, EmergencyAlertCreate
from app.services.ai_safety_agent import AISafetyAgent
from app.services.contact_delivery_service import ContactDeliveryService
from app.services.device_service import DeviceService
from app.services.google_maps_service import GoogleMapsService
from app.services.notification_service import NotificationService
from app.services.police_service import PoliceKNNService
from app.services.push_service import PushService
from app.services.safety_service import SafetyService
from app.utils.realtime import realtime_manager


class AlertService:
    def __init__(self, db):
        self.alerts = db["alerts"]
        self.locations = db["locations"]
        self.contacts = db["contacts"]
        self.users = db["users"]
        self.db = db
        self.notification_service = NotificationService()
        self.push_service = PushService()
        self.police_service = PoliceKNNService()
        self.google_maps_service = GoogleMapsService()
        self.ai_safety_agent = AISafetyAgent()
        self.contact_delivery_service = ContactDeliveryService()
        self.evidence_dir = Path(__file__).resolve().parents[2] / "data" / "evidence"

    # ------------------------------
    # New manual SOS alert flow
    # ------------------------------
    async def create_emergency_alert(self, user_id: str, payload: EmergencyAlertCreate) -> dict:
        existing = await self._find_idempotent_alert(user_id, payload.request_id)
        if existing:
            serialized = self._serialize(existing, await self._resolve_user(user_id))
            serialized["idempotent_replay"] = True
            return serialized

        user = await self.users.find_one({"_id": ObjectId(user_id)})
        now = datetime.now(timezone.utc)

        trusted_contacts = payload.trusted_contacts
        if not trusted_contacts:
            contacts = await self.contacts.find({"user_id": user_id}).to_list(length=50)
            trusted_contacts = [
                {
                    "name": item.get("name", ""),
                    "phone_number": item.get("phone_number", ""),
                    "relation": item.get("relationship", "") or item.get("relation", ""),
                }
                for item in contacts
            ]
        trusted_contacts = self.contact_delivery_service.normalize_contacts(trusted_contacts)
        if not trusted_contacts:
            raise ValueError("At least one valid trusted contact phone number is required.")

        map_url = payload.map_url or "Location unavailable"
        if payload.latitude is not None and payload.longitude is not None and not payload.map_url:
            map_url = f"https://www.google.com/maps?q={payload.latitude},{payload.longitude}"

        geocode = {
            "formatted_address": "Location address unavailable",
            "locality": "",
            "city": "",
            "source": "fallback",
        }
        nearest_result = {
            "nearest_station": None,
            "top_3": [],
            "source": "static_fallback",
        }
        if payload.latitude is not None and payload.longitude is not None:
            geocode = self.google_maps_service.reverse_geocode(payload.latitude, payload.longitude)
            nearest_result = self.google_maps_service.get_best_police_station(
                payload.latitude, payload.longitude
            )
        nearest_station = nearest_result.get("nearest_station")
        location_address = geocode.get("formatted_address", "Location address unavailable")
        location_locality = geocode.get("locality", "")
        location_city = geocode.get("city", "")
        location_source = payload.location_source
        address_source = geocode.get("source", "fallback")
        police_source = nearest_result.get("source", "static_fallback")

        maps_enrichment = {
            "address_source": address_source,
            "police_source": police_source,
            "google_maps_used": bool(police_source == "google_maps" or address_source == "google_maps"),
            "fallback_used": bool(police_source != "google_maps" or address_source != "google_maps"),
        }

        message_to_contacts = self._build_contacts_message(
            payload.user_name,
            payload.user_phone,
            map_url,
            location_address,
        )
        message_to_police = self._build_police_message(
            payload.user_name,
            payload.user_phone,
            map_url,
            location_address,
            nearest_station,
            police_source,
        )
        ai_agent_input = {
            "status": "SOS_CREATED",
            "user_name": payload.user_name,
            "user_phone": payload.user_phone,
            "trusted_contacts": trusted_contacts,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "map_url": map_url,
            "location_address": location_address,
            "nearest_police_station_name": nearest_station.get("name") if nearest_station else None,
            "nearest_police_station_phone": nearest_station.get("phone") if nearest_station else None,
            "nearest_police_station_address": nearest_station.get("address") if nearest_station else None,
            "police_distance_km": nearest_station.get("distance_km") if nearest_station else None,
            "police_source": police_source,
            "maps_enrichment": maps_enrichment,
            "created_at": now.isoformat(),
            "location_source": location_source,
        }
        ai_agent_analysis = self.ai_safety_agent.analyze(ai_agent_input)

        alert = {
            "user_id": user_id,
            "request_id": payload.request_id,
            "user_name": payload.user_name,
            "user_phone": payload.user_phone,
            "trusted_contacts": trusted_contacts,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "map_url": map_url,
            "location_address": location_address,
            "location_locality": location_locality,
            "location_city": location_city,
            "location_source": location_source,
            "nearest_police_station_name": nearest_station.get("name") if nearest_station else None,
            "nearest_police_station_phone": nearest_station.get("phone") if nearest_station else None,
            "nearest_police_station_address": nearest_station.get("address") if nearest_station else None,
            "nearest_police_station_latitude": nearest_station.get("latitude") if nearest_station else None,
            "nearest_police_station_longitude": nearest_station.get("longitude") if nearest_station else None,
            "nearest_police_station_place_id": nearest_station.get("place_id") if nearest_station else None,
            "police_distance_km": nearest_station.get("distance_km") if nearest_station else None,
            "police_source": police_source,
            "nearby_police_stations": nearest_result.get("top_3", []),
            "maps_enrichment": maps_enrichment,
            "status": "SOS_CREATED",
            "status_history": ["SOS_CREATED"],
            "police_delivery_status": "POLICE_CONTACT_NOT_AUTOMATED",
            "message_to_contacts": message_to_contacts,
            "police_message_preview": message_to_police,
            "ai_agent_analysis": ai_agent_analysis,
            "contact_delivery_status": "NOT_ATTEMPTED",
            "contact_delivery_results": [],
            "contact_delivery_error": "",
            "created_at": now,
            "resolved_at": None,
            "demo_mode": True,
            "source": "manual_sos",
            "metadata": {
                "legacy_compatible": False,
                "user_email": user.get("email") if user else None,
            },
        }
        try:
            result = await self.alerts.insert_one(alert)
        except DuplicateKeyError:
            existing = await self._find_idempotent_alert(user_id, payload.request_id)
            if existing:
                serialized = self._serialize(existing, user)
                serialized["idempotent_replay"] = True
                return serialized
            raise
        alert["_id"] = result.inserted_id

        contact_delivery = await self.contact_delivery_service.deliver_contact_messages(
            {
                "trusted_contacts": trusted_contacts,
                "message_to_contacts": message_to_contacts,
            }
        )
        contact_delivery_status = contact_delivery.get("contact_delivery_status", "NOT_ATTEMPTED")
        alert_status = self._alert_status_for_delivery(contact_delivery_status)
        status_history = ["SOS_CREATED"]
        if alert_status != "SOS_CREATED":
            status_history.append(alert_status)
        delivery_update = {
            "status": alert_status,
            "status_history": status_history,
            "contact_delivery_status": contact_delivery_status,
            "contact_delivery_results": contact_delivery.get("contact_delivery_results", []),
            "contact_delivery_error": contact_delivery.get("contact_delivery_error", ""),
        }
        await self.alerts.update_one({"_id": alert["_id"]}, {"$set": delivery_update})
        alert.update(delivery_update)

        serialized = self._serialize(alert, user)
        await realtime_manager.broadcast({"type": "alert.created", "payload": serialized})
        return serialized

    async def list_alerts(self, user_id: str, is_admin: bool = False) -> list[dict]:
        query = {} if is_admin else {"user_id": user_id}
        alerts = await self.alerts.find(query).sort("created_at", -1).to_list(length=300)
        user_lookup = await self._build_user_lookup(alerts)
        return [self._serialize(alert, user_lookup.get(alert.get("user_id"))) for alert in alerts]

    async def get_alert(self, user_id: str, alert_id: str, is_admin: bool = False) -> dict | None:
        if not ObjectId.is_valid(alert_id):
            return None
        query: dict[str, Any] = {"_id": ObjectId(alert_id)}
        if not is_admin:
            query["user_id"] = user_id
        alert = await self.alerts.find_one(query)
        if not alert:
            return None
        user = await self._resolve_user(alert.get("user_id"))
        return self._serialize(alert, user)

    async def get_agent_analysis(self, user_id: str, alert_id: str, is_admin: bool = False) -> dict | None:
        alert = await self.get_alert(user_id, alert_id, is_admin=is_admin)
        if not alert:
            return None
        return alert.get("ai_agent_analysis")

    async def get_contact_delivery(self, user_id: str, alert_id: str, is_admin: bool = False) -> dict | None:
        alert = await self.get_alert(user_id, alert_id, is_admin=is_admin)
        if not alert:
            return None
        return {
            "alert_id": alert.get("id"),
            "contact_delivery_status": alert.get("contact_delivery_status", "NOT_ATTEMPTED"),
            "contact_delivery_results": alert.get("contact_delivery_results", []),
        }

    async def mark_contact_delivery(
        self,
        user_id: str,
        alert_id: str,
        updates: list[dict[str, Any]],
        is_admin: bool = False,
    ) -> dict:
        if not ObjectId.is_valid(alert_id):
            raise ValueError("Alert not found.")
        query: dict[str, Any] = {"_id": ObjectId(alert_id)}
        if not is_admin:
            query["user_id"] = user_id
        alert = await self.alerts.find_one(query)
        if not alert:
            raise ValueError("Alert not found.")

        existing_results = list(alert.get("contact_delivery_results") or [])
        result_by_phone = {
            str(item.get("phone_number") or "").strip(): dict(item)
            for item in existing_results
            if str(item.get("phone_number") or "").strip()
        }

        for update in updates:
            phone = str(update.get("phone_number") or "").strip()
            if not phone:
                continue
            current = result_by_phone.get(
                phone,
                {
                    "name": "",
                    "phone_number": phone,
                    "relation": "",
                    "status": "NOT_ATTEMPTED",
                    "error": "",
                    "sent_at": None,
                },
            )
            status = str(update.get("status") or current.get("status") or "PREPARED").upper()
            current["status"] = status
            current["error"] = str(update.get("error") or "")
            current["phone_number"] = phone
            if status == "SENT":
                current["sent_at"] = self.contact_delivery_service.now_iso()
            elif status in {"FAILED", "PENDING_USER_CONFIRMATION", "PREPARED"}:
                current.setdefault("sent_at", None)
            result_by_phone[phone] = current

        next_results = list(result_by_phone.values())
        next_status = self.contact_delivery_service.aggregate_status(next_results)
        next_alert_status = self._alert_status_for_delivery(next_status)
        next_history = list(alert.get("status_history") or [])
        if next_alert_status not in next_history:
            next_history.append(next_alert_status)

        await self.alerts.update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "status": next_alert_status,
                    "status_history": next_history,
                    "contact_delivery_status": next_status,
                    "contact_delivery_results": next_results,
                }
            },
        )

        alert["status"] = next_alert_status
        alert["status_history"] = next_history
        alert["contact_delivery_status"] = next_status
        alert["contact_delivery_results"] = next_results
        serialized = self._serialize(alert, await self._resolve_user(alert.get("user_id")))
        await realtime_manager.broadcast({"type": "alert.status_changed", "payload": serialized})
        return serialized

    async def resolve_alert(self, user_id: str, alert_id: str, is_admin: bool = False) -> dict:
        if not ObjectId.is_valid(alert_id):
            raise ValueError("Alert not found.")
        query: dict[str, Any] = {"_id": ObjectId(alert_id)}
        if not is_admin:
            query["user_id"] = user_id
        alert = await self.alerts.find_one(query)
        if not alert:
            raise ValueError("Alert not found.")

        now = datetime.now(timezone.utc)
        next_history = list(alert.get("status_history") or [])
        if "RESOLVED" not in next_history:
            next_history.append("RESOLVED")
        await self.alerts.update_one(
            {"_id": ObjectId(alert_id)},
            {"$set": {"status": "RESOLVED", "resolved_at": now, "status_history": next_history}},
        )
        alert["status"] = "RESOLVED"
        alert["resolved_at"] = now
        alert["status_history"] = next_history
        serialized = self._serialize(alert, await self._resolve_user(alert.get("user_id")))
        await realtime_manager.broadcast({"type": "alert.status_changed", "payload": serialized})
        return serialized

    async def cancel_false_alarm(self, user_id: str, reason: str = "countdown_cancelled") -> dict:
        now = datetime.now(timezone.utc)
        user = await self.users.find_one({"_id": ObjectId(user_id)})
        alert = {
            "user_id": user_id,
            "user_name": (user or {}).get("full_name", "Unknown User"),
            "user_phone": (user or {}).get("phone_number", ""),
            "trusted_contacts": [],
            "latitude": None,
            "longitude": None,
            "map_url": "Location unavailable",
            "location_address": "Location address unavailable",
            "location_locality": "",
            "location_city": "",
            "location_source": "fallback",
            "nearest_police_station_name": None,
            "nearest_police_station_phone": None,
            "nearest_police_station_address": None,
            "nearest_police_station_latitude": None,
            "nearest_police_station_longitude": None,
            "nearest_police_station_place_id": "",
            "police_distance_km": None,
            "police_source": "static_fallback",
            "nearby_police_stations": [],
            "maps_enrichment": {
                "address_source": "fallback",
                "police_source": "static_fallback",
                "google_maps_used": False,
                "fallback_used": True,
            },
            "status": "CANCELLED_FALSE_ALARM",
            "status_history": ["CANCELLED_FALSE_ALARM"],
            "police_delivery_status": "POLICE_CONTACT_NOT_AUTOMATED",
            "message_to_contacts": f"SafeHer: SOS cancelled by user ({reason}).",
            "police_message_preview": "No police contact is required for this cancelled event.",
            "ai_agent_analysis": self.ai_safety_agent.analyze(
                {
                    "status": "CANCELLED_FALSE_ALARM",
                    "user_name": (user or {}).get("full_name", "Unknown User"),
                    "user_phone": (user or {}).get("phone_number", ""),
                    "trusted_contacts": [],
                    "latitude": None,
                    "longitude": None,
                    "map_url": "Location unavailable",
                    "location_address": "Location address unavailable",
                    "nearest_police_station_name": None,
                    "nearest_police_station_phone": None,
                    "nearest_police_station_address": None,
                    "police_distance_km": None,
                    "police_source": "static_fallback",
                    "maps_enrichment": {
                        "address_source": "fallback",
                        "police_source": "static_fallback",
                        "google_maps_used": False,
                        "fallback_used": True,
                    },
                    "created_at": now.isoformat(),
                    "location_source": "fallback",
                }
            ),
            "created_at": now,
            "resolved_at": now,
            "demo_mode": True,
            "source": "manual_sos_false_alarm",
            "contact_delivery_status": "NOT_ATTEMPTED",
            "contact_delivery_results": [],
            "metadata": {"reason": reason},
        }
        try:
            result = await self.alerts.insert_one(alert)
        except DuplicateKeyError:
            existing = await self._find_idempotent_alert(user_id, payload.request_id)
            if existing:
                serialized = self._serialize(existing, user)
                serialized["idempotent_replay"] = True
                return serialized
            raise
        alert["_id"] = result.inserted_id
        serialized = self._serialize(alert, user)
        await realtime_manager.broadcast({"type": "alert.created", "payload": serialized})
        return serialized

    # ------------------------------
    # Legacy gesture flow (kept for compatibility)
    # ------------------------------
    async def create_alert(self, user_id: str, payload: AlertCreate, public_base_url: str | None = None) -> dict:
        existing = await self._find_idempotent_alert(user_id, payload.request_id)
        if existing:
            serialized = self._serialize(existing, await self._resolve_user(user_id))
            serialized["idempotent_replay"] = True
            return serialized

        settings = get_settings()
        contacts = await self.contacts.find({"user_id": user_id}).to_list(length=20)
        user = await self.users.find_one({"_id": ObjectId(user_id)})
        map_link = f"{settings.google_maps_base_url}{payload.location.latitude},{payload.location.longitude}"

        alert = {
            "user_id": user_id,
            "request_id": payload.request_id,
            "gesture_label": payload.gesture_label,
            "confidence": payload.confidence,
            "location": payload.location.model_dump(),
            "features": payload.features.model_dump(),
            "metadata": payload.metadata or {},
            "triggered_at": payload.triggered_at,
            "map_link": map_link,
            "status": "triggered",
            "delivery_channels": ["sms" for _ in contacts],
            "created_at": datetime.now(timezone.utc),
        }
        result = await self.alerts.insert_one(alert)
        alert["_id"] = result.inserted_id

        await self.locations.insert_one(
            {
                "user_id": user_id,
                "latitude": payload.location.latitude,
                "longitude": payload.location.longitude,
                "accuracy": payload.location.accuracy,
                "speed": None,
                "recorded_at": payload.triggered_at,
                "created_at": datetime.now(timezone.utc),
            }
        )

        serialized = self._serialize(alert, user)
        live_room = await SafetyService(self.db).create_live_room_for_alert(
            user_id,
            serialized,
            contacts,
            public_base_url=public_base_url,
        )
        delivery_results = await self.notification_service.dispatch_alert(
            contacts,
            {**alert, "map_link": map_link, "trusted_circle_room": live_room},
            {"full_name": user["full_name"]} if user else None,
        )
        await self.alerts.update_one(
            {"_id": result.inserted_id},
            {"$set": {"delivery_results": delivery_results}},
        )
        serialized = self._serialize({**alert, "delivery_results": delivery_results}, user)
        serialized["trusted_circle_room"] = live_room
        devices = await DeviceService(self.db).list_user_devices(user_id)
        push_results = await self.push_service.send_alert_notification(devices, serialized)
        await self.alerts.update_one(
            {"_id": result.inserted_id},
            {"$set": {"delivery_results": delivery_results, "push_results": push_results}},
        )
        serialized["push_results"] = push_results
        await realtime_manager.broadcast({"type": "alert.created", "payload": serialized})
        return serialized

    async def get_alert_history(self, user_id: str) -> list[dict]:
        alerts = await self.alerts.find({"user_id": user_id}).sort("created_at", -1).to_list(length=100)
        user = await self._resolve_user(user_id)
        return [self._serialize(alert, user) for alert in alerts]

    async def mark_alert_status(self, user_id: str, alert_id: str, status: str) -> dict:
        if status not in {"resolved", "cancelled"}:
            raise ValueError("Unsupported alert status.")
        if not ObjectId.is_valid(alert_id):
            raise ValueError("Alert not found.")
        existing = await self.alerts.find_one({"_id": ObjectId(alert_id), "user_id": user_id})
        if not existing:
            raise ValueError("Alert not found.")

        now = datetime.now(timezone.utc)
        await self.alerts.update_one(
            {"_id": ObjectId(alert_id)},
            {"$set": {"status": status, "resolved_at": now}},
        )
        existing["status"] = status
        existing["resolved_at"] = now
        serialized = self._serialize(existing)
        await realtime_manager.broadcast({"type": "alert.status_changed", "payload": serialized})
        return serialized

    async def attach_audio_evidence(self, user_id: str, alert_id: str, audio_file: UploadFile) -> dict:
        if not ObjectId.is_valid(alert_id):
            raise ValueError("Alert not found.")
        alert = await self.alerts.find_one({"_id": ObjectId(alert_id), "user_id": user_id})
        if not alert:
            raise ValueError("Alert not found.")

        allowed_content_types = {
            "audio/aac",
            "audio/mp4",
            "audio/m4a",
            "audio/mpeg",
            "audio/ogg",
            "audio/wav",
            "audio/x-m4a",
        }
        if audio_file.content_type not in allowed_content_types:
            raise ValueError("Unsupported audio evidence type.")

        suffix = Path(audio_file.filename or "alert-audio.m4a").suffix or ".m4a"
        safe_suffix = suffix if len(suffix) <= 10 else ".m4a"
        filename = f"{alert_id}-{int(datetime.now(timezone.utc).timestamp())}{safe_suffix}"
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        target = self.evidence_dir / filename
        max_bytes = get_settings().evidence_max_bytes
        content = await audio_file.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError("Audio evidence exceeds the configured size limit.")
        target.write_bytes(content)
        evidence_url = f"/api/alerts/{alert_id}/evidence-audio"

        await self.alerts.update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "audio_evidence": {
                        "filename": filename,
                        "content_type": audio_file.content_type,
                        "size_bytes": len(content),
                        "uploaded_at": datetime.now(timezone.utc),
                        "url": evidence_url,
                    }
                }
            },
        )
        return {"alert_id": alert_id, "audio_evidence_url": evidence_url}

    async def get_audio_evidence(
        self, user_id: str, alert_id: str, is_admin: bool = False
    ) -> tuple[Path, str] | None:
        if not ObjectId.is_valid(alert_id):
            return None
        query: dict[str, Any] = {"_id": ObjectId(alert_id)}
        if not is_admin:
            query["user_id"] = user_id
        alert = await self.alerts.find_one(query)
        evidence = alert.get("audio_evidence") if alert else None
        filename = str((evidence or {}).get("filename") or "")
        if not filename or Path(filename).name != filename:
            return None
        path = self.evidence_dir / filename
        if not path.is_file():
            return None
        return path, str((evidence or {}).get("content_type") or "audio/mp4")

    async def get_admin_summary(self) -> dict:
        alerts = await self.alerts.find({}).sort("created_at", -1).to_list(length=300)
        user_lookup = await self._build_user_lookup(alerts)
        serialized = [self._serialize(alert, user_lookup.get(alert.get("user_id"))) for alert in alerts]
        confidence_values = [item.get("confidence") for item in serialized if item.get("confidence") is not None]
        active_statuses = {
            "triggered",
            "SOS_CREATED",
            "CONTACTS_NOTIFIED",
            "CONTACT_NOTIFICATION_PARTIAL",
            "CONTACT_NOTIFICATION_FAILED",
            "PENDING_USER_CONFIRMATION",
        }
        return {
            "total_alerts": len(serialized),
            "active_alerts": len([alert for alert in serialized if alert.get("status") in active_statuses]),
            "avg_confidence": round(mean(confidence_values), 3) if confidence_values else 0.0,
            "recent_alerts": serialized[:50],
        }

    # ------------------------------
    # Helpers
    # ------------------------------
    async def _build_user_lookup(self, alerts: list[dict]) -> dict[str, dict]:
        user_ids = list({item.get("user_id") for item in alerts if item.get("user_id")})
        object_ids = [ObjectId(user_id) for user_id in user_ids if ObjectId.is_valid(str(user_id))]
        users = await self.users.find({"_id": {"$in": object_ids}}).to_list(length=500)
        return {str(user["_id"]): user for user in users}

    async def _resolve_user(self, user_id: str | None) -> dict | None:
        if not user_id:
            return None
        if not ObjectId.is_valid(str(user_id)):
            return None
        return await self.users.find_one({"_id": ObjectId(str(user_id))})

    async def _find_idempotent_alert(self, user_id: str, request_id: str | None) -> dict | None:
        if not request_id:
            return None
        return await self.alerts.find_one({"user_id": user_id, "request_id": request_id})

    @staticmethod
    def _alert_status_for_delivery(contact_delivery_status: str) -> str:
        return {
            "SENT": "CONTACTS_NOTIFIED",
            "PARTIALLY_SENT": "CONTACT_NOTIFICATION_PARTIAL",
            "FAILED": "CONTACT_NOTIFICATION_FAILED",
            "PENDING_USER_CONFIRMATION": "PENDING_USER_CONFIRMATION",
            "PREPARED": "SOS_CREATED",
            "NOT_ATTEMPTED": "SOS_CREATED",
        }.get(contact_delivery_status, "SOS_CREATED")

    @staticmethod
    def _contact_model_dump(contact: Any) -> dict:
        if hasattr(contact, "model_dump"):
            return contact.model_dump()
        if isinstance(contact, dict):
            return contact
        return {
            "name": getattr(contact, "name", ""),
            "phone_number": getattr(contact, "phone_number", ""),
            "relation": getattr(contact, "relation", ""),
        }

    @staticmethod
    def _build_contacts_message(
        user_name: str,
        user_phone: str,
        map_url: str,
        location_address: str,
    ) -> str:
        return (
            f"SAFEHER SOS ALERT: {user_name} may need help.\n"
            f"Phone: {user_phone}\n"
            f"Location: {map_url}\n"
            f"Address: {location_address}\n"
            "Please contact or assist immediately."
        )

    @staticmethod
    def _build_police_message(
        user_name: str,
        user_phone: str,
        map_url: str,
        location_address: str,
        nearest_station: dict | None,
        police_source: str,
    ) -> str:
        station_name = nearest_station.get("name") if nearest_station else "Not available"
        distance_km = nearest_station.get("distance_km") if nearest_station else "N/A"
        return (
            f"SAFEHER POLICE ALERT: {user_name} may need help.\n"
            f"Phone: {user_phone}\n"
            f"Location: {map_url}\n"
            f"Address: {location_address}\n"
            f"Nearest station selected: {station_name}\n"
            f"Distance: {distance_km} km\n"
            f"Source: {police_source}\n"
            "This is a demo-generated SafeHer alert."
        )

    @staticmethod
    def _serialize(alert: dict, user: dict | None = None) -> dict:
        base = {
            "id": str(alert["_id"]),
            "user_id": alert.get("user_id"),
            "user_name": alert.get("user_name") or (user.get("full_name") if user else None),
            "user_email": user.get("email") if user else None,
            "user_phone": alert.get("user_phone") or (user.get("phone_number") if user else None),
            "status": alert.get("status"),
            "created_at": alert.get("created_at"),
            "resolved_at": alert.get("resolved_at"),
            "metadata": alert.get("metadata"),
            "request_id": alert.get("request_id"),
            "status_history": alert.get("status_history", []),
        }
        if "gesture_label" in alert:
            base.update(
                {
                    "gesture_label": alert.get("gesture_label"),
                    "confidence": alert.get("confidence"),
                    "location": alert.get("location"),
                    "features": alert.get("features"),
                    "triggered_at": alert.get("triggered_at"),
                    "map_link": alert.get("map_link"),
                    "delivery_channels": alert.get("delivery_channels", []),
                    "delivery_results": alert.get("delivery_results", []),
                    "push_results": alert.get("push_results", []),
                    "audio_evidence": alert.get("audio_evidence"),
                }
            )

        if "trusted_contacts" in alert or "map_url" in alert:
            base.update(
                {
                    "trusted_contacts": alert.get("trusted_contacts", []),
                    "latitude": alert.get("latitude"),
                    "longitude": alert.get("longitude"),
                    "map_url": alert.get("map_url"),
                    "location_address": alert.get("location_address"),
                    "location_locality": alert.get("location_locality"),
                    "location_city": alert.get("location_city"),
                    "location_source": alert.get("location_source"),
                    "nearest_police_station_name": alert.get("nearest_police_station_name"),
                    "nearest_police_station_phone": alert.get("nearest_police_station_phone"),
                    "nearest_police_station_address": alert.get("nearest_police_station_address"),
                    "nearest_police_station_latitude": alert.get("nearest_police_station_latitude"),
                    "nearest_police_station_longitude": alert.get("nearest_police_station_longitude"),
                    "nearest_police_station_place_id": alert.get("nearest_police_station_place_id"),
                    "police_distance_km": alert.get("police_distance_km"),
                    "police_source": alert.get("police_source"),
                    "nearby_police_stations": alert.get("nearby_police_stations", []),
                    "maps_enrichment": alert.get("maps_enrichment", {}),
                    "message_to_contacts": alert.get("message_to_contacts"),
                    "police_delivery_status": alert.get(
                        "police_delivery_status", "POLICE_CONTACT_NOT_AUTOMATED"
                    ),
                    "police_message_preview": alert.get(
                        "police_message_preview", alert.get("message_to_police")
                    ),
                    "ai_agent_analysis": alert.get("ai_agent_analysis"),
                    "contact_delivery_status": alert.get("contact_delivery_status", "NOT_ATTEMPTED"),
                    "contact_delivery_results": alert.get("contact_delivery_results", []),
                    "contact_delivery_error": alert.get("contact_delivery_error", ""),
                    "demo_mode": alert.get("demo_mode", True),
                    "source": alert.get("source"),
                }
            )
        return base
