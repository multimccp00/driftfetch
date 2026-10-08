# Current 1.2.1 — Frontend Audit

Date: 2 October 2026 · Reviewer role: senior frontend engineer · Scope: renderer only — `src/` (`App.tsx`, `ReviewQueue.tsx`, `CollectionPreview.tsx`, `AccountsSettings.tsx`, `ExtensionsSettings.tsx`, `Popup.tsx`, `styles.css`, `popup.css`, `shared.ts`), `index.html`, `popup.html`, the preload bridges, and the uncommitted renderer changes.

Companion to the main-process audit, which covers the main process, engine, and repo hygiene. Where that audit already covers a renderer issue, this one links to it (e.g. "see AUDIT §2.4") rather than repeating it.

## Baseline

| Check | Result |
| --- | --- |
| `tsc --noEmit` | Clean |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` | 4 hits; 2 in the renderer: `ArrowDown` (`App.tsx:6`), `React` (`Popup.tsx:1`) |
| `prettier --check src index.html popup.html` | Drift in `src/App.tsx`, `popup.html` |
| Renderer tests | None. Every test targets `electron/`; no component or renderer-helper test exists |
| Unused CSS classes | `.collection-tools`, `.collection-list` (`styles.css:1155-1176`) |
| Hard-coded colours in `styles.css` | 175 unique values; 4 custom properties |
| Text at 8–9 px | 19 rules |
| ARIA live regions | 2 (toast, collection selection count) |

Overall, the UI is coherent and careful: errors are humanised, destructive bulk actions have confirmations, inputs have labels, focus-visible outlines exist, and the modal restores focus. The problems are mostly **one real text-encoding bug, a few state-sync bugs, accessibility gaps (contrast, tiny type, modal focus), and a 2,467-line component that re-renders every second.**

---

## 1. Bugs (fix first)

### 1.1 HIGH — Mojibake in the per-source rules UI
`src/App.tsx:2144` and `2251-2257` contain U+FFFD replacement characters (`�`). Users see "Set a source�s quality…" and rule summaries like `best � 0 KiB/s � 1 connection(s)`. The original `’` and `·` were lost by an encoding round-trip (most likely an editor saving as ANSI/CP-1252 and reading back as UTF-8).

**Fix:** replace with `’` and `·`. Add `"files.encoding": "utf8"` / an `.editorconfig` with `charset = utf-8`, and a cheap guard in `release:check`: `grep -rP '\x{FFFD}' src electron` must return nothing.

### 1.2 HIGH — The "Add links" textarea never receives focus
`App.tsx:1156` sets `autoFocus` on the textarea, but `Modal` (`App.tsx:1649-1658`) calls `dialogRef.current?.focus()` in a passive `useEffect`. React applies `autoFocus` during commit; the passive effect runs afterwards and moves focus to the `<section>`. Result: the user opens "Add links" and presses Ctrl+V. The textarea does not have focus, so the paste goes to the new global paste handler (the focused `<section>` is not a text field). That handler adds the links immediately and skips the group name and review options the user opened the dialog to set.

**Fix:** in `Modal`, only focus the dialog when nothing inside it already has focus:
```ts
if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
```
Or adopt native `<dialog>` (see 3.3), which honours `autofocus` itself.

### 1.3 MEDIUM — Settings drafts go stale and can overwrite newer values
`SettingsView` copies `filenameTemplate`, `speedLimitKiB`, `scheduleStart`, `scheduleEnd` into local state once (`App.tsx:1718-1723`). If settings change while the view is mounted — **Restore backup does exactly this** — the inputs keep showing the old values, and pressing "Save limit"/"Save times"/"Save template" writes the old value back over the restored one.

**Fix (smallest):** drop the four `useState` drafts and the three Save buttons. Use uncontrolled inputs that commit on blur:
```tsx
<input defaultValue={s.filenameTemplate} key={s.filenameTemplate}
       onBlur={(e) => e.target.value !== s.filenameTemplate && update({ filenameTemplate: e.target.value })} />
