// Newest first. To publish a release: add an entry here, and bump `version` in site.ts.
// Old entries stay so people can still get an earlier build; the files live in the GitHub release for that tag.
export type Release = { version: string; date?: string; notes: string[] };

export const releases: Release[] = [
  {
    version: "0.10.17",
    notes: [
      "A file a site refuses no longer shows as a sign-in problem. The row says the site refused access, and Retry is the main button.",
      "The link popup now recovers by itself if its window stops working, instead of staying blank until you restart DriftFetch.",
    ],
  },
  {
    version: "0.10.16",
    notes: [
      "A link with many files now lists all of them, not just the first 100.",
      "When a site rate limits a large listing, DriftFetch lets the download engine wait out the limit and carry on, for up to 30 minutes, instead of restarting the read.",
    ],
  },
  {
    version: "0.10.15",
    notes: [
      "Link checks: when a site answers with a rate limit, DriftFetch shows that reason right away instead of timing out after two minutes.",
    ],
  },
  {
    version: "0.10.14",
    notes: [
      "Links held by the daily Instagram limit have a Download anyway button.",
      "A failed update check now says why.",
    ],
  },
  {
    version: "0.10.13",
    notes: [
      "Image lists show real progress: files saved out of files chosen.",
    ],
  },
  {
    version: "0.10.12",
    notes: [
      "A found image list has a Search again button.",
      "Links read by an extension get 30 minutes instead of two, so long searches can finish.",
    ],
  },
  {
    version: "0.10.11",
    notes: [
      "Each installed extension has an Update button.",
    ],
  },
  {
    version: "0.10.10",
    notes: [
      "App updates install silently and reopen DriftFetch when they finish.",
      "The installer's last page offers to run DriftFetch.",
    ],
  },
  {
    version: "0.10.9",
    notes: [
      "Settings has a Check for updates button; a downloaded, verified update installs in one click.",
    ],
  },
  {
    version: "0.10.8",
    notes: [
      "Image searches with more than 5,000 results load in full, up to 100,000.",
      "A failing page no longer discards the posts already read: pages are retried and the partial list is kept.",
      "A newer extension file replaces the installed one in place.",
      "DriftFetch downloads new versions of itself at startup and checks the checksum before offering them.",
    ],
  },
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
