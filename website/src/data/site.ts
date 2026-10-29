// Single source for values the design hard-codes on several pages.
export const site = {
  name: "DriftFetch",
  version: "0.10.6", // keep in step with ../package.json
  stage: "pre-release", // shown beside the version; set to "" for a full release
  owner: "DriftFetch contributors", // footer copyright line
  email: "driftfetch@proton.me",
  url: (import.meta.env.SITE ?? "https://driftfetch.app").replace(/\/$/, ""),
  // GitHub "owner/repo". Empty until the repo exists; links fall back to "#".
  repo: "multimccp00/driftfetch",
  bmc: "https://buymeacoffee.com/driftfetch", // Buy Me a Coffee page
};

const gh = (p: string) => (site.repo ? `https://github.com/${site.repo}${p}` : "#");
const dl = (file: string, v = site.version) => gh(`/releases/download/v${v}/${file}`);

// Checked at build time: until the current version's release exists, its download links
// open the releases page instead of a 404. The site rebuilds when a release is published.
export const released = await fetch(dl(`DriftFetch-Setup-${site.version}-x64.exe`), {
  method: "HEAD",
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
})
  .then((r) => r.status >= 200 && r.status < 400)
  .catch(() => false);
const file = (name: string, v = site.version) =>
  v === site.version && !released ? gh("/releases") : dl(name, v);

/** Direct file links for any released version (used by the earlier-versions page). */
export const versionLinks = (v: string) => ({
  installer: file(`DriftFetch-Setup-${v}-x64.exe`, v),
  portable: file(`DriftFetch-Portable-${v}-x64.exe`, v),
  source: file(`corresponding-source-${v}.zip`, v),
});

export const links = {
  source: gh(""),
  issues: gh("/issues"),
  installer: file(`DriftFetch-Setup-${site.version}-x64.exe`),
  portable: file(`DriftFetch-Portable-${site.version}-x64.exe`),
  // Source of the bundled GPL/LGPL programs (npm run sources), attached to every release.
  sourceZip: file(`corresponding-source-${site.version}.zip`),
  donate: site.bmc || "#",
};

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
/** Prefix a root-relative path with the deploy base ("/" on a custom domain, "/repo" on github.io). */
export const u = (p: string) => base + p;
