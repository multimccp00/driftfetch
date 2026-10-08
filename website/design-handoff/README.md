# Handoff: DriftFetch website

## Overview
The marketing website for **DriftFetch**, a free, open-source Windows app that downloads videos and image galleries automatically when the user copies a link. The site has 10 pages: a homepage with a working copy-to-download demo, a download page (installer and portable versions), a supported-sites hub plus three site pages for search traffic, an FAQ, a plain-words privacy page, a Buy Me a Coffee donation page, and one long legal page.

Look and feel: a print-style layout with no glows, gradient borders, eyebrow labels or sticky blurred nav. Full-width colour bands (navy, white, mist grey and electric blue) meet at slowly moving **wave edges**, called "the tide". One typeface, large headlines, and cyan used only as an accent.

## About the design files
The files in `pages/` are **design references built in HTML**. They show exactly how the site should look and behave; they are not production code. They use a small in-house prototype runtime (`support.js`, `.dc.html` files with `{{ }}` templates and inline styles) that should **not** ship.

Rebuild them as a **static site**. Recommended stack: **Astro** (or Eleventy) with plain CSS. Use one layout component for the header and footer, a small client script for the tide and the homepage demo, and pre-rendered HTML for every page. Static HTML matters because a big part of the brief is SEO reach. Every page needs its title, meta tags and JSON-LD in the served HTML, not injected by JavaScript.

To view a reference: serve the `pages/` folder from any local server (e.g. `npx serve pages`) and open `Home.dc.html`. Pages link to each other.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and interactions are final, so recreate them closely. Copy is final apart from the bracketed placeholders listed under *Before launch*.

---

## Global

### Page shell
- `body`: background `#f3f5fa`, ink `#010930`, `-webkit-font-smoothing: antialiased`, `html { scroll-behavior: smooth }`.
- Page root: background `#fff`, font `Schibsted Grotesk` 17px / 1.55.
- Container: `max-width: 1180px; margin: 0 auto`, side gutter `clamp(20px, 4vw, 48px)`.
- `::selection`: background `#0b67fe`, text white.
- Links: `#0a55d6`, hover `#010930`, no underline. On navy: `#5fe3ee`, hover `#fff`.
- Skip link "Skip to content" → `#main`, hidden off-screen and shown on focus (white chip, 10/14 padding, radius 6).
- Every section that takes part in the tide needs `data-tide` and a solid background. Its content wrapper needs `position: relative; z-index: 2` so the content sits above the wave canvas.

### Header (identical on every page; not sticky)
- Full-width `#010930` band, gutter padding. Inner row: `min-height: 76px`, flex, `align-items: center`, `gap: 12px 32px`, wraps, bottom rule `1px rgba(255,255,255,0.10)`.
- Left: logo link to `/` with the 28×28 icon (radius 7) and "DriftFetch" (18px / 700 / −0.02em, white).
- Right: `nav[aria-label=Main]`, flex, gap 22px, 15px / 500:
  **Sites · FAQ · Privacy · Donate · [Download]**
  - Links `#b7c1e0`, hover `#fff`. The current page's link is white with `aria-current="page"`.
  - Download is a button: height 38, padding 0 14, radius 8, `#0b67fe` (hover `#2a7bff`), white 600, with an 16px `arrow-down-to-line` icon and an 8px gap.
- **Rule:** every nav item opens a **page**. In-page jump links exist only inside page content.

### Footer (identical on every page)
- `#010930`, padding `56px gutter 40px`, 14.5px, text `#8a96bd`.
- Grid: `repeat(auto-fit, minmax(min(100%,170px), 1fr))`, gap `36px 40px`.
  1. Brand: 24px icon, "DriftFetch" 17px/800, and the line "A free, private video and image downloader for Windows."
  2. **Product**: Download · Supported sites · FAQ · Release notes
  3. **Works with**: YouTube · Reddit · Vimeo · All sites
  4. **Project**: Support DriftFetch · Source code · Report a problem · hello@driftfetch.app
  5. **Legal**: Privacy · Legal notice · Privacy policy · Terms of use · Open-source licences (the last four link to anchors on `/legal`)
