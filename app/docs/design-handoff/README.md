# Handoff: DriftFetch interface redesign

## Overview
DriftFetch is a free Windows desktop app (Electron + React) that downloads videos and images from websites. Copied links are picked up from the clipboard and saved. The app keeps its **existing layout** (brand sidebar, "Listening for links" strip, stat cards, tabbed list card). This redesign:
- replaces the mint/grey-black palette with one built from the new icon (navy, electric blue, cyan),
- uses plainer copy,
- adds a real thumbnail slot to list rows,
- gives every row state its own visual treatment,
- splits rate limits (which resolve by themselves) from real failures,
- turns the details modal into a side panel,
- groups settings into 4 sections instead of 8 tabs.

The current app's functions stay the same; this is not a feature change.

## About the design files
The files here are **design references made in HTML**. They are prototypes showing the intended look and behaviour, not production code. Rebuild them by hand in the existing DriftFetch codebase (React, plain CSS, tokens as CSS variables, no Tailwind, Lucide icons), following its patterns. The current `JobRow.tsx` structure maps directly onto the list row described below.

To view the files, open `DriftFetch Redesign.dc.html` in a browser from this folder. It is a pan/zoom canvas with every screen as an artboard labelled 1a–1n. `DriftFetchApp.dc.html` is the interactive app mock, and its state data sits in the `<script>` logic class. Icons in the mock load Lucide from a CDN for preview only; the app must use its bundled `lucide-react`.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Recreate them to the pixel. Every value is in `tokens.css`.

## Hard constraints (from the brief)
- Windows 10/11. Minimum window 1020 × 680, typical size 1380 × 880, can be maximised.
- Frameless window with a custom 36 px title bar. The whole bar drags (`-webkit-app-region: drag`; the buttons use `no-drag`).
- Closing the window hides it to the tray. The close button's tooltip reads "Close to tray".
- No web fonts, because the CSP blocks remote loading. Use Segoe UI Variable (ships with Windows) and bundle Cascadia Mono (OFL).
- Keep the current accessibility: full keyboard use, a visible focus ring (`--focus-ring`), focus trapped in dialogs, text contrast of at least 4.5:1, and `prefers-reduced-motion` support.

---

## App shell

### Title bar (36 px, `--bg-titlebar`, bottom border `--border`)
- Left side, 12 px padding, 8 px gap:
  - icon (16 × 16, radius 4),
  - "DriftFetch" (12/600, `--text-1b`),
  - a 1 × 12 px divider (`#262d3d`, 6 px margin),
  - "VIDEO DOWNLOADER" (10.5/600, tracking 0.12em, `--text-3`).
- Right side: three 46 × 36 window buttons. Lucide `minus` 14, `square` 11 and `x` 15, all at stroke 1.5.
  - Hover: `--border` background.
  - Close hover: `--win-close-hover` background with white text.

### Sidebar (220 px wide; 52 px rail below about 1100 px window width)
- Background `--bg-sidebar`, right border `--border`, padding 22/12/12.
- **Brand block:** icon 40 × 40 (radius 10) + "DriftFetch" (`--type-brand`), with "Video & image downloader" below it (11.5/16, `--text-3`). Gap 12, 8 px side padding.
- **"WORKSPACE" overline** (`--type-overline`, `--text-3`), padding 30/10/8.
- **Nav items:** 40 px tall, radius 8, padding 0 10 0 12, gap 12, icon 17. Label 13.5/500.
  - Order and icons: Review queue (`list-checks`), Downloads (`arrow-down-to-line`), History (`history`), Recent captures (`clipboard-list`), Settings (`sliders-horizontal`).
  - Inactive: `--text-2` text, `--text-3` icon. Hover: `--bg-nav-hover`.
  - Active: `--bg-nav-active` background, `--text-1` text, `--accent-text` icon.
  - Count badge: min 20 × 18, radius 5, 11/600 tabular. Inactive `--bg-badge`/`--text-2`, active `--bg-badge-active`/`--accent-badge-text`.
