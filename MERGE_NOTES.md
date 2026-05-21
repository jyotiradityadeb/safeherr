# MERGE_NOTES

## Base and Source
- Base project: `safeher-master basefile.zip`
- Source of candidate changes: `safeher-master.zip`
- Merge policy: keep the base backend, admin, API contracts, alert flow, login flow, and existing mobile behavior; merge only safe, compatible improvements.

## Comparison Summary
- Filtered base files scanned: 180
- Filtered new-edit files scanned: 189
- Files only in base: none
- Files only in new edit: 9
- Changed common files: 12
- Ignored generated/runtime folders: `node_modules`, `.venv`, `__pycache__`, `.pytest_cache`, `.expo`, `build`, `dist`, `.gradle`, Android build outputs, logs, and cache files.

## File/Area Decision Table
| File/Area | Decision | Reason |
|---|---|---|
| `backend/*` | KEEP_BASE | No useful backend diff from new edit; preserving working routes, schemas, auth, alert, location, live room, admin, and federated contracts. |
| `backend/app/services/federated_service.py` | MERGE | Preserved base federated flow and hardened latest-model JSON serialization so admin refresh does not 500. |
| `backend/app/db/database.py` | MERGE | Preserved in-memory prototype DB and seeded demo SMS contacts so demo alerts have recipients. |
| `backend/scripts/seed_demo.py` | MERGE | Preserved demo user seeding and made contact seeding idempotent with SMS contacts. |
| `admin/src/pages/Dashboard.tsx` | MERGE | Preserved dashboard data flow and made model/summary loading independent so one failing widget does not blank the page. |
| `admin/src/theme/styles.css` | MERGE | Added cleaner dashboard visual hierarchy, proper button states, banners, cards, and alert status styling. |
| `mobile/App.tsx` | MERGE | Kept base bootstrap effects and added safe theme/navigation wrapper from new edit. |
| `mobile/src/theme/colors.ts` | KEEP_NEW | Adds typed light/dark theme palettes while preserving the existing `colors` export. |
| `mobile/src/theme/ThemeContext.tsx` | KEEP_NEW | Adds persisted system/light/dark theme preference support. |
| `mobile/src/theme/useTheme.ts` | KEEP_NEW | Small hook used by themed mobile screens. |
| `mobile/src/navigation/AppNavigator.tsx` | KEEP_NEW | Theme-aware navigator with unchanged auth-based routing. |
| `mobile/src/screens/*.tsx` | KEEP_NEW | Screen updates are theme/UI focused and preserve existing API calls and workflows. |
| `mobile/src/screens/HomeScreen.tsx` | MERGE | Added SMS draft retry/status UI and clearer emergency/safe/help button hierarchy while preserving alert logic. |
| `mobile/src/screens/home/styles.ts` | MERGE | Adds themed style factory, stronger mobile button styling, and keeps a dark-theme `styles` fallback export. |
| `mobile/src/services/alertService.ts` | MERGE | Alert flow still creates backend alerts, but SMS draft opening now remains available even when contacts are missing. |
| `mobile/package.json` | KEEP_NEW | Adds missing `expo-sensors` dependency required by the existing shake SOS service. |
| `mobile/package-lock.json` | KEEP_NEW | Lockfile matches the merged mobile dependency manifest and improves reproducible installs. |
| `mobile/metro.config.js` | KEEP_NEW | Standard Expo Metro config required by normal Expo tooling. |
| `ml/data/women_safety_dataset_v2.csv` | KEEP_NEW | Additive context-safety dataset; does not replace the base gesture dataset. |
| `ml/scripts/train_safety_context_model.py` | KEEP_NEW | Additive training pipeline, internally consistent with the new dataset. |
| `ml/scripts/safety_context_inference.py` | KEEP_NEW | Additive inference script matching the new saved model. |
| `ml/models/safety_context_model.joblib` | KEEP_NEW | Retrained after dependency pin fix so the artifact matches the runnable ML stack. |
| `ml/models/safety_context_metrics.json` | KEEP_NEW | Regenerated with the retrained context model. |
| Generated folders in new edit | REJECT_NEW | Runtime artifacts are not source and were not copied. |
| `README.md` | MERGE | Added Python runtime note and replaced hardcoded machine-local links with relative links. |
| `run-native-prototype.ps1` | MERGE | Replaced hardcoded local Android/JBR paths with PATH and environment discovery. |
| `ml/requirements.txt` | MERGE | Fixed incompatible pins for Python 3.9 verification and TensorFlow compatibility; added `pytest`. |

## What Was Kept from Base
- FastAPI app entry point, router registration, auth/login/refresh flow, user profile route.
- Contacts, devices, locations, alerts/SOS, trusted-circle live room, public live room, smart check-in, demo routes, and federated learning routes.
- Admin dashboard login, alert summary, demo trigger, seed-model flow, and WebSocket/API client behavior.
- Existing mobile auth context, emergency alert flow, location fallback, SMS draft fallback, smart check-in, fake call, shake SOS, background location, gesture inference, and TFLite fallback behavior.
- Existing gesture dataset, gesture demo model assets, and federated simulation flow.

