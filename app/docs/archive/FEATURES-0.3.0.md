# Current 0.3.0

- **Speed limit:** Settings → Files & quality accepts KiB/s per download (0 is unlimited). Applied to each newly started or resumed engine transfer. An already running transfer keeps its existing limit.
- **Queue order:** Drag waiting rows above or below another waiting row. Download next moves an item to the front and requests its start, respecting concurrency and the schedule. Ordering persists across restarts; active transfers are not interrupted for priority changes.
- **Automatic retries:** Enabled by default, with a switch in Files & quality. Temporary network/server failures retry after 15, 30, then 60 seconds, at most three automatic attempts after an engine failure. The engine can also perform its own internal retries. The queue shows a countdown, persists it, and offers pause/Stop retrying. Access errors, unsupported pages and disk errors need user action. Manual Retry resets the allowance.
- **Disk-space check:** Before a transfer starts, check the destination volume and account for other reserved transfers. Reserve twice the estimated video size minus downloaded bytes, plus 256 MiB for headroom. A known selected format size takes precedence. Unknown-size videos get the minimum reserve and can still exhaust the disk; other applications can also consume space after the check. Low-space failures do not loop through automatic retries.
- **Missing files:** Completed files are checked on launch, every minute, and when opening History. Check files runs an explicit refresh. Missing files retain their source identity and duplicate history. Locate file opens a native file picker to reconnect a moved video; Download again creates a fresh copy. Reconnecting an external drive and checking again clears the missing flag.
- **Scheduling:** An optional daily local-time window, disabled by default, in Files & quality. Overnight windows are supported. Current must remain running; it does not wake a sleeping PC. Link analysis can continue outside the window. Queued transfers wait; downloading transfers stop while keeping partial files. Finishing merges complete. Manually paused items remain paused. Disabling the schedule allows queued work to continue.

The five-second floating popup from 0.2.1 is retained. No Test session feature was added.

## Validation

54 automated tests passed, including schedule boundaries, scheduled transfer interruption, retry persistence/cancellation, queue order, missing-file recovery, speed-limit arguments, and refusal to launch a transfer when the destination has insufficient free space.

The packaged Windows executable passed all 16 smoke checks with no renderer console errors. The added end-to-end check exercised speed settings, retry controls, native drag-and-drop, a scheduled queue, a real bundled-engine transfer, detection of a moved fixture file, and Locate file through a mocked native picker. Existing extraction, merging, partial recovery, encrypted session fixtures, popup, and restart checks also passed. The process used an isolated data directory and a Windows-only PATH. The installer itself was built but not reinstalled during this validation. See [the packaged report](packaged-smoke-report-0.3.0.json).

The settings, scheduled queue, and missing-file screens were visually inspected. All media in these checks were synthetic fixtures, and the system clipboard was not changed.

Installer SHA-256: `a339775a59d48955ab242d317d83d0503aa15f2b71b92ffb1db98c9d9a78760e`, verified against its companion file.
