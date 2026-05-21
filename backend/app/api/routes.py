from datetime import datetime, timezone
from urllib.parse import urlparse

from bson import ObjectId
from jose import JWTError, jwt
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import ValidationError

from app.api.deps import get_current_admin, get_current_user
from app.core.config import get_settings
from app.db.database import get_database
from app.schemas.agent import AgentAnalyzeRequest
from app.schemas.alert import AlertCreate, ContactDeliveryMarkRequest, EmergencyAlertCreate
from app.schemas.auth import LoginRequest, SignupRequest, RefreshRequest, TokenResponse
from app.schemas.contact import EmergencyContactCreate
from app.schemas.demo import DemoAlertRequest
from app.schemas.device import DeviceTokenCreate
from app.schemas.federated import ModelUpdateCreate
from app.schemas.location import LocationUpdateCreate
from app.schemas.profile import SafetyProfileUpsert
from app.schemas.safety import (
    CheckInAckCreate,
    CheckInRequestCreate,
    LiveRoomAckCreate,
    LiveRoomNoteCreate,
    PublicLiveRoomNoteCreate,
)
from app.services.alert_service import AlertService
from app.services.ai_safety_agent import AISafetyAgent
from app.services.auth_service import AuthService
from app.services.contact_service import ContactService
from app.services.device_service import DeviceService
from app.services.federated_service import FederatedService
from app.services.location_service import LocationService
from app.services.google_maps_service import GoogleMapsService
from app.services.profile_service import ProfileService
from app.services.safety_service import SafetyService
from app.utils.rate_limit import client_key, rate_limiter
from app.utils.security import ALGORITHM, create_access_token, create_refresh_token

router = APIRouter()
settings = get_settings()


@router.get("")
@router.get("/")
async def api_index():
    return {
        "name": settings.app_name,
        "status": "ok",
        "message": "SafeHer backend API is running.",
        "health": "/api/health",
        "docs": "/docs",
        "admin": "http://192.168.0.101:5173",
        "expo": "exp://192.168.0.101:8081",
    }


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/system/status")
async def system_status(user=Depends(get_current_user)):
    sms_backend_configured = bool(
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_phone_number
    )
    return {
        "status": "ok",
        "sms_backend": "configured" if sms_backend_configured else "simulated",
        "sms_backend_configured": sms_backend_configured,
    }


@router.post("/auth/signup")
async def signup(payload: SignupRequest, request: Request, db=Depends(get_database)):
    rate_limiter.check(
        client_key(request, "auth:signup"),
        max_attempts=settings.auth_login_max_attempts,
        window_seconds=settings.auth_login_window_seconds,
    )
    return await AuthService(db).signup(payload)


@router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, db=Depends(get_database)):
    rate_limiter.check(
        client_key(request, "auth:login"),
        max_attempts=settings.auth_login_max_attempts,
        window_seconds=settings.auth_login_window_seconds,
    )
    return await AuthService(db).login(payload)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(payload: RefreshRequest, db=Depends(get_database)):
    try:
        decoded = jwt.decode(payload.refresh_token, settings.secret_key, algorithms=[ALGORITHM])
        if decoded.get("token_type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token.")
        user_id = decoded.get("sub")
    except JWTError as error:
        raise HTTPException(status_code=401, detail="Invalid refresh token.") from error

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=401, detail="Invalid refresh token.")
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    return TokenResponse(
        access_token=create_access_token(str(user["_id"])),
        refresh_token=create_refresh_token(str(user["_id"])),
        user={
            "id": str(user["_id"]),
            "full_name": user["full_name"],
            "email": user["email"],
            "phone_number": user["phone_number"],
            "is_admin": user.get("is_admin", False),
        },
    )


@router.get("/me")
async def get_profile(user=Depends(get_current_user)):
    return user


@router.get("/profile/me")
async def get_safety_profile(user=Depends(get_current_user), db=Depends(get_database)):
    return await ProfileService(db).get_profile(user["id"])


