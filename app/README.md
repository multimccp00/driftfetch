# DriftFetch

A local Windows download manager built with Electron, React, TypeScript, SQLite, yt-dlp, and FFmpeg.

## Privacy

DriftFetch has no account, ads or telemetry and sends nothing to its developers. The privacy note is the first page of the installer and appears on first launch (and in Settings → Advanced → Privacy). It is written once in `shared/privacy-note.ts`; `npm run privacy` regenerates the installer text, a test checks they match, and `npm run release:check` refuses to pass while its contact address is unset.

## Licence

DriftFetch's own code is MIT-licensed (`LICENSE`). It bundles yt-dlp, FFmpeg (an LGPL shared build), gallery-dl, Deno and the OpenPGP.js library under their own licences; `THIRD-PARTY-NOTICES.md` lists them and `SOURCE-OFFER.md` explains how to get the source code of the GPL and LGPL parts. `npm run sources` collects that source for a release, and `npm run release:check` refuses to pass until the notices are current and the offer has a contact address.

## Run the app

Run `release/<version>/win-unpacked/DriftFetch.exe` (the folder is named after the package version); keep its accompanying files together. The app includes its own runtime, yt-dlp, gallery-dl, FFmpeg, FFprobe, and Deno. Windows 10/11 x64 is the target.

Packaged launches refresh a permanent `DriftFetch` desktop shortcut. Settings → Advanced → App also has Create desktop shortcut. The running app version is shown in the sidebar and Settings. Beginning with 0.2.0, opening a newer DriftFetch build asks the existing instance to save and quit, then acquires the application lock before loading its data. Opening the same version brings the existing window forward.

Settings → Advanced → App → Install app update accepts a newer DriftFetch x64 installer. Keep its companion `.sha256` file beside it: DriftFetch checks the bytes, saves worker state, closes, and launches the installer. This is a local installer flow, not an online update service. The checksum checks integrity against the accompanying file; it is not a publisher signature.

This personal build is unsigned. Windows may show an unknown-publisher prompt.

## Everyday use

Version 1.2 adds a watched folder (Settings → Quality & files): `.txt` files of links dropped there are imported once and moved to `processed/`. It also adds completion notifications, per-source download rules (quality, speed, connections, folder), CSV export of History, Ctrl+V to add links, downloads of pages with several HTML5 videos, browser impersonation for Cloudflare-protected generic pages, and extraction of KVS player pages. Version 1.2.1 keeps bundled tools current across upgrades, tells you when a damaged database was set aside, and uses a stronger key derivation for new encrypted backups (older backups still restore). Version 0.5.7 adds Instagram photo posts, mixed photo/video carousels, and whole-profile downloads through a bundled, checksum-verified gallery-dl, saved under the account name; an in-app Sign in here window for site sessions; an Unlimited simultaneous-downloads option; and removes the Sources page. Version 0.5.6 keeps automatic downloads exclusive to image galleries; video channels, playlists, and collections always require selection. Version 0.5.5 keeps a gallery under its original link as one download entry while it downloads all selected images to the gallery folder. Version 0.5.4 identifies image galleries in link notifications and adds an opt-in automatic gallery download setting. Version 0.5.3 adds Clear list on Downloads, which removes queued, paused, collection, and failed entries without deleting files or stopping active transfers. Version 0.5.2 lets a newly copied link retry after a prior failed attempt, so an old error never blocks a fixed extractor or a refreshed session. Version 0.5.0 bundles the verified JavaScript runtime required by current YouTube extraction, restores real format detection for individual pages, and adds source-verification and release-integrity checks. See [feature notes](docs/archive/FEATURES-0.5.0.md).

Version 0.3.0 adds drag-and-drop queue ordering and Download next, automatic retry countdowns, pre-transfer disk-space checks, and missing-file recovery in History. Settings → Advanced → Speed has the per-download speed limit and Settings → Downloads → Schedule the optional daily schedule. See [the feature notes](docs/archive/FEATURES-0.3.0.md) for behavior and limits.

1. Open DriftFetch, then right-click a video link in your usual browser and copy its address.
2. DriftFetch captures the newly copied link, resolves the source, and downloads individual videos automatically.
3. Find completed videos in History or use Open folder. The default destination is your Windows Downloads folder under `DriftFetch/<source site>`.