- Column headings `#f2f5ff` 600; links `#8a96bd`, hover white; 8px gap.
- Bottom row (44px above, 13.5px): "© 2026 [Your name]. MIT licence." · "Not affiliated with YouTube, Reddit, Vimeo or any other site it works with." · "This site sets no cookies."

### Section rhythm
- The homepage uses 150px vertical padding (privacy and FAQ 170px top). Sub-pages use 110px. The sub-page hero is `clamp(56px,8vw,104px)` top and 120px bottom.
- **Neighbouring sections must have different backgrounds.** Otherwise no wave appears and the bands merge. Alternate between `#fff`, `#e4e9f4`, `#010930` and `#0b67fe`.
- **Cyan `#0cf3fe` is never a section background or a section border.** It appears only as:
  - the highlighter stroke under one phrase in some H2s (`.df-mark` in tokens.css)
  - icon glyphs inside navy icon tiles
  - the cyan text variant `#5fe3ee` on navy

### Reusable pieces
- **Sub-page hero**: navy. H1 `clamp(42px,6vw,84px)` / 700 / lh 1 / −0.04em, max-width 13ch, `text-wrap: balance`. Lede `clamp(18px,1.6vw,20px)` `#c7cfea`, max-width 32em, 28px above it.
- **Primary button**: height 52–54, padding `0 22–24px 0 18–20px`, radius 8–9, `#0b67fe` (hover `#2a7bff`), white 16–17px / 600, leading 18–19px icon, gap 10.
- **Ghost button (on navy)**: same size, transparent, `box-shadow: inset 0 0 0 1.5px rgba(242,245,255,0.45)`, which becomes `#fff` on hover.
- **Split block**: grid `repeat(auto-fit, minmax(min(100%,380px),1fr))`, gap `40px 72px`, with the H2 on the left and a list on the right.
- **Icon row**: flex, gap 18, padding `22px 0 24px`, top rule. 40×40 tile with radius 10: navy tile and cyan glyph on light backgrounds, `rgba(12,243,254,0.12)` tile on navy. H3 20/700, then the body.
- **Numbered steps**: 3-column auto-fit grid (min 300px), gap `32px 40px`. Each step has a top rule, the number in `#0a55d6` 15/700, an H3 22/700/−0.02em and the body in `#353d5c`.
- **Card**: radius 12, padding 28, `#fff` on mist or `#e4e9f4` on white.
- **Code block**: navy, `#c7cfea`, JetBrains Mono 14px / 1.6, padding 16/18, radius 10, horizontal scroll, `white-space: pre`.