- **Privacy card** (pinned to the bottom): padding 14, radius 10, `--bg-panel`, border `--border-subtle`.
  - `shield-check` icon 17 in `--accent-text`.
  - "Stays on this PC" (13/600).
  - "Downloads, history and sign-ins never leave this computer." (12/17, `--text-2`).
- **"Download folder" link row:** 36 px, `folder` 16 icon, `arrow-up-right` 14 icon on the right.
- **Footer** (top border, 12 px padding): green 6 px dot, "Engine ready" (12, `--text-3`), and "v0.2.1" on the right (600, `--text-2`).
- **Compact rail (52 px):** 36 × 34 icon buttons, 4 px gap. The count shows as a 14 px badge at the top-right corner. Settings sits at the bottom with the engine dot below it.

---

## Screen: Downloads (artboards 1c, 1d, 1e)

### Layout
The main column has 28/32/24 padding and is a vertical flex with a 16 px gap:
1. header
2. listening strip
3. stat cards (hidden in compact)
4. list card (flex: 1)

### Header
- "Downloads" (`--type-page`), with "Copy a link and DriftFetch takes it from there." below it (13, `--text-2`).
- Right side: the **Add links** primary CTA.
  - 40 px tall, padding 0 18 0 14, radius 8, `--accent`, white 14/600.
  - Lucide `plus` icon at 17 px, stroke 2, with an 8 px gap.
  - `--shadow-cta`. Hover: `--accent-hover`.
  - Icons must be vertically centred (flex, not inline baseline).

### Listening strip
- Padding 12 12 12 16, radius 10, gap 14.
- Background: `linear-gradient(90deg, rgba(11,103,254,.11), rgba(12,243,254,.035) 55%, rgba(14,18,27,.6))`.
- Border `rgba(106,166,255,.18)`.
- Icon tile: 34 × 34, radius 8, `rgba(12,243,254,.08)`, Lucide `radio` 17 in `--cyan-text` (`--text-3` when off).
- Title: "Listening for links" when on, "Not watching the clipboard" when off (13/600).
- Subtitle: "Copy a video or gallery link in your browser and it appears here." when on, "Copied links are ignored. Use Add links, or turn Watch clipboard on." when off.
- Two toggles on the right, "Watch clipboard" and "Auto-download", with a 1 × 20 divider (`--border-strong`) between them.

### Toggle
- Track 32 × 18, radius 9. On: `--accent` track with a white knob at left 16 px. Off: `--border-strong` track with a `#8b93a6` knob at left 2 px.
- Knob 14 px. Transition `left --dur-fast`.
- Role `switch`, with `aria-pressed`/`aria-checked`.

### Stat cards
- 4-column grid with a 12 px gap.
- Each card: padding 14/16/13, radius 10, `--bg-list`, border `--border`.
- Content, top to bottom:
  - overline label with a 16 px icon on the right,
  - value (`--type-stat`, tabular),
  - sub-line (12/16, `--text-3`) with an optional 6 px dot.

| Label | Icon | Value | Sub |
|---|---|---|---|
| DOWNLOADING | arrow-down-to-line (`--cyan-text`) | 2 (in `--cyan-text` when above 0) | ● 7.9 MB/s combined |
| IN QUEUE | layers | 2 | 2 at a time |
| COMPLETED | check-check | 1 | Saved to this PC |
| DEFAULT QUALITY | gauge | Best | Highest the site offers |

At the minimum window size (1020 × 680) the stat cards are hidden.