**Watch clipboard** and **Auto-download** are independent switches, enabled by default. The clipboard watcher ignores existing clipboard content at launch, prose containing URLs, unsupported schemes, and repeated polling of the same content. It accepts individual HTTP(S) URLs and whitespace-separated URL lists. It runs while the app is open, including in the system tray.

**Link notifications**, enabled by default in Settings → Downloads, show DriftFetch's own floating panel when copied links arrive while another app is active. The panel shows up to 20 recent captures, updates during extraction, and identifies duplicates or failures without stealing keyboard focus. Open DriftFetch opens Recent captures. Dismiss closes the panel; it also closes after 5 seconds even when checking is still in progress. Hovering keeps it open; moving away starts a new five-second timer. Switching notifications off does not disable capture or downloading.

**Recent captures** retains the last 100 clipboard/manual link events across restarts. Each event shows the source, time, and outcome and opens its download details. Clear log removes capture events without removing jobs, history, or files. Private clipboard prose and rejected schemes are not logged. Capture records store a source hostname and job reference, not another copy of signed URLs or session data.

**Download details** explains the current state and offers Copy diagnostic report. Reports include app/engine versions, failure category, stage, format count, session type, and transfer state. URLs, titles, paths, source identifiers, cookies, and raw engine output are omitted.

Turn off Auto-download to review new items before starting. Turning it off holds waiting downloads; already running transfers continue. Collections always require selecting their entries; the first 100 entries are offered. Pasting links with Ctrl+V anywhere in the window (there is no Add links button; Ctrl+Shift+V first asks for a group name and whether to hold them for review) accepts batches of up to 200 distinct URLs and 100 KB of text.

Pause preserves partial files. Resume uses the source protocol's resume support; some hosts may restart the transfer. Closing the window hides it in the system tray. Quit stops workers and persists their state. On restart, interrupted work resumes if automatic downloading is on, while manually paused entries stay paused.

## Link compatibility

The app distinguishes a copied listing/redirect link from the resolved video-page URL and source identity. It follows ordinary HTTP redirects before selecting a source account; yt-dlp handles supported embedded players and extraction. A visible download button is not required: extraction reads supported pages, player data, and streaming manifests. Source folders use the resolved video site rather than the original listing site.

Support comes from yt-dlp's extractors and generic handling, not a universal downloader. JavaScript-only redirect pages, unusual aggregators, anti-bot challenges, and changing source sites may need additional support. DriftFetch includes Deno for yt-dlp's JavaScript challenges, including current YouTube extraction; it does not rely on a separately installed JavaScript runtime. A category/listing page is not proof that its outgoing video links work. One supplied destination link passed metadata-only extraction; this does not establish compatibility with all links from that aggregator or verify the resolution of its high-quality stream.

Duplicates are detected by submitted/resolved URLs and source video identity, across pending items and history. Generic extractor identities also include their host. Explicit Download again creates another job with a unique filename. Visual matching of reuploads on different sites is not included. Removing an entry keeps its files but forgets that entry's duplicate history.

## Accounts

In Settings → Sites & sign-ins, enter the **actual source domain**, then sign in with the built-in browser, use a Chrome profile, or import a Netscape-format cookies.txt file for that source. Chrome extraction is best effort; Windows encryption and database locking can prevent it. The app does not weaken Chrome's security settings.

Imported cookies are filtered to the selected domain and its subdomains, then encrypted with Electron safeStorage/Windows DPAPI in the local SQLite database. Only a temporary decrypted file is passed to the download process; it is removed after use, with crash leftovers cleaned on next launch. Passwords and cookie values are not sent to the renderer or written to application logs. Remove session deletes the stored account session. The user-provided import file is left untouched.

Refresh expired sessions and retry affected downloads. DRM decryption and access-control bypasses are not supported. Actual paid-site/Chrome-session compatibility has not been validated; authentication tests use a local protected fixture.

## Files and quality

