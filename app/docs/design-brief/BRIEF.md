# DriftFetch: interface redesign brief

Use this brief together with the images in `screens/` and `resources/driftfetch-icon.png`.

## The product

DriftFetch is a free Windows desktop app that downloads videos and images from websites: YouTube, Vimeo, Reddit (posts, galleries, whole subreddits), Instagram (posts, reels, stories, whole profiles), RedGIFs, image galleries and many more. You copy a link, and DriftFetch picks it up from the clipboard, works out what is behind it and saves it. Everything runs on the user's computer. There is no account, no cloud and no tracking.

The people using it are ordinary people, not engineers. They copy links all day and want them saved at the best quality with as few clicks as possible. Some download one video; others download whole profiles of hundreds of files. Many links need a sign-in, such as Instagram or Reddit, which the user does once inside the app.

Personality: calm, quick, trustworthy. It should feel like a polished native utility (think Raycast, Arc or Linear), not a busy downloader full of buttons.

## The brand

The icon is `resources/driftfetch-icon.png`: a blue "D" ribbon folding around a cyan "F" on deep navy.

| Role | Colour |
|---|---|
| Deep navy (icon background) | `#010930` |
| Electric blue (ribbon) | `#0b67fe`, shading down to `#0044ee` and `#012fc8` |
| Cyan (the F) | `#0cf3fe` |

The current interface uses a mint accent (`#8ce0c1`) on grey-black (`#101216`), which no longer matches. Please build a new palette from the icon. It must stay readable for long sessions: blue and cyan as accents, not large fills. Dark theme is the main one. A light theme is welcome but optional.

## Hard constraints (so the design can be built as-is)

- **Platform:** Windows 10 and 11 desktop app (Electron). Window minimum is **1020 × 680**; it is usually around 1380 × 880 and can be maximised.
- **Title bar:** the window is frameless with its own 36 px title bar. It holds the app mark and name on the left and minimise, maximise/restore and close on the right, and the whole bar drags the window.
- **Closing:** closing the window hides it to the system tray. The app keeps running and watching the clipboard.
- **Fonts:** must ship inside the app. No web font CDNs are allowed (the content security policy blocks remote loading). Suggest open-licence fonts that can be bundled, or Segoe UI Variable, which comes with Windows.
- **Icons:** the app uses Lucide icons. Keeping Lucide makes the build simpler.
- **Implementation:** React with plain CSS and design tokens as CSS variables (no Tailwind). Deliver tokens plus component and screen designs; they will be rebuilt by hand.
- **Accessibility must stay:** full keyboard use, visible focus, dialogs that trap focus, text contrast of at least 4.5:1, and support for "reduce motion". The current build already does all of this.

## Screens and what each must show

The screenshots in `screens/` use made-up data and show every screen and state as it is today.

### 1. Downloads (main screen): `02-downloads-all`, `03` to `05`, `23`, `24`
This screen is where users spend nearly all their time, so it matters most.

- **Header:** "Add links" button. A strip showing clipboard listening on or off and auto-download on or off; both are toggles.
- **Summary today:** 4 stat cards (downloading, waiting, completed, default quality). They take a lot of room; rethink or drop them.
- **Filters:** All / Active / Ready / Paused / Needs attention (with counts), a search box, a source filter, "Clear list" and "Pause all".
- **List:** many rows (hundreds possible), each with a checkbox for bulk actions, a thumbnail or placeholder, title, source site, quality badge (1080p, 2160p…), duration, status, size and speed, and actions.
- **Empty state:** `23` shows it today.
- **Footer:** item count, download folder with a "Change" link.
- **Small window:** `24` shows the minimum window size.

**Row states.** Each needs a clear visual treatment:

| State | What the row shows | Actions |
|---|---|---|
| Looking up (resolving) | spinner or "Checking link", the raw link as title | remove |
| Ready (review) | quality, size, duration | start, details, remove |
| Waiting (queued) | position or "Waiting" | download next, pause, remove |
| Downloading | progress bar, %, speed, time remaining | pause, cancel |
| Downloading a whole profile or subreddit | "128 files saved" counter (no percentage is known) | pause, cancel |
| Paused | progress so far | resume, remove |
| Choose items (collection) | "Select from 18 images/videos/items" link | open picker, remove |
| Rate limited | "Rate limited · resumes in 4:32" live countdown. The site asked DriftFetch to wait, and it continues by itself, so this is not an error. | stop retrying, details |
| Failed | short reason, "See what happened" | retry, open source page, details |
| Done | file size, quality | open folder, open file, download again |
| Already in list (duplicate) | link to the original | remove |

The rows currently show a letter tile instead of a thumbnail. Design a thumbnail slot that also works when there is no image, which is common.

### 2. Collection picker: `10` (images), `11` (videos)
Opens when a link contains several items (a gallery, playlist or post with many images). It's a grid of thumbnails with checkboxes, search, "Select all", "Select this page", "Clear selection", paging (12 per page), a "selected count" and a "Confirm N selected items" button. Each tile can be enlarged with a zoom button. A post with exactly one item skips this picker.

