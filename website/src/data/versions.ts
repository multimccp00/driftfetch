// Newest first. To publish a release: add an entry here, and bump `version` in site.ts.
// Old entries stay so people can still get an earlier build; the files live in the GitHub release for that tag.
export type Release = { version: string; date?: string; notes: string[] };

export const releases: Release[] = [
  {
    version: "0.10.6",
    notes: [
      "Instagram: daily request cap, with today's count and usage bar shown per sign-in.",
      "Instagram: private profiles can be reached through a dedicated sign-in.",
      "Instagram: reels are built from the reels list; profile downloads stop at the daily limit.",
      "Profiles: a failed part keeps the files already saved, and cut-off parts resume.",
      "Fixes: the link popup shows when the window is minimized or in the tray; pasting links works while the details panel is open.",
    ],
  },
  { version: "0.9.0", notes: ["First public pre-release. Please report problems on GitHub."] },
];
