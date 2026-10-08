import path from "node:path";
import type { Settings, Job, Status } from "../src/shared";
import { rateLimitWait } from "../shared/transfer-policy";
/**
 * Entries kept on one collection job. The job JSON is rewritten on every save
 * and broadcast to the renderer, so a 100,000-post search would stall both.
 * ponytail: hard cap, flagged via collectionLimited; page the list if users need more.
 */
export const maxCollectionEntries = 5000;
export const defaultSettings = (downloads: string): Settings => ({
  warnBelowHeight: 720,
  speedLimitKiB: 0,
  automaticRetries: true,
  scheduleEnabled: false,
  scheduleStart: "00:00",
  scheduleEnd: "07:00",
  clipboardWatch: true,
  captureNotifications: true,
  autoDownload: true,
  autoDownloadCollections: false,
  previewCollections: true,
  quality: "best",
  concurrency: 2,
  fragmentConcurrency: 1,
  downloadDir: path.join(downloads, "DriftFetch"),
  folderWatchDir: "",
  completionAction: "notify",
  sourceRules: [],
  grouping: "source",
  filenameTemplate: "{title} [{id}]",
  launchAtLogin: false,
  theme: "dark",
  privacyNoticeVersion: 0,
});
export function normalizeUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
/** Links accepted per paste; the rest are reported back as truncated. */
export const maxLinksPerBatch = 200;
export function parseLinks(text: string): string[] {
  if (typeof text !== "string" || text.length > 100_000)
    throw new Error("Paste up to 100 KB of links at a time.");
  return [
    ...new Set(
      text
        .trim()
        .split(/\s+/)
        .map(normalizeUrl)
        .filter((u): u is string => !!u),
    ),
  ];
}
/** Loopback, link-local, private-range and single-label (intranet) hosts. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(?:localhost|local|internal|lan)$/.test(host))
    return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (host.includes(":")) return /^(?:::1?|f[cd]|fe[89ab])/.test(host);
  return !host.includes(".");
}
/** One-time and account links (password reset, magic sign-in…) must not be fetched unasked. */
export function isSensitiveLink(url: string, allowPrivate = false): boolean {
  const page = new URL(url);
  if (!allowPrivate && isPrivateHost(page.hostname)) return true;
  if (
    /(?:^|[/_.-])(?:reset|verify|verification|confirm|magic|token|login|signin|sign-in|oauth|password|activate|invite)(?:[/_.-]|$)/i.test(
      page.pathname,
    )
  )
    return true;
  return [...page.searchParams.keys()].some((key) =>
    /^(?:token|access_token|reset_token|verification_code)$/i.test(key),
  );
}
export class ClipboardTracker {
  private previous: string;
  constructor(initial: string) {
    this.previous = initial;
  }
  read(text: string, enabled: boolean): string[] {
    if (text === this.previous) return [];
    this.previous = text;
    if (!enabled || text.length > 100_000) return [];
    const parts = text.trim().split(/\s+/);
    // Clipboard capture accepts a URL or URL list, never URLs buried in private prose.
    if (!parts.length || parts.some((p) => !normalizeUrl(p))) return [];
    // Test builds serve fixtures from 127.0.0.1.
    const allowPrivate = process.env.CURRENT_ALLOW_LOCAL_CLIPBOARD === "1";
    return parseLinks(text).filter(
      (url) => !isSensitiveLink(url, allowPrivate),
    );
  }
}
export function safeSegment(value: string, limit = 100): string {
  let s = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, limit)
    .replace(/[. ]+$/g, "");
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s)) s = "_" + s;
  return s || "Untitled";
}
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "Unknown source";
  }
}
export function validateDomain(value: string): string {
  const domain = domainOf(value.includes("://") ? value : "https://" + value);
  if (!domain.includes(".") || !/^[a-z0-9.-]+$/.test(domain))
    throw new Error("Enter a source domain, for example example.com.");
  return domain;
}
/** Stored settings may predate a rule or hold a bad value; fall back to the default per key. */
export function sanitizeSettings(
  defaults: Settings,
  stored: Partial<Settings>,
): Settings {
  try {
    return validateSettings(defaults, stored);
  } catch {
    let result = defaults;
    for (const [key, value] of Object.entries(stored))
      try {
        result = validateSettings(result, { [key]: value });
      } catch {
        // Keep this key's default.
      }
    return result;
  }
}
export function validateSettings(
  current: Settings,
  patch: Partial<Settings>,
): Settings {
  const allowed = Object.keys(current);
  for (const key of Object.keys(patch))
    if (!allowed.includes(key)) throw new Error("Unknown setting.");
  const s = { ...current, ...patch };
  if (![0, 720, 1080].includes(s.warnBelowHeight))
    throw new Error("Choose a valid quality warning threshold.");
  if (
    !Number.isInteger(s.speedLimitKiB) ||
    s.speedLimitKiB < 0 ||
    s.speedLimitKiB > 1_000_000
  )
    throw new Error("Choose a speed limit between 0 and 1,000,000 KiB/s.");
  if (
    ![s.scheduleStart, s.scheduleEnd].every(
      (value) =>
        typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    ) ||
    s.scheduleStart === s.scheduleEnd
  )
    throw new Error("Choose different, valid start and stop times.");
  if (
    [
      "clipboardWatch",
      "captureNotifications",
      "autoDownload",
      "autoDownloadCollections",
      "previewCollections",
      "launchAtLogin",
      "automaticRetries",
      "scheduleEnabled",
    ].some((k) => typeof s[k as keyof Settings] !== "boolean")
  )
    throw new Error("Invalid switch value.");
  if (
    !["best", "1080", "720"].includes(s.quality) ||
    !["source", "date", "none"].includes(s.grouping)
  )
    throw new Error("Invalid download preference.");
  if (
    !Number.isInteger(s.concurrency) ||
    s.concurrency < 0 ||
    s.concurrency > 8
  )
    // 0 means no limit.
    throw new Error("Choose 1 to 8 simultaneous downloads, or Unlimited.");
  if (
    !Number.isInteger(s.fragmentConcurrency) ||
    s.fragmentConcurrency < 1 ||
    s.fragmentConcurrency > 8
  )
    throw new Error("Choose between 1 and 8 connections per download.");
  if (
    typeof s.downloadDir !== "string" ||
    !path.isAbsolute(s.downloadDir) ||
    s.downloadDir.length > 140
  )
    throw new Error(
      "Choose an absolute folder path shorter than 140 characters.",
    );
  if (
    typeof s.folderWatchDir !== "string" ||
    (s.folderWatchDir && !path.isAbsolute(s.folderWatchDir))
  )
    throw new Error("Choose an absolute watched folder path.");
  if (
    !Number.isInteger(s.privacyNoticeVersion) ||
    s.privacyNoticeVersion < 0 ||
    s.privacyNoticeVersion > 1000
  )
    throw new Error("Invalid privacy notice version.");
  if (!["dark", "light", "system"].includes(s.theme))
    throw new Error("Invalid appearance.");
  if (!["none", "notify"].includes(s.completionAction))
    throw new Error("Invalid completion action.");
  if (
    !Array.isArray(s.sourceRules) ||
    s.sourceRules.some(
      (rule) =>
        !rule ||
        typeof rule.source !== "string" ||
        !/^[a-z0-9.-]+$/i.test(rule.source) ||
        (rule.quality !== undefined &&
          !["best", "1080", "720"].includes(rule.quality)) ||
        (rule.speedLimitKiB !== undefined &&
          (!Number.isInteger(rule.speedLimitKiB) ||
            rule.speedLimitKiB < 0 ||
            rule.speedLimitKiB > 1_000_000)) ||
        (rule.fragmentConcurrency !== undefined &&
          (!Number.isInteger(rule.fragmentConcurrency) ||
            rule.fragmentConcurrency < 1 ||
            rule.fragmentConcurrency > 8)) ||
        (rule.maxSimultaneous !== undefined &&
          (!Number.isInteger(rule.maxSimultaneous) ||
            rule.maxSimultaneous < 1 ||
            rule.maxSimultaneous > 10)) ||
        (rule.requestDelaySec !== undefined &&
          (!Number.isInteger(rule.requestDelaySec) ||
            rule.requestDelaySec < 0 ||
            rule.requestDelaySec > 60)) ||
        (rule.downloadDir !== undefined &&
          (typeof rule.downloadDir !== "string" ||
            !path.isAbsolute(rule.downloadDir) ||
            rule.downloadDir.length > 140)) ||
        (rule.autoDownload !== undefined &&
          typeof rule.autoDownload !== "boolean"),
    )
  )
    throw new Error("Invalid source rule.");
  if (
    typeof s.filenameTemplate !== "string" ||
    s.filenameTemplate.length > 100 ||
    !s.filenameTemplate.includes("{id}") ||
    /[<>:"/\\|?*\x00-\x1f%]/.test(s.filenameTemplate) ||
    /\{(?!title\}|id\}|source\}|date\})/.test(s.filenameTemplate)
  )
    throw new Error(
      "Use {title}, {id}, {source}, or {date}. Keep {id} and omit path separators and % signs.",
    );
  return s;
}
export function outputLocation(
  job: Job,
  settings: Settings,
): { targetDir: string; outputTemplate: string } {
  const date = new Date(job.createdAt).toISOString().slice(0, 10);
  const source = job.gallerySource || job.source;
  const sub =
    settings.grouping === "source"
      ? safeSegment(source, 45)
      : settings.grouping === "date"
        ? date
        : "";
  const galleryFolder =
    job.galleryFolder || (job.imageUrls?.length ? job.title : undefined);
  // Keep the folder under ~200 characters so a file still fits in MAX_PATH
  // (the bundled Python engines fail confusingly past it): shrink the optional folders first.
  const extras = [job.groupName, galleryFolder].filter(Boolean).length;
  const room = 200 - settings.downloadDir.length - sub.length - 3;
  const each = Math.max(12, Math.min(70, Math.floor(room / (extras || 1))));
  const targetDir = path.join(
    settings.downloadDir,
    sub,
    ...(job.groupName ? [safeSegment(job.groupName, each)] : []),
    ...(galleryFolder ? [safeSegment(galleryFolder, each)] : []),
  );
  if (job.imageUrls?.length)
    return { targetDir, outputTemplate: "%(id)s.%(ext)s" };
  const values: Record<string, string> = {
    title: safeSegment(job.title, 70),
    id: safeSegment(job.mediaKey?.split(":").slice(1).join(":") || job.id, 30),
    source: safeSegment(source, 35),
    date,
  };
  const name = safeSegment(
    settings.filenameTemplate.replace(
      /\{(title|id|source|date)\}/g,
      (_, key: string) => values[key],
    ),
    Math.max(45, 225 - targetDir.length),
  );
  // A per-job suffix avoids overwrites across explicit re-downloads and colliding source IDs.
  return {
    targetDir,
    outputTemplate: name.replace(/%/g, "%%") + `-${job.id.slice(0, 8)}.%(ext)s`,
  };
}
export function recoveryStatus(status: Status, auto: boolean): Status {
  if (["downloading", "processing", "queued"].includes(status))
    return auto ? "queued" : "review";
  return status;
}
/** Returns the account name when the URL is an Instagram profile page. */
export function instagramProfile(url: string): string | undefined {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return;
  }
  if (!/(^|\.)instagram\.com$/i.test(page.hostname)) return;
  const name = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(page.pathname)?.[1];
  if (
    !name ||
    /^(p|reel|reels|tv|stories|explore|accounts|direct|about|developer|legal)$/i.test(
      name,
    )
  )
    return;
  return name;
}
/** Folder name when the URL is a whole subreddit or Reddit user page (not a single post). */
export function redditFeed(url: string): string | undefined {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return;
  }
  if (!/(^|\.)reddit\.com$/i.test(page.hostname)) return;
  const m =
    /^\/(r|u|user)\/([A-Za-z0-9_-]{2,30})(?:\/(?:hot|new|top|rising|best|controversial|submitted))?\/?$/i.exec(
      page.pathname,
    );
  if (!m) return;
  return `reddit_${/^r$/i.test(m[1]) ? "" : "u_"}${m[2]}`;
}
export function friendlyError(raw: string): string {
  if (/CURRENT_EXTENSION_REQUIRED/.test(raw))
    return "The extension for this collection is disabled or missing. Enable it in Settings → Advanced → Extensions and retry.";
  if (/CURRENT_INCOMPLETE_FILES/.test(raw))
    return "The collection is incomplete: some selected files could not be verified on disk. Saved files are kept. Retry to check or download the missing files.";
  if (/CURRENT_INCOMPLETE_DISCOVERY/.test(raw))
    return "The collection could not be fully read. Check the source counts and pagination details. Saved files are kept. Use Download again for a fresh lookup.";
  if (/CURRENT_REMOVED/.test(raw))
    return "This post or its media was removed or deleted at the source, so nothing is left to download.";
  if (/CURRENT_NO_IMAGES/.test(raw))
    return "No accessible original files were found for this image search. Check the tags and source access, then retry.";
  if (/CURRENT_TIMEOUT/i.test(raw))
    return "The source took too long to respond. Check your connection or source access, then retry.";
  if (
    /session unavailable|decrypt|cookie database|cookies database|could not copy|DPAPI|CryptUnprotectData/i.test(
      raw,
    )
  )
    return "Session unavailable. Use Sign in here in Settings → Sites & sign-ins (Chrome often blocks sharing its session), then retry.";
  if (
    /sign.?in|log.?in|cookies.*(expired|invalid)|authentication|\b401\b|members.only|isn't available to everyone|certain audiences|empty media response|\bprivate (?:video|account|post|profile|playlist)\b|is private|age.restricted/i.test(
      raw,
    )
  )
    return "Session expired or login required. Refresh the source session in Settings → Sites & sign-ins, then retry.";
  if (/no space|disk full|ENOSPC|not enough space/i.test(raw))
    return "The destination disk is full. Free up space or choose another folder, then retry.";
  // A missing engine executable (e.g. quarantined by antivirus) is not a drive problem.
  if (/\bspawn\b.*\b(?:ENOENT|UNKNOWN)\b/i.test(raw))
    return "A bundled download tool is missing or blocked, possibly by antivirus. Reinstall DriftFetch to restore it, then retry.";
  if (
    /ENOENT|ENODEV|device (?:is )?not ready|drive .* unavailable|network name is no longer available/i.test(
      raw,
    )
  )
    return "The destination drive is unavailable. Reconnect it or choose another folder, then retry.";
  if (/permission denied|access is denied|EACCES/i.test(raw))
    return "Cannot write to the destination. Choose a writable folder, then retry.";
  const wait = rateLimitWait(raw);
  if (wait !== undefined)
    return `The source is limiting requests and asked for a wait of about ${Math.max(1, Math.round(wait / 60_000))} minute(s). DriftFetch retries automatically about a minute and a half after that when automatic retries are on; otherwise retry later.`;
  if (/\b429\b|too many requests|rate limit/i.test(raw))
    return "The source is limiting requests (HTTP 429). Wait before retrying and reduce simultaneous downloads for this source.";
  if (/\b403\b|forbidden|captcha|cloudflare/i.test(raw))
    return "The source refused access to this request (HTTP 403 or a browser check). Open the page in Chrome to check access. If sign-in is required, refresh its session in Settings → Sites & sign-ins. Retrying cannot bypass the site's restrictions.";
  if (
    /unsupported url|no video formats|no video could|unable to extract/i.test(
      raw,
    )
  )
    return "DriftFetch could not identify supported media on this page. If this source uses an extension, check that it is added and enabled in Settings → Advanced → Extensions. If sign-in is required, connect the appropriate account in Settings → Sites & sign-ins. An account alone cannot add missing extraction support.";
  if (/DRM/i.test(raw))
    return "This video is DRM-protected and cannot be downloaded by this app.";
  if (/javascript runtime|deno|ejs/i.test(raw))
    return "This source needs DriftFetch's JavaScript runtime. Reinstall DriftFetch to restore the bundled runtime, then retry.";
  if (
    /timed? out|network|connection|resolve host|name resolution|fetch failed/i.test(
      raw,
    )
  )
    return "Connection failed. Check your network and retry; partial files are kept.";
  // Never pass raw engine stderr to the renderer: it can contain signed URLs or credentials.
  return "The download engine could not finish. Check source access, update the engine, and retry.";
}
