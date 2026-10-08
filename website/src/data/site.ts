// Single source for values the design hard-codes on several pages.
export const site = {
  name: "DriftFetch",
  version: "0.2.1", // keep in step with ../package.json
  owner: "[Your name]", // TODO: footer / legal notice
  email: "hello@driftfetch.app", // TODO: confirm or remove
  url: (import.meta.env.SITE ?? "https://driftfetch.app").replace(/\/$/, ""),
  // GitHub "owner/repo". Empty until the repo exists; links fall back to "#".
  repo: "multimccp00/driftfetch",
  bmc: "", // Buy Me a Coffee page, e.g. "https://buymeacoffee.com/yourname"
};

const gh = (p: string) => (site.repo ? `https://github.com/${site.repo}${p}` : "#");
const dl = (file: string) => gh(`/releases/download/v${site.version}/${file}`);

export const links = {
  source: gh(""),
  issues: gh("/issues"),
  releases: gh("/releases"),
  releaseNotes: gh(`/releases/tag/v${site.version}`),
  installer: dl(`DriftFetch-Setup-${site.version}-x64.exe`),
  portable: dl(`DriftFetch-Portable-${site.version}-x64.exe`),
  donate: site.bmc || "#",
};

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
/** Prefix a root-relative path with the deploy base ("/" on a custom domain, "/repo" on github.io). */
export const u = (p: string) => base + p;