```
`key` remounts the input when the stored value changes, so restore is reflected. Same pattern for speed limit and the two time inputs.

### 1.4 MEDIUM — Detail and collection modals hold a copy of the job, not a reference
- `detail` is a `Job` object re-synced by an effect (`App.tsx:112-116`). Every snapshot causes a second render, and line 1245 has to look the job up *again* (`jobs.find(...) || detail`) because the copy can be a frame stale.
- `collection` is a `Job` copy that is **never** re-synced (`App.tsx:97, 240-247`). If the job is removed, cleared via "Clear list", or auto-selected while the modal is open, the modal stays up and "Confirm" calls `selectCollection` on a job that no longer exists.

**Fix:** store ids, derive the job:
```ts
const [detailId, setDetailId] = useState<string>();
const detail = jobs.find((j) => j.id === detailId);
```
The sync effect and the line-1245 lookup disappear; the modal closes itself when the job is gone. Same for `collectionId`.

### 1.5 MEDIUM — Bulk actions on the History page are the Downloads actions
When rows are selected on History, the toolbar shows **Start / Pause / Cancel** (`App.tsx:677-701`), which are meaningless for completed, cancelled and duplicate entries. There is no bulk **Remove** (the only per-row path is details → Remove from list, one at a time), so cleaning up history means either one-by-one or "Clear all history".

**Fix:** on History, show `Remove selected` (`act(selected, "remove")`) and `Download again`; keep Start/Pause/Cancel for Downloads only.

### 1.6 MEDIUM — Details modal shows actions that do not apply to the status
`App.tsx:1506-1552`: "Download again" and "Cancel download" are shown for every status. "Cancel" on a completed or cancelled job does nothing visible; "Download again" on a job that is currently downloading creates a parallel duplicate. Gate them:
- Cancel: `downloading | processing | queued | resolving | paused | review`
- Download again: terminal statuses + `failed`

### 1.7 MEDIUM — Backup export has no password confirmation
`App.tsx:1828-1853`. The UI states the password "cannot be recovered", yet export takes a single password field. One typo produces a backup nobody can restore. Add a "Confirm password" field required for **export** only.

### 1.8 LOW — Smaller correctness issues
- **Toast timer does not restart for repeated messages.** `setToast(sameText)` is a no-op, so the 6.5 s timer is not extended and screen readers do not re-announce. Store `{ id, text }` (`id: Date.now()`).
- **Errors and successes share one toast style** with a `CircleHelp` icon and auto-dismiss after 6.5 s. Long failure messages (e.g. backup restore, engine update) vanish before they can be read. Add an `error` variant that stays until dismissed.
- **Per-source rule "Save" clears the form before the save resolves** (`App.tsx:2239-2240`), so a rejected save loses the input. Move the reset into the `execute` callback after `await`. Also only `source`/`folder` reset; quality, speed, connections, auto stay from the previous rule.
- **`checkFiles` effect is unguarded** (`App.tsx:109`): `window.current.checkFiles()` throws synchronously when the preload is absent (Vite dev in a plain browser), before `.catch` attaches. The sidebar is clickable while "Connecting…" is shown, so clicking History crashes the tree. Use `window.current?.checkFiles()`.
- **"Quit Current" and the title-bar buttons** call `window.current.windowAction(...)` without `execute`, so a rejection is an unhandled promise.
- **Status text is inconsistent:** the capture log (`App.tsx:438`) and details modal (`App.tsx:1245`) use `labels[status]` instead of `label(job)`, so image galleries show "Choose videos" there. Popup `names` (`Popup.tsx:22-35`) uses different words for the same states ("Queued" vs "In queue", "Downloaded" vs "Completed"). Export one `statusLabel(job)` from `shared.ts` and use it in all three places.
- **Escape inside an enlarged collection preview closes the whole modal** (`CollectionPreview.tsx:126-138`), not just the enlarged image. Handle Escape in `CollectionPreview` when `large` is set and `stopPropagation`.
- **History search placeholder** says "Search downloads…" on the History page.
- **Select-all checkbox has no indeterminate state** when some rows are selected (`App.tsx:736-748`). Set `ref.indeterminate`.

---

## 2. Accessibility

### 2.1 HIGH — Contrast and type size fail WCAG AA in the main table
19 rules render text at **8–9 px** (`.table-head` 8 px, `.eta` 8 px, `.quality-pill` 8 px, `.video-meta` 9 px, `.size-cell span` 9 px, `.text-link` 9 px, `.queue-footer` 9 px, …). Several of them also use dim greys:

| Colour | Used by (line) | On `#101216` | On `#171a20` |
| --- | --- | --- | --- |
| `#535d69` | `.titlebar-name span` (108) | 2.80 | 2.60 |
| `#56636e` | `.version` (261) | 3.04 | 2.83 |
| `#64717a` | (244) | 3.74 | 3.47 |
| `#677585` / `#68717f` / `#6c7685` | stat labels, nav caption (174, 454, 529) | 3.8–4.1 | 3.5–3.8 |
| `#697b85` | `.eta` (708) | 4.26 | 3.96 |
| `--muted #858d99` | — | 5.60 | 5.20 |