### Icons
[Lucide](https://lucide.dev) (the references load v0.469.0 via `Icon.dc.html`). Use a build-time icon package such as `lucide-static` or `astro-icon` so no icon script loads at runtime. Default stroke width is 2.

---

## The tide (signature motion)
Wherever two neighbouring `[data-tide]` blocks have different background colours, the straight edge between them is replaced by a moving wave. Reference: `pages/tide.js` (custom element `<df-tide>`) and `drawTide()` in `Home.dc.html`.

How it works:
1. One `position: fixed` canvas covers the viewport (`pointer-events: none`, `z-index: 1`, `aria-hidden`). It is sized to the viewport × devicePixelRatio and redrawn every animation frame.
2. Each frame, walk every `[data-tide]` element in document order and read its computed background. A transparent background inherits the colour of the nearest ancestor that has one. Wherever the colour changes from one block to the next, there is an edge at `el.getBoundingClientRect().top`. Skip edges more than 140px off-screen.
3. Wave height at x for edge j:
   `y(x) = top + A·(0.62·sin(x/230 + 0.6t + 1.7j + 0.0025·scrollY) + 0.38·sin(x/97 − 0.85t + j))`, sampled every 8px.
   - `t` = seconds.
   - Amplitude `A = 22 + min(48, v·1.8)`, where v is the smoothed scroll speed in px per frame (`v = v·0.93 + |Δscroll|·0.07`). Faster scrolling makes the waves swell.
4. Fill the area above the wave with the colour above the edge (down to `top − A − 8`), and the area below it with the colour below the edge (to `top + A + 8`). The waves overlap the straight section edges, so nothing shows through.
5. With `prefers-reduced-motion: reduce`, `t = 0` and `A = 18`: the waves stay fixed and don't move.

Notes:
- The waves have no stroke or outline. The user specifically rejected a cyan line along them.
- Section content must sit above the canvas (z-index 2), but section backgrounds stay below it. That ordering is what lets the waves overlap the edges.
- Cost: one canvas and a handful of `fillPath` calls per frame. Pause the loop with `document.visibilitychange`.

---

## Pages

### 1. Home (`/`) — `Home.dc.html`
Sections in order (background colour → content):

1. **Hero** `#top` (navy)
   - **Headline:** H1 "Copy a link and it’s on your PC." at `clamp(44px,6vw,86px)` / 700, max-width 11ch.
   - **The link:** a button, 44px below the headline, that looks like selected text:
     - text `youtube.com/watch?v=aBcD123`, JetBrains Mono `clamp(17px,2vw,26px)`
     - `#0b67fe` background, white text, padding 3/6, radius 2, `user-select: text`
     - hover background `#2a7bff`
   - **Hint below the link (14px gap, 15px, `#8a96bd`):** "That’s the whole interface. Click the link, or select it and press <kbd>Ctrl</kbd>+<kbd>C</kbd>".
     - Each key: `#0e1a4a` background, radius 5, padding 2/8, `0 0 0 1px` and `0 2px 0` shadows in `rgba(255,255,255,0.16)`.
   - **After a copy:** the hint is replaced for 5 seconds by `role=status` text in `#5fcf98` with a check icon: "Copied. DriftFetch would already be saving it. It’s waiting in the demo further down."
   - **Lede (64px below, `#c7cfea`):** "DriftFetch waits in your tray. When you copy a video or gallery link, it finds the best version and saves it. No account, no ads, and nobody watching."
   - **Button and meta:** a primary button "Download for Windows" (linking to `/download`), then the line "Free and open source · Windows 10 and 11 · Version 0.2.1" in 14px `#8a96bd`.
   - **Right-hand space (≥860px):** the right ~38% of the container is intentionally empty from the hero through the status section; the text column has `padding-right: colW + 60px`. Keep the space even though there's no motion in it now. It's where the demo window sits.

2. **How it works** `#how` (white)
   - H2 "Three steps. You only do the first one." (max-width 14ch, 40px below it).
   - **List:** an `<ol>` of 3 rows. Each row has a top rule and padding 28/34. Inside: the number (`#0a55d6` 15/700), an H3 `clamp(26px,2.6vw,34px)`, and the body 18px `#353d5c` indented 34px. The rows are deliberately tight; the user asked for less space between them.
     - 01 **Copy a link**: "From your browser, a chat or an email. Anywhere Windows lets you copy. That’s your part done."
     - 02 **DriftFetch finds it**: "It checks what the link points to and picks the best quality the site offers. Albums and playlists wait for you to choose."
     - 03 **It’s on your PC**: "Saved to Downloads\DriftFetch, sorted by site. Open the file or its folder straight from the list."

3. **Try it** `#try` (`#e4e9f4`)
   - **Grid:** `minmax(0,1fr) max(380px, colW)` with a 56/60px gap. Below 860px it's one column with the demo under the links.
   - **Left column:**
     - H2 "Go on, try it on this page."
     - Text: "This page listens for copied links the way the app does. Click a link below, or select one and press Ctrl+C, and watch it land."
   - **4 link buttons:** height 48, radius 10, white background with a `rgba(1,9,48,0.18)` border that turns `#010930` on hover. Mono 13.5px with an icon and a hint:
     - `youtube.com/watch?v=aBcD123` (a video)
     - `reddit.com/r/travel/…/lisbon` (an album)
     - `vimeo.com/123456` (a video)
     - `patreon.com/posts/members-only` (needs sign-in)
   - **Right column, demo window:** a dark mini version of the app (`#0b0e17`, radius 12, shadow token `--df-shadow-demo`, Segoe UI 13px):
     - a 36px title bar
     - a "Listening for links" card with a toggle
     - a 268px list (column headings VIDEO / SOURCE, STATUS)
     - a footer with an item count and a "Clear" button
     - a toast
   - Exact styles are in the reference. Behaviour is under *Interactions*.

4. **Status** `#status` (white)
   - H2 "It tells you what’s actually going on." plus a short intro paragraph.
   - **Status list:** a `<dl>` of 5 rows. Each row has a top rule, padding 36/44, a coloured dot (11px), a `<dt>` in that status colour at `clamp(22px,2.2vw,28px)` / 700, and a `<dd>` indented 25px:
     - Downloading · 38 s left (`#00737e`)
     - Rate limited · resumes in 3:12 (`#9a5b00`)
     - Choose items · 18 images (`#0a55d6`)
     - Sign-in needed (`#b8322a`)
     - Saved · Today, 21:14 (`#1d7a4c`)
   - Copy is in the reference.

5. **App** `#app` (`#0b67fe`, white text)
   - **Heading row:** a 2-column grid with the H2 "And when you want the details, they’re all there." and a paragraph in `#e8efff`.
   - **App image:** the full app mockup at 1380×880, scaled to the container width (aspect ratio 1380/880, radius 10, `--df-shadow-shot`).
     - It's the interactive app reference (`DriftFetchApp.dc.html`). In production use a static high-resolution screenshot or video loop, with `alt` text and `loading="lazy"`.

6. **Privacy** `#privacy` (navy). Heading "No account. No ads. No tracking. …" and points; copy is in the reference.
7. **FAQ** `#faq` (white). Heading "Questions people ask", 6 Q&As, and a share block: Copy link, X, Reddit, WhatsApp and Email share URLs built from `SITE_URL` and a set message (see the reference's `shares`).
8. **Download** `#download` (navy). Heading "Let it drift in." with the main download button.

**JSON-LD** for the homepage: a `SoftwareApplication` (name, OS "Windows 10, Windows 11", category MultimediaApplication, version 0.2.1, price 0) plus `FAQPage`. Both are in the reference `<helmet>`.

### 2. Download (`/download`) — `Download.dc.html`
Sections: navy hero, then white, then mist, white, mist, and finally blue.

1. **Hero:** H1 "Download DriftFetch.", lede, then:
   - **Primary** "Download for Windows" (installer, `.exe`)
   - **Ghost** "Portable (.zip)" with a `folder-archive` icon
   - **Text link** "All releases on GitHub" (underlined by a 1px bottom border)
   - **Meta:** "Version 0.2.1 · Windows 10 and 11, 64-bit · MIT licence"
2. **"Installer or portable?"**: compares the **Installer** (installs for the current user, Start menu entry, starts with Windows, uninstall from Settings) with the **Portable** version (unzip and run from any folder or a USB stick, settings kept next to the app, delete the folder to remove it). See the reference for the exact copy.
3. **"Installing takes a minute"** (with "a minute" highlighted): 3 numbered steps — run the installer, the "Windows protected your PC" warning (More info › Run anyway), look in your tray.
4. **"Check the file"**: explains SHA-256, the PowerShell command `Get-FileHash .\DriftFetch-Setup-0.2.1.exe` (and the portable `.zip` equivalent), and checksum placeholder blocks for each file.
5. **"What you need"**: 3 icon rows — Windows 10/11 64-bit (no ARM), bundled tools (FFmpeg, yt-dlp, gallery-dl, Deno), an internet connection.
6. **Blue band:** 3 Q&As (safe? / Windows warning / uninstall), also included as `FAQPage` JSON-LD.

### 3. Sites hub (`/sites`) — `Sites.dc.html`
1. **Hero:** "Works with the sites you already use."
2. **"Most popular":** 3 mist cards (YouTube, Reddit, Vimeo) linking to the site pages. Each card has a 26px/800 name, an arrow icon and one line of text; hover background `#d8dff0`.
3. **"And many more":** a list of pills (white, radius 999, 8/14 padding) naming 12 more sites, plus links to the full yt-dlp and gallery-dl supported-sites lists.
4. **"Good to know":** sign-ins, no DRM or paywalls, and what to do when a site breaks.

### 4–6. Site pages (`/youtube`, `/reddit`, `/vimeo`) — `Sites - *.dc.html`
All three follow one template:
1. **Hero:** label "DriftFetch for {Site}" (15px / 600, `#5fe3ee`), a search-shaped H1 (e.g. "Save YouTube videos to your PC."), a lede and a download button.
2. **"How to save from {Site} in one step":** 3 steps. Step 1 shows an example URL in a mono pill.
3. **"What you can save" (mist):** 3 white cards, each with a navy icon tile.
4. **"{Site} questions":** a split block with 3 Q&As, also in `FAQPage` JSON-LD.
5. **"Also works with" (blue):** navy pill buttons linking to the other two site pages.

Each page has its own `<title>`, description, canonical URL and OG tags. To add more site pages later, copy the template; the content lives in one data object per site.

### 7. FAQ (`/faq`) — `FAQ.dc.html`
- **Hero:** "Questions people ask." with an email link.
- **4 groups:** Basics, Downloading, When something goes wrong, Privacy and safety. Each group is its own section, alternating white and mist backgrounds.
- **Group layout:** the group's H2 (`flex: 1 1 260px`) sits next to its list of `<details>`/`<summary>` accordions (`flex: 2 1 460px`).
  - Summary: 20px / 700 with a plus icon in `#0a55d6`.
  - Answer: max-width 38em.
  - Hide the default disclosure marker.
- All 14 questions are output as `FAQPage` JSON-LD.

### 8. Privacy (`/privacy`) — `Privacy.dc.html`
- **Hero:** "Your downloads are your business."
- **Then three split blocks:**
  - "Stays on your PC" (white)
  - "Leaves your PC" (mist)
  - "This website" (navy, dark icon rows)
- Ends with a link to the formal policy at `/legal#privacy`.

### 9. Donate (`/donate`) — `Donate.dc.html`
- **Hero:** "Keep DriftFetch free."
  - A Buy Me a Coffee button in yellow `#FFDD00` with navy text, 700 weight, height 56 and a coffee icon. Hover `#ffe633`.
  - Note below it: "Opens Buy Me a Coffee in a new tab…"
- **"Pick a size":** 3 cards linking to the BMC page:
  - One coffee (yellow card)
  - Three coffees
  - Every month (repeat icon)
  - Under the cards: "You choose the exact amount on the next page."
- **"Where it goes" (mist):** code signing, the website and domain, and time.
- **"No money? These help just as much.":** 4 links with a 2px navy top rule — Star on GitHub, Report a problem, Help translate, Tell a friend.
- **Blue band:** 3 Q&As (no donor perks, privacy, not tax-deductible).
- **No BMC widget or script.** The page only links out with `target=_blank rel=noopener`. This keeps the "no third-party scripts" promise.

### 10. Legal (`/legal`) — `Legal.dc.html`
- A single long document on `#f3f5fa`.
- Anchors: `#imprint`, `#privacy`, `#terms`, `#copyright`, `#accessibility`, `#licences`, `#source-offer` (the GPL/LGPL written offer for the bundled FFmpeg build).
- Same header and footer as the rest. The only wave is at the footer.
- **Needs review by a lawyer before launch.**

---

## Interactions & behaviour

### Copy detection (homepage)
- Listen for `document` `copy` events. Read `window.getSelection()` and match it against `/https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/i`; add `https://` when the scheme is missing.
- Clicking the hero link or any try-it link calls `navigator.clipboard.writeText(url)` (failures are ignored) and adds the link to the demo directly.
- Toasts:
  - "Link picked up from your clipboard" (hero link or a real copy)
  - "Link copied, and DriftFetch picked it up" (try-it buttons)
  - "Already in your list" (duplicates)
  - Each shows for 2.2 seconds.

### Demo list
- Newest items appear at the top, and the list holds at most 4. Each row has a 56×32 thumbnail, a title, the site and a quality badge, and a 150px status column.
- What happens after a link is added:

| Kind | Sequence |
|---|---|
| video (YouTube/Vimeo) | **Checking link** for 1.3 s (spinner, striped thumbnail, "Finding the best version") → **Downloading · Ns** for 4.8 s (cyan, % + 4px gradient bar `#0b67fe→#0cf3fe`) → **Saved** "512 MB · MP4" (green `#5fcf98`) |
| gallery (Reddit) | Checking (1.3 s) → **Choose items** with a "Download all 18" button → when clicked, "Saving 18 images" for 3.5 s → Saved "18 images · 96 MB" |
| locked (Patreon) | Checking (1.3 s) → **Sign-in needed** `#f2847b` "Members-only post" |
| unknown URL | Shows the raw URL in mono, the hostname as the site, then the video sequence |
| duplicate | Row at 45% opacity with the label "Already in list · Not downloaded twice" |

- Progress updates every 150 ms while any row is in progress.
- Placeholder thumbnails are gradients; see `G` in the reference. Swap in real thumbnails if you have rights to use them.
- The empty state reads "Nothing here yet" with the hint "Copy a link on the left and watch it land." "Clear" empties the list.

### Other
- **Share "Copy link":** copies the site URL; the label shows "Link copied" with a check icon for 1.8 seconds.
- **FAQ accordions:** native `<details>`, no JavaScript.
- **Hover states:** colour or shadow changes only, with no movement.
- **Focus:** keep the browser's visible focus ring, or add `outline: 2px solid #0b67fe; outline-offset: 2px`.

### Responsive
- Every page is fluid, using `clamp()` sizes and auto-fit grids.
- **Below 860px:** the homepage's empty right column collapses, the text runs full width, and the try-it demo moves below its links.
- **Header:** the nav wraps under the logo on narrow screens. A hamburger menu isn't needed with 5 items, but you may add one under about 520px.
- **Waves:** they work at every width.

### Accessibility
- Sections are `<section aria-labelledby>` with a proper heading order, and the `<main id="main">` target has a skip link.
- The wave canvas is `aria-hidden`.
- The demo's status changes are announced through the `role=status` toast.
- Reduced motion: the waves stay fixed, and the demo still works.
- Body text contrast is ≥ 4.5:1 throughout. On navy use the `#5fe3ee` cyan for text, not `#0cf3fe` on white.

---

## State (homepage only; everything else is static)
```
rows:   [{ id, sample, t0, dup:boolean, chose:timestamp|null }]   // max 4, newest first
toast:  string ('' = hidden)          // auto-clears after 2.2 s
picked: boolean                       // hero confirmation, auto-clears after 5 s
copied: boolean                       // share button, auto-clears after 1.8 s
```
A row's phase comes from `Date.now() - t0`; see the table above. A 150 ms interval re-renders while any row is in "checking" or "downloading". No data is fetched. Use a small vanilla island (Astro `client:visible`) or about 150 lines of plain JavaScript.

---

## SEO and publishing
- **Pre-render every page** as static HTML.
- **URLs:** `/`, `/download`, `/sites`, `/youtube`, `/reddit`, `/vimeo`, `/faq`, `/privacy`, `/donate`, `/legal`.
- **Head tags:** each page's `<title>`, meta description, canonical (`https://driftfetch.app/{slug}`), OG tags and JSON-LD are in its reference `<helmet>`; copy them across verbatim.
- **Theme colour:** `#010930`, set with `<meta name="theme-color">`.
- **Also add:**
  - `sitemap.xml` and `robots.txt`
  - a 1200×630 OG image (navy background, the headline and the icon)
  - `lang="en"` on `<html>`
  - favicons generated from `assets/driftfetch-icon.png`
- **No cookies, analytics, third-party scripts or embeds.** The privacy copy promises this; keep it true.
- **Fonts:** self-host Schibsted Grotesk (400/500/600/700/800 plus italic 500/600) and JetBrains Mono (400/500) as WOFF2 with `font-display: swap`. The references load Google Fonts only for prototyping; the privacy page says fonts are self-hosted.

## Before launch (placeholders and things to confirm)
- **Links still pointing to `#`:** the download links (installer `.exe`, portable `.zip`, GitHub releases), Source code, Report a problem and Release notes.
- **Text placeholders:**
  - `buymeacoffee.com/[your-name]` on the Donate page
  - `[Your name]` in the footer
  - all bracketed fields on the Legal page (name, address, host, data protection authority)
- **Checksum blocks** on the Download page: paste the real SHA-256 per release, ideally generated at build time from the release.
- **Version 0.2.1:** it's hard-coded on several pages. Keep it in one config value.
- **Claims to confirm against the app:**
  - installs without admin rights
  - no Windows on ARM support
  - a maximum-resolution setting exists
  - the engine update check can be turned off
  - YouTube audio-only downloads
  - Vimeo password prompt
  - portable mode keeps its settings next to the app
- **Email** `hello@driftfetch.app`: confirm the address or remove it.

## Design tokens
See `tokens.css` (colours, type scale, layout, radii, shadows, highlighter mark). Summary:
- **Colours:**
  - Navy `#010930`
  - Blue `#0b67fe` (hover `#2a7bff`)
  - Cyan `#0cf3fe` (accent only), `#5fe3ee` (text on navy)
  - White `#fff`, Mist `#e4e9f4`, Paper `#f3f5fa`
  - Ink `#010930` / `#353d5c` / `#596180`
  - On-navy text `#f2f5ff` / `#c7cfea` / `#8a96bd`
- **Type:** Schibsted Grotesk for everything, JetBrains Mono for URLs and code. Headlines use −0.04em tracking and `text-wrap: balance`; body text uses `text-wrap: pretty`.
- **Radii:** 2 (selected-link highlight), 5 (key caps), 8 (buttons), 10 (icon tiles, code), 12 (cards, demo window), 999 (pills).

## Assets
- `pages/assets/driftfetch-icon.png`: the app icon, used in the header and footer and as the favicon source. Generate 16/32/180/512 PNGs and a `.ico` from it.
- Icons: Lucide (names are used inline in the references, e.g. `arrow-down-to-line`, `folder-archive`, `coffee`, `shield-check`).
- Thumbnails in the demo are CSS gradients, not images.
- The app screenshot on the homepage is the live mockup; export a static image or video for production.

## Files
```
design_handoff_driftfetch_website/
  README.md            ← this document
  tokens.css           ← design tokens as CSS custom properties
  pages/
    Home.dc.html                 /            (homepage + demo + tide reference: drawTide)
    Download.dc.html             /download
    Sites.dc.html                /sites
    Sites - YouTube.dc.html      /youtube
    Sites - Reddit.dc.html       /reddit
    Sites - Vimeo.dc.html        /vimeo
    FAQ.dc.html                  /faq
    Privacy.dc.html              /privacy
    Donate.dc.html               /donate
    Legal.dc.html                /legal
    tide.js                      wave-edge renderer (portable custom element: the closest thing to production code here)
    DriftFetchApp.dc.html        app mockup embedded on the homepage
    Icon.dc.html                 Lucide icon helper (prototype only)
    support.js                   prototype runtime (do not ship)
    assets/driftfetch-icon.png
```
The app redesign itself has its own handoff in `design_handoff_driftfetch_redesign/`.
