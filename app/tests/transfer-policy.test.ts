import { expect, it } from "vitest";
import {
  defaultSettings,
  friendlyError,
  validateSettings,
} from "../electron/core";
import {
  requiredSpace,
  rateLimitWait,
  retryDelay,
  scheduleAllows,
  sourceLimits,
} from "../shared/transfer-policy";
import { downloadArgs } from "../electron/engine";
import type { Job } from "../src/shared";

it("handles daytime and overnight local schedules including exact boundaries", () => {
  const settings = {
    ...defaultSettings("C:/Downloads"),
    scheduleEnabled: true,
    scheduleStart: "22:00",
    scheduleEnd: "07:00",
  };
  const at = (h: number, m = 0) => new Date(2026, 8, 12, h, m);
  expect(scheduleAllows(settings, at(22))).toBe(true);
  expect(scheduleAllows(settings, at(6, 59))).toBe(true);
  expect(scheduleAllows(settings, at(7))).toBe(false);
  expect(scheduleAllows(settings, at(21, 59))).toBe(false);
  settings.scheduleStart = "09:00";
  settings.scheduleEnd = "17:00";
  expect(scheduleAllows(settings, at(9))).toBe(true);
  expect(scheduleAllows(settings, at(17))).toBe(false);
  settings.scheduleEnabled = false;
  expect(scheduleAllows(settings, at(21))).toBe(true);
});

it("bounds retries and excludes errors needing user action", () => {
  expect(
    [0, 1, 2, 3].map((n) =>
      retryDelay("HTTP Error 503: Service Unavailable", n),
    ),
  ).toEqual([15000, 30000, 60000, undefined]);
  expect(retryDelay("Connection reset by peer", 0)).toBe(15000);
  for (const error of [
    "HTTP Error 403",
    "HTTP Error 429",
    "expired cookies",
    "Unsupported URL",
    "ENOSPC",
    "permission denied",
    "DRM",
    "HTTP Error 404",
  ])
    expect(retryDelay(error, 0)).toBeUndefined();
});

it("does not mistake digits inside ids or paths for HTTP status codes", () => {
  expect(
    retryDelay("Connection reset while fetching /watch?v=x4031ab", 0),
  ).toBe(15000);
  expect(retryDelay("Connection reset, HTTP Error 429", 0)).toBeUndefined();
});

it("reserves merge space, accounts for partial data, and bounds unknown sizes", () => {
  const reserve = 256 * 1024 * 1024;
  expect(requiredSpace({} as Job)).toBe(reserve);
  expect(requiredSpace({ totalBytes: 1000, downloadedBytes: 200 } as Job)).toBe(
    reserve + 1800,
  );
  expect(
    requiredSpace({
      totalBytes: 1000,
      selectedFormatId: "high",
      formats: [{ id: "high", size: 5000 }],
    } as Job),
  ).toBe(reserve + 10000);
});

it("validates scheduler and speed inputs and passes the speed limit as arguments", () => {
  const defaults = defaultSettings("C:/Downloads");
  expect(() =>
    validateSettings(defaults, { scheduleStart: "25:00" }),
  ).toThrow();
  expect(() =>
    validateSettings(defaults, { scheduleEnd: defaults.scheduleStart }),
  ).toThrow();
  expect(() => validateSettings(defaults, { speedLimitKiB: -1 })).toThrow();
  expect(() => validateSettings(defaults, { speedLimitKiB: 1.5 })).toThrow();
  const args = downloadArgs({
    speedLimitKiB: 512,
    targetDir: "C:/Downloads",
    outputTemplate: "sample.%(ext)s",
  } as Job);
  expect(
    args.slice(args.indexOf("--limit-rate"), args.indexOf("--limit-rate") + 2),
  ).toEqual(["--limit-rate", "512K"]);
  expect(downloadArgs({} as Job)).not.toContain("--limit-rate");
});

it("limits rate-limited sources by default and lets a rule override", () => {
  const base = { ...defaultSettings("C:/Downloads"), sourceRules: [] };
  expect(sourceLimits(base, "www.reddit.com")).toEqual({
    maxSimultaneous: 1,
    requestDelaySec: 6,
  });
  expect(sourceLimits(base, "example.com")).toEqual({
    maxSimultaneous: 0,
    requestDelaySec: 0,
  });
  const rule = {
    source: "reddit.com",
    maxSimultaneous: 3,
    requestDelaySec: 10,
  };
  expect(
    sourceLimits({ ...base, sourceRules: [rule] }, "old.reddit.com"),
  ).toEqual({ maxSimultaneous: 3, requestDelaySec: 10 });
  expect(() =>
    validateSettings(base, {
      sourceRules: [{ source: "a.com", maxSimultaneous: 0 }],
    }),
  ).toThrow();
  const job = { requestDelaySec: 2 } as Job;
  expect(downloadArgs(job)).toContain("--sleep-requests");
});

it("reads the wait a source announces and retries after it", () => {
  const raw =
    "[reddit][warning] API rate limit exceeded\n[reddit][info] Waiting for 4 minutes until 14:09:58 (rate limit)\n";
  expect(rateLimitWait(raw)).toBe(240_000);
  expect(rateLimitWait("Waiting for 30 seconds (rate limit)")).toBe(30_000);
  expect(rateLimitWait("HTTP Error 429")).toBeUndefined();
  expect(retryDelay(raw, 0)).toBe(330_000);
  expect(retryDelay(raw, 9)).toBe(330_000); // no attempt cap: the source sets the wait
  expect(friendlyError(raw)).toMatch(/about 4 minute/);
});
