import type { Entry } from "../src/shared";

/** Keep the first URL supplied for each source item; alternate URLs are not items. */
export function uniqueCollectionEntries(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    // Extractors should provide stable item IDs. Without one, only exact URL
    // duplicates can be identified safely; do not infer IDs from signed URLs.
    const key = entry.id ? `id:${entry.id}` : `url:${entry.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