AA needs 4.5:1 for body text. Everything above except `--muted` fails, and at 8–9 px even 4.5:1 is hard to read on a 1080p panel at 100 % scaling.

**Fix:** set a floor of **11 px** for meta text and 10 px for uppercase labels, and replace the dim greys with `var(--muted)` (already 5.6:1). This is a find-and-replace, not a redesign.

### 2.2 MEDIUM — Modal is not a real modal for keyboard users
`Modal` (`App.tsx:1635-1694`) has `role="dialog" aria-modal="true"` but:
- **No focus trap.** Tab from the last button walks into the page behind.
- Background is not `inert`.
- `aria-label={title}` instead of `aria-labelledby` pointing at the visible `<h2>`; subtitle is not `aria-describedby`.
- The Escape listener is on `document` and re-subscribes on every render (inline `close` arrow, and `App` renders every second).

**Fix (native, less code):** render `<dialog>` and call `showModal()` in an effect. The browser provides focus trapping, `inert` background, Escape (`onCancel`), `::backdrop`, and honours `autofocus` (fixes 1.2). The custom Escape listener and focus-restore logic can go; keep only the backdrop-click close.

### 2.3 MEDIUM — Missing semantics on interactive widgets
- **Queue filter tabs and Settings tabs** (`App.tsx:544-583`, `1739-1757`) are plain buttons with an `active` class. Add `aria-pressed={filter === key}` (simplest correct pattern for a filter bar) or the full `role="tablist"/"tab"` + `aria-selected` for Settings.
- **Sidebar nav** has no `aria-current="page"` on the active item (`Nav`, `App.tsx:1576`).
- **Progress bars** (`App.tsx:862-864`) are a bare `<i>` with a width. Add `role="progressbar" aria-valuenow={Math.floor(job.progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`${job.title} progress`}`.
- **Icon-only row buttons** use `title` only (`App.tsx:918-975`, account/extension/rule trash buttons). Chromium falls back to `title` for the name, but add `aria-label` so the name is explicit and per-row (`"Pause ${job.title}"`) — otherwise a screen reader hears ten identical "Pause" buttons.
- **Status changes are silent.** A download completing or failing is not announced. A single visually hidden `aria-live="polite"` region fed by the existing completion tracker events would cover it.

### 2.4 LOW
- **Reorder is drag-only.** "Download next" covers the most common case, but there is no keyboard way to move an item down. Acceptable; if needed, add Alt+↑/↓ on the focused row calling the existing `reorder` IPC.
- **No `prefers-reduced-motion`** handling for the infinite `rotate`, `pulse` (`styles.css:704, 1218`) and popup `blink` (`popup.css:50`) animations. Add:
  ```css
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
  ```
- `popup.html` has no `lang` attribute (`index.html` does).
- Maximise button always shows the "maximise" square; it does not switch to "restore" when maximised.

---

## 3. Performance (renderer)

The AUDIT §2.1 snapshot-size and §2.4 one-second re-render findings are the biggest renderer costs; fix those first. Additional renderer-only items:

### 3.1 Derived data is recomputed on every tick
Because `App` re-renders every second (AUDIT §2.4), everything outside the single `useMemo` runs once a second over the full job list: `active`, `queueJobs`, `completed`, `attention`, the review count (`App.tsx:291`), the "IN QUEUE" count (`504-514`), the source `<option>` set (`609`), the Clear list / Pause all predicates (`648-657`, `707-729` — the Pause-all filter is written twice), and the capture log's `jobs.find` per capture (`416`, 100 × n).

