# Current 0.1.1 quality correction

Current already extracts supported pages, player data, and streaming manifests through yt-dlp. It does not require a visible download button.

## Diagnosis

The user's completed file measured 640×360 despite Best available being selected. Metadata-only extraction of the supplied destination page exposed two distinct media URLs with format IDs `High_Quality` and `Low_Quality`. Both had the same numeric quality score and lacked dimensions, bitrate, and file-size metadata. The engine selected `Low_Quality` by default. A simulation explicitly selecting `High_Quality` succeeded, but its actual resolution was not verified and no media was downloaded for that probe.

## Changes

- Best available prefers a unique higher quality label only when the candidates have recognized labels, lack measurements, and otherwise have equivalent format properties. Normal measured-quality ranking and user resolution-cap selectors remain in place.
- After a successful transfer, bundled FFprobe measures the saved video resolution. Failed inspection produces Unknown rather than a guessed resolution. Completed byte counts use the final file size, including merged audio/video.
- Existing completed files and history are not automatically changed. The update is built separately from the previous running application.

## Validation

- TypeScript and production build passed; 38 automated behavioral tests passed.
- The development app passed all 13 real-engine smoke checks with generated non-explicit fixtures, including an HTML video page offering unlabeled-dimension `High_Quality` and `Low_Quality` sources. It saved the 1080p source and reported its measured resolution correctly.
- The packaged executable also passed all 13 checks with no renderer exceptions and PATH restricted to Windows system directories. See `packaged-smoke-report-0.1.1.json`. The 0.1.1 installer itself was not installed during this run; the prior version's installer validation is recorded separately in `VALIDATION.md`.
- Clipboard writes were disabled in this run to avoid sending synthetic fixture links to the user's running app. The harness used manual intake and isolated application data. Earlier clipboard coverage remains recorded in the 0.1.0 validation report.
- Installer build completed: `release/0.1.1/Current-Setup-0.1.1-x64.exe`, 185,952,997 bytes, unsigned.
- Installer SHA-256: `a7c76ecd155c938713871c08ac96aecdcf9d58a8e9a25b4b3316821ec697dc51`.

The source's High_Quality label does not prove 1080p availability. Compatibility with every outgoing link, real Chrome sessions, and paid-account access is not established by these tests. The new installer was built without replacing or stopping the user's running copy.
