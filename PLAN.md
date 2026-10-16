# Plan

Status on 2026-10-15: the app's 254 tests pass, the type-check is clean and `npm run release:check` passes. The website builds and is live on GitHub Pages. No release has been published yet: there is no tag and no GitHub release, so the download buttons on the live site return 404.

## App

### Done
- [x] **Instagram stories** work again (gallery-dl v1.32.14 fixed story and highlight extraction).
- [x] **Misleading "Sign-in needed".** When yt-dlp wants a login but gallery-dl reads the link cleanly and lists nothing, the row now says "Nothing found" with the real possible causes. A genuine gallery-dl login failure still reports a sign-in problem. Covered by tests.
- [x] **Taskbar icon from source.** Source runs use their own taskbar identity (`local.driftfetch.app.source`) so a stale shortcut cannot override the icon. Verified on the taskbar.
- [x] **Icon files.** `resources/icon.ico` is rebuilt from the transparent `public/icon.png`, and `scripts/make-icon.ps1` no longer overwrites that PNG. The sign-in window has the icon too.
- [x] **Extension picker** opens in `app/local-extensions/`, where built extension files sit side by side.
- [x] **Contact address** is set in `SOURCE-OFFER.md` and the privacy note, and `npm run release:check` passes.
- [x] **Packaged build tested (2026-10-15).** `npm run package` and `npm run package:portable` built `DriftFetch-Setup-0.2.1-x64.exe` and `DriftFetch-Portable-0.2.1-x64.exe` (Electron 44.7.2, gallery-dl v1.32.16). Silent install creates every file; all bundled engines pass their checksum, run from the installed copy, and download and merge test media; the installed app loads from `app.asar`, runs the startup engine check ("Engines are up to date.") and shows the new setting; the silent uninstall removes the files and the Start Menu shortcut. The portable build keeps all its data in "DriftFetch data" next to the `.exe`, leaves `%APPDATA%\DriftFetch` untouched, and removes its temporary copy when it quits.
- [x] **Engine upkeep.** The in-app updater refreshes gallery-dl as well as yt-dlp, verified against each maintainer's signature. On by default it also runs at every start (Settings > Update engines automatically) and downloads only when a newer release exists; downloads wait until the check is done. The privacy note, installer page and website say so.
- [x] **Engine and Electron bump (2026-10-15).** gallery-dl v1.32.16 (its `SHA256SUMS` signature checked against the pinned key) and Electron 44.7.2. `engines.lock.json`, `SOURCE-OFFER.md` and `THIRD-PARTY-NOTICES.md` updated.
- [x] **Portable privacy text.** The privacy note (version 4, shown again once) and Settings > Privacy name the portable "DriftFetch data" folder next to the `.exe` as well as `%APPDATA%\DriftFetch`.
- [x] **Support matrix.** `app/docs/SUPPORT-MATRIX.md` uses the DriftFetch name, the 15 October 2026 source check and the 0.2.1 packaged smoke run, and has a Reddit row marked not checked yet. Settings says the sites were checked in October 2026.

### Still open
- [x] **Installer, by hand.** Checked on 2026-10-16 with no DriftFetch installed: the privacy page, "Choose Installation Options" ("Only for me" preselected), the folder-choice page (default `%LOCALAPPDATA%\Programs\DriftFetch`, Browse, space required 551.4 MB), installing and the finish page. The finish page shows `build/installerSidebar.bmp` (DriftFetch icon and name on navy); the privacy page replaces the welcome page, so the finish page is where the sidebar appears. Cancelling on the folder page leaves no folder and no uninstall entry. When testing by hand, keep the keyboard and mouse idle: the installer takes focus when it opens, and stray key presses go to its Next button and skip pages.
- [x] **Build-time gallery-dl signature.** `scripts/prepare-engines.mjs` now verifies gallery-dl's `SHA256SUMS.sig` with the pinned key, as it does for yt-dlp (checked 2026-10-16 by re-downloading both engines).
- [x] **Old name removed (2026-10-16).** No tracked file uses the old product name any more. The file types are now `.driftfetch-extension` and `.driftfetch-backup`, settings and internal codes use `DRIFTFETCH_*`, the renderer API is `window.driftfetch` and the database is `driftfetch.sqlite`. This is a clean break with no code that reads the old names, since nothing was ever released under them; the move-once migration from `%APPDATA%\Current` is gone too. The engine-output parser now slices by prefix length instead of fixed offsets. On the development PC the old install, its `%APPDATA%` folder, the old builds and `test-results/` were removed, and the local database and extension files were renamed. Git history still has the old name.
- [ ] **Local extensions.** Two extensions are built as `.driftfetch-extension` files in `app/local-extensions/` but not added in the app yet (Settings > Extensions > Add extension file). These files stay local and are never committed.
- [ ] **Smoke suite flake.** Earlier notes say about one run in three a screenshot step times out at a different check, and a rerun passes. Likely cause: Windows occlusion, where a window covered by others stops painting. Packaged runs hit it twice in a row on 2026-10-15 and passed twice once spawned with `--disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion`. Source runs do not pass these switches yet.
- [x] **Smoke suite against a packaged build.** The `enableNodeCliInspectArguments: false` fuse blocks Playwright's Electron launcher, so with `DRIFTFETCH_PACKAGED_EXE` set `scripts/smoke.mjs` now spawns the exe with `--remote-debugging-port` and drives its window through `chromium.connectOverCDP`. Packaged runs use manual intake instead of the clipboard and skip what needs the main process: cookie import, Locate file and backup export/restore (stubbed dialogs), the floating capture panel (stubbed clipboard) and the hidden-window check. Skips are printed and listed under `skipped` in `report.json`. Passed 2026-10-15 against an install of `DriftFetch-Setup-0.2.1-x64.exe`; source runs still pass 18/18.
- [ ] **Dev dependency audit.** `npm audit` flags `http-cache-semantics`, `source-map-js` and `sprintf-js` in dev dependencies. Nothing in the shipped app (`npm audit --omit=dev` is clean).
- [x] **Disk space.** Cleared on 2026-10-16: `app/test-results/` and the old build folders in `app/release/` are gone; only `release/0.2.1` is kept.
- [ ] **Queue test needs the network.** "keeps title and referer on media-file entries" waits 2 s while the queue looks up a fake `.invalid` host for real. With slow DNS (11 s on 2026-10-16) it times out, also on unchanged `main`. Stub the lookup in the test.

