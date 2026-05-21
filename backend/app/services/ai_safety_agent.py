from typing import Any


class AISafetyAgent:
    def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
        status = str(payload.get("status") or "").upper()
        is_cancelled_false_alarm = status == "CANCELLED_FALSE_ALARM"

        priority_score = 10 if is_cancelled_false_alarm else 40

        latitude = payload.get("latitude")
        longitude = payload.get("longitude")
        has_coordinates = latitude is not None and longitude is not None
        has_address = bool(
            payload.get("location_address")
            and payload.get("location_address") != "Location address unavailable"
        )
        trusted_contacts = payload.get("trusted_contacts") or []
        has_contacts = len(trusted_contacts) > 0
        nearest_station = payload.get("nearest_police_station_name")
        has_nearest_police = bool(nearest_station)
        police_source = payload.get("police_source", "")
        police_distance_km = payload.get("police_distance_km")

        if not is_cancelled_false_alarm:
            if has_coordinates:
                priority_score += 20
            if has_address:
                priority_score += 15
            if has_contacts:
                priority_score += 15
            if has_nearest_police:
                priority_score += 15
            if police_source == "google_maps":
                priority_score += 10
            if isinstance(police_distance_km, (int, float)) and police_distance_km > 5:
                priority_score += 10

        priority_score = min(priority_score, 100)

        if priority_score <= 39:
            risk_level = "LOW"
        elif priority_score <= 64:
            risk_level = "MEDIUM"
        elif priority_score <= 84:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"

        maps_context_used = police_source == "google_maps" or payload.get("location_source") == "google_maps"
        if is_cancelled_false_alarm:
            reasoning = (
                "This alert was marked as CANCELLED_FALSE_ALARM during the countdown, "
                "so no emergency escalation should be treated as active."
            )
        elif maps_context_used and has_coordinates and has_contacts:
            reasoning = (
                "The SOS alert includes GPS coordinates, a readable address from Google Maps, "
                "trusted contacts, and a nearby police station identified through Google Maps. "
                "Since the countdown was not cancelled, this should be treated as high priority."
            )
        else:
            detail_bits: list[str] = []
            detail_bits.append("The SOS alert was not cancelled.")
            detail_bits.append(
                "GPS coordinates were captured." if has_coordinates else "GPS coordinates were unavailable."
            )
            detail_bits.append(
                "Trusted contacts were included." if has_contacts else "Trusted contacts were unavailable in the payload."
            )
            detail_bits.append(
                "Google Maps enrichment was used."
                if maps_context_used
                else "Google Maps enrichment was unavailable; static fallback data was used."
            )
            reasoning = " ".join(detail_bits)

        if is_cancelled_false_alarm:
            recommended_actions = [
                "Verify this was an intentional cancellation.",
                "Keep a brief log for audit purposes.",
                "No police/contact escalation is required for this cancelled event.",
            ]
            next_steps_for_user = [
                "If still unsafe, trigger SOS again immediately.",
                "Review trusted contacts and location permissions.",
            ]
            next_steps_for_admin = [
                "Confirm user safety quickly.",
                "Mark as resolved if cancellation was valid.",
            ]
        else:
            recommended_actions = [
                "Contact the user immediately.",
                "Open the map link and verify the location.",
                "Contact trusted contacts.",
                "Contact nearest police station in demo mode.",
                "Keep alert active until safety is verified.",
                "Mark as resolved only after confirmation.",
            ]
            next_steps_for_user = [
                "Stay in a visible/safe area if possible.",
                "Keep phone reachable.",
                "Call trusted contact if safe.",
                "Do not share additional sensitive details unless necessary.",
            ]
            next_steps_for_admin = [
                "Call the user.",
                "Verify Google Maps link.",
                "Contact trusted contacts.",
                "Check nearest police station details.",
                "Keep alert active until confirmed safe.",
            ]

        user_name = payload.get("user_name", "User")
        location_address = payload.get("location_address") or "Address unavailable"
        station_name = payload.get("nearest_police_station_name") or "No station available"
        if is_cancelled_false_alarm:
            alert_summary = f"False alarm cancellation for {user_name}. No active SOS escalation."
        else:
            alert_summary = (
                f"SOS for {user_name}. Address: {location_address}. "
                f"Nearest police: {station_name}. Risk level {risk_level}."
            )

        return {
            "risk_level": risk_level,
            "priority_score": priority_score,
            "reasoning": reasoning,
            "recommended_actions": recommended_actions,
            "next_steps_for_user": next_steps_for_user,
            "next_steps_for_admin": next_steps_for_admin,
            "alert_summary": alert_summary,
            "maps_context_used": maps_context_used,
        }
