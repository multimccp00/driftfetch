import { expect, it, vi } from "vitest";
import { readWithFallback } from "../electron/reader-fallback";
import {
  diagnosticReport,
  failureCode,
  readerFailureExplanation,
} from "../shared/diagnostics";
import type { CollectionReadAttempt, Job } from "../src/shared";

it("retains the primary failure even when the fallback returns a list", async () => {
  const snapshots: CollectionReadAttempt[][] = [];
  const list = {
    entries: [{ id: "1", url: "https://example.invalid/landscape.png" }],
  };
  const result = await readWithFallback(
    async () => {
      throw new Error("HTTP 403 https://example.invalid/?api_key=SECRET");
    },
    async () => list,
    new AbortController().signal,
    (attempts) => snapshots.push(attempts),
  );
  expect(result).toBe(list);
  expect(snapshots[0]).toEqual([{ reader: "api", outcome: "reading" }]);
  expect(snapshots.at(-1)).toEqual([
    { reader: "api", outcome: "failed", failureCode: "HTTP_403" },
    { reader: "html", outcome: "succeeded" },
  ]);
  const report = diagnosticReport(
    { collectionReadAttempts: snapshots.at(-1), status: "completed" } as Job,
    "test",
    "test",
    "api",
  );
  expect(JSON.parse(report).collectionReadAttempts).toEqual(snapshots.at(-1));
  expect(report).not.toContain("SECRET");
  expect(report).not.toContain("example.invalid");
});

it("preserves both failures and throws the fallback error", async () => {
  let attempts: CollectionReadAttempt[] = [];
  const finalError = new Error("HTTP 429");
  await expect(
    readWithFallback(
      async () => {
        throw new Error("API credentials are unavailable.");
      },
      async () => {
        throw finalError;
      },
      new AbortController().signal,
      (value) => {
        attempts = value;
      },
    ),
  ).rejects.toBe(finalError);
  expect(attempts).toEqual([
    {
      reader: "api",
      outcome: "failed",
      failureCode: "API_CREDENTIALS_UNAVAILABLE",
    },
    { reader: "html", outcome: "failed", failureCode: "HTTP_429" },
  ]);
});

it.each([undefined, { entries: [] }])(
  "does not add a fallback when the primary returns %j",
  async (value) => {
    const fallback = vi.fn();
    const record = vi.fn();
    expect(
      await readWithFallback(
        async () => value,
        fallback,
        new AbortController().signal,
        record,
      ),
    ).toBe(value);
    expect(fallback).not.toHaveBeenCalled();
    expect(record).toHaveBeenLastCalledWith([
      { reader: "api", outcome: value === undefined ? "empty" : "succeeded" },
    ]);
  },
);

it("does not start a fallback after cancellation", async () => {
  const controller = new AbortController();
  const fallback = vi.fn();
  const record = vi.fn();
  await expect(
    readWithFallback(
      async () => {
        controller.abort();
        throw new Error("interrupted");
      },
      fallback,
      controller.signal,
      record,
    ),
  ).rejects.toThrow("interrupted");
  expect(fallback).not.toHaveBeenCalled();
  expect(record).toHaveBeenLastCalledWith([
    { reader: "api", outcome: "cancelled" },
  ]);
});

it.each([
  ["unavailable", "API_CREDENTIALS_UNAVAILABLE"],
  ["invalid", "API_CREDENTIALS_INVALID"],
  ["rejected", "API_CREDENTIALS_REJECTED"],
])(
  "classifies %s API credentials without retaining secrets",
  (reason, code) => {
    expect(
      failureCode(
        new Error(
          `API credentials ${reason === "rejected" ? "were" : "are"} ${reason}. SECRET`,
        ),
      ),
    ).toBe(code);
    expect(readerFailureExplanation(code)).not.toContain("SECRET");
  },
);

it("does not invent reader evidence for old jobs", () => {
  expect(
    JSON.parse(
      diagnosticReport({ status: "completed" } as Job, "test", "test", "none"),
    ).collectionReadAttempts,
  ).toBeNull();
});