### List card
- Radius 12, `--bg-list`, border `--border`, overflow hidden. Vertical flex, top to bottom:
  1. **Tabs bar** (46 px, bottom border):
     - Underline tabs, padding 0 8, 6 px gap, 13/500. Active: `--text-1` with a 2 px `--accent-text` bottom border.
     - Tabs: All downloads 11 · Active 5 · Ready 2 · Paused 1 · Failed 1.
     - Count badges look like the nav badges, except the Failed badge uses `rgba(242,132,123,.14)`/`--danger`.
     - Use the tablist pattern with arrow-key navigation.
  2. **Toolbar** (padding 12 14):
     - Search field: 260 px (200 compact), 32 px tall, `search` icon 15, placeholder "Search downloads".
     - "All sites" select.
     - Spacer, then "Clear list" (`list-x`) and "Pause all" (`pause`) secondary buttons: 32 px, `#121722` background, `--border-control` border.
  3. **Column header** (34 px, `--bg-list-header`, borders top and bottom, overline style):
     - Columns: select-all checkbox · VIDEO / SOURCE (spans 2) · STATUS · SIZE / SPEED (right-aligned) · actions.
     - The checkbox shows an indeterminate dash when some rows are selected.
  4. **Rows** (scrolling area; virtualise for hundreds of rows).
  5. **Footer** (42 px, top border, 12 px `--text-3`):
     - Left: "● 11 items". When rows are selected it switches to the bulk bar (see below).
     - Right: `folder` 14 icon, the path in `--type-mono`, and a "Change" link. Then a divider and "Duplicates are skipped" with `shield-check` 13 (full width only).

**Grid columns:**
- Full: `16px 64px minmax(0,1fr) 250px 104px 100px`
- Compact: `16px 64px minmax(0,1fr) 196px 84px 92px`
- Gap 12. Row padding 0 12 0 14.

### List row (56 px tall, `--border-row` bottom border)
- **Checkbox:** 16 × 16, radius 4, 1.5 px `--border-checkbox` border. Checked: `--accent` fill with a white `check` 11 (stroke 3). A selected row gets `--bg-row-selected`; hover is `--bg-row-hover`.
- **Thumbnail slot:**
  - 64 × 36 (16:9), radius 6, inset 1 px `rgba(255,255,255,.06)` ring.
  - With an image: the image covers the slot (`object-fit: cover`).
  - Without an image: `--thumb-empty` hatch plus a 16 px Lucide glyph in `--thumb-icon`. Glyphs: `film` for a video, `images` for a gallery, `user-round` for a profile, `loader-circle` (spinning) while checking. **Never a letter tile.**
  - Collection: a second card peeks 4 px above (inset 5 px, `#2a3244`), plus a bottom-right count chip (`images` 9 + "18", 10/600, `rgba(5,7,12,.78)` background).
  - Duplicate: thumbnail at 45 % opacity.
- **Name column:**
  - Title: 13/500 `--text-1`, one line with ellipsis. While checking, the raw URL in mono `--text-2`.
  - Meta line (12/16 `--text-3`, gap 6): site · quality badge · duration.
  - Quality badge: 16 px tall, padding 0 5, radius 4, 1 px `#2b3345` border, `#b4bbcb`, 10.5/600. Amber variant `--wait` when below the warning threshold.
- **Status column:** a label line (12.5/18, 500) with a 6 px dot *or* a 13 px icon, plus an optional `%` on the right. Under it, one of:
  - a 4 px progress bar,
  - a sub-line (12/16) — `--accent-text` with `chevron-right` 12 when it is a link.
- **Size column:** right-aligned, tabular. Top line 12.5 `--text-1`, bottom line 12 `--text-3`.
- **Actions:** 28 × 28 icon buttons, radius 6, icon 16 in `--text-2`. Hover: `--bg-hover`/`--text-1`. Each has a tooltip and `aria-label`.

**Row states (colour = meaning):**