@router.post("/profile/me")
async def create_safety_profile(
    payload: SafetyProfileUpsert,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await ProfileService(db).upsert_profile(user["id"], payload)


@router.put("/profile/me")
async def update_safety_profile(
    payload: SafetyProfileUpsert,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await ProfileService(db).upsert_profile(user["id"], payload)


@router.get("/police/nearest")
async def get_nearest_police_station(lat: float, lng: float):
    return GoogleMapsService().get_best_police_station(lat, lng)


@router.get("/maps/reverse-geocode")
async def reverse_geocode(lat: float, lng: float):
    return GoogleMapsService().reverse_geocode(lat, lng)


@router.get("/maps/nearby-police")
async def nearby_police(lat: float, lng: float):
    best = GoogleMapsService().get_best_police_station(lat, lng)
    return {
        "stations": best.get("top_3", []),
        "source": best.get("source", "static_fallback"),
    }


@router.post("/agent/analyze-alert")
async def analyze_alert(
    payload: AgentAnalyzeRequest,
    user=Depends(get_current_user),
):
    _ = user
    return AISafetyAgent().analyze(payload.model_dump())


@router.post("/contacts")
async def add_contact(
    payload: EmergencyContactCreate,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await ContactService(db).add_contact(user["id"], payload)


@router.get("/contacts")
async def list_contacts(user=Depends(get_current_user), db=Depends(get_database)):
    return await ContactService(db).list_contacts(user["id"])


@router.delete("/contacts/{contact_id}")
async def remove_contact(contact_id: str, user=Depends(get_current_user), db=Depends(get_database)):
    try:
        return await ContactService(db).remove_contact(user["id"], contact_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/devices")
async def register_device(
    payload: DeviceTokenCreate,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await DeviceService(db).upsert_device_token(user["id"], payload)


@router.get("/devices")
async def list_devices(user=Depends(get_current_user), db=Depends(get_database)):
    return await DeviceService(db).list_user_devices(user["id"])


@router.post("/alerts")
async def create_alert(
    payload: dict,
    request: Request,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    rate_limiter.check(
        client_key(request, "alerts:create"),
        max_attempts=settings.alerts_create_max_attempts,
        window_seconds=settings.alerts_create_window_seconds,
    )
    request_base_url = str(request.base_url).rstrip("/")
    hostname = (urlparse(request_base_url).hostname or "").lower()
    # For demo tunnels such as *.loca.lt, force the configured public room URL.
    # This avoids anti-abuse interstitial pages when contacts open shared live-room links.
    if hostname in {"127.0.0.1", "localhost", "::1"} or hostname.endswith(".loca.lt"):
        public_base_url = settings.public_room_base_url.rstrip("/")
    else:
        public_base_url = request_base_url
    try:
        if "gesture_label" in payload:
            legacy_payload = AlertCreate.model_validate(payload)
            return await AlertService(db).create_alert(
                user["id"], legacy_payload, public_base_url=public_base_url
            )
        emergency_payload = EmergencyAlertCreate.model_validate(payload)
        return await AlertService(db).create_emergency_alert(user["id"], emergency_payload)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors()) from error


@router.get("/alerts")
async def list_alerts(user=Depends(get_current_user), db=Depends(get_database)):
    return await AlertService(db).list_alerts(user["id"], is_admin=user.get("is_admin", False))


@router.get("/alerts/history")
async def get_alert_history(user=Depends(get_current_user), db=Depends(get_database)):
    return await AlertService(db).get_alert_history(user["id"])


@router.get("/alerts/{alert_id}")
async def get_alert(alert_id: str, user=Depends(get_current_user), db=Depends(get_database)):
    alert = await AlertService(db).get_alert(
        user["id"], alert_id, is_admin=user.get("is_admin", False)
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return alert


@router.get("/alerts/{alert_id}/agent-analysis")
async def get_alert_agent_analysis(
    alert_id: str,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    analysis = await AlertService(db).get_agent_analysis(
        user["id"], alert_id, is_admin=user.get("is_admin", False)
    )
    if analysis is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return analysis


@router.get("/alerts/{alert_id}/contact-delivery")
async def get_alert_contact_delivery(
    alert_id: str,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    delivery = await AlertService(db).get_contact_delivery(
        user["id"], alert_id, is_admin=user.get("is_admin", False)
    )
    if delivery is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return delivery


@router.post("/alerts/{alert_id}/contact-delivery/mark-sent")
async def mark_alert_contact_delivery(
    alert_id: str,
    payload: ContactDeliveryMarkRequest,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    try:
        return await AlertService(db).mark_contact_delivery(
            user["id"],
            alert_id,
            [item.model_dump() for item in payload.results],
            is_admin=user.get("is_admin", False),
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.put("/alerts/{alert_id}/resolve")
async def resolve_alert_put(alert_id: str, user=Depends(get_current_user), db=Depends(get_database)):
    try:
        return await AlertService(db).resolve_alert(
            user["id"], alert_id, is_admin=user.get("is_admin", False)
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/alerts/cancel-false-alarm")
async def create_false_alarm_record(
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await AlertService(db).cancel_false_alarm(user["id"])


@router.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, user=Depends(get_current_user), db=Depends(get_database)):
    try:
        return await AlertService(db).mark_alert_status(user["id"], alert_id, "resolved")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.patch("/alerts/{alert_id}/cancel")
async def cancel_alert(alert_id: str, user=Depends(get_current_user), db=Depends(get_database)):
    try:
        return await AlertService(db).mark_alert_status(user["id"], alert_id, "cancelled")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/alerts/{alert_id}/evidence-audio")
async def upload_alert_audio(
    alert_id: str,
    audio_file: UploadFile = File(...),
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    try:
        return await AlertService(db).attach_audio_evidence(user["id"], alert_id, audio_file)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/locations")
async def post_location(
    payload: LocationUpdateCreate,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await LocationService(db).record_location(user["id"], payload)


@router.get("/locations/latest")
async def get_latest_location(user=Depends(get_current_user), db=Depends(get_database)):
    return await LocationService(db).latest_location(user["id"])


@router.get("/safety/live-room/latest")
async def get_latest_live_room(user=Depends(get_current_user), db=Depends(get_database)):
    return await SafetyService(db).get_latest_live_room(user["id"])


@router.get("/public/live-room/{access_token}")
async def get_public_live_room(access_token: str, db=Depends(get_database)):
    room = await SafetyService(db).get_public_live_room(access_token)
    if room is None:
        raise HTTPException(status_code=404, detail="Live room not found.")
    return room


@router.post("/public/live-room/{access_token}/ack")
async def acknowledge_public_live_room(
    access_token: str,
    payload: LiveRoomAckCreate,
    db=Depends(get_database),
):
    try:
        return await SafetyService(db).acknowledge_public_live_room(access_token, payload.contact_name)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/public/live-room/{access_token}/note")
async def add_public_live_room_note(
    access_token: str,
    payload: PublicLiveRoomNoteCreate,
    db=Depends(get_database),
):
    try:
        return await SafetyService(db).add_public_live_room_note(
            access_token, payload.contact_name, payload.message
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/safety/live-room/{room_id}/notes")
async def add_live_room_note(
    room_id: str,
    payload: LiveRoomNoteCreate,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    try:
        return await SafetyService(db).add_live_room_note(user["id"], room_id, payload.message)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/safety/check-ins/request")
async def request_check_in(
    payload: CheckInRequestCreate,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    return await SafetyService(db).request_check_in(
        user["id"], payload.reason, payload.due_in_seconds
    )


@router.get("/safety/check-ins/latest")
async def get_latest_check_in(user=Depends(get_current_user), db=Depends(get_database)):
    return await SafetyService(db).get_latest_check_in(user["id"])


@router.post("/safety/check-ins/{check_in_id}/ack")
async def acknowledge_check_in(
    check_in_id: str,
    payload: CheckInAckCreate,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    try:
        return await SafetyService(db).acknowledge_check_in(
            user["id"], check_in_id, payload.status, payload.note
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/admin/summary")
async def get_admin_summary(user=Depends(get_current_admin), db=Depends(get_database)):
    return await AlertService(db).get_admin_summary()


@router.post("/federated/updates")
async def submit_model_update(
    payload: ModelUpdateCreate,
    request: Request,
    user=Depends(get_current_user),
    db=Depends(get_database),
):
    rate_limiter.check(
        client_key(request, "federated:update"),
        max_attempts=settings.federated_update_max_attempts,
        window_seconds=settings.federated_update_window_seconds,
    )
    try:
        return await FederatedService(db).submit_update(payload, user["id"])
    except ValueError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


@router.post("/federated/aggregate/{round_id}")
async def aggregate_round(round_id: int, user=Depends(get_current_admin), db=Depends(get_database)):
    return await FederatedService(db).aggregate_round(round_id)


@router.get("/federated/model/latest")
async def get_latest_model(user=Depends(get_current_admin), db=Depends(get_database)):
    return await FederatedService(db).get_latest_model()


@router.get("/federated/model/latest/public")
async def get_latest_public_model(user=Depends(get_current_user), db=Depends(get_database)):
    return await FederatedService(db).get_latest_model()


@router.post("/federated/device-round")
async def simulate_device_round(user=Depends(get_current_user), db=Depends(get_database)):
    return await FederatedService(db).simulate_device_round(user["id"])


@router.post("/demo/trigger-alert")
async def trigger_demo_alert(
    payload: DemoAlertRequest,
    user=Depends(get_current_admin),
    db=Depends(get_database),
):
    demo_user = await db["users"].find_one({"email": "demo@safeher.app"})
    if not demo_user:
        return {"message": "Demo user not found. Run the seed script first."}

    contacts = await db["contacts"].find({"user_id": str(demo_user["_id"])}).to_list(length=20)
    trusted_contacts = [
        {
            "name": item.get("name", ""),
            "phone_number": item.get("phone_number", ""),
            "relation": item.get("relationship", ""),
        }
        for item in contacts
    ]
    if not trusted_contacts:
        trusted_contacts = [
            {
                "name": "Mother",
                "phone_number": "9876543211",
                "relation": "Parent",
            }
        ]

    alert = await AlertService(db).create_emergency_alert(
        str(demo_user["_id"]),
        EmergencyAlertCreate(
            user_name=demo_user.get("full_name", "Demo User"),
            user_phone=demo_user.get("phone_number", "9876543210"),
            trusted_contacts=trusted_contacts,
            latitude=payload.latitude,
            longitude=payload.longitude,
            map_url=f"https://www.google.com/maps?q={payload.latitude},{payload.longitude}",
        ),
    )
    return {"message": "Demo alert created.", "alert": alert}


@router.post("/demo/seed-model")
async def seed_demo_model(user=Depends(get_current_admin), db=Depends(get_database)):
    service = FederatedService(db)

    await service.submit_update(
        ModelUpdateCreate(
            user_id="demo-device-1",
            round_id=1,
            sample_count=24,
            metrics={"accuracy": 0.91, "loss": 0.22},
            weights=[0.11, 0.23, 0.38, 0.52],
            submitted_at=datetime.now(timezone.utc),
        )
    )
    await service.submit_update(
        ModelUpdateCreate(
            user_id="demo-device-2",
            round_id=1,
            sample_count=18,
            metrics={"accuracy": 0.88, "loss": 0.27},
            weights=[0.15, 0.20, 0.35, 0.57],
            submitted_at=datetime.now(timezone.utc),
        )
    )
    summary = await service.aggregate_round(1)
    return {"message": "Demo federated round seeded.", "model": summary}
