# DriftFetch

A quiet, capable download manager for Windows. Copy a link to a video or an image gallery and DriftFetch finds the best version and saves it to your PC. No account, no ads, no telemetry.

| Folder | What it is |
|---|---|
| [`app/`](app) | The Windows desktop app (Electron, React, TypeScript, SQLite). |
| [`website/`](website) | The marketing site (Astro), published with GitHub Pages. |

## What it does

- **Watches your clipboard.** Copy a link in any app and DriftFetch picks it up, even from the system tray. You can also paste links into the window with `Ctrl+V` (batches of up to 200).
- **Finds the best quality.** It resolves redirects and embedded players, lists the formats the site offers, and picks the best one. Audio and video are joined at the end without re-encoding.
- **Handles galleries and profiles.** Image galleries, Instagram posts, carousels and whole profiles open as a picker with thumbnails, so you choose what to save. Playlists and channels always wait for your selection.
- **Says what is actually happening.** Each download has a plain-words state: checking, downloading with real size, speed and time left, rate limited (it waits and carries on by itself), choose items, sign-in needed, saved. When something fails you get the reason and the one step that fixes it.
- **Behaves like a proper queue.** Pause and resume, drag-to-reorder, "download next", automatic retries with a countdown, disk-space checks before a transfer, a speed limit, an optional daily schedule, and duplicate detection so the same video is not saved twice.
- **Works with sites that need a login.** Sign in inside the app, use a Chrome profile, or import a `cookies.txt`. Sessions are filtered to the site's domain and encrypted with Windows DPAPI. DRM and paywalls are not bypassed.
- **Keeps things tidy.** Files go to `Downloads\DriftFetch\<site>` by default. There is a watched folder for `.txt` link lists, per-site rules (quality, speed, folder), CSV export of history, and encrypted backups.
- **Optional extensions.** Site-specific readers can be added as sandboxed extensions that you install yourself; none ship with the app. See [`app/docs/EXTENSIONS.md`](app/docs/EXTENSIONS.md).

## How it works

DriftFetch is a wrapper that adds a queue, a clipboard watcher and a clear interface around proven open-source tools, all bundled with the app so nothing else needs installing:

1. The Electron main process watches the clipboard (or takes pasted links) and normalises each URL.
2. It asks **yt-dlp** what the link points to. Image galleries and profiles go to **gallery-dl** instead. **Deno** is bundled for the JavaScript challenges some sites use.
3. The queue (`app/electron/queue.ts`) decides what to start: it respects pauses, schedules, connection limits and per-site rules, and stores every job in a local SQLite database.
4. The tools download the media, **FFmpeg** (a small remux-only build) joins audio and video, and DriftFetch verifies the file and records it in History.
5. The React interface shows live progress through a narrow, typed preload bridge. Cookies, passwords and signed URLs never reach the renderer or the logs.

Everything stays on your machine. The app talks only to the sites you download from, and to GitHub when it checks for engine updates.

Support comes from the yt-dlp and gallery-dl extractors, so it is not a universal downloader and sites do change. [`app/docs/SUPPORT-MATRIX.md`](app/docs/SUPPORT-MATRIX.md) lists what has actually been checked.

## Status

Version 0.2.1, Windows 10/11 x64 only, **unsigned**, so Windows may show an "unknown publisher" prompt. There are no published releases yet; for now, build it yourself.

## Build and run

You need Node 22 and Windows.

```bash
cd app
npm install
npm run engines     # download and verify the bundled tools (yt-dlp, gallery-dl, Deno, FFmpeg)
npm run dev         # run in development
npm test            # unit and integration tests
npm run package     # build the installer into app/release/
```

The website:

```bash
cd website
npm install
npm run dev         # http://localhost:4321
npm run build
```

## Layout

```
app/
  electron/   main process: queue, engine wrapper, accounts, backups, extension host
  src/        React interface
  shared/     types and rules used by both sides
  scripts/    build, packaging and release checks
  tests/      vitest suite
  docs/       extension guide, support matrix, validation notes
website/
  src/pages/  one file per URL
  src/data/   version, repo and links in one place
```

## Licence

DriftFetch's own code is MIT ([`LICENSE`](LICENSE)). It bundles yt-dlp, gallery-dl, Deno, FFmpeg (LGPL build) and OpenPGP.js under their own licences; see [`app/THIRD-PARTY-NOTICES.md`](app/THIRD-PARTY-NOTICES.md) and [`app/SOURCE-OFFER.md`](app/SOURCE-OFFER.md).

Only save content you have the right to keep, and follow each site's terms. DriftFetch is not affiliated with YouTube, Reddit, Vimeo or any other site it works with.