| State | Status label (colour) | Under label | Size / bottom | Actions |
|---|---|---|---|---|
| Checking link | spinning `loader-circle` "Checking link" (`--text-2`) | "Finding what can be downloaded" | — | Remove |
| Ready | ● "Ready to start" (`--accent-text`) | "Auto-download is off" | 182 MB / estimated | Start, Details, Remove |
| Waiting | ● "Waiting · next in line" (`--text-2`) | "Starts when a download finishes" | 920 MB / estimated | Download next (`arrow-up-to-line`), Pause, Remove |
| Downloading | ● "Downloading · 38 s left" (`--cyan-text`) + "46%" | 4 px bar, `--progress-fill` | 236 / 512 MB / 6.4 MB/s | Pause, Cancel |
| Saving profile | ● "Saving profile" (`--cyan-text`) | indeterminate bar + "128 files saved" | 1.4 GB / 1.5 MB/s | Pause, Cancel |
| Paused | `pause` "Paused" (`--text-2`) + "12%" | bar in `--progress-paused` | 26 / 220 MB | Resume, Remove |
| Choose items | ● "Choose items" (`--accent-text`) | link "Select from 18 images ›" | — | Choose items (`list-checks`), Remove |
| Rate limited | `clock` "Rate limited · resumes in 4:32" (`--wait`), live countdown | "The site asked us to wait · continues by itself" | — | Stop retrying (`circle-stop`), Details |
| Failed | `circle-alert` "Sign-in needed" (`--danger`), short reason | link "See what happened ›" | — | Retry, Open source page, Details |
| Saved | `check` "Saved" (`--ok`) | "Today, 21:14" | 410 MB / MP4 | Open folder, Open file, Download again |
| Already in list | `copy` "Already in list" (`--text-2`) | link "Go to original ›" | — | Remove |

- Rate-limited rows count under **Active**, not Failed.
- Indeterminate bar: a 35 %-wide cyan highlight (transparent → `#0cf3fe` → transparent) sweeping from −120 % to 320 % every 1.4 s, ease-in-out. It is disabled under reduced motion; the counter keeps updating.

**Bulk bar** (replaces the footer count when any row is checked):
- "N selected" (600, `--text-1`).
- 26 px buttons: Start, Pause, Remove (the last one in `--danger` text).
- A quiet "Clear" button.

### Empty state (1e)
- Centred in the list card.
- 48 × 48 tile (radius 12, `#121722`, border `--border-control`) with `clipboard-paste` 22 in `--accent-text`.
- "No downloads yet" (15/600).
- "Copy a video or gallery link in your browser and it shows up here. You can also paste several links at once." (13, `--text-2`, max 360 px).
- "Add links" primary button.
- "● Watching clipboard" hint (12, `--text-3`, cyan dot).
- The tab counts read 0.

---

## Collection picker (1f) — a dialog
- Scrim `--scrim-dialog`. Dialog 940 px max, radius 12, `--bg-panel`, border `--border-dialog`, `--shadow-dialog`. Focus is trapped and Esc closes.
- **Header** (padding 20 20 14 24):
  - "Choose images to download" (`--type-dialog`).
  - Below it: "Lisbon Travel Album · reddit.com · 18 images" (12.5 `--text-2`).
  - Close button 30 × 30.
- **Toolbar:**
  - Search field (240 px): "Search titles or item IDs".
  - Quiet buttons: "Select all 18", "Select this page", "Clear selection".
  - Right side: "**18** of 18 selected".
- **Grid:** 4 columns, 12 px gap, 12 items per page.
  - Tile: 4:3, radius 8. Selected: `0 0 0 2px --accent` ring. Unselected: 55 % opacity.
  - Checkbox 18 px at top-left (8, 8). Unchecked: `rgba(5,7,12,.45)` fill with a white 70 % border.
  - Enlarge button 26 px at top-right (`maximize-2` 13, `rgba(5,7,12,.6)`).
  - Caption under the tile: "Image 1" left, "4032 × 3024" right (12).
- **Footer** (top border):
  - Prev/next 30 px buttons with "Page 1 of 2" between them.
  - Hint: "Closing keeps the album waiting in your list."
  - Cancel (secondary) and "Download N selected" (primary, `arrow-down-to-line`).
- For videos, the same layout uses 16:9 tiles with a duration in the caption.
- A post with exactly one item skips the picker.

## Details side panel (1g–1j)
- Slides in from the right: 420 px (380 compact), `--bg-panel`, left border `--border-dialog`, `--shadow-panel`, scrim `--scrim-panel`.
- Transition `transform --dur-base --ease`. Focus is trapped and Esc closes.
- Opens from a row click, "Details", or the "See what happened" link.

**Contents, top to bottom:**
1. **Header:** 80 × 45 thumbnail, title (14/19 600, wraps), meta "site · quality · duration", close button.
2. **Status card:** padding 14, radius 10, tinted by status.
   - Icon 16 + label (14/600, status colour), and a value on the right.
   - Optional 6 px bar.
   - Sub-line (12.5 `--text-1b`).