## What Was Merged from New Edit
- Mobile light/dark/system theme architecture.
- Theme-aware mobile navigation and screen styles.
- Missing `expo-sensors` dependency and mobile lockfile.
- Standard Expo `metro.config.js`.
- Additive safety-context ML dataset, training script, inference script, model, and metrics.
- Admin dashboard UI polish, clearer action buttons, independent model error handling, and model JSON serialization fix.
- Mobile home-screen polish, clearer emergency/safe/help button hierarchy, alert delivery status, and SMS draft retry.
- Prototype demo contacts so local alerts show SMS recipients and delivery status.

## What Was Rejected from New Edit
- `node_modules`, `.expo`, `.pytest_cache`, `__pycache__`, and other generated runtime/cache artifacts.
- No backend/admin replacements were applied because new edit did not provide safer behavior there.

## Manual Conflict Resolutions
- `backend/app/services/federated_service.py`: kept base aggregation logic and added JSON-safe serialization for `_id`/datetime values.
- `backend/app/db/database.py` and `backend/scripts/seed_demo.py`: kept demo users and added idempotent SMS contacts.
- `admin/src/pages/Dashboard.tsx`: kept dashboard routes and split summary/model loading to avoid a full-page 500 state.
- `mobile/src/screens/HomeScreen.tsx`: kept existing alert/check-in/fake-call flows and added delivery UI without changing API contracts.
- `mobile/App.tsx`: combined base bootstrap effects with new theme-aware navigation.
- `run-native-prototype.ps1`: removed hardcoded machine paths and added discovery through `PATH`, `ANDROID_SDK_ROOT`, `ANDROID_HOME`, and optional `JAVA_HOME`.
- `README.md`: removed hardcoded Windows absolute links and documented Python 3.10+ for backend.
- `ml/requirements.txt`: changed `numpy==2.3.1` to `numpy==1.26.4`, changed `scikit-learn==1.7.0` to `scikit-learn==1.6.1`, and added `pytest==8.4.1`.

## Dependency Changes
- Mobile: added `expo-sensors`; added `package-lock.json`.
- ML: adjusted NumPy/scikit-learn pins for local compatibility and TensorFlow compatibility; added pytest.
- Backend/admin: no dependency changes.

## Environment Variables Needed
- Backend: copy `backend/.env.example` to `backend/.env`; set a real `SECRET_KEY` for non-demo use.
- Mobile: copy `mobile/.env.example` to `mobile/.env`; set `EXPO_PUBLIC_API_BASE_URL` when testing on a physical device or tunnel.
- Admin: copy `admin/.env.example` to `admin/.env`; set `VITE_API_BASE_URL` and `VITE_WS_URL` if not using the local Vite proxy.
- Optional backend production/demo variables: Twilio credentials, Firebase credentials path, `PUBLIC_ROOM_BASE_URL`, `PROTOTYPE_MEMORY_DB`, `ALLOW_MEMORY_DB_FALLBACK`.

## Commands to Run

### Backend
Requires Python 3.10 or newer.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

For a no-Mongo prototype run:

```bash
export APP_ENV="development"
export PROTOTYPE_MEMORY_DB="true"
export SECRET_KEY="change-me-for-demo-only"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Admin
```bash
cd admin
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

### Mobile
```bash
cd mobile
npm install
npx expo start --host lan --port 8081
```

### ML
```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/train_safety_context_model.py
python scripts/safety_context_inference.py
```

## Validation Results
- Backend: import passed with Python 3.12; `pytest tests -q` passed (`16 passed`); FastAPI started with `PROTOTYPE_MEMORY_DB=true`; `/api/health`, demo login, and `/api/alerts` passed.
- Admin: `npm test -- --run` passed (`2 passed`); `npm run build` passed; browser verification passed for login, seed model, trigger alert, and dashboard refresh without the previous 500 banner.
- Mobile: `npx tsc --noEmit` passed; `npm test` passed (`13 passed`); Expo packager is running on port `8081`.
- ML: `pytest tests -q` passed (`2 passed`); `train_safety_context_model.py` retrained model; `safety_context_inference.py` returned a prediction.

## Known Limitations
- Backend source uses Python 3.10+ type syntax; macOS system Python 3.9 will fail on import.
- The new safety-context ML model is additive and not wired into backend/mobile alert decisions.
- Safety-context model accuracy is low on the tiny synthetic dataset (`0.2667`), so it is demo-only.
- Mobile gesture detection currently uses the rule-based local inference in `mobile/src/services/mlService.ts`; the generated JSON gesture demo model is available in `mobile/assets/models`, but is not yet wired into runtime inference.
- Expo Go cannot silently send SMS. The app opens an SMS draft and the user must tap Send, unless a real backend SMS provider such as Twilio is configured.
- Mobile `npm audit` reports 4 moderate findings; they were not auto-fixed to avoid breaking dependency changes.
- `docker-compose.yml` still uses demo defaults such as `SECRET_KEY=change-me`; replace them before any real deployment.
