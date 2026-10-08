import type { Job, Settings } from "../src/shared";

/**
 * gallery-dl announces rate limits as "Waiting for 4 minutes until 14:09:58 (rate limit)".
 * Returns the wait in milliseconds, or undefined when the text has no such notice.
 */
export function rateLimitWait(raw: string): number | undefined {
  const m =
    /Waiting for (\d+(?:\.\d+)?) (second|minute|hour)s?\b[^\n]*\(rate limit\)/i.exec(
      raw,
    );
  if (!m) return;
  const unit = { second: 1000, minute: 60_000, hour: 3_600_000 }[
    m[2].toLowerCase() as "second" | "minute" | "hour"
  ];
  return Math.ceil(Number(m[1]) * unit);
}

/** Sites known to rate-limit get a gentle default until the user sets a rule. */
const defaultSourceLimits: Record<
  string,
  { maxSimultaneous: number; requestDelaySec: number }
> = {
  // Reddit allows about 10 API requests a minute without OAuth.
  "reddit.com": { maxSimultaneous: 1, requestDelaySec: 6 },
};
export function sourceLimits(
  settings: Settings,
  source: string | undefined,
): { maxSimultaneous: number; requestDelaySec: number } {
  const match = (domain: string) =>
    !!source && (source === domain || source.endsWith("." + domain));
  const rule = settings.sourceRules.find((r) => match(r.source));
  const fallback = Object.entries(defaultSourceLimits).find(([d]) =>
    match(d),
  )?.[1];
  return {
    // 0 means no per-source limit beyond the global one.
    maxSimultaneous: rule?.maxSimultaneous ?? fallback?.maxSimultaneous ?? 0,
    requestDelaySec: rule?.requestDelaySec ?? fallback?.requestDelaySec ?? 0,
  };
}

export function scheduleAllows(settings: Settings, now = new Date()): boolean {
  if (!settings.scheduleEnabled) return true;
  const minute = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = parse(settings.scheduleStart),
    end = parse(settings.scheduleEnd);
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

export function retryDelay(raw: string, attempts: number): number | undefined {
  // The source said how long to wait: retry that long plus a margin so the limit has
  // cleared. No attempt or length cap: the wait always comes from the source.
  const wait = rateLimitWait(raw);
  if (wait !== undefined) return wait + 90_000;
  if (
    attempts >= 3 ||
    /\b(?:401|403|404|429)\b|captcha|cloudflare|forbidden|DRM|cookies|session|login|sign.?in|no space|ENOSPC|permission denied|unsupported/i.test(
      raw,
    )
  )
    return;
  if (
    /timed? out|timeout|network|connection (?:reset|refused|closed|aborted)|ECONNRESET|ETIMEDOUT|EAI_AGAIN|resolve host|name resolution|HTTP Error 50[0234]|\b50[0234] (?:Bad|Service|Gateway|Internal)/i.test(
      raw,
    )
  )
    return 15_000 * 2 ** attempts;
}

export function requiredSpace(job: Job): number {
  const selected = job.formats?.find(
    (format) => format.id === job.selectedFormatId,
  );
  const size = selected?.size || job.totalBytes || 0;
  // Allow for the completed file plus temporary streams during merging.
  return Math.max(0, size * 2 - (job.downloadedBytes || 0)) + 256 * 1024 * 1024;
}
