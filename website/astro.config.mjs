import { defineConfig } from "astro/config";

// SITE / BASE come from the Pages workflow. Defaults match the future custom domain.
// GitHub Pages project site: SITE=https://<user>.github.io  BASE=/<repo>
export default defineConfig({
  site: process.env.SITE ?? "https://driftfetch.app",
  base: process.env.BASE ?? "/",
  trailingSlash: "ignore",
  build: { format: "file" },
  devToolbar: { enabled: false },
});
