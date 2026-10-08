import { it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ choose: vi.fn() }));
vi.mock("electron", () => ({
  app: { getVersion: () => "0.2.0" },
  dialog: { showOpenDialog: mocks.choose },
  shell: {},
}));
import { chooseUpdate, isNewer } from "../electron/app-updates";
import { diagnosticReport } from "../shared/diagnostics";
import type { Job } from "../src/shared";
let dir: string;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});
it("compares semantic version components numerically", () => {
  expect(isNewer("0.10.0", "0.2.0")).toBe(true);
  expect(isNewer("0.2.0", "0.2.0")).toBe(false);
  expect(isNewer("bad", "0.2.0")).toBe(false);
});
it("verifies selected update bytes before allowing installation", async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "current-update-"));
  const file = path.join(dir, "DriftFetch-Setup-0.3.0-x64.exe");
  await fs.writeFile(file, "synthetic installer bytes");
  mocks.choose.mockResolvedValue({ canceled: false, filePaths: [file] });
  await expect(chooseUpdate({} as any)).rejects.toThrow(".sha256");
  await fs.writeFile(file + ".sha256", "0".repeat(64));
  await expect(chooseUpdate({} as any)).rejects.toThrow("checksum");
  await fs.writeFile(
    file + ".sha256",
    createHash("sha256").update("synthetic installer bytes").digest("hex"),
  );
  await expect(chooseUpdate({} as any)).resolves.toBe(file);
});
it("diagnostics omit identifying content while keeping failure categories", () => {
  const report = diagnosticReport(
    {
      status: "failed",
      failureStage: "extraction",
      error: "DriftFetch could not extract a video from this page.",
      originalUrl: "https://example.com/PRIVATE?token=PRIVATE",
      title: "PRIVATE",
      filePath: "C:\\PRIVATE",
      progress: 0,
    } as Job,
    "0.2.0",
    "engine",
    "none",
  );
  expect(report).not.toContain("PRIVATE");
  expect(JSON.parse(report).reason).toBe("unsupported-extraction");
});