3. **"What's happening"** (13/600), then a plain-language paragraph (13/20 `--text-2`). The failed state adds numbered steps (20 px circles).
4. **Action buttons** (wrap, 8 px gap, 32 px).
5. **Quality:**
   - Read-only text, or a radio list for the Ready state: Automatic / 1080p / 720p / 540p / Audio only, each with a "format · ≈size" meta.
   - Selected row: 5 px `--accent` ring radio on a `rgba(11,103,254,.08)` background.
   - "Recheck formats" link.
6. **"Technical details"** disclosure: `chevron-right` rotates 90°, `aria-expanded`.
   - Content is a 104 px / 1fr grid of key/value pairs, values in mono with `word-break: break-all`.
   - Keys: Copied link, Page, Source ID, Format, Saving to, Added, Error code.
7. **Footer:** "Copy diagnostic report" (secondary, `copy`) and "Remove from list" (quiet danger, `trash-2`, tooltip "Keeps any saved files on disk").

| Variant | Status card tint / border | Label · value | Actions |
|---|---|---|---|
| Downloading | `rgba(12,243,254,.05)` / `.16` | Downloading · 46%, gradient bar, "236 of 512 MB · 6.4 MB/s · about 38 s left" | Pause, Cancel download (danger) |
| Ready | `rgba(11,103,254,.07)` / `rgba(106,166,255,.2)` | Ready to download · ≈182 MB | Start download (primary), Download next |
| Rate limited | `rgba(233,180,90,.06)` / `.2` | Waiting on reddit.com · m:ss countdown, amber bar filling toward resume, "Resumes by itself. You don't need to do anything." | Stop retrying, Open reddit.com |
| Failed | `rgba(240,113,103,.06)` / `.2` | Couldn't download, "Sign-in needed · patreon.com refused access" + steps | Sign in to patreon.com (primary), Retry, Open source page |

The copy for each variant is in `DriftFetchApp.dc.html` → `PANELS`.

## Add links dialog (1n)
- 560 px wide.
- "Add links" / "Paste video or gallery links, one per line."
- Mono textarea, 150 px tall. Focused: `--accent` border plus `--focus-input`.
- "Group name · optional" field with placeholder "For example: Holiday videos". This field is a styled input; it is unstyled in the current build.
- Checkbox: "Hold for review before downloading".
- Info line: "Links already in your list are skipped. Albums and playlists wait for you to choose items."
- Cancel, and "Add N links" (primary).

---

## Settings (1k, 1k2, 1l, 1m)

### Layout
- Header: "Settings" (`--type-page`), with "Changes save as you make them." below it. A "Search settings" field (260 px) sits on the right.
- Left section nav, 196 px wide. Each item: icon 16 + label 13/500 + hint 11.5/15 `--text-3`, padding 8 10, radius 6. Active item: `--bg-nav-active`.
- Content area: scrolls, max width 860 px.
  - Section title (15/600) and description (12.5 `--text-2`, 18 px below).
  - Groups are separated by 22 px. Group title: 12/600 `--text-2`.
  - Each group is a card: radius 10, `--bg-list`, border `--border`. Rows inside are separated by 1 px `#171c28` lines.
- **Setting row:** padding 14 18, flex-wrap, 16 px gap. Contents in order:
  - optional 34 × 34 icon tile (radius 8),
  - label (13/500) + description (12/17 `--text-3`), with min-width 240,
  - the control on the right.
  - Full-width sub-controls (radio cards, path field, time range, tool tiles) wrap below the row with `flex-basis: 100%`.
- **Icon tile variants:**
  - default: `rgba(106,166,255,.12)` / `--accent-text`
  - highlighted (Watch clipboard): `--accent` / white
  - muted: `--bg-raised` / `--text-2`
  - danger: `rgba(242,132,123,.1)` / `--danger`
