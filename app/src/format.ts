import type { Job, Status } from "./shared";

export const labels: Record<Status, string> = {
  resolving: "Checking link",
  review: "Ready to start",
  collection: "Choose items",
  queued: "Waiting",
  downloading: "Downloading",
  processing: "Finishing",
  paused: "Paused",
  completed: "Saved",
  failed: "Needs attention",
  cancelled: "Cancelled",
  duplicate: "Already in list",
};

/** What a gallery-style collection holds: "images", "videos" or a mix ("items"). */
export const collectionNoun = (job: {
  collectionKind?: string;
  linkType?: string;
  entries?: { title: string }[];
}) => {
  if (job.collectionKind !== "images") return "videos";
  if (job.linkType === "video page") return "videos";
  return job.entries?.some((e) => e.title.startsWith("Video"))
    ? "items"
    : "images";
};

/** Label for a job state; gallery-style collections name what they hold. */
export const statusLabel = (
  status: string,
  collectionKind?: string,
  noun = "images",
) =>
  status === "collection" && collectionKind === "images"
    ? `Choose ${noun}`
    : (labels as Record<string, string>)[status] ||
      (status === "removed" ? "Removed" : status);

export const bytes = (n?: number) => {
  if (!n) return "—";
  const i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / 1024 ** i;
  return `${value.toFixed(i && value < 100 ? 1 : 0)} ${["B", "KB", "MB", "GB"][i]}`;
};

/** "236 / 512 MB": the done part is written in the unit of the total. */
export const bytesOf = (done: number, total: number) => {
  const i = Math.min(3, Math.floor(Math.log(total) / Math.log(1024)));
  const scaled = total / 1024 ** i;
  return `${(done / 1024 ** i).toFixed(i && scaled < 100 ? 1 : 0)} / ${bytes(total)}`;
};

/** Time left: "38 s", "4 min", "1.2 h". */
export const time = (n?: number) =>
  !n
    ? "—"
    : n < 60
      ? `${Math.ceil(n)} s`
      : n < 3600
        ? `${Math.ceil(n / 60)} min`
        : `${(n / 3600).toFixed(1)} h`;

/** Length of a video: 8:47 or 1:02:03. */
export const clock = (seconds?: number) => {
  if (!seconds) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** A countdown such as 4:32. */
export const countdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** "Today, 21:14", "Yesterday, 09:02" or "5 Oct, 21:14". */
export const when = (at?: number) => {
  if (!at) return "";
  const date = new Date(at);
  const day = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const hm = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const diff = Math.round((day(new Date()) - day(date)) / 86_400_000);
  if (diff === 0) return `Today, ${hm}`;
  if (diff === 1) return `Yesterday, ${hm}`;
  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${hm}`;
};

/** The short reason shown on a failed row; the details panel has the rest. */
export const failureSummary = (job: Job) => {
  const raw = `${job.error ?? ""} ${job.failureCode ?? ""}`;
  if (/nothing could be read|NOTHING_READ/i.test(raw)) return "Nothing found";
  if (/sign.?in|login required|session (?:expired|unavailable)/i.test(raw))
    return "Sign-in needed";
  if (/CURRENT_REMOVED|removed or deleted/i.test(raw))
    return "Removed at the source";
  if (/free up space|disk is full|ENOSPC|LOW_SPACE/i.test(raw))
    return "Not enough disk space";
  if (/destination drive|Cannot write/i.test(raw)) return "Can't save here";
  if (/refused access|HTTP_403|\b403\b/i.test(raw))
    return "Site refused access";
  if (/limiting requests|HTTP_429/i.test(raw))
    return "Site is limiting requests";
  if (/DRM/i.test(raw)) return "Protected by DRM";
  if (/could not identify|unsupported|INVALID_METADATA/i.test(raw))
    return "Not supported";
  if (
    /Connection failed|FETCH_FAILED|READ_TIMEOUT|too long to respond/i.test(raw)
  )
    return "Connection problem";
  if (/incomplete/i.test(raw)) return "Some files are missing";
  if (/bundled download tool|FFmpeg is missing|JavaScript runtime/i.test(raw))
    return "A tool is missing";
  return "Needs attention";
};

/** A sign-in problem; the details panel then offers the fix. */
export const needsSignIn = (job: Job) =>
  failureSummary(job) === "Sign-in needed";

/** Rows that count as Active: running, waiting, checking, or retrying by themselves. */
export const isActive = (job: Job) =>
  ["downloading", "processing", "resolving", "queued"].includes(job.status) ||
  (job.status === "failed" && !!job.retryAt);
