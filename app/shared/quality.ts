import type { Job, Settings } from "../src/shared";

export function qualityWarning(
  job: Job,
  settings: Settings,
): string | undefined {
  // Image collections do not expose video formats or a meaningful resolution
  // expectation. Their originals are selected from the collection metadata.
  if (job.collectionKind === "images" || job.linkType === "profile") return;
  const selected = job.formats?.find((f) => f.id === job.selectedFormatId);
  // A format without a height (e.g. KVS "High Quality") may be the best one,
  // so the known heights are not a ceiling.
  const available = job.formats?.some((f) => !f.height)
    ? 0
    : job.availableHeight ||
      Math.max(0, ...(job.formats || []).map((f) => f.height || 0));
  const measured =
    job.status === "completed"
      ? Number(job.quality?.match(/^(\d+)p$/)?.[1])
      : 0;
  const cap = job.qualityLimit || settings.quality;
  const expected =
    selected?.height ||
    (available
      ? Math.min(available, cap === "best" ? available : Number(cap))
      : 0);
  if (measured && expected && measured < expected)
    return `Saved at ${measured}p, below the expected ${expected}p. Recheck formats before downloading another copy.`;
  if (!job.mediaKey) return;
  if (!measured && !available)
    return "Resolution is unknown. Labels such as High Quality do not confirm HD; the saved file will be measured after downloading.";
  const threshold = selected?.height || settings.warnBelowHeight;
  const actual = measured || available;
  if (threshold && actual && actual < threshold)
    return `${measured ? "Saved file" : "Highest detected format"}: ${actual}p, below your ${threshold}p expectation. The site may expose only a lower-quality version.`;
}

/** Conservative tie-breaker for hosts that expose quality labels but no measurements. */
export function preferredLabelFormat(formats: any[]): string | undefined {
  const video = formats.filter((f) => f.vcodec !== "none");
  if (video.length < 2) return;
  // Let yt-dlp keep its normal codec/resolution/bitrate ranking whenever those facts exist.
  if (
    video.some((f) =>
      ["height", "width", "tbr", "vbr", "filesize", "filesize_approx"].some(
        (k) => Number(f[k]) > 0,
      ),
    )
  )
    return;
  if (
    video.some(
      (f) =>
        f.acodec === "none" ||
        !/^[a-zA-Z0-9_.-]+$/.test(String(f.format_id || "")),
    )
  )
    return;
  for (const field of [
    "quality",
    "preference",
    "source_preference",
    "language_preference",
    "fps",
    "ext",
    "protocol",
    "vcodec",
    "acodec",
  ]) {
    if (new Set(video.map((f) => f[field] ?? null)).size > 1) return;
  }
  const ranks: Record<string, number> = {
    highquality: 3,
    high: 3,
    hq: 3,
    hd: 3,
    mediumquality: 2,
    medium: 2,
    sd: 2,
    lowquality: 1,
    low: 1,
    lq: 1,
  };
  const ranked = video.map((f) => ({
    id: String(f.format_id),
    rank: ranks[String(f.format_id).toLowerCase().replace(/[_.-]/g, "")],
  }));
  if (
    ranked.some((f) => !f.rank) ||
    new Set(ranked.map((f) => f.rank)).size < 2
  )
    return;
  const best = Math.max(...ranked.map((f) => f.rank));
  const winners = ranked.filter((f) => f.rank === best);
  return winners.length === 1 ? winners[0].id : undefined;
}

/** Resolution from the saved file, never inferred from labels such as "HD". */
export function savedFileQuality(probe: any): string {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const height = Math.max(
    0,
    ...streams
      .filter(
        (s: any) => s.codec_type === "video" && !s.disposition?.attached_pic,
      )
      .map((s: any) => Number(s.height) || 0),
  );
  return height > 0 ? `${height}p` : "Unknown";
}
