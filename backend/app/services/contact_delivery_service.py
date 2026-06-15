from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings

try:
    from twilio.rest import Client
except Exception:
    Client = None


class ContactDeliveryService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.enabled = bool(
            self.settings.sms_gateway_enabled
            and self.settings.twilio_account_sid
            and self.settings.twilio_auth_token
            and self.settings.twilio_phone_number
            and Client is not None
        )
        self.client = (
            Client(self.settings.twilio_account_sid, self.settings.twilio_auth_token)
            if self.enabled
            else None
        )

    async def deliver_contact_messages(self, alert: dict[str, Any]) -> dict[str, Any]:
        contacts = self.normalize_contacts(alert.get("trusted_contacts") or [])
        message = str(alert.get("message_to_contacts") or "").strip()

        if not contacts:
            return {
                "contact_delivery_status": "FAILED",
                "contact_delivery_results": [],
                "contact_delivery_error": "No valid trusted contact phone numbers are available.",
            }

        if not self.enabled or not self.client:
            return {
                "contact_delivery_status": "PREPARED",
                "contact_delivery_results": [
                    {
                        **contact,
                        "status": "PREPARED",
                        "error": "",
                        "sent_at": None,
                    }
                    for contact in contacts
                ],
                "contact_delivery_error": (
                    "Automatic SMS is unavailable. Open the device SMS composer and press Send."
                ),
            }

        results = []
        for contact in contacts:
            try:
                provider_id = await asyncio.wait_for(
                    asyncio.to_thread(self._send_sms, contact["phone_number"], message),
                    timeout=max(self.settings.sms_send_timeout_seconds, 1),
                )
                results.append(
                    {
                        **contact,
                        "status": "SENT",
                        "error": "",
                        "sent_at": self.now_iso(),
                        "provider_id": provider_id,
                    }
                )
            except TimeoutError:
                results.append(
                    {
                        **contact,
                        "status": "FAILED",
                        "error": "SMS provider request timed out.",
                        "sent_at": None,
                    }
                )
            except Exception:
                results.append(
                    {
                        **contact,
                        "status": "FAILED",
                        "error": "SMS provider rejected the delivery request.",
                        "sent_at": None,
                    }
                )

        return {
            "contact_delivery_status": self.aggregate_status(results),
            "contact_delivery_results": results,
            "contact_delivery_error": "",
        }

    def _send_sms(self, phone_number: str, message: str) -> str:
        result = self.client.messages.create(
            body=message,
            from_=self.settings.twilio_phone_number,
            to=phone_number,
        )
        return str(result.sid)

    def normalize_contacts(self, contacts: list[Any]) -> list[dict[str, str]]:
        results = []
        seen_numbers = set()
        for contact in contacts:
            normalized = self._normalize_contact(contact)
            phone_number = self.normalize_phone_number(normalized["phone_number"])
            if not phone_number or phone_number in seen_numbers:
                continue
            seen_numbers.add(phone_number)
            results.append({**normalized, "phone_number": phone_number})
        return results

    @staticmethod
    def normalize_phone_number(phone_number: str) -> str | None:
        raw = str(phone_number or "").strip()
        if not raw:
            return None
        has_plus = raw.startswith("+")
        digits = re.sub(r"\D", "", raw)

        if len(digits) == 10 and digits[0] in "6789":
            return f"+91{digits}"
        if len(digits) == 11 and digits.startswith("0") and digits[1] in "6789":
            return f"+91{digits[1:]}"
        if len(digits) == 12 and digits.startswith("91") and digits[2] in "6789":
            return f"+{digits}"
        if has_plus and 8 <= len(digits) <= 15:
            return f"+{digits}"
        return None

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
            "relation": str(as_dict.get("relation") or as_dict.get("relationship") or "").strip(),
        }

    @staticmethod
    def aggregate_status(results: list[dict[str, Any]]) -> str:
        if not results:
            return "NOT_ATTEMPTED"

        statuses = [str(item.get("status") or "").upper() for item in results]
        if all(status == "SENT" for status in statuses):
            return "SENT"
        if "PENDING_USER_CONFIRMATION" in statuses:
            return "PENDING_USER_CONFIRMATION"
        if "SENT" in statuses and "FAILED" in statuses:
            return "PARTIALLY_SENT"
        if all(status == "FAILED" for status in statuses):
            return "FAILED"
        if "SENT" in statuses:
            return "PARTIALLY_SENT"
        if all(status == "PREPARED" for status in statuses):
            return "PREPARED"
        if all(status == "NOT_ATTEMPTED" for status in statuses):
            return "NOT_ATTEMPTED"
        return "PREPARED"

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