**Fix:** one `useMemo([state])` that walks `jobs` once and returns counts, the source list, and a `Map<id, Job>` for the capture log and the detail/collection lookups in 1.4.

### 3.2 Extract `JobRow` and memoise it
Each row's markup is ~220 lines inline in `App` (`App.tsx:755-978`). Extracting `JobRow` (props: `job`, `selected`, `draggable`, callbacks) and wrapping it in `React.memo` means a progress update for one job re-renders one row, not all of them. Pair with the `RetryCountdown` component from AUDIT §2.4 so `now` never reaches the list. Hold selection in a `Set` (AUDIT §2.4).

### 3.3 Collection preview refetches every page
`CollectionPreview.tsx:39-57` clears the thumbnail cache (`setImages({})`) whenever `visible` changes. Paging forward and back re-requests the same thumbnails over IPC, and every keystroke in the search box cancels and restarts the fetch. Keep `images` across pages and only fetch entries without a cached value. Optional: debounce search by ~150 ms for 10k+ entry image galleries.

Also `const entries = job.entries || []` creates a new array each render when `entries` is undefined, defeating both `useMemo`s. Use a module-level `const EMPTY: Entry[] = []`.

---

## 4. Styling and design system

- **175 unique hard-coded colours, 4 custom properties.** Many are near-duplicates (`#181d24`, `#181e24`, `#171a20`; `#2b333b`, `#272c33`, `#282d35`, `#30353f`, `#303840`). Collapse into ~12 tokens (`--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-2`, `--muted`, `--accent`, `--warn`, `--danger`, `--success`). This is mechanical and makes 2.1 a one-place fix.
- **Dead media queries.** `@media (max-width: 750px)` and `(max-width: 850px)` (`styles.css:1577-1586`) can never match: the window has `minWidth: 1020` (`electron/main.ts:178`). Delete them.
- **Magic layout numbers.** `.job-list { max-height: max(220px, calc(100vh - 595px)) }` (and the 1180 px override) hard-code the height of everything above the list. Any change to the header, stats or notices breaks the list height. Make `main` a flex column and give the list `flex: 1; min-height: 0; overflow: auto`.
- **`font-family: Inter`** is declared first but never bundled, and the CSP blocks remote fonts. Everyone gets Segoe UI. Either drop `Inter` from the stack or ship it as a local `@font-face`.
- **Units are inconsistent.** `bytes()` (`App.tsx:66-70`) divides by 1024 but labels "KB/MB/GB"; `ReviewQueue.tsx:105` prints "MiB"; Settings say "KiB per second". Pick binary units (`KiB/MiB/GiB`) everywhere, and use `bytes()` in `ReviewQueue` instead of its own formatter.
- **Two modal widths only** (`modal`, `collection-modal` via `wide`). Fine; no change needed.

---

## 5. UX and content

- **Destructive actions without confirmation or undo:** Remove from list (details), Remove session (Accounts — forces a fresh sign-in), Remove extension, Remove source rule, Clear captures log. Clear history and Clear list already confirm. Cheapest fix: an "Undo" button in the toast for Remove from list; a confirm for session removal.
- **Compatibility tab is hard-coded and undated** (`App.tsx:1769-1812`). The intro says "real, dated checks", but no date is shown and the data is frozen in JSX. Show the check date, or move the table to `docs/SUPPORT-MATRIX.md` and link to it.
- **Two different "queue" numbers.** Sidebar "Downloads" count = all non-terminal jobs (includes downloading and failed); the "IN QUEUE" stat excludes both. Users see e.g. sidebar 7, stat 03. Either label the stat "WAITING" or use the same count.
- **Per-source rules cannot be edited**, only re-saved under the same domain. An "Edit" button that loads the rule into the form (as Accounts → Update already does) costs ~10 lines.
- **Ctrl+V paste vs. clipboard watcher** — see AUDIT §1.5. Also, with 1.2 unfixed, Ctrl+V inside the open "Add links" dialog goes to the global handler and bypasses the dialog's group/review options.
- **Bulk "Select visible" in Review queue silently caps at 500** (`ReviewQueue.tsx:44-50`). The count is shown on the Start button, but say so: "Select visible (first 500)". There is also no "Clear selection".

