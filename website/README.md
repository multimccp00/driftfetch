# DriftFetch website

Static Astro site, published to GitHub Pages. Fully separate from the desktop app (`../app`): own `package.json`, own `node_modules`, own CI workflow (`../.github/workflows/website.yml`). Nothing here is imported by the app and the app's build/tests don't touch it.

```bash
cd website
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
```

## Layout
- `src/pages/` one file per URL. `index.astro` (home) is hand-maintained; the others were generated from the design handoff by `scripts/convert-handoff.mjs` and are now ordinary pages to edit.
- `src/layouts/Layout.astro` head/SEO/JSON-LD, header, footer, tide script.
- `src/data/site.ts` version, repo, email, Buy Me a Coffee link, release file names. **Edit this first.**
- `src/scripts/tide.ts` wave edges; `src/scripts/home.ts` homepage demo.
- `public/` icons, `og.png`, `app.png` (screenshot of the app for the home page).
- Design source: `design-handoff/`.

## Deploying
Push to `main`; the workflow builds and publishes. One-time: repo Settings > Pages > Source: **GitHub Actions**.
Without a custom domain the site lives at `https://<owner>.github.io/<repo>/` (the workflow sets `BASE` for that).
For a custom domain: add `public/CNAME`, and in the workflow set `SITE=https://yourdomain` and `BASE=/`.
