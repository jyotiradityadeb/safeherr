# SafeHer Manual SOS and Safety Monitoring Prototype

This monorepo contains a mobile-first safety platform with a verified manual SOS workflow, trusted-contact notification, location capture, admin monitoring, and privacy-preserving ML prototypes.

The current emergency path is **manual SOS**. Gesture classification, TensorFlow Lite export, and federated learning are experimental/demo features and do not automatically trigger the production-facing SOS screen.

## Project Structure

- `mobile/` React Native Expo app for Android-first manual SOS workflows
- `backend/` FastAPI backend for auth, contacts, alerts, admin, and FL aggregation
- `admin/` React dashboard for live monitoring and model metrics
- `ml/` training, feature extraction, TFLite export hooks, and federated simulation
- `docs/` architecture notes and API references

## Current SOS Flow

1. The authenticated user presses `Send SOS`.
2. A 25-second countdown displays `Send Now` and `Cancel`.
3. `Cancel` closes the countdown without creating an alert.
4. `Send Now` or timer completion submits one request with a reusable request ID.
5. The backend stores the SOS before attempting provider delivery.
6. If Twilio is enabled and confirms the requests, contact delivery is reported as `SENT`.
7. Otherwise, the phone SMS composer opens with recipients and message filled in; the user must press Send.
8. Police information is a nearest-station suggestion only. No police API delivery is implemented.

## Architecture Diagram

```text
+-------------------+          HTTPS / WebSocket          +----------------------+
| React Native App  |  --------------------------------> | FastAPI Backend      |
| - Auth            |                                     | - JWT Auth           |
| - Manual SOS      | <--------------------------------  | - Contacts API       |
| - SMS fallback    |     alert + delivery status        | - Alerts API         |
| - GPS + Alerts    |                                     | - FL Aggregation     |
+---------+---------+                                     | - Admin Metrics      |
          |                                               +----------+-----------+
          | local samples / local training                           |
          v                                                          |
+-------------------+                                                |
| On-device ML      |                                                |
| - feature extract |                                                |
| - TFLite model    |                                                |
| - local fine-tune |                                                |
+---------+---------+                                                |
          | model deltas only                                        |
          +----------------------------------------------------------+
                                                                     |
                                                                     v
                                                        +----------------------+
                                                        | MongoDB              |
                                                        | - users              |
                                                        | - contacts           |
                                                        | - alerts             |
                                                        | - model_updates      |
                                                        +----------------------+
                                                                     |
                                                                     v
                                                        +----------------------+
                                                        | Admin Dashboard      |
                                                        | - live alerts        |
                                                        | - user activity      |
                                                        | - FL metrics         |
                                                        +----------------------+
```

## Quick Start

### Backend

Requires Python 3.10 or newer.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

### Mobile

```bash
cd mobile
npm install
copy .env.example .env
npx expo start --host lan
```

Open the displayed QR code with Expo Go while the phone and development
computer are on the same network. Set `EXPO_PUBLIC_API_BASE_URL` to the
computer's reachable LAN address, not `127.0.0.1`.

### Admin

```bash
cd admin
npm install
copy .env.example .env
npm run dev
```

### ML

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scripts\prepare_dataset.py
python scripts\train_model.py
python scripts\federated_simulation.py
python scripts\train_tflite_model.py
python scripts\publish_mobile_model.py
```

### Docker Local Stack

```powershell
$env:SECRET_KEY="replace-with-a-random-32-character-secret"
docker compose up --build
```

This starts MongoDB, the FastAPI backend on `http://localhost:8000`, and the admin dashboard on `http://localhost:5173`.
It also runs a one-shot seed container that creates the demo user, contacts, and admin account.

## Safety and Reliability Additions

- Optional Twilio SMS delivery with explicit enablement and provider-confirmed states
- Device SMS-composer fallback with `PENDING_USER_CONFIRMATION`
- Request-ID idempotency and a unique database index to prevent duplicate SOS delivery
- Admin-authenticated WebSocket alert stream at `/ws/alerts`
- Secure mobile token persistence with Expo Secure Store
- Dockerized backend, MongoDB, and admin dashboard
- Push token registration and Firebase-ready notification hooks
- Background location tracking hooks for Android
- Experimental TFLite adapter with a rules fallback; automatic gesture SOS remains disabled
- Role-based admin access for dashboard and aggregation endpoints
- Authenticated, size-limited audio evidence access

## Required Backend Configuration

Copy `backend/.env.example` to `backend/.env`.

Required for non-demo use:

```env
APP_ENV=production
SECRET_KEY=use-a-random-secret-of-at-least-32-characters
MONGODB_URL=mongodb://...
PUBLIC_ROOM_BASE_URL=https://your-api.example.com
```

Optional automatic Twilio SMS:

```env
SMS_GATEWAY_ENABLED=true
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
SMS_SEND_TIMEOUT_SECONDS=10
```

If any required Twilio setting is missing or `SMS_GATEWAY_ENABLED=false`, SafeHer returns `PREPARED` and opens the device SMS composer. It does not claim that the SMS was sent.

## Experimental Mobile Model Flow

1. Generate features with `python scripts\prepare_dataset.py`
2. Train/export a TensorFlow Lite model with `python scripts\train_tflite_model.py`
3. Copy the exported model into the app with `python scripts\publish_mobile_model.py`
4. Set `EXPO_PUBLIC_USE_TFLITE=true` in `mobile/.env`
5. Build the mobile app with native module support

This experimental TFLite path is not available in Expo Go. Keep
`EXPO_PUBLIC_USE_TFLITE=false` for the verified Expo Go manual SOS workflow.

## Testing

### Backend

```bash
cd backend
pip install -r requirements.txt
pytest tests
```

This includes both service-layer tests and FastAPI route tests with dependency overrides.

### ML

```bash
cd ml
pip install pytest pandas numpy
pytest tests
```

### Admin

```bash
cd admin
npm install
npm test
```

Local admin credentials:

- `admin@safeher.app`
- `admin123`

### Mobile

```bash
cd mobile
npm install
npm test
```

## Status Semantics

- `SOS_CREATED`: alert stored; automatic contact delivery is not confirmed.
- `CONTACTS_NOTIFIED`: all valid provider requests were confirmed.
- `CONTACT_NOTIFICATION_PARTIAL`: some provider requests succeeded and some failed.
- `CONTACT_NOTIFICATION_FAILED`: all provider requests failed.
- `PENDING_USER_CONFIRMATION`: the device SMS composer was opened but sending is not confirmed.
- `POLICE_CONTACT_NOT_AUTOMATED`: police information is advisory and no police delivery occurred.

## Security Notes

- Production startup rejects the default secret and non-HTTPS public-room URL.
- Audio evidence requires authenticated owner or administrator access.
- WebSocket monitoring requires an administrator access token.
- Replace all demo accounts and credentials before deployment.
- The Docker stack requires `SECRET_KEY` to be supplied externally.

## Prototype Demo

Use [`docs/prototype-demo.md`](docs/prototype-demo.md) for the fastest college-presentation flow.
Use [`docs/presentation-script.md`](docs/presentation-script.md) and [`docs/presentation-slides.md`](docs/presentation-slides.md) for your viva/demo presentation.