- **Controls:**
  - Toggle: as on the Downloads screen.
  - Select: 30 px, min 150, `--bg-raised`.
  - Segmented: 24 px options inside a 2 px padded track, active option `#1f2636`.
  - Text input: 30–34 px, mono.
  - Buttons: 30 px. Variants are secondary, danger (`--danger-border` border, `--danger` text) and primary.
- **Radio cards:** a grid with one column per card and 10 px gap.
  - Each card: padding 12 14, radius 8, a 16 px radio, title 13/600 with an optional "Recommended" tag (`rgba(106,166,255,.16)`/`#9cc3ff`), and a description 12/17.
  - Selected: `--accent` border on a `rgba(11,103,254,.09)` background. Unselected: `--bg-input` background with a `--border-control` border.

### Sections (the old tabs map onto these)
1. **Downloads** — from General.
   - *Picking up links:* Watch clipboard (highlighted tile); Show a popup when a link is picked up.
   - *Single videos:* radio cards "Start right away" (Recommended) / "Wait in my list".
   - *Galleries, playlists and profiles:* radio cards "Let me choose" / "Download every image"; toggle "Show thumbnails in the picker".
   - *Finishing and problems:* "When a download finishes" select; "Retry automatically" toggle.
   - *Schedule:* toggle "Only download at certain times" with a From/To time-field pair below it, dimmed to 45 % while the toggle is off.
2. **Quality & files** — from Files & quality.
   - *Video quality:* 3 radio cards (Best available, Recommended / Up to 1080p / Up to 720p); "Warn me when a video is lower than" select.
   - *Where files go:* Download folder as a full-width path field with Open and Change… buttons; "Sort into folders" segmented control (By site / By date / None) with a dashed example path below it; "File names" template input with insertable tag chips ({title} {site} {date} {quality} {id}) and a dashed preview line below.
   - *Import from a folder:* watched .txt folder; "Hold imported links for review" toggle. ⚠ Check that this toggle exists in the current build. Remove it if not — it was added in the mock.
3. **Sites & sign-ins** — from Accounts, per-site rules and Compatibility.
   - **Sign-in hero card** at the top:
     - Padding 20 22, radius 12, gradient `rgba(11,103,254,.16)` → `rgba(12,243,254,.05)` → `--bg-list`, border `rgba(106,166,255,.28)`.
     - A 40 px solid `--accent` key tile.
     - Title "Sign in to a site" (15/600) and a sentence explaining why.
     - Three 36 px buttons: "Sign in with built-in browser" (primary), "Import cookies.txt", "Use a Chrome profile".
     - Lock line: "Encrypted with your Windows account. Never leaves this PC."
   - Then: *Signed-in sites · N* list (letter tile + site + method · date, with Update and Remove); *Site rules* (per-site summary + Edit, then Add a rule); *Compatibility* (View results).
4. **Advanced** — from Extensions, Engine, Privacy, Backup and the rare General items.
   - *Speed:* Downloads at the same time (segmented 1–5); Connections per download; Speed limit.
   - *Download engine:* one row with "Restore previous" and "Check for updates" (primary), and below it a 4-up grid of tool tiles (yt-dlp, gallery-dl, FFmpeg, Deno), each showing name, a ● Ready status, the version in mono, and its purpose.
   - *Extensions:* empty row + "Add extension file…".
   - *Backup & privacy:* Encrypted backup (Restore…, Export…); Privacy (Read privacy note, which opens the first-launch text); Open-source licences.
   - *App:* Open DriftFetch when Windows starts; Quit DriftFetch (danger).

---

## Components without their own screen (artboard 1b)
- **Buttons:**

  | Type | Size | Look | Weight |
  |---|---|---|---|
  | Primary | 32 px (40 for the page CTA) | `--accent`, white | 600 |
  | Secondary | 32 px | `--bg-raised` + `--border-strong` | 500 |
  | Quiet | 32 px | transparent, `--text-2` | 500 |
  | Danger | 32 px | transparent + `--danger-border`, `--danger` text | 500 |
  | Icon | 28 px | — | — |

  Hover lightens one step. Disabled: `#121722` background, `--border-subtle` border, `--text-disabled` text. Focus: `--focus-ring`.
