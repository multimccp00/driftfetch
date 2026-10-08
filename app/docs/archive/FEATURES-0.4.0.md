# Current 0.4.0

## Changes

- Added visible quality warnings in Downloads and Download details. Resolution is not inferred from High/Low labels. Settings → Files & quality controls the low-resolution threshold (default 720p). Saved files below an expected known format are flagged; an explicitly selected low-quality format is respected.
- Preserved the conservative High Quality label preference when a resolution cap is set. Unknown-height formats remain eligible, as in the existing cap selector, so an unknown source height cannot guarantee the cap before downloading.
- Added Recheck available formats on inactive entries, including completed videos. It updates the format list on the same entry while retaining files, measured saved quality and source identity. Different-video responses are rejected. Failure keeps the previous list and provides a message. Refreshing queued work holds it for review. Partial transfers retain their locked format.
- Added a Review queue with search, per-video format choices, size estimates, select-visible and Start selected. Adding links there holds them regardless of Auto-download. The Add links dialog also offers this choice elsewhere. Collection selections inherit the review preference.
- Added Sources, grouping local queue/history observations by source and link type, with the latest outcome, completed count, check date and recorded engine version. It distinguishes identification from completed downloads, and account/access/extraction failures. Removing history removes its evidence; it is not a universal source-support registry.
- Added Settings → Backup & restore. Backups use scrypt-derived AES-256-GCM encryption and a user-supplied password of at least 12 characters. They contain settings and queue/history, but no account sessions or media files. Restore validates decrypted content before an atomic database transaction, merges entries without overwriting existing ones, keeps local account sessions and Windows launch preference, disables automatic downloading and leaves pending work paused. Restored pending links are identified afresh. Restore requires idle workers. Completed files can be relocated using Locate file.
- Added a concrete 1.0 roadmap, separating personal-release requirements from broader distribution work.

## Validation

The production build and 61 automated tests pass. New tests cover backup encryption, incorrect passwords, tampering, invalid/duplicate entries, safe restore states, quality mismatch/unknown/explicit-low cases, review holds under Auto-download, completed-file preservation on refresh, refresh failure, and source outcome classification.

The dependency audit reports zero known vulnerabilities at the time of this build. See `dependency-audit-0.4.0.json`. This is an advisory check, not a full security audit.

The Test session feature remains excluded.

The packaged smoke suite passed all 17 checks with no renderer console errors, including review selection under Auto-download, format refresh without a new entry, an actual 1080p labelled-format download under the cap, source records, and encrypted backup export/restore. The Review, Sources and Backup screens were visually inspected. See [the packaged report](packaged-smoke-report-0.4.0.json).

After that suite, one additional recovery branch was added: a previously unidentified entry whose format recheck now succeeds moves into held Review. Its unit test passed, bringing the total to 61, and the rebuilt final packaged executable passed a dedicated test with a changing synthetic page, Windows-only PATH and isolated user data. See [the final recovery report](final-format-recovery-0.4.0.json). The installer was built but was not reinstalled on this PC during this release check.

Final installer SHA-256: `a2628e577dcd7cd33624394472916fd161c33b0f7f9d10feeb09a731f8c99150`, matching the companion checksum. The normal user instance and desktop shortcut were verified to point to version 0.4.0.
