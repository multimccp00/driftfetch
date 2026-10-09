import { expect, it } from "vitest";
import {
  diagnosticReport,
  extensionExplanation,
  failureCode,
} from "../shared/diagnostics";
import type { Job } from "../src/shared";

it("reports extension selection without domains, IDs or credential data and does not invent older evidence", () => {
  const job = {
    extensionId: "private-provider",
    originalUrl: "https://private.invalid/?token=SECRET",
    extensionChecks: [{ stage: "submitted", outcome: "disabled" }],
  } as Job;
  const report = diagnosticReport(job, "fixture", "fixture", "api");
  expect(JSON.parse(report).extensionChecks).toEqual(job.extensionChecks);
  expect(report).not.toMatch(/SECRET|private-provider|private.invalid/);
  expect(extensionExplanation("disabled")).toContain("Enable it in Settings");
  expect(
    JSON.parse(diagnosticReport({} as Job, "fixture", "fixture", "none"))
      .extensionChecks,
  ).toBeNull();
});

it("retains safe HTTP and nested connection codes without exposing raw errors", () => {
  const cause = Object.assign(new Error("private path"), { code: "EACCES" });
  expect(failureCode(new TypeError("fetch failed", { cause }))).toBe("EACCES");
  expect(failureCode(new Error("CURRENT_NOTHING_READ"))).toBe("NOTHING_READ");
  expect(
    failureCode(
      new Error("HTTP Error 403 at https://example.invalid/?token=SECRET"),
    ),
  ).toBe("HTTP_403");
  expect(failureCode(new Error("'429 Too Many Requests'"))).toBe("HTTP_429");
  expect(failureCode(new SyntaxError("<private page>"))).toBe(
    "INVALID_METADATA",
  );
  expect(
    failureCode(Object.assign(new Error("SECRET"), { code: "SECRET" })),
  ).toBe("ENGINE_FAILED");
});
