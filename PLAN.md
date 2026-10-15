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
- [x] **Packaged build tested (2026-10-09).** `npm run package` built `DriftFetch-Setup-0.2.1-x64.exe`; silent install, bundled engines, smoke suite 18/18, extension sandbox, taskbar icon and uninstaller all checked. This build is now out of date (see "Repackage and retest").
- [x] **Engine upkeep.** The in-app updater refreshes gallery-dl as well as yt-dlp, verified against each maintainer's signature.
- [x] **Engine and Electron bump (2026-10-15).** gallery-dl v1.32.16 (its `SHA256SUMS` signature checked against the pinned key) and Electron 44.7.2. `engines.lock.json`, `SOURCE-OFFER.md` and `THIRD-PARTY-NOTICES.md` updated.

### Still open
- [ ] **Repackage and retest.** The 2026-10-09 installer predates the 2026-10-15 work: portable data beside the `.exe`, the gallery-dl updater, encrypted sign-in cookies, the extension engine-option fix, the capture-popup notifications, and the gallery-dl and Electron bumps. Run `npm run package` and `npm run package:portable`, then repeat the installed-build checks, including a portable run that keeps its data next to the `.exe`.
- [ ] **Installer, by hand.** Not looked at by eye: the license/privacy page the installer shows and the wizard pages, because the test installs silently. Click through the real installer once.
- [ ] **Portable privacy text.** Settings > Privacy says everything stays in `%APPDATA%\DriftFetch`. A portable copy now keeps its data beside the `.exe`, so the text should name the real folder.
- [ ] **Support matrix.** `app/docs/SUPPORT-MATRIX.md` still says "Current" and cites "packaged smoke 0.5.9". Refresh it from the latest `npm run test:sources` run (2026-10-15: Vimeo needs a signed-in session, TED and Rumble need attention).
- [ ] **Build-time gallery-dl signature.** `scripts/prepare-engines.mjs` checks gallery-dl against `SHA256SUMS` only. The app already verifies `SHA256SUMS.sig`; the build script could do the same, as it does for yt-dlp.
- [ ] **Old name "Current".** The `.current-extension` and `.currentbackup` file types, `CURRENT_*` settings and internal error codes keep the old name. Nothing visible leaks into the UI. Decide whether to rename, and keep reading the old names so existing extensions and backups still load.
- [ ] **Local extensions.** Two extensions are built as `.current-extension` files in `app/local-extensions/` but not added in the app yet (Settings > Extensions > Add extension file). These files stay local and are never committed.
- [ ] **Smoke suite flake.** Earlier notes say about one run in three a screenshot step times out at a different check, and a rerun passes. Still suspected environmental and unproven.
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
1. App: repackage, retest the installed and portable builds, click through the installer.
2. App: portable privacy text and the support matrix.
3. Website: download-button state and the site-page check.
4. Release prep: git history decision, signing, source zip, legal review.
5. First release, then confirm the download buttons.
