# Audit: interface redesign

Date: 6 October 2026 · Scope: commits `26873c4` to `c8f932c` (redesign, paste instead of Add links, icon, picker fix), plus the audit fixes below.

Method: read every new and rewritten file, traced each new IPC call end to end, ran the renderer against a fake desktop API at 1380×880 and 1020×680, ran `tsc`, the unit tests, the renderer smoke and the Electron smoke suite. The Instagram and Reddit tests against live sites were **not** run: nothing in the download path changed.

## Fixed in this audit

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | The thumbnail loader followed redirects on its own, so a thumbnail address that redirected to `192.168.x.x` or `localhost` was fetched (the private-host check only looked at the first address). The collection preview had the same hole before the redesign. | Redirects are followed by hand, at most 3, each checked with `isPrivateHost`. Test added. |
| 2 | Medium | Every waiting row ran its own 1 s timer and re-rendered each second, even with no schedule set. With the 200 links a paste can add, that is 200 timers and 200 row renders a second. | A waiting row only ticks when the daily schedule is on. A countdown row always does. |
| 3 | Low | The in-app thumbnail cache had no limit; each entry is a data URL of up to 4 MB. | Capped at the newest 300. |
| 4 | Low | The Watch clipboard and Auto-download labels stopped toggling their switch when clicked (the wrapper became a `span`). | Wrapper is a `label` again. |
| 5 | Low | A file-name template without `{id}` stayed in the field after the engine refused it, so the field and the saved value disagreed. | The field reverts and the engine's message is shown. |
| 6 | Low | Dead code: an unused `Badge` component and an unused field in the list's derived data. | Removed. |
| 7 | Low | No tests for the new formatting and failure-reason helpers. | `tests/format.test.ts`. |

Fixed earlier in the session, after you reported them: picker previews stuck on "Loading preview…" (`c8f932c`), taskbar and tray icon (`8d47ae8`, `7fa5d21`).

## Open items from the first pass: all closed

| Finding | What was done |
|---|---|
| No row virtualisation | The list builds only the rows in view plus a margin once it passes 80 rows (rows are a fixed 56 px). A list of 800 renders 27 rows. `src/window.ts`, with a test. |
| Finished galleries lost their thumbnail | A chosen gallery now keeps the first item's thumbnail on the job, and the list view keeps one for older galleries whose items are still stored. Test in `tests/queue.test.ts`. |
| Thumbnails checked the host name, not what it points at | Names are resolved first and refused if any address is on the local network or the name does not resolve; redirects are checked the same way. The gap that remains is the moment between the lookup and the real connection (true DNS rebinding). Test added. |
| Radio groups had no arrow keys | Arrow keys, Home and End move through and pick a radio in Settings and in the format list; only the chosen one is a tab stop. |
| Capture popup had no thumbnail, Choose quality or Cancel | The popup shows the thumbnail and quality. With one capture it offers Choose quality (opens that download's details), Open DriftFetch and Cancel. It only acts on a download it is showing. Tests with a mocked Electron. |
| Light theme not wired | Full light palette, an Appearance setting in Settings, Advanced, App (Dark, Light, System), applied to the app and the popup. Checked on the downloads page, the details panel, the picker, Settings and the popup. |
| Group name dropped | Ctrl+Shift+V pastes with a small dialog for a group name and whether to hold the links for review. Ctrl+V still adds at once. |
| Reduced motion, high-DPI, Settings at 1020×680, packaged build | All checked. Reduced motion leaves no animations running; 1.5× scaling lays out as the narrow layout; Settings at 1020×680 had its section names hidden by the narrow-layout rule meant for the sidebar (fixed); the packaged build passes the full smoke suite. |

## Still open

| Severity | Finding | Notes |
|---|---|---|
| Low | Real keypresses were not exercised: the tests send a synthetic paste event, so Ctrl+V and Ctrl+Shift+V as typed on a keyboard are untested. | Both were tried by you with Ctrl+V earlier in the session; Ctrl+Shift+V is new. |
| Low | The Review queue list is not windowed (its rows vary in height). | Fine unless hundreds of links are held for review. |
| Low | The window shows the dark background for a moment at start when the theme is light. | |
| Info | The privacy note went to version 2, so every user sees it once more. | Intended. |

## Checked and fine

- **New IPC calls.** `open-file` only opens media extensions with the default app and otherwise reveals the file. `open-source` accepts http and https only. `job-thumbnail` takes a job id, never a URL from the window. All three go through the same sender check as the other calls.
- **Paste.** Ignored inside fields and dialogs, ignored unless the text holds an http(s) link, and capped at 200 links like before. Works with the watcher on; a link the watcher already took is reported as already in the list.
- **Accessibility.** Tabs have the tab pattern with arrow keys, dialogs and the side panel trap focus and close with Esc, icon buttons all have names, the focus ring is the cyan token, and reduced motion stops transitions and animations.
- **Rate limits** count as Active and not Failed in the tabs and the Failed badge; the countdown updates every second in the row and the panel.
- **Content security.** The page still loads nothing remote: thumbnails arrive as data URLs and fonts are system fonts.