- **Inputs:** 32 px, `--bg-input`, `--border-strong`, radius 6.
  - Focus: `--accent` border plus `--focus-input`.
  - Error: `--danger` border with a 12 px `--danger` message below.
- **Toast:** bottom centre, 44 px tall, 360 px wide, `--bg-toast`, border `--border-strong`, `--shadow-pop`.
  - "Removed 2 downloads" with an "Undo" button (`--accent-text`, 600).
  - A 2 px `--accent-text` bar along the bottom counts down 30 s.
- **Capture popup** (frameless window near the tray):
  - 340 px wide, radius 12, `--shadow-dialog`.
  - Header strip: "Link captured" + close.
  - Body: 80 × 45 thumbnail, title, meta with quality badge, and a "● Starting download" line in cyan.
  - Buttons: Choose quality, Open DriftFetch, and Cancel (quiet danger).

## Interactions & behaviour
- **Toggles:** Watch clipboard and Auto-download in the strip are the same settings as in Settings. The strip copy changes with the clipboard state.
- **Tabs:** All / Active / Ready / Paused / Failed filter the list. Rate-limited, checking, waiting and downloading rows count as Active.
- **Row click:** opens the details panel. The checkbox and action buttons stop propagation.
- **Select all:** has an indeterminate state. The footer becomes the bulk bar while anything is selected.
- **Rate-limit countdown:** updates every second in both the row and the panel. The panel bar fills toward resume.
- **Remove / Clear list:** show a toast with Undo for 30 s.
- **Motion:**
  - hover 120 ms,
  - panel slide 180 ms,
  - dialog fade/scale-in 240 ms (from scale 0.98),
  - all using `--ease`.
  - Spinners turn once per second (1 s linear).
  - With reduced motion: no transitions, spinners and the indeterminate sweep stop, progress still updates.
- **Responsive:** below about 1100 px wide the sidebar becomes the 52 px rail, the stat cards hide, the grid uses the compact columns, and toolbar buttons may drop their labels.

## State (mock → app)
- `filter`: all | active | ready | paused | failed
- `selection`: Set of job ids
- `panelJobId`: the open details panel, or null
- `dialog`: picker | add | null
- `watchClipboard`, `autoDownload`: booleans, persisted
- Picker: `selectedIds`, `page`
- Settings: `section`

Job fields used by the row: `status`, `title`, `url`, `site`, `quality`, `duration`, `thumbnailUrl`, `kind` (video | gallery | profile | playlist), `itemCount`, `progress`, `bytesDone`, `bytesTotal`, `speed`, `eta`, `filesSaved`, `retryAt`, `errorCode`, `errorReason`, `duplicateOf`, `finishedAt`, `container`.

## Copy rules
Friendly but plain. No twee lines: "Your space, your pace", "A little less friction" and similar are removed. Use the sentence case shown. Units are MB/GB; switch to MiB if the engine reports that.

## Assets
- `assets/driftfetch-icon.png`: the app icon (title bar 16 px, sidebar 40 px, popup 14 px).
- Icons are Lucide, used through `lucide-react`. Default stroke 1.75; 2 for primary button icons; 3 for checks inside checkboxes.
- The thumbnails in the mock are gradient placeholders. Use real source thumbnails, falling back to the hatched slot.

## Files
- `tokens.css`: every design token as CSS variables (dark, with light overrides).
- `DriftFetch Redesign.dc.html`: overview canvas.
  - 1a tokens, 1b components
  - 1c Downloads, 1d minimum window, 1e empty
  - 1f picker
  - 1g–1j details panel variants
  - 1k / 1k2 / 1l / 1m settings
  - 1n Add links
- `DriftFetchApp.dc.html`: the interactive app mock. Its props are `screen`, `panel`, `dialog`, `section`, `compact`, `selected` and `techOpen`. Data and copy are in the logic class: `ROWS`, `PANELS`, `SETTINGS`, `FORMATS`.
- `Icon.dc.html`: a Lucide wrapper used only in the mock.
- `support.js`: the runtime for viewing the mock files. Not needed in the app.
