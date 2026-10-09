# Plan

Status on 2026-10-09: the app's 241 tests pass, the website is live on GitHub Pages, and no release has been published yet. Release work is deliberately deferred until there is a full release.

## Website

### Quick fixes
- [ ] **Footer owner placeholder.** `owner` in `website/src/data/site.ts` is still `[Your name]`, and the footer shows "© 2026 [Your name]". Pick a display name (the project name is fine).
- [ ] **Download buttons 404** while there is no release. Show a "Not released yet" state, or link to the repo, until the first release exists.
- [ ] **Portable wording.** The download page says "Portable (.zip)" but the build produces a portable `.exe`. Fix the button label, the page description and the structured data.
- [ ] **Site pages vs reality.** Check the YouTube, Reddit, Vimeo and Sites pages against `app/docs/SUPPORT-MATRIX.md`, so the site claims nothing the app does not do.

### Needs checking
- [ ] **Mobile and tablet.** The hero and the new About and Extensions pages have only been viewed at desktop width.
- [ ] **Accessibility.** The legal page states WCAG 2.2 AA. Run an automated audit, or soften the claim.
- [ ] **Images.** Refresh `app.png` and `og.png` so they match the current UI and hero.

### Decisions
- [ ] **Domain.** `driftfetch.app` is not owned, so the site stays at `multimccp00.github.io/driftfetch`. A custom domain needs `public/CNAME` and `SITE` / `BASE=/` in `.github/workflows/website.yml`.
- [ ] **Buy Me a Coffee page.** Cover image and memberships. The donate page says "Covers a month of the website", which is not true while hosting is free: reword it.
- [ ] **Legal and tax review.** Have an accountant or the tax office check the legal page and how donations are treated.

## App

### Bugs and polish
- [ ] **Misleading "Sign-in needed".** When gallery-dl finds nothing or fails, the app falls back to yt-dlp's login message. Change the wording, and offer optional engine details in the details panel (raw output stays out of the shared report).
- [ ] **Taskbar icon from source.** Unconfirmed after the icon and app-ID changes. Verify in an installed build, where the exe embeds the icon.
- [ ] **Old name "Current".** Leftovers: `.current-extension`, `.currentbackup`, `CURRENT_*` settings and docs. Decide whether to rename the file types, and keep reading the old names so existing extensions and backups still load.
- [ ] **Engine upkeep.** gallery-dl is bundled and pinned (v1.32.15) and Instagram breaks it regularly, while the in-app updater only refreshes yt-dlp. Add a gallery-dl check to the bump routine, or extend the updater. Every bump also updates `app/SOURCE-OFFER.md` and `app/THIRD-PARTY-NOTICES.md`.

### Before a release
- [ ] **Packaging.** Run `npm run package` and `npm run package:portable`, then the installed-build smoke test.
- [ ] **Code signing.** Off for now, so Windows SmartScreen warns users. The site FAQ already explains the "Run anyway" step.
- [ ] **Version sync.** Keep `app/package.json` and `website/src/data/site.ts` on the same version.
- [ ] **First release.** Publish `v<version>` on GitHub with the installer and portable files, then switch the website download buttons back on.

## Suggested order
1. Website quick fixes: footer name, download buttons, portable wording.
2. App: the error message, then the rename decision.
3. Mobile and accessibility pass, plus new screenshots.
4. Domain, signing, packaging and the release, together.
