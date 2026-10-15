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
- [x] **Packaged build tested (2026-10-15).** `npm run package` and `npm run package:portable` built `DriftFetch-Setup-0.2.1-x64.exe` and `DriftFetch-Portable-0.2.1-x64.exe` (Electron 44.7.2, gallery-dl v1.32.16). Silent install creates every file; all bundled engines pass their checksum, run from the installed copy, and download and merge test media; the installed app loads from `app.asar`, runs the startup engine check ("Engines are up to date.") and shows the new setting; the silent uninstall removes the files and the Start Menu shortcut. The portable build keeps all its data in "DriftFetch data" next to the `.exe`, leaves `%APPDATA%DriftFetch` untouched, and removes its temporary copy when it quits.
- [x] **Engine upkeep.** The in-app updater refreshes gallery-dl as well as yt-dlp, verified against each maintainer's signature. On by default it also runs at every start (Settings > Update engines automatically) and downloads only when a newer release exists; downloads wait until the check is done. The privacy note, installer page and website say so.
- [x] **Engine and Electron bump (2026-10-15).** gallery-dl v1.32.16 (its `SHA256SUMS` signature checked against the pinned key) and Electron 44.7.2. `engines.lock.json`, `SOURCE-OFFER.md` and `THIRD-PARTY-NOTICES.md` updated.
- [x] **Portable privacy text.** The privacy note (version 4, shown again once) and Settings > Privacy name the portable "DriftFetch data" folder next to the `.exe` as well as `%APPDATA%\DriftFetch`.

### Still open
- [ ] **Installer, by hand.** Not looked at by eye: the privacy page the installer shows and the wizard pages, because the tests install silently. Click through the real installer once. While there: `build/installer.nsh` `customInit` creates the default folder (`%LOCALAPPDATA%ProgramsDriftFetch`) as soon as the wizard opens, so cancelling, or choosing another folder, leaves an empty folder behind.
- [ ] **Support matrix.** `app/docs/SUPPORT-MATRIX.md` still says "Current" and cites "packaged smoke 0.5.9". Refresh it from the latest `npm run test:sources` run (2026-10-15: Vimeo needs a signed-in session, TED and Rumble need attention).
- [ ] **Build-time gallery-dl signature.** `scripts/prepare-engines.mjs` checks gallery-dl against `SHA256SUMS` only. The app already verifies `SHA256SUMS.sig`; the build script could do the same, as it does for yt-dlp.
- [ ] **Old name "Current".** The `.current-extension` and `.currentbackup` file types, `CURRENT_*` settings and internal error codes keep the old name. Nothing visible leaks into the UI. Decide whether to rename, and keep reading the old names so existing extensions and backups still load.
- [ ] **Local extensions.** Two extensions are built as `.current-extension` files in `app/local-extensions/` but not added in the app yet (Settings > Extensions > Add extension file). These files stay local and are never committed.
- [ ] **Smoke suite flake.** Earlier notes say about one run in three a screenshot step times out at a different check, and a rerun passes. Still suspected environmental and unproven.
- [ ] **Smoke suite against a packaged build.** `CURRENT_PACKAGED_EXE` no longer works: the `enableNodeCliInspectArguments: false` fuse (2026-10-15) blocks the `--inspect` flag Playwright's Electron launcher needs, so `electron.launch` times out. Packaged builds can still be driven through `--remote-debugging-port` and `chromium.connectOverCDP` (used for the 2026-10-15 check); move the smoke suite to that, or keep it for source runs only.
- [ ] **Dev dependency audit.** `npm audit` flags `http-cache-semantics`, `source-map-js` and `sprintf-js` in dev dependencies. Nothing in the shipped app (`npm audit --omit=dev` is clean).
- [ ] **Disk space.** `app/release/` (6 GB) and `app/test-results/` (17 GB) are git-ignored. Keep the last two releases and clear the rest.

### Before a release
- [ ] **Git history.** An earlier commit of this file (`df0193a`) names one of the local extensions' sites, and the repo is public. Rewriting history is a separate decision.
- [ ] **Code signing.** Off for now, so Windows SmartScreen warns users. A certificate has to be bought. The site FAQ already explains the "Run anyway" step.
- [ ] **Source zip.** Attach `corresponding-source-<version>.zip` (`npm run sources`) to every release, and credit FFmpeg on the download page.
- [ ] **Version sync.** Keep `app/package.json` and `website/src/data/site.ts` on the same version (both 0.2.1 now).
- [ ] **Legal review.** See `app/docs/LEGAL-RESEARCH.md`. Open questions: codec patents for stream-header parsing, how the GPL applies to yt-dlp and gallery-dl as separate programs, site terms and anti-circumvention law, the product name.
- [ ] **First release.** Publish `v<version>` on GitHub with the installer and portable files and their `.sha256` files, then check the website download buttons resolve.

## Website

### Done
- [x] **Footer owner** is "DriftFetch contributors".
- [x] **Portable wording.** The download page names the portable build as a single `.exe`.
- [x] **Accessibility.** Automated WCAG 2.2 AA checks on every page at desktop and phone width, plus keyboard and 320-pixel checks (October 2026).
- [x] **Vimeo page.** No longer says no account is needed or that password-protected videos are supported; it points to Settings › Sites & sign-ins.
- [x] **Donate page.** No longer claims donations cover hosting or a domain while both are free or not owned.

### Still open
- [ ] **Download buttons 404** while there is no release. Show a "Not released yet" state, or link to the repo, until the first release exists.
- [ ] **Site pages vs reality.** Check the YouTube, Reddit and Sites pages against the refreshed support matrix.
- [ ] **Tablet width.** Phone and desktop were checked; tablet was not.
- [ ] **Images.** Refresh `app.webp` and `og.png` so they match the current UI and hero.

### Decisions
- [ ] **Domain.** `driftfetch.app` is not owned, so the site stays at `multimccp00.github.io/driftfetch`. A custom domain needs `public/CNAME` and `SITE` / `BASE=/` in `.github/workflows/website.yml`.
- [ ] **Buy Me a Coffee page.** Cover image and memberships.
- [ ] **Legal and tax review.** Have an accountant or the tax office check the legal page and how donations are treated.

## Suggested order
1. App: click through the installer by hand; decide how the smoke suite drives packaged builds.
2. App: portable privacy text and the support matrix.
3. Website: download-button state and the site-page check.
4. Release prep: git history decision, signing, source zip, legal review.
5. First release, then confirm the download buttons.
