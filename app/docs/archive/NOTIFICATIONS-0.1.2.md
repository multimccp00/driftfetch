# Current 0.1.2 capture notifications

Newly copied links now produce a quiet Windows tray notification. Batches show one count; already-added links explain that they are in Downloads or History and mention Download again. Clicking a notification raises Current. Settings → General → Link notifications defaults to on, including for existing users, and can be disabled independently of capture and automatic downloading. No titles or URLs appear in notification text. Existing startup and unchanged-clipboard suppression remain in place.

## Validation

- Production build and all 38 automated tests passed.
- All 14 real-engine desktop smoke checks passed, including notification batches, unchanged-clipboard suppression, duplicate feedback, click-to-open, independent notification/capture switches, and persistence after restart. See `smoke-report-0.1.2.json`.
- Notification integration tests substitute clipboard reads only inside the isolated test app and intercept tray notifications. They do not change the user's clipboard.
- A separate packaged 0.1.2 check called the real Windows tray notification API, verified the default setting and Settings toggle, and completed with PATH limited to Windows system directories. See `notifications-packaged-report-0.1.2.json`. This verifies the native request, not whether Windows displayed or suppressed the popup.
- The Settings layout was inspected in the packaged app.
- Windows x64 unsigned installer built successfully: `release/0.1.2/Current-Setup-0.1.2-x64.exe`, 185,953,654 bytes.
- SHA-256: `c8c64d7b458d4fef3fb86383d000622211a4d204c3c308be91000df5548e032b`.

Windows notification preferences can suppress display. Notifications indicate link intake, not successful extraction or download. The installer was built without installing over the user's running application; earlier installer validation is documented separately.