### 3. Download details: `06` downloading, `07` ready with format choice, `08` rate limited, `09` failed
Today it's a modal full of technical fields ("Resolved page", "Source identity"). Redesign it as a calm side panel or sheet with:
- a plain explanation of what's happening and why ("What's happening?");
- quality and format choice, when available (`07`);
- actions: cancel, retry, remove, locate file, copy diagnostic report (for support).

Keep the technical fields, but tucked away under an expandable "Technical details".

### 4. Settings: `15` to `22`
There are 8 tabs today: General, Files & quality, Accounts, Extensions, Compatibility, Engine, Privacy, Backup & restore. Each page is a long scrolling list, and the screenshots only show the top of each. The full content:
- **General:** watch clipboard, capture notifications, auto-download single links, auto-download galleries, preview collections first, completion notification, launch at login, automatic retries, schedule (only download between two times), quit.
- **Files & quality:** download folder, watched folder for `.txt` link lists, organise into folders (by site / by date / none), video quality (best / up to 1080p / up to 720p), quality warning threshold, simultaneous downloads, connections per download, speed limit, filename template, and per-site rules. Each rule sets quality, speed, connections, downloads at once, a pause between requests, a folder and auto-start.
- **Accounts:** sign in per site, in one of three ways: a built-in browser window, importing cookies.txt, or using a Chrome profile. Below that, a list of connected sites with remove buttons.
- **Extensions:** optional add-ons for extra sites: install, enable, disable, remove, and an account form for each.
- **Compatibility:** which sites have been checked and how they performed.
- **Engine:** versions of the download tools (yt-dlp, FFmpeg, gallery-dl, Deno), "Update engine", rollback, the licence folder.
- **Privacy:** the privacy note (same text as the first-launch dialog `01`).
- **Backup & restore:** encrypted backup export and restore with a password.

Please propose a simpler structure. Group by what people want to do (Downloads, Quality, Sites & sign-ins, Advanced), and bury what almost nobody touches.

### 5. Smaller screens (can reuse the new style; full redesign optional)
- **Review queue `12`:** links held for review before downloading.
- **History `13`:** finished downloads, with search, bulk remove, CSV export and "download again".
- **Recent captures `14`:** the log of links picked up from the clipboard.
- **First-launch privacy dialog `01`**
- **Add links dialog `02b`:** paste several links; optional group name; "hold for review" checkbox. Its group-name field is currently unstyled.
- **Capture popup (no screenshot):** a small window near the tray that appears when a link is copied, showing what was captured, with quick actions.
- **Toasts:** short confirmations, with Undo after Remove or Clear (30 s).

## What is wrong with today's interface (please fix)
1. The mint accent and grey-black don't match the blue and navy icon.
2. The four stat cards use prime space for numbers that are already in the tab counts.
3. Rows are tall but carry little: no thumbnails, and the status and size columns feel disconnected.
4. "Needs attention" mixes real failures with rate limits that fix themselves.
5. The details modal reads like a debug report.
6. Settings are long, flat pages with 8 tabs, and the most-used options aren't first.
7. The copy is a bit twee ("Your space, your pace", "Bring a few links along", "Made for less clicking", "A little less friction"). It should be friendly but plain.

## What to deliver
1. **Design tokens:** colours (dark theme, plus light if you do it), type scale, spacing, radius, shadows and motion, named so they map onto CSS variables.
2. **Components:** buttons (primary, secondary, quiet, danger, icon), inputs, select, toggle, checkbox, tabs, badge and status pill, progress bar, list row (every state in the table above), thumbnail slot, dialog and side panel, toast, empty state, title bar.
3. **Screens:** Downloads (with rows in every state, the empty state and the 1020 × 680 size), Collection picker, Details panel (downloading, rate limited and failed), and Settings with the new structure.
4. Optional: History, the Add links dialog, the capture popup and the first-launch dialog in the new style.

## Out of scope
- Marketing website and store pages.
- Mobile and macOS.
- New features. The redesign covers the same functions, presented better.

## Screenshot index (`screens/`)
| File | Shows |
|---|---|
| 01-first-launch-privacy | First-launch "Before you start" privacy dialog |
| 02-downloads-all | Main list, all states mixed |
| 02b-add-links-dialog | Add links dialog |
| 03-downloads-active / 04-ready / 05-needs-attention | Filter tabs |
| 06-details-downloading | Details of a running download |
| 07-details-ready-with-formats | Details with format choice |
| 08-details-rate-limited | Details while waiting out a rate limit |
| 09-details-failed | Details of a failure |
| 10-collection-picker-images / 11-videos | Picker for galleries and playlists |
| 12-review-queue, 13-history, 14-recent-captures | Secondary screens |
| 15 to 22-settings-… | The 8 settings tabs (top of each page) |
| 23-downloads-empty | Empty state |
| 24-downloads-minimum-window-1020x680 | Smallest window size |
