import { expect, it } from "vitest";
import {
  bytes,
  bytesOf,
  clock,
  countdown,
  failureSummary,
  isActive,
  needsSignIn,
  time,
  when,
} from "../src/format";
import type { Job } from "../src/shared";

const job = (patch: Partial<Job>) => ({ status: "failed", ...patch }) as Job;

it("writes sizes, times and countdowns for the list", () => {
  expect(bytes(0)).toBe("—");
  expect(bytes(512)).toBe("512 B");
  expect(bytes(182 * 1024 ** 2)).toBe("182 MB");
  expect(bytes(1.4 * 1024 ** 3)).toBe("1.4 GB");
  expect(bytesOf(236 * 1024 ** 2, 512 * 1024 ** 2)).toBe("236 / 512 MB");
  expect(time(38)).toBe("38 s");
  expect(time(150)).toBe("3 min");
  expect(clock(527)).toBe("8:47");
  expect(clock(3723)).toBe("1:02:03");
  expect(clock(undefined)).toBe("");
  expect(countdown(272)).toBe("4:32");
  expect(countdown(5)).toBe("0:05");
});
it("says when something finished", () => {
  const now = Date.now();
  expect(when(now)).toMatch(/^Today, \d\d:\d\d$/);
  expect(when(now - 86_400_000)).toMatch(/^Yesterday, \d\d:\d\d$/);
  expect(when(now - 10 * 86_400_000)).toMatch(/, \d\d:\d\d$/);
  expect(when(undefined)).toBe("");
});
it("turns a failure into a short reason", () => {
  const reason = (error: string, failureCode?: string) =>
    failureSummary(job({ error, failureCode }));
  expect(
    reason("Session expired or login required. Refresh the source session."),
  ).toBe("Sign-in needed");
  expect(reason("The source refused access (HTTP 403)", "HTTP_403")).toBe(
    "Site refused access",
  );
  expect(reason("The destination disk is full.")).toBe("Not enough disk space");
  // The "nothing read" message mentions the login, but must not be labelled as a sign-in problem.
  expect(
    reason(
      "Nothing could be read from this link. The saved login may have lapsed.",
      "NOTHING_READ",
    ),
  ).toBe("Nothing found");
  expect(reason("This video is DRM-protected")).toBe("Protected by DRM");
  expect(reason("Connection failed. Check your network")).toBe(
    "Connection problem",
  );
  expect(reason("something nobody planned for")).toBe("Needs attention");
  expect(needsSignIn(job({ error: "login required" }))).toBe(true);
  expect(needsSignIn(job({ error: "disk is full" }))).toBe(false);
});
it("counts waiting, checking and retrying downloads as active, not failed", () => {
  for (const status of ["downloading", "processing", "resolving", "queued"])
    expect(isActive(job({ status: status as Job["status"] }))).toBe(true);
  expect(isActive(job({ status: "failed", retryAt: Date.now() + 5000 }))).toBe(
    true,
  );
  expect(isActive(job({ status: "failed" }))).toBe(false);
  expect(isActive(job({ status: "paused" }))).toBe(false);
});