---

## 6. Unused, dead, and duplicated code (renderer)

| Location | What | Action |
| --- | --- | --- |
| `src/App.tsx:6` | `ArrowDown` import unused | Delete |
| `src/Popup.tsx:1` | `React` default import unused (`jsx: react-jsx`) | Delete |
| `src/styles.css:1155-1176` | `.collection-tools`, `.collection-list` (+ `label`) unused | Delete (also in AUDIT §3) |
| `src/styles.css:1577-1586` | Media queries below the window's `minWidth` | Delete |
| `src/App.tsx:112-116, 1245` | Detail re-sync effect + redundant lookup | Replace with derived `detailId` (1.4) |
| `src/App.tsx:168-170, 192-194` | Identical "N links added · M already…" string | One `addedMessage(result)` helper |
| `src/App.tsx:1713` | `await execute(async () => {}, message)` — nested `execute` used only to show a toast | Return `message` from the work function, or call `setToast` via a passed `notify` prop |
| `src/App.tsx` (×4), `ReviewQueue` | Status sets re-declared inline: `["queued","review","paused","failed"]` ×4, `["downloading","processing","queued","resolving"]` ×3, `["downloading","processing"]` ×3 | Named `Set`s in `shared.ts`: `REORDERABLE`, `PAUSABLE`, `ACTIVE` |
| `src/App.tsx:1478-1486`, `ReviewQueue.tsx:130-135` | Two format-option renderers with different text | One `formatLabel(f)` |
| `src/App.tsx:48-64`, `Popup.tsx:22-35` | Two status-label maps | One `statusLabel(job)` (1.8) |
| `src/App.tsx:224-226`, `ReviewQueue.tsx:17-26` | Search filter `${title} ${source}`.toLowerCase().includes(...)` written 3× | `matches(job, query)` helper |
| `src/shared.ts` `Job.duplicateOf` | Never read in the UI | Show "Duplicate of …" in details, or delete (AUDIT §3) |
| `popup.html` CSP | Missing `object-src 'none'; base-uri 'none'` that `index.html` has | Align |

Non-renderer hits from the same `--noUnusedLocals` run: `path` in `electron/queue.ts:3`, `imageSearchJob` in `tests/core.test.ts:18`.

---

## 7. Structure

- **`App.tsx` is 2,467 lines** (AUDIT §4). Concrete split, pure moves, no behaviour change:
  1. `SettingsView` + `Setting` → `src/SettingsView.tsx` (~770 lines).
  2. Details modal body → `src/JobDetails.tsx` (~320 lines).
  3. `JobRow` → `src/JobRow.tsx` (~220 lines, memoised — 3.2).
  4. `Modal`, `Switch`, `Stat`, `Nav` → `src/ui.tsx`.
  5. `bytes`, `time`, `statusLabel`, status sets, `formatLabel` → `src/format.ts`.

  `App.tsx` ends up ~800 lines of page composition.
- **Prop drilling of `execute`** into five components is fine at this size. A context is not needed yet.
- **Renderer imports `electron/diagnostics`, `electron/quality`, `electron/transfer-policy`** — see AUDIT §4; move pure modules beside `shared.ts`.
- **No renderer tests.** Don't add React Testing Library for this. After step 5 above, one `tests/format.test.ts` covering `bytes`, `time`, `statusLabel` and the visible-jobs filter catches the regressions that matter (e.g. 1.8's label mismatch) with zero new dependencies.

---

## 8. Suggested order

1. **1.1 mojibake** + encoding guard (minutes).
2. **1.2 modal focus** — or go straight to native `<dialog>` (2.2), which fixes both.
3. **1.3 stale settings drafts**, **1.4 derive detail/collection by id**, **1.7 backup password confirm**.
4. **2.1 contrast + minimum font size** (with the colour tokens from §4, one pass).
5. **1.5 / 1.6** status-aware actions (History bulk remove, details buttons).
6. §6 dead-code sweep + `prettier --write` + enable `noUnusedLocals`.
7. §7 file split, then 3.1/3.2 memoised rows and derived counts.
8. Remaining ARIA (2.3) and UX items (§5).
