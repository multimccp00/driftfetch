// Newest first. To publish a release: add an entry here, and bump `version` in site.ts.
// Old entries stay so people can still get an earlier build; the files live in the GitHub release for that tag.
export type Release = { version: string; date?: string; notes: string[] };

export const releases: Release[] = [
  { version: "0.2.1", notes: ["Latest version."] },
];
