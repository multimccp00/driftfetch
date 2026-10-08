import type { CollectionDiscovery, Job } from "../src/shared";

/** Copy only bounded counters, never arbitrary provider text or credentials. */
export function safeCollectionDiscovery(
  value: unknown,
): CollectionDiscovery | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  const keys = [
    "pagesRead",
    "postsReturned",
    "uniquePosts",
    "duplicatePosts",
    "postsWithoutFiles",
    "invalidPosts",
    "sharedFileUrls",
  ] as const;
  if (
    keys.some(
      (key) =>
        typeof input[key] !== "number" ||
        !Number.isSafeInteger(input[key]) ||
        (input[key] as number) < 0 ||
        (input[key] as number) > 10_000_000,
    )
  )
    return;
  if (
    !["empty-page", "repeated-page", "page-limit"].includes(
      String(input.stopReason),
    )
  )
    return;
  const result = Object.fromEntries(keys.map((key) => [key, input[key]]));
  return { ...result, stopReason: input.stopReason } as CollectionDiscovery;
}

export function incompleteCollection(job: Job): boolean {
  if (!job.selectedAll) return false;
  const audit = safeCollectionDiscovery(job.collectionDiscovery);
  return (
    (job.sourceItemCount !== undefined &&
      job.discoveredItems !== undefined &&
      job.sourceItemCount > job.discoveredItems) ||
    !!(
      audit &&
      (audit.postsWithoutFiles ||
        audit.invalidPosts ||
        audit.stopReason !== "empty-page")
    )
  );
}
