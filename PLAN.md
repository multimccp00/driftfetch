# Plan

Status on 2026-10-09: the app's 244 tests pass and the type-check is clean. The website is live on GitHub Pages. No release has been published yet, and release work is deferred until the app is ready. The app comes first; the website items wait.

## App

### Done
- [x] **Instagram stories** work again: the bundled gallery-dl is pinned to v1.32.15 (v1.32.14 fixed story and highlight extraction).
- [x] **Misleading "Sign-in needed".** When yt-dlp wants a login but gallery-dl reads the link cleanly and lists nothing, the row now says "Nothing found" with the real possible causes. A genuine gallery-dl login failure still reports a sign-in problem. Covered by tests.
- [x] **Taskbar icon from source.** Source runs use their own taskbar identity (`local.driftfetch.app.source`) so a stale shortcut cannot override the icon. Verified on the taskbar.
- [x] **Icon files.** `resources/icon.ico` is rebuilt from the transparent `public/icon.png`, and `scripts/make-icon.ps1` no longer overwrites that PNG. The sign-in window has the icon too.
- [x] **Extension picker** opens in `app/local-extensions/`, where built extension files sit side by side.
- [x] **Contact address** is set in `SOURCE-OFFER.md` and the privacy note, and `npm run release:check` passes.

### Still open
- [ ] **Test an installed build.** Nothing has been packaged since these changes. Unverified: the NSIS installer end to end, the privacy page in the installer, the sandboxed extension host in a packaged app, `openpgp` inside `app.asar`, and the icon in a packaged build. Run `npm run package`, install it, and click through.
- [ ] **Engine upkeep.** gallery-dl is bundled and pinned, Instagram breaks it regularly, and the in-app updater only refreshes yt-dlp. Either extend the updater to cover gallery-dl or keep a bump routine. Every bump also updates `app/SOURCE-OFFER.md` and `app/THIRD-PARTY-NOTICES.md`.
- [ ] **Old name "Current".** The `.current-extension` and `.currentbackup` file types, `CURRENT_*` settings and internal error codes keep the old name. Nothing visible leaks into the UI. Decide whether to rename, and keep reading the old names so existing extensions and backups still load.
- [ ] **Extensions.** `booru-search` and `pornpics` are built as `.current-extension` files in `app/local-extensions/` but not added in the app yet (Settings > Extensions > Add extension file). These files stay local and are never committed.
- [ ] **Smoke suite flake.** About one run in three, a screenshot step times out at a different check, and a rerun passes. Suspected environmental, not proven.
- [ ] **Disk space.** `app/release/` and `app/test-results/` are git-ignored but take around 34 GB. Keep the last two releases and clear the rest.

### Before a release
- [ ] **Code signing.** Off for now, so Windows SmartScreen warns users. A certificate has to be bought. The site FAQ already explains the "Run anyway" step.
- [ ] **Source zip.** Attach `corresponding-source-<version>.zip` (`npm run sources`) to every release, and credit FFmpeg on the download page.
- [ ] **Version sync.** Keep `app/package.json` and `website/src/data/site.ts` on the same version.
- [ ] **Legal review.** See `app/docs/LEGAL-RESEARCH.md`. Open questions: codec patents for stream-header parsing, how the GPL applies to yt-dlp and gallery-dl as separate programs, site terms and anti-circumvention law, the product name.
- [ ] **First release.** Publish `v<version>` on GitHub with the installer and portable files, then switch the website download buttons back on.

## Website

Not started until the app is ready.

### Quick fixes
- [ ] **Footer owner placeholder.** `owner` in `website/src/data/site.ts` is still `[Your name]`, and the footer shows "© 2026 [Your name]". Pick a display name (the project name is fine).
- [ ] **Download buttons 404** while there is no release. Show a "Not released yet" state, or link to the repo, until the first release exists.
- [ ] **Portable wording.** The download page says "Portable (.zip)" but the build produces a portable `.exe`. Fix the button label, the page description and the structured data.
- [ ] **Site pages vs reality.** Check the YouTube, Reddit, Vimeo and Sites pages against `app/docs/SUPPORT-MATRIX.md`, so the site claims nothing the app does not do.

### Needs checking
- [ ] **Mobile and tablet.** The hero and the About and Extensions pages have only been viewed at desktop width.
- [ ] **Accessibility.** The legal page states WCAG 2.2 AA. Run an automated audit, or soften the claim.
- [ ] **Images.** Refresh `app.png` and `og.png` so they match the current UI and hero.

### Decisions
- [ ] **Domain.** `driftfetch.app` is not owned, so the site stays at `multimccp00.github.io/driftfetch`. A custom domain needs `public/CNAME` and `SITE` / `BASE=/` in `.github/workflows/website.yml`.
- [ ] **Buy Me a Coffee page.** Cover image and memberships. The donate page says "Covers a month of the website", which is not true while hosting is free: reword it.
- [ ] **Legal and tax review.** Have an accountant or the tax office check the legal page and how donations are treated.

## Suggested order
1. App: package once and test the installer and the packaged icon.
2. App: decide the rename, then sort out engine upkeep.
3. App: add the two extensions, look into the smoke-suite flake.
4. Release prep: signing, source zip, version sync, legal review.
5. Website: quick fixes, then the mobile and accessibility pass, then the first release and the download buttons.