### Before a release
- [x] **Git history.** Two local extensions' site names in earlier commits of this file were rewritten out of the whole history with `git filter-repo --replace-text` and force-pushed on 2026-10-16 (new tip `c2838ea`; every commit hash changed, the final tree did not). Old commits stay reachable on GitHub by SHA until GitHub Support removes cached views; other clones must re-clone.
- [x] **Code signing.** Decided on 2026-10-16: ship unsigned for now, as there is no budget for a certificate. Windows SmartScreen warns on download and first run until the file builds reputation; the site FAQ explains the "More info" > "Run anyway" step. Revisit when money allows, or apply to a free code-signing programme for open-source projects.
- [ ] **Source zip.** Attach `corresponding-source-<version>.zip` (`npm run sources`) to every release. The download page credits FFmpeg and links the zip, and the earlier-versions page has a source button per version. Since 2026-10-16 the zip is written with Windows' `tar.exe`, so its paths use forward slashes; `release/0.2.1/corresponding-source-0.2.1.zip` was rebuilt that way.
- [ ] **Version sync.** Keep `app/package.json` and `website/src/data/site.ts` on the same version (both 0.2.1 now).
- [ ] **Legal review.** See `app/docs/LEGAL-RESEARCH.md`. Open questions: codec patents for stream-header parsing, how the GPL applies to yt-dlp and gallery-dl as separate programs (in particular whether pointing to upstream for the Python parts inside yt-dlp's `.exe` is enough), and site terms and anti-circumvention law. None blocks a free release; keep DRM and paywall bypass out and attach the source zip to every release.
- [x] **Product name search (2026-10-16).** No mark named DriftFetch, or combining "drift" and "fetch", at USPTO (live and dead), EUIPO, or WIPO's Global Brand Database (word search; its fuzzy and phonetic searches did not load). The web and GitHub show no other DriftFetch. Nearest marks in software classes 9/42: FETCH (Fetch Softworks, US, file-transfer software), FETCH (Amazon Technologies, EU), FETCH UP (TuneIn, EU), and DRIFT (Salesloft, US and EU, sales chat software). None names a download manager, and the combined name differs from each, so the risk looks low. This is a self-search, not a clearance opinion; national registers outside these databases were not checked one by one.
- [ ] **First release.** Publish `v<version>` on GitHub with the installer and portable files and their `.sha256` files, then check the website download buttons resolve.

## Website

### Done
- [x] **Footer owner** is "DriftFetch contributors".
- [x] **Portable wording.** The download page names the portable build as a single `.exe`.
- [x] **Accessibility.** Automated WCAG 2.2 AA checks on every page at desktop and phone width, plus keyboard and 320-pixel checks (October 2026).
- [x] **Vimeo page.** No longer says no account is needed or that password-protected videos are supported; it points to Settings › Sites & sign-ins.
- [x] **Donate page.** No longer claims donations cover hosting or a domain while both are free or not owned.
- [x] **Not released yet.** At build time the site checks whether the current version's installer exists on GitHub. Until it does, the download links open the releases page and the download, home and earlier-versions pages say the version is not released yet. The Pages workflow also runs when a release is published, so the links switch to direct downloads by themselves.
- [x] **Site pages vs reality (2026-10-16).** The YouTube page no longer promises audio-only saving (the app offers no audio-only format); it describes the quality cap and per-download format choice instead. The Reddit page says every gallery waits for a choice by default, not only large ones. The Sites page says Vimeo currently asks for a sign-in. SoundCloud and Bandcamp stay listed: the app's format fallback picks the audio stream (checked with the bundled yt-dlp).
- [x] **Tablet width.** No page scrolls sideways at 768 px, and the home page reads cleanly (2026-10-16).

### Still open
- [ ] **Images.** Refresh `app.webp` and `og.png` so they match the current UI and hero.
- [ ] **Reddit page unchecked.** Its claims match the app's code (sound joined back, galleries in a folder, galleries wait for a choice by default), but no Reddit link has been checked live; Reddit's public API refused an unsigned request on 2026-10-16.

### Decisions
- [ ] **Domain.** `driftfetch.app` is not owned, so the site stays at `multimccp00.github.io/driftfetch`. A custom domain needs `public/CNAME` and `SITE` / `BASE=/` in `.github/workflows/website.yml`.
- [ ] **Buy Me a Coffee page.** Cover image and memberships.
- [ ] **Legal and tax review.** Have an accountant or the tax office check the legal page and how donations are treated.

## Suggested order
1. Release prep: legal review if wanted (not blocking).
2. First release (with the source zip), then confirm the download buttons.
