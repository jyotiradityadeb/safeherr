from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings


class ContactDeliveryService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def prepare_contact_messages(self, alert: dict[str, Any]) -> dict[str, Any]:
        trusted_contacts = alert.get("trusted_contacts") or []
        message_to_contacts = alert.get("message_to_contacts") or ""

        if not trusted_contacts:
            return {
                "contact_delivery_status": "FAILED",
                "contact_delivery_results": [],
                "contact_delivery_error": "No trusted contacts available",
            }

        results: list[dict[str, Any]] = []
        for contact in trusted_contacts:
            normalized = self._normalize_contact(contact)
            result = {
                **normalized,
                "status": "PREPARED",
                "error": "",
                "sent_at": None,
            }
            results.append(result)
            print(
                "SAFEHER DEMO PREPARED CONTACT MESSAGE",
                f"to={normalized['name']} ({normalized['phone_number']})",
                f"message={message_to_contacts}",
            )

        # Backend SMS gateway sending is intentionally disabled by default.
        # We keep demo-safe prepared mode and let the mobile app open SMS composer.
        _ = self.settings.sms_gateway_enabled

        return {
            "contact_delivery_status": "PREPARED",
            "contact_delivery_results": results,
            "contact_delivery_error": "",
        }

    @staticmethod
    def _normalize_contact(contact: Any) -> dict[str, str]:
        if hasattr(contact, "model_dump"):
            as_dict = contact.model_dump()
        elif isinstance(contact, dict):
            as_dict = contact
        else:
            as_dict = {
                "name": getattr(contact, "name", ""),
                "phone_number": getattr(contact, "phone_number", ""),
                "relation": getattr(contact, "relation", ""),
            }
        return {
            "name": str(as_dict.get("name") or "").strip(),
            "phone_number": str(as_dict.get("phone_number") or "").strip(),
            "relation": str(as_dict.get("relation") or "").strip(),
        }

    @staticmethod
    def aggregate_status(results: list[dict[str, Any]]) -> str:
        if not results:
            return "NOT_ATTEMPTED"

        statuses = [str(item.get("status") or "").upper() for item in results]

        if statuses and all(status == "SENT" for status in statuses):
            return "SENT"
        if "PENDING_USER_CONFIRMATION" in statuses:
            return "PENDING_USER_CONFIRMATION"
        if "SENT" in statuses and "FAILED" in statuses:
            return "PARTIALLY_SENT"
        if statuses and all(status == "FAILED" for status in statuses):
            return "FAILED"
        if "SENT" in statuses:
            return "PARTIALLY_SENT"
        if statuses and all(status == "PREPARED" for status in statuses):
            return "PREPARED"
        if statuses and all(status == "NOT_ATTEMPTED" for status in statuses):
            return "NOT_ATTEMPTED"
        return "PREPARED"

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
