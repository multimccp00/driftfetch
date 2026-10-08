# Current 0.2.0

## Changes

- Replaced Windows tray notifications with an isolated, frameless Current popup. It appears without taking keyboard focus when clipboard links arrive in the background, tracks checking/results/duplicates, opens Recent captures, and can be dismissed. After checking, it stays for 15 seconds; hovering pauses dismissal. It displays up to 20 recent captures.
- Added Recent captures with the latest 100 clipboard and manual events, persisted in SQLite. Capture records contain source hostnames and job references. They never retain private clipboard prose or another copy of URL tokens. Clear log keeps downloads and files.
- Added per-download format selection before a transfer starts. Choices show the available measurements, unknown resolutions, and separate-audio requirements. Explicit choices override the global quality cap. Partial downloads keep their selected format. The engine's actual format ID is recorded separately from measured output resolution.
- Added state explanations and copyable diagnostic reports. Reports retain versions, failure category/stage, session type, and transfer facts; URLs, file paths, titles, source identifiers, cookies, and raw stderr are omitted.
- Added a permanent desktop shortcut, runtime version display, newer-version handoff, and a local installer update action. Updates require a companion SHA-256 file; workers save and stop before the installer opens. The checksum checks local file integrity, not publisher authenticity. No online update feed is configured.
- No Test session feature was added.

## Upgrade behavior

Pre-0.2.0 versions must be quit once before opening this build because they do not implement the handoff protocol. From this version onward, opening a newer build asks the old process to quit normally and waits for the application lock. Same-version launches focus the existing window. Packaged launches refresh `Current.lnk` on the desktop; isolated test instances do not change it.

## Validation notes

The production build and 44 automated tests passed, covering format selection, partial-file protection, capture retention, credential-free diagnostics, update version comparison, and checksum rejection/acceptance. A two-process handoff check simulated an older version in an isolated first process, launched a real second process, and confirmed the first exited and settings survived. See `handoff-report-0.2.0.json`.

The floating popup, capture log, and quality details were visually inspected using generated, non-explicit fixtures. Test clipboard input is injected only into the isolated Electron process, without changing the user's clipboard.

The final packaged build passed all 15 smoke checks with no renderer console errors. These cover extraction, duplicates, quality selection and audio/video merging, partial-file resume, encrypted fixture sessions, restart recovery, popup controls, diagnostics, and tray shutdown. See [the packaged report](packaged-smoke-report-0.2.0.json). The packaged app uses bundled engines with the test process PATH restricted to Windows system directories; this run did not reinstall the app through the installer.

Installer: `release/0.2.0/Current-Setup-0.2.0-x64.exe` (185,963,508 bytes). SHA-256: `51174e140459bd569c2735ec7d6939723ae8bf616ca4f3fa9515efbb3c4d7d6b`. A matching `.sha256` companion file is included.

Delivery verified: the normal user instance is running from `release/0.2.0/win-unpacked/Current.exe`, and the desktop `Current.lnk` points to that executable.
