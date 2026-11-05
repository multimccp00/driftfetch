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
import {
  chooseUpdate,
  downloadUpdate,
  findUpdate,
  isNewer,
  packagedAppUserModelId,
  verifyInstaller,
} from "../electron/app-updates";
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
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "driftfetch-update-"));
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
it("rejects an installer that changed after it was chosen", async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "driftfetch-update-"));
  const file = path.join(dir, "DriftFetch-Setup-0.3.0-x64.exe");
  await fs.writeFile(file, "original");
  await fs.writeFile(
    file + ".sha256",
    createHash("sha256").update("original").digest("hex"),
  );
  await expect(verifyInstaller(file)).resolves.toBeUndefined();
  await fs.writeFile(file, "swapped");
  await expect(verifyInstaller(file)).rejects.toThrow("checksum");
});
it("shortcut and app share one taskbar identity", () => {
  expect(packagedAppUserModelId).toBe("local.driftfetch.app");
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

const base =
  "https://github.com/multimccp00/driftfetch/releases/download/v0.2.1/";
const release = (over = {}) => ({
  tag_name: "v0.2.1",
  assets: [
    {
      name: "DriftFetch-Setup-0.2.1-x64.exe",
      browser_download_url: base + "DriftFetch-Setup-0.2.1-x64.exe",
    },
    {
      name: "DriftFetch-Setup-0.2.1-x64.exe.sha256",
      browser_download_url: base + "DriftFetch-Setup-0.2.1-x64.exe.sha256",
    },
  ],
  ...over,
});
const reply = (body: unknown) =>
  (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

it("finds a newer release only when its installer and checksum are attached", async () => {
  const signal = new AbortController().signal;
  expect((await findUpdate("0.2.0", signal, reply(release())))?.version).toBe(
    "0.2.1",
  );
  expect(await findUpdate("0.2.1", signal, reply(release()))).toBeUndefined();
  expect(
    await findUpdate("0.2.0", signal, reply(release({ prerelease: true }))),
  ).toBeUndefined();
  expect(
    await findUpdate("0.2.0", signal, reply(release({ assets: [] }))),
  ).toBeUndefined();
  const foreign = release();
  foreign.assets[0].browser_download_url =
    "https://example.invalid/DriftFetch-Setup-0.2.1-x64.exe";
  expect(await findUpdate("0.2.0", signal, reply(foreign))).toBeUndefined();
});

it("downloads an update and rejects one whose checksum does not match", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "df-update-"));
  const signal = new AbortController().signal;
  const update = {
    version: "0.2.1",
    installer: base + "DriftFetch-Setup-0.2.1-x64.exe",
    checksum: base + "DriftFetch-Setup-0.2.1-x64.exe.sha256",
  };
  const serve = (hash: string) =>
    (async (url: string) =>
      new Response(
        url.endsWith(".sha256") ? hash : "installer",
      )) as unknown as typeof fetch;
  const good = createHash("sha256").update("installer").digest("hex");
  const file = await downloadUpdate(update, dir, signal, serve(good));
  expect(await fs.readFile(file, "utf8")).toBe("installer");
  await expect(
    downloadUpdate(update, dir, signal, serve("0".repeat(64))),
  ).rejects.toThrow("checksum");
  await fs.rm(dir, { recursive: true, force: true });
});
