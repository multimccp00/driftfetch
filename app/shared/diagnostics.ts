import type { Job, ExtensionCheck } from "../src/shared";
import { safeCollectionDiscovery } from "./collection-discovery";
export function extensionExplanation(
  outcome: ExtensionCheck["outcome"],
): string {
  switch (outcome) {
    case "not-installed":
      return "No extension is installed for this domain. If this source needs one, add and enable it in Settings → Advanced → Extensions.";
    case "disabled":
      return "The extension for this domain is disabled. Enable it in Settings → Advanced → Extensions, then retry.";
    case "load-failed":
      return "The extension for this domain could not load. Check Settings → Advanced → Extensions.";
    case "not-matched":
      return "An extension is enabled for this domain, but it does not recognize this link type.";
    case "selected":
      return "An enabled extension recognized this link and was called to read it.";
    case "check-failed":
      return "The extension failed while checking whether it recognizes this link.";
  }
}
/** Only fixed codes may leave the main process, never raw error details. */
export function failureCode(error: unknown): string {
  let cause: unknown = error;
  for (
    let depth = 0;
    depth < 3 && cause && typeof cause === "object";
    depth++
  ) {
    const value = cause as { code?: unknown; cause?: unknown };
    if (
      typeof value.code === "string" &&
      /^(?:EACCES|EPERM|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOSPC|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UND_ERR_CONNECT_TIMEOUT)$/.test(
        value.code,
      )
    )
      return value.code;
    cause = value.cause;
  }
  const raw = String(error);
  if (/CURRENT_EXTENSION_REQUIRED/.test(raw)) return "EXTENSION_REQUIRED";
  if (/API credentials are unavailable/i.test(raw))
    return "API_CREDENTIALS_UNAVAILABLE";
  if (/API credentials are invalid/i.test(raw))
    return "API_CREDENTIALS_INVALID";
  if (/API credentials were rejected/i.test(raw))
    return "API_CREDENTIALS_REJECTED";
  if (/CURRENT_INCOMPLETE_FILES/.test(raw)) return "INCOMPLETE_FILES";
  if (/CURRENT_INCOMPLETE_DISCOVERY/.test(raw)) return "INCOMPLETE_DISCOVERY";
  if (/CURRENT_NOTHING_READ/.test(raw)) return "NOTHING_READ";
  if (/CURRENT_TIMEOUT/.test(raw)) return "READ_TIMEOUT";
  if (/rate limit/i.test(raw)) return "RATE_LIMIT";
  const http =
    /\b(?:HTTP(?: Error)?\s+|status(?: code)?[: ]+)([45]\d\d)\b/i.exec(raw) ||
    /\b([45]\d\d)\s+(?:Forbidden|Unauthorized|Not Found|Too Many Requests|Service Unavailable)\b/i.exec(
      raw,
    );
  if (http) return `HTTP_${http[1]}`;
  if (error instanceof SyntaxError) return "INVALID_METADATA";
  if (/fetch failed/i.test(raw)) return "FETCH_FAILED";
  return "ENGINE_FAILED";
}
export function readerFailureExplanation(code: string): string {
  switch (code) {
    case "API_CREDENTIALS_UNAVAILABLE":
      return "Saved API credentials could not be accessed. Check the API session in Settings → Sites & sign-ins.";
    case "API_CREDENTIALS_INVALID":
      return "Saved API credentials could not be read. Save the API session again in Settings → Sites & sign-ins.";
    case "API_CREDENTIALS_REJECTED":
    case "HTTP_401":
      return "The API rejected authentication. Check the saved API credentials.";
    case "HTTP_403":
      return "The source refused this request. This does not establish that the credentials expired.";
    case "HTTP_429":
      return "The source limited requests. Wait before retrying.";
    case "INVALID_METADATA":
      return "The response could not be read as the expected metadata.";
    case "EACCES":
    case "EPERM":
      return "Access was denied locally while reading the source or session.";
    default:
      return "The reader could not finish. Include this code when reporting the problem.";
  }
}
export function explanation(job: Job): string {
  if (job.imageSearch && job.status === "review")
    return "This is an image search. Start it to download original files from every available results page into one folder. You can pause or cancel while it runs.";
  if (job.fileMissing && job.status === "completed")
    return "The saved file could not be found. If its drive is disconnected, reconnect it and use Check files. If you moved the video, use Locate file, or choose Download again for a new copy.";
  if (job.retryAt && job.failureCode === "RATE_LIMIT")
    return `The source is limiting requests. DriftFetch waits as long as the source asks, plus a short safety margin, then continues by itself. ${job.error || ""}`;
  if (job.retryAt)
    return `A temporary failure occurred. Automatic retry ${job.retryCount || 1} of 3 is scheduled. Partial files are kept. ${job.error || ""}`;
  if (job.status === "duplicate")
    return "This source video is already in Downloads or History. Use Download again for another copy.";
  if (job.status === "failed")
    return `${job.failureStage === "download" ? "The transfer failed after the media was identified." : "The media could not be identified or prepared."} ${job.error || "Check the source and try again."}`;
  if (job.status === "review")
    return "The video is ready. Automatic downloading is off, so it is waiting for you to start it.";
  if (job.status === "collection")
    return "This link contains multiple videos. Select which ones to download.";
  if (job.status === "paused")
    return "This download is paused. Resume it to continue.";
  if (job.status === "cancelled") return "This download was cancelled.";
  if (job.status === "resolving")
    return "DriftFetch is checking the page for supported videos.";
  if (job.status === "queued")
    return "The video is waiting for a download slot.";
  if (job.status === "completed")
    return "The download completed. Use Open folder to find the saved file.";
  return "The download is still in progress.";
}
export function diagnosticReport(
  job: Job,
  appVersion: string,
  engineVersion: string,
  sessionKind: string,
): string {
  const error = job.error || "";
  const reason = /Nothing could be read/i.test(error)
    ? "nothing-read"
    : /Session unavailable/i.test(error)
    ? "session-unavailable"
    : /login required|Session expired/i.test(error)
      ? "session-required-or-expired"
      : /extract|supported video/i.test(error)
        ? "unsupported-extraction"
        : /disk is full|free space/i.test(error)
          ? "disk-full"
          : /limiting requests|HTTP 429/i.test(error)
            ? "source-rate-limited"
            : /blocked|refused access/i.test(error)
              ? "source-blocked"
              : /Connection failed/i.test(error)
                ? "network"
                : /DRM/i.test(error)
                  ? "drm"
                  : error
                    ? "engine-failure"
                    : "none";
  // Deliberately omit URLs, paths, titles, cookies, raw stderr, and source identifiers.
  return JSON.stringify(
    {
      app: "DriftFetch",
      appVersion,
      engineVersion,
      status: job.status,
      reason,
      failureCode: job.failureCode || "not-recorded",
      collectionReadAttempts: job.collectionReadAttempts ?? null,
      collectionDiscovery:
        safeCollectionDiscovery(job.collectionDiscovery) ?? null,
      extensionChecks: job.extensionChecks ?? null,
      stage:
        job.failureStage || (job.mediaKey ? "video identified" : "extraction"),
      session: sessionKind,
      quality: job.quality || "Unknown",
      qualityLimit: job.qualityLimit || "best",
      formatsFound: job.formats?.length || 0,
      formatPreference: job.selectedFormatId ? "manual" : "automatic",
      progress: job.progress,
      bytes: job.downloadedBytes,
      sourceItems: job.sourceItemCount ?? null,
      discoveredItems: job.discoveredItems ?? null,
      expectedFiles: job.expectedFiles ?? null,
      verifiedFiles: job.verifiedFiles ?? null,
      missingFiles: job.missingFiles ?? null,
      hasPartialDestination: !!job.targetDir,
    },
    null,
    2,
  );
}
