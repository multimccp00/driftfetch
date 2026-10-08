# Current 0.1.0 validation

The Windows x64 NSIS installer completed successfully with exit code 0. Its installed executable passed the full smoke suite with PATH restricted to Windows system directories, using isolated application data and generated non-explicit media.

## Results

- TypeScript check and production build: passed.
- Automated behavioral tests: 32 passed across core behavior, queue scheduling, cookie isolation, and engine update/rollback.
- Installed-app end-to-end checks: 12 passed; no renderer exceptions.
- Dependency audit: zero known vulnerabilities at build time.
- Installer: `release/Current-Setup-0.1.0-x64.exe`, 185,951,256 bytes.
- Installer SHA-256: `f156ba1bc81e3ae2d05371de1fe5a4a9505ff3ab6bde3e26c0bb261f22a9f435`.
- Signing: unsigned personal build.

## Installed-app coverage

1. Bundled engine availability and default preferences.
2. Clipboard capture, HTTP redirect, embedded video extraction, and playable file output.
3. Duplicate original URLs and resolved media identities.
4. Manual pasting and review with automatic downloading disabled.
5. Unsupported pages retained with actionable errors.
6. Explicit collection selection.
7. Settings and account controls.
8. Quality cap and separate DASH audio/video merging into MKV.
9. Pause preserving a partial file; resume issuing HTTP range requests.
10. Authentication failure, encrypted cookie import, successful retry, and temporary cookie cleanup.
11. Restart recovery of interrupted transfers while preserving manual pauses.
12. Close-to-tray behavior, explicit quit, and persisted settings/history.

See `installed-smoke-report.json` for the machine-readable record and `current-preview.png` for the installed application's appearance. The temporary validation installation was removed after testing; the distributable installer and unpacked build remain in `release`.

## Limits of this verification

The supplied aggregator's real outgoing video links and actual paid-account/Chrome-session access have not been tested. Compatibility depends on the destination site's yt-dlp extractor and any intermediate link handling. Disk-full and network/permission error messaging is checked with controlled error cases, without filling the disk or disrupting the user's network. Installer behavior was tested on this Windows machine, not a separate clean Windows VM.
