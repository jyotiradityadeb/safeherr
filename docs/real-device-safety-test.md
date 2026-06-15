# Real Device Safety Flow Test

## Goal
Validate real user flow:
`manual SOS -> cancel window -> send now -> SMS app/provider -> result -> done`.

## Preconditions
- Android device with SIM and SMS app.
- Logged in user with at least one trusted contact.
- Background location tracking enabled in Gesture Setup.
- Network enabled.

## Test Steps
1. Open SafeHer and go to Home.
2. Tap `Send SOS`.
3. Confirm the countdown shows both `Send Now` and `Cancel`.
4. Tap `Send Now`.
5. Verify SMS draft opens and includes map link.
6. Tap map link and verify Google Maps opens at correct coordinates.
7. Verify the result is scrollable and shows individual contact states.
8. Verify police is labelled as a suggestion and `POLICE_CONTACT_NOT_AUTOMATED`.
9. Tap `Done` and verify the result closes.
10. Repeat with timer completion and verify only one alert exists.

## Friction Notes (fill after run)
- Permission prompts sequence:
- SMS app handoff latency:
- Map link open latency:
- Time to detect gesture:
- Overlay readability under stress:
- Smart check-in clarity:
- Any missed escalations while minimized:
- Duplicate alert count:
- Result usability on small screen:

## Known Risks To Watch
- If battery optimization is aggressive, background location callbacks may be delayed.
- If SMS app is unavailable or blocked, alert is still created but draft opening can fail.
