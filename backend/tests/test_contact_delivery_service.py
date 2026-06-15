from types import SimpleNamespace

import pytest

from app.services.contact_delivery_service import ContactDeliveryService


def test_normalizes_indian_numbers_and_rejects_invalid_values():
    assert ContactDeliveryService.normalize_phone_number("98765 43210") == "+919876543210"
    assert ContactDeliveryService.normalize_phone_number("09876543210") == "+919876543210"
    assert ContactDeliveryService.normalize_phone_number("91-98765-43210") == "+919876543210"
    assert ContactDeliveryService.normalize_phone_number("12345") is None


@pytest.mark.asyncio
async def test_missing_sms_configuration_returns_prepared_and_deduplicates_contacts():
    service = ContactDeliveryService()
    service.enabled = False
    service.client = None

    result = await service.deliver_contact_messages(
        {
            "trusted_contacts": [
                {"name": "Mother", "phone_number": "9876543210", "relation": "Parent"},
                {"name": "Duplicate", "phone_number": "+919876543210", "relation": "Parent"},
                {"name": "Invalid", "phone_number": "12", "relation": "Friend"},
            ],
            "message_to_contacts": "Test alert",
        }
    )

    assert result["contact_delivery_status"] == "PREPARED"
    assert len(result["contact_delivery_results"]) == 1
    assert result["contact_delivery_results"][0]["phone_number"] == "+919876543210"


@pytest.mark.asyncio
async def test_provider_success_and_failure_produce_partial_status(monkeypatch):
    service = ContactDeliveryService()
    service.enabled = True
    service.client = SimpleNamespace()

    def fake_send(phone_number, message):
        if phone_number.endswith("3210"):
            return "SM-success"
        raise RuntimeError("provider failed")

    monkeypatch.setattr(service, "_send_sms", fake_send)
    result = await service.deliver_contact_messages(
        {
            "trusted_contacts": [
                {"name": "Mother", "phone_number": "9876543210", "relation": "Parent"},
                {"name": "Friend", "phone_number": "9123456789", "relation": "Friend"},
            ],
            "message_to_contacts": "Test alert",
        }
    )

    assert result["contact_delivery_status"] == "PARTIALLY_SENT"
    assert [item["status"] for item in result["contact_delivery_results"]] == ["SENT", "FAILED"]