- Defaults: highest available quality, two concurrent downloads, source-site folders.
- When otherwise equivalent formats lack dimensions and bitrate, Best available can distinguish known high/medium/low quality labels. Normal measured-quality ranking remains with yt-dlp.
- Completed downloads show the saved file's resolution measured by bundled FFprobe, or Unknown when inspection cannot establish it. A source's high-quality label does not itself establish 1080p. Existing completed history is not re-inspected automatically.
- Quality caps: 1080p or 720p; unknown-resolution direct files remain eligible.
- Download details lists available formats with supplied resolution, bitrate, size, and whether separate audio is needed. Turn Auto-download off to choose a format before starting; an explicit selection overrides the global cap. Format selection is locked once a transfer has a destination/partial files. Actual engine format IDs are recorded separately from the saved file's measured resolution.
- Separate audio/video streams are merged without re-encoding into MKV. Single-file sources retain their source container.
- Filename fields: `{title}`, `{id}`, `{source}`, `{date}`. The ID is required. Windows-invalid characters are sanitized and a per-job suffix prevents overwrites.
- Destination, quality, and template changes apply to transfers that have not started. Resuming a partial transfer retains its original destination and format preference.

## Engine updates

Settings → Advanced → Download engine downloads yt-dlp from its official GitHub release, checks that the release's checksum list is signed by the yt-dlp maintainers' PGP key built into DriftFetch (fingerprint `AC0C BBE6 848D 6A87 3464 AF4E 57CF 6593 3B5A 7581`), checks the executable against that list, validates the executable, and retains the previous version for rollback. Active extraction and downloads must finish or be paused before an update. FFmpeg, FFprobe, Deno and gallery-dl run from the install folder and are updated by installing a newer DriftFetch build. The bundled yt-dlp replaces an older installed copy when a new build is first launched.

Data lives under Electron's per-user `DriftFetch` application-data directory: `current.sqlite`, `engines`, and `temporary-sessions`. There is no cloud service or telemetry. `CURRENT_USER_DATA` is available for isolated testing; normal runs use the default per-user location.

## Development

Use Node.js 22.14+ on Windows:

```powershell
npm ci
npm run engines
npm run dev
```

FFmpeg is the exception: DriftFetch builds its own remux-only FFmpeg (no encoders or decoders, so no codec patents to carry) with `npm run ffmpeg:build` (needs WSL Ubuntu or Linux with `mingw-w64`; run it once before `npm run engines`, which then verifies and copies the result). `npm run engines` retrieves and verifies official Windows binaries and generates the application icon. The generated manifest records versions, origins, and checksums. Cached binaries are reused only when their recorded checksums match.

```powershell
npm run build       # Type check and bundle renderer/main/preload
npm test            # Core, queue, cookie isolation, update/rollback tests
npm run test:smoke  # Real desktop app with synthetic local media
npm run package    # Windows x64 NSIS installer and unpacked application
npm run release:check # verify bundled binaries and required notices
```

To test the installed or packaged app, set `CURRENT_PACKAGED_EXE` to its absolute executable path and run `npm run test:smoke`. The harness isolates application data and restricts the app's PATH to Windows system directories so downloads cannot rely on development tools. It restores the clipboard text after testing. Reports and screenshots are written to `test-results/smoke-*/`.

If another copy of DriftFetch is watching your clipboard, set `CURRENT_SMOKE_NO_CLIPBOARD=1`. The harness then uses manual intake, disables clipboard watching only in its isolated test instance, and never changes your clipboard.

The real-engine smoke test covers redirects, HTML video extraction, ambiguous quality labels and measured 1080p output, duplicate identity, manual queueing, collection selection, unsupported pages, quality-capped DASH merging, range-based pause/resume, authenticated cookie import/encryption/cleanup, settings persistence, and tray behavior. No explicit media or real account credentials are used. Disk-full/network/permission diagnostics are tested through controlled errors rather than filling the user's disk or interrupting their network.

## Structure

- `electron/`: privileged engine, scheduler, persistence, credential storage, and validated desktop IPC.
- `src/`: React interface, styles, and typed shared API. Renderer has no Node integration; preload is sandboxed and context-isolated.
- `scripts/`: development runner, binary preparation, build, and desktop smoke harness.
- `tests/`: automated behavioral tests.

See `THIRD-PARTY-NOTICES.md` and the bundled engine license files before redistributing binaries.
