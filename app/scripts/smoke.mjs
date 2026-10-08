import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
// The version of the privacy note the app shows, read from its source.
const privacyVersion = Number(
  /version:\s*(\d+)/.exec(
    await fs.readFile("shared/privacy-note.ts", "utf8"),
  )[1],
);
const noClipboard = process.env.CURRENT_SMOKE_NO_CLIPBOARD === "1";
const runDir = path.resolve("test-results", "smoke-" + Date.now());
await fs.mkdir(runDir, { recursive: true });
const sample = path.join(runDir, "sample.mp4");
// The shipped FFmpeg only copies streams (it has no encoders), so the test media are
// committed fixtures: 8 s of 640x360 H.264/AAC, and 1 s of 1920x1080.
const ffmpeg = path.resolve("resources/engines/ffmpeg.exe");
await fs.copyFile("tests/fixtures/media/sample.mp4", sample);
const size = (await fs.stat(sample)).size;
const highSample = path.join(runDir, "high.mp4");
await fs.copyFile("tests/fixtures/media/high.mp4", highSample);
const highSize = (await fs.stat(highSample)).size;
const dashDir = path.join(runDir, "dash");
await fs.mkdir(dashDir);
const dash = spawnSync(
  ffmpeg,
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sample,
    "-map",
    "0",
    "-c",
    "copy",
    "-f",
    "dash",
    "-seg_duration",
    "2",
    "manifest.mpd",
  ],
  { cwd: dashDir, windowsHide: true, encoding: "utf8" },
);
assert.equal(dash.status, 0, dash.stderr);
const sampleBytes = await fs.readFile(sample);
let resumedRequests = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/redirect" || url.pathname === "/redirect-alias") {
    res.writeHead(302, { Location: "/embedded" });
    res.end();
    return;
  }
  if (url.pathname === "/embedded") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<!doctype html><html><head><title>DriftFetch synthetic sample</title></head><body><video controls src="/sample.mp4"></video></body></html>',
    );
    return;
  }
  if (
    url.pathname === "/quality-labels" ||
    url.pathname === "/review-quality"
  ) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<html><head><title>Synthetic quality selection</title></head><body><video controls><source src="/high.mp4" type="video/mp4" label="High_Quality"><source src="/sample.mp4" type="video/mp4" label="Low_Quality"></video></body></html>',
    );
    return;
  }
  if (url.pathname === "/high.mp4") {
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": highSize,
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(highSample).pipe(res);
    return;
  }
  if (url.pathname === "/collection") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<!doctype html><html><head><title>Synthetic collection</title></head><body><video src="/sample.mp4?one"></video><video src="/sample.mp4?two"></video></body></html>',
    );
    return;
  }
  if (url.pathname === "/unsupported") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<html><title>No video here</title><body>A plain text page.</body></html>",
    );
    return;
  }
  if (url.pathname === "/private") {
    if (!req.headers.cookie?.includes("session=current-fixture")) {
      res.writeHead(401);
      res.end("Login required");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<html><title>Authenticated synthetic sample</title><body><video src="/sample.mp4"></video></body></html>',
    );
    return;
  }
  if (url.pathname.startsWith("/dash/")) {
    const file = path.join(dashDir, path.basename(url.pathname));
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const isManifest = file.endsWith(".mpd");
    res.writeHead(200, {
      "Content-Type": isManifest ? "application/dash+xml" : "video/mp4",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
    return;
  }
  if (url.pathname === "/sample.mp4" || url.pathname === "/slow.mp4") {
    let start = 0,
      end = size - 1;
    const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    if (match) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    }
    const headers = {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
    };
    if (match) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    res.writeHead(match ? 206 : 200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    if (url.pathname === "/slow.mp4") {
      if (start > 0) resumedRequests++;
      let offset = start;
      const timer = setInterval(() => {
        const next = Math.min(offset + 32768, end + 1);
        res.write(sampleBytes.subarray(offset, next));
        offset = next;
        if (offset > end) {
          clearInterval(timer);
          res.end();
        }
      }, 100);
      res.once("close", () => clearInterval(timer));
    } else createReadStream(sample, { start, end }).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const env = {
  ...process.env,
  CURRENT_USER_DATA: path.join(runDir, "userdata"),
  // Clipboard capture ignores private hosts; the fixtures live on 127.0.0.1.
  CURRENT_ALLOW_LOCAL_CLIPBOARD: "1",
};
if (process.env.CURRENT_PACKAGED_EXE)
  env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
delete env.ELECTRON_RUN_AS_NODE;
delete env.CURRENT_DEV_URL;
const executablePath = process.env.CURRENT_PACKAGED_EXE || require("electron");
let app, originalClipboard, page;
let appChild;
let engineLog = "";
const consoleErrors = [];
const report = {
  runDir,
  packaged: !!process.env.CURRENT_PACKAGED_EXE,
  checks: [],
};
async function launch() {
  app = await electron.launch({
    executablePath,
    args: process.env.CURRENT_PACKAGED_EXE ? [] : ["."],
    env,
    timeout: 60000,
  });
  const child = app.process();
  appChild = child;
  child.stderr?.on("data", (chunk) => {
    engineLog = (engineLog + chunk.toString()).slice(-16000);
  });
  try {
    page = await app.firstWindow({ timeout: 30000 });
  } catch (error) {
    terminateTestApp();
    throw error;
  }
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.waitForFunction(() => !!window.current, { timeout: 30000 });
  // The privacy note appears on the first launch of a fresh profile and must be acknowledged.
  const understood = page.getByRole("button", { name: "I understand" });
  if (
    await understood
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false)
  ) {
    privacyShown = true;
    await page.screenshot({ path: path.join(runDir, "00-privacy-note.png") });
    await understood.click();
    await understood.waitFor({ state: "detached" });
  }
  await page.getByRole("heading", { name: "Downloads", exact: true }).waitFor();
}
let privacyShown = false;
function terminateTestApp() {
  const child = appChild;
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync(
      path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "taskkill.exe",
      ),
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, timeout: 5000 },
    );
  } else child.kill("SIGKILL");
}
// Pastes text the way Ctrl+V does, without touching the real clipboard.
const pasteLinks = (text) =>
  page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text", value);
    document.body.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
const settingsTab = (name) =>
  page.locator(".settings-nav").getByRole("button", { name });
async function state() {
  return await page.evaluate(() => window.current.snapshot());
}
async function until(fn, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await state();
    if (fn(s)) return s;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    "Timed out: " +
      JSON.stringify(
        (await state()).jobs.map((j) => ({
          status: j.status,
          error: j.error,
          title: j.title,
        })),
      ),
  );
}
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log("PASS " + name);
}
try {
  await launch();
  originalClipboard = noClipboard
    ? undefined
    : await app.evaluate(async ({ clipboard }) => await clipboard.readText());
  await check("Bundled engines and safe defaults", async () => {
    const s = await state();
    assert(s.engine.available);
    assert(s.engine.ffmpegAvailable);
    assert(s.engine.jsRuntimeAvailable);
    assert.match(s.engine.jsRuntimeVersion || "", /^2\./);
    assert(privacyShown, "the privacy note was not shown on first launch");
    assert.equal(s.settings.privacyNoticeVersion, privacyVersion);
    assert.equal(s.settings.clipboardWatch, true);
    assert.equal(s.settings.captureNotifications, true);
    assert.equal(s.settings.autoDownload, true);
    assert.equal(s.settings.concurrency, 2);
    assert.equal(s.jobs.length, 0);
  });
  await page.screenshot({ path: path.join(runDir, "01-downloads-empty.png") });
  if (noClipboard)
    await page.evaluate(() =>
      window.current.settings({ clipboardWatch: false }),
    );
  await page.evaluate(
    async (dir) => window.current.settings({ downloadDir: dir }),
    path.join(runDir, "downloads"),
  );
  await check(
    "Folder Watch imports a link list once and archives it",
    async () => {
      const watched = path.join(runDir, "watched-links");
      await page.evaluate(
        async (dir) =>
          window.current.settings({ folderWatchDir: dir, autoDownload: false }),
        watched,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await fs.writeFile(path.join(watched, "links.txt"), base + "/quality");
      await until((s) =>
        s.jobs.some((job) => job.originalUrl === base + "/quality"),
      );
      // The file is archived right after its links are queued.
      for (let i = 0; ; i++) {
        const archived = await fs
          .readdir(path.join(watched, "processed"))
          .catch(() => []);
        if (archived.some((name) => name.endsWith("-links.txt"))) break;
        assert(i < 30, "watched file was not archived");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await page.evaluate(() =>
        window.current.settings({ folderWatchDir: "", autoDownload: true }),
      );
    },
  );
  await check(
    noClipboard
      ? "Manual intake → redirect → embedded video → playable file"
      : "Clipboard capture → redirect → embedded video → playable file",
    async () => {
      if (noClipboard)
        await page.evaluate(
          (url) => window.current.addLinks(url),
          base + "/redirect",
        );
      else
        await app.evaluate(
          async ({ clipboard }, url) => await clipboard.writeText(url),
          base + "/redirect",
        );
      const s = await until((s) =>
        s.jobs.some((j) => j.status === "completed"),
      );
      const job = s.jobs.find((j) => j.status === "completed");
      assert.equal(job.originalUrl, base + "/redirect");
      assert.equal(job.source, "127.0.0.1");
      assert(job.filePath && existsSync(job.filePath));
      const probe = spawnSync(
        path.resolve("resources/engines/ffprobe.exe"),
        [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type",
          "-of",
          "json",
          job.filePath,
        ],
        { windowsHide: true, encoding: "utf8" },
      );
      assert.equal(probe.status, 0);
      assert(
        JSON.parse(probe.stdout).streams.some((s) => s.codec_type === "video"),
      );
    },
  );
  await check(
    "Best quality prefers the high label and reports the actual saved 1080p resolution",
    async () => {
      await page.evaluate(
        (url) => window.current.addLinks(url),
        base + "/quality-labels",
      );
      const s = await until((s) =>
        s.jobs.some(
          (j) =>
            j.originalUrl.endsWith("/quality-labels") &&
            j.status === "completed",
        ),
      );
      const job = s.jobs.find((j) => j.originalUrl.endsWith("/quality-labels"));
      assert.equal(job.preferredFormatId, "High_Quality");
      assert.equal(job.quality, "1080p");
      assert.equal(job.totalBytes, (await fs.stat(job.filePath)).size);
    },
  );
  await check("Duplicate copied URL and resolved media identity", async () => {
    const a = await page.evaluate(
      (url) => window.current.addLinks(url),
      base + "/redirect",
    );
    assert.equal(a.duplicates, 1);
    const b = await page.evaluate(
      (url) => window.current.addLinks(url),
      base + "/embedded",
    );
    assert.equal(b.duplicates, 1);
    await page.evaluate(
      (url) => window.current.addLinks(url),
      base + "/redirect-alias",
    );
    await until((s) => s.jobs.some((j) => j.status === "duplicate"));
  });
  await check("Manual paste with automatic download disabled", async () => {
    await page
      .getByRole("switch", { name: "Auto-download", exact: true })
      .click();
    await pasteLinks(base + "/sample.mp4");
    await until((s) => s.jobs.some((j) => j.status === "review"));
    await page.getByText("1 link added", { exact: true }).waitFor();
    // Text without links is ignored; a link already in the list is reported as such.
    const jobCount = (await state()).jobs.length;
    await pasteLinks("just some words");
    await pasteLinks(base + "/sample.mp4");
    await page.getByText("Already in your list or history").waitFor();
    assert.equal((await state()).jobs.length, jobCount);
    // Ctrl+Shift+V asks for a group name first.
    await page.evaluate((value) => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "V",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      const data = new DataTransfer();
      data.setData("text", value);
      document.body.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
      document.dispatchEvent(
        new KeyboardEvent("keyup", { key: "V", bubbles: true }),
      );
    }, base + "/sample.mp4?grouped=1");
    await page.getByLabel("Download group").fill("Smoke group");
    await page.getByRole("button", { name: /^Add 1 link$/ }).click();
    const grouped = await until((s) =>
      s.jobs.some((j) => j.groupName === "Smoke group"),
    );
    assert(grouped.jobs.some((j) => j.originalUrl.endsWith("?grouped=1")));
    // The appearance setting reaches the page.
    await page.evaluate(() => window.current.settings({ theme: "light" }));
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    await page.evaluate(() => window.current.settings({ theme: "dark" }));
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    assert.equal((await state()).settings.autoDownload, false);
  });
  await check(
    "Unsupported links remain visible with an actionable error",
    async () => {
      await page.evaluate(
        (url) => window.current.addLinks(url),
        base + "/unsupported",
      );
      await until((s) => s.jobs.some((j) => j.status === "failed"));
      const failed = (await state()).jobs.find((j) => j.status === "failed");
      assert(failed.error);
      assert(!failed.error.includes(base));
    },
  );
  await check("Collections wait for explicit video selection", async () => {
    await page.evaluate(
      (url) => window.current.addLinks(url),
      base + "/collection",
    );
    const s = await until((s) => s.jobs.some((j) => j.status === "collection"));
    const collection = s.jobs.find((j) => j.status === "collection");
    assert.equal(collection.entries.length, 2);
    await page.getByRole("button", { name: "Select from 2 videos" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Select all \d+$/ })
      .click();
    await page.getByRole("button", { name: /^Download 2 selected/ }).click();
    await until((s) => !s.jobs.some((j) => j.status === "collection"));
  });
  await page.screenshot({
    path: path.join(runDir, "02-downloads-populated.png"),
  });
  await check("Settings and account controls render", async () => {
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await settingsTab(/^Quality & files/).click();
    await page.getByRole("radio", { name: /^Up to 1080p/ }).click();
    await until((s) => s.settings.quality === "1080");
    await settingsTab(/^Sites & sign-ins/).click();
    await page.getByLabel("Source domain").fill("example.com");
    await page.screenshot({ path: path.join(runDir, "03-accounts.png") });
    await settingsTab(/^Advanced/).click();
    await page.screenshot({ path: path.join(runDir, "04-engine.png") });
  });
  await check("Bounded quality plus DASH audio/video merge", async () => {
    await page.evaluate(
      (url) => window.current.addLinks(url),
      base + "/dash/manifest.mpd",
    );
    const s = await until((s) =>
      s.jobs.some(
        (j) => j.originalUrl.endsWith("/manifest.mpd") && j.status === "review",
      ),
    );
    const job = s.jobs.find((j) => j.originalUrl.endsWith("/manifest.mpd"));
    await page.evaluate((id) => window.current.action([id], "start"), job.id);
    const finished = await until(
      (s) => s.jobs.find((j) => j.id === job.id)?.status === "completed",
    );
    const saved = finished.jobs.find((j) => j.id === job.id);
    assert(saved.filePath.endsWith(".mkv"));
    const probe = spawnSync(
      path.resolve("resources/engines/ffprobe.exe"),
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "json",
        saved.filePath,
      ],
      { windowsHide: true, encoding: "utf8" },
    );
    const types = JSON.parse(probe.stdout).streams.map((s) => s.codec_type);
    assert(types.includes("audio") && types.includes("video"));
  });
  await check(
    "Pause retains partial files and resume uses HTTP ranges",
    async () => {
      await page.evaluate(
        (url) => window.current.addLinks(url),
        base + "/slow.mp4",
      );
      const s = await until((s) =>
        s.jobs.some(
          (j) => j.originalUrl.endsWith("/slow.mp4") && j.status === "review",
        ),
      );
      const job = s.jobs.find((j) => j.originalUrl.endsWith("/slow.mp4"));
      await page.evaluate((id) => window.current.action([id], "start"), job.id);
      await until((s) => s.jobs.find((j) => j.id === job.id)?.progress > 0);
      await page.evaluate((id) => window.current.action([id], "pause"), job.id);
      const paused = (await state()).jobs.find((j) => j.id === job.id);
      assert.equal(paused.status, "paused");
      assert(
        (await fs.readdir(paused.targetDir)).some(
          (f) => f.includes(job.id.slice(0, 8)) && f.endsWith(".part"),
        ),
      );
      await page.evaluate((id) => window.current.action([id], "start"), job.id);
      await until(
        (s) => s.jobs.find((j) => j.id === job.id)?.status === "completed",
      );
      assert(resumedRequests > 0);
    },
  );
  await check(
    "Encrypted cookie import unlocks a protected fixture and cleans temporary files",
    async () => {
      await page.evaluate(
        (url) => window.current.addLinks(url),
        base + "/private",
      );
      const blocked = await until((s) =>
        s.jobs.some(
          (j) => j.originalUrl.endsWith("/private") && j.status === "failed",
        ),
      );
      const job = blocked.jobs.find((j) => j.originalUrl.endsWith("/private"));
      assert(job.error.includes("Session expired"));
      const cookies = path.join(runDir, "fixture-cookies.txt");
      await fs.writeFile(
        cookies,
        "# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tsession\tcurrent-fixture\n",
      );
      await app.evaluate(({ dialog }, file) => {
        globalThis.originalOpenDialog = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, cookies);
      try {
        assert(
          await page.evaluate(() => window.current.importSession("127.0.0.1")),
        );
      } finally {
        await app.evaluate(({ dialog }) => {
          dialog.showOpenDialog = globalThis.originalOpenDialog;
        });
      }
      await page.evaluate((id) => window.current.action([id], "retry"), job.id);
      await until(
        (s) => s.jobs.find((j) => j.id === job.id)?.status === "completed",
      );
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(
        path.join(runDir, "userdata", "current.sqlite"),
      );
      const row = db
        .prepare("SELECT secret FROM sessions WHERE domain=?")
        .get("127.0.0.1");
      db.close();
      assert(
        !Buffer.from(row.secret).toString("utf8").includes("current-fixture"),
      );
      await page.evaluate(() => window.current.removeSession("127.0.0.1"));
      assert.equal((await state()).sessions.length, 0);
      assert.deepEqual(
        await fs.readdir(path.join(runDir, "userdata", "temporary-sessions")),
        [],
      );
    },
  );
  await check(
    "Restart resumes interrupted transfers and preserves manual pauses",
    async () => {
      const before = await state();
      const held = before.jobs.find(
        (j) => j.originalUrl.endsWith("/sample.mp4") && j.status === "review",
      );
      assert(held);
      await page.evaluate(
        (id) => window.current.action([id], "pause"),
        held.id,
      );
      await page.evaluate(() =>
        window.current.settings({ autoDownload: true }),
      );
      const slow = before.jobs.find(
        (j) => j.originalUrl.endsWith("/slow.mp4") && j.status === "completed",
      );
      await page.evaluate(
        (id) => window.current.action([id], "again"),
        slow.id,
      );
      const started = await until((s) =>
        s.jobs.some(
          (j) =>
            !before.jobs.some((old) => old.id === j.id) &&
            j.originalUrl.endsWith("/slow.mp4") &&
            j.progress > 0,
        ),
      );
      const interrupted = started.jobs.find(
        (j) =>
          !before.jobs.some((old) => old.id === j.id) &&
          j.originalUrl.endsWith("/slow.mp4"),
      );
      await app.close();
      app = undefined;
      await launch();
      const recovered = await until(
        (s) =>
          s.jobs.find((j) => j.id === interrupted.id)?.status === "completed",
      );
      assert.equal(
        recovered.jobs.find((j) => j.id === held.id).status,
        "paused",
      );
      await page.evaluate(() =>
        window.current.settings({ autoDownload: false }),
      );
    },
  );
  await check(
    "Floating capture panel, capture log, diagnostics, and opt-out",
    async () => {
      await app.evaluate(({ clipboard }) => {
        globalThis.captureTest = {
          text: "",
          read: clipboard.readText,
          write: clipboard.writeText,
        };
        clipboard.readText = async () => globalThis.captureTest.text;
        clipboard.writeText = async (text) => {
          globalThis.captureTest.report = text;
        };
      });
      try {
        await page.evaluate(() =>
          window.current.settings({
            clipboardWatch: true,
            captureNotifications: true,
            autoDownload: false,
          }),
        );
        await page.evaluate(() => window.current.windowAction("close"));
        const popupReady = app.waitForEvent("window");
        await app.evaluate(
          (_e, url) => {
            globalThis.captureTest.text = url;
          },
          base + "/unsupported?capture=1\n" + base + "/unsupported?capture=2",
        );
        const popupPage = await popupReady;
        await popupPage.getByText("2 captured", { exact: false }).waitFor();
        assert.equal(
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.getTitle().includes("link capture"))
              .isFocusable(),
          ),
          false,
        );
        await popupPage.screenshot({
          path: path.join(runDir, "capture-popup.png"),
        });
        const initial = (await state()).captures.length;
        await page.waitForTimeout(1700);
        assert.equal(
          (await state()).captures.length,
          initial,
          "Unchanged clipboard does not add captures",
        );
        await app.evaluate((_e, url) => {
          globalThis.captureTest.text = url;
        }, base + "/redirect");
        await popupPage.getByText("Already in list", { exact: true }).waitFor();
        await popupPage
          .getByRole("button", { name: "Open DriftFetch" })
          .click();
        await page
          .getByRole("heading", { name: "Recent captures", exact: true })
          .waitFor();
        await page.screenshot({
          path: path.join(runDir, "recent-captures.png"),
        });
        const failed = (await state()).jobs.find((j) =>
          j.originalUrl.endsWith("?capture=1"),
        );
        await page.evaluate(
          (id) => window.current.copyDiagnostic(id),
          failed.id,
        );
        const diagnostic = await app.evaluate(
          () => globalThis.captureTest.report,
        );
        assert.equal(JSON.parse(diagnostic).stage, "extraction");
        assert(!diagnostic.includes(base));
        await page.evaluate(() =>
          window.current.settings({ captureNotifications: false }),
        );
        await page.evaluate(() => window.current.windowAction("close"));
        await app.evaluate((_e, url) => {
          globalThis.captureTest.text = url;
        }, base + "/unsupported?capture=3");
        await until((s) =>
          s.jobs.some((j) => j.originalUrl.endsWith("?capture=3")),
        );
        assert.equal(
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.getTitle().includes("link capture"))
              .isVisible(),
          ),
          false,
        );
        await page.evaluate(() =>
          window.current.settings({
            clipboardWatch: false,
            captureNotifications: true,
          }),
        );
        await app.evaluate((_e, url) => {
          globalThis.captureTest.text = url;
        }, base + "/unsupported?capture=4");
        await page.waitForTimeout(1700);
        assert(
          !(await state()).jobs.some((j) =>
            j.originalUrl.endsWith("?capture=4"),
          ),
        );
        await page.evaluate(() =>
          window.current.settings({ captureNotifications: false }),
        );
      } finally {
        await page.evaluate(() =>
          window.current.settings({ clipboardWatch: false }),
        );
        await app.evaluate(({ clipboard, BrowserWindow }) => {
          clipboard.readText = globalThis.captureTest.read;
          clipboard.writeText = globalThis.captureTest.write;
          delete globalThis.captureTest;
          BrowserWindow.getAllWindows()
            .find((w) => w.getTitle() === "DriftFetch")
            .show();
        });
      }
    },
  );
  await check(
    "Per-download format choice overrides the default and reports the used format",
    async () => {
      const original = (await state()).jobs.find((j) =>
        j.originalUrl.endsWith("/quality-labels"),
      );
      const before = new Set((await state()).jobs.map((j) => j.id));
      await page.evaluate(
        (id) => window.current.action([id], "again"),
        original.id,
      );
      const ready = await until((s) =>
        s.jobs.some((j) => !before.has(j.id) && j.status === "review"),
      );
      const job = ready.jobs.find((j) => !before.has(j.id));
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "Recent captures", exact: true })
        .click();
      await page.locator(".capture-row").first().click();
      await page.getByRole("radio", { name: /Low_Quality/ }).click();
      await page.screenshot({ path: path.join(runDir, "quality-details.png") });
      assert.equal(
        (await state()).jobs.find((j) => j.id === job.id).selectedFormatId,
        "Low_Quality",
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await page.evaluate((id) => window.current.action([id], "start"), job.id);
      const done = await until(
        (s) => s.jobs.find((j) => j.id === job.id).status === "completed",
      );
      assert.equal(done.jobs.find((j) => j.id === job.id).quality, "360p");
      assert.equal(
        done.jobs.find((j) => j.id === job.id).actualFormatId,
        "Low_Quality",
      );
    },
  );
  await check(
    "Transfer controls, scheduled queue ordering, and missing-file recovery",
    async () => {
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await settingsTab(/^Advanced/).click();
      await page
        .getByLabel("Speed limit in KiB per second")
        .selectOption("512");
      await until((s) => s.settings.speedLimitKiB === 512);
      await settingsTab(/^Downloads/).click();
      await page
        .getByRole("switch", { name: "Automatic retries", exact: true })
        .click();
      await until((s) => !s.settings.automaticRetries);
      // The window repaints from a broadcast a moment later; click again only once it shows off.
      await page
        .locator(
          '[role="switch"][aria-label="Automatic retries"][aria-checked="false"]',
        )
        .waitFor();
      await page
        .getByRole("switch", { name: "Automatic retries", exact: true })
        .click();
      await until((s) => s.settings.automaticRetries);
      const hour = new Date().getHours();
      const at = (h) => `${String(h % 24).padStart(2, "0")}:00`;
      await page
        .getByLabel("Schedule stop", { exact: true })
        .fill(at(hour + 2));
      await page
        .getByLabel("Schedule start", { exact: true })
        .fill(at(hour + 1));
      await until((s) => s.settings.scheduleStart === at(hour + 1));
      await page
        .getByRole("switch", { name: "Download schedule", exact: true })
        .click();
      await until((s) => s.settings.scheduleEnabled);
      await page.screenshot({
        path: path.join(runDir, "transfer-settings.png"),
      });
      const original = (await state()).jobs.find(
        (j) =>
          j.status === "completed" && j.originalUrl.endsWith("/quality-labels"),
      );
      const before = new Set((await state()).jobs.map((j) => j.id));
      await page.evaluate(
        (id) => window.current.action([id], "again"),
        original.id,
      );
      await page.evaluate(
        (id) => window.current.action([id], "again"),
        original.id,
      );
      const ready = await until(
        (s) =>
          s.jobs.filter((j) => !before.has(j.id) && j.status === "review")
            .length === 2,
      );
      const [first, second] = ready.jobs.filter((j) => !before.has(j.id));
      await page
        .locator(".sidebar")
        .getByRole("button", { name: /^Downloads/ })
        .click();
      const firstRow = page.locator(`[data-job-id="${first.id}"]`);
      const secondRow = page.locator(`[data-job-id="${second.id}"]`);
      await firstRow.dragTo(secondRow, { targetPosition: { x: 150, y: 46 } });
      await until(
        (s) =>
          s.jobs.find((j) => j.id === first.id).queueOrder >
          s.jobs.find((j) => j.id === second.id).queueOrder,
      );
      await secondRow.getByTitle("Start", { exact: true }).click();
      await until(
        (s) => s.jobs.find((j) => j.id === second.id).status === "queued",
      );
      await secondRow
        .getByText("Waiting for schedule", { exact: true })
        .waitFor();
      await page.screenshot({ path: path.join(runDir, "scheduled-queue.png") });
      await page.evaluate(() =>
        window.current.settings({ scheduleEnabled: false }),
      );
      const done = await until(
        (s) => s.jobs.find((j) => j.id === second.id).status === "completed",
      );
      const completed = done.jobs.find((j) => j.id === second.id);
      assert.equal(completed.speedLimitKiB, 512);
      const moved = completed.filePath + ".moved.mp4";
      await fs.rename(completed.filePath, moved);
      await page
        .locator(".sidebar")
        .getByRole("button", { name: /^History/ })
        .click();
      await page
        .getByRole("button", { name: "Check files", exact: true })
        .click();
      await until((s) => s.jobs.find((j) => j.id === second.id).fileMissing);
      const historyRow = page.locator(`[data-job-id="${second.id}"]`);
      await historyRow.getByText("File missing", { exact: true }).waitFor();
      await historyRow.getByTitle("Download details", { exact: true }).click();
      await page.screenshot({ path: path.join(runDir, "missing-file.png") });
      await app.evaluate(({ dialog }, file) => {
        globalThis.originalLocateDialog = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, moved);
      try {
        await page
          .getByRole("button", { name: "Locate file", exact: true })
          .click();
        await until(
          (s) =>
            s.jobs.find((j) => j.id === second.id).filePath === moved &&
            !s.jobs.find((j) => j.id === second.id).fileMissing,
        );
      } finally {
        await app.evaluate(({ dialog }) => {
          dialog.showOpenDialog = globalThis.originalLocateDialog;
          delete globalThis.originalLocateDialog;
        });
      }
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    },
  );
  await check(
    "Review queue, same-entry format refresh, source evidence, and encrypted backup restore",
    async () => {
      await page.evaluate(async () => {
        const s = await window.current.snapshot();
        await window.current.action(
          s.jobs
            .filter(
              (j) =>
                !["completed", "duplicate", "collection"].includes(j.status),
            )
            .map((j) => j.id),
          "pause",
        );
        await window.current.settings({ autoDownload: true });
      });
      await page
        .locator(".sidebar")
        .getByRole("button", { name: /^Review queue/ })
        .click();
      await pasteLinks(base + "/review-quality");
      const ready = await until((s) =>
        s.jobs.some(
          (j) =>
            j.originalUrl.endsWith("/review-quality") && j.status === "review",
        ),
      );
      const job = ready.jobs.find((j) =>
        j.originalUrl.endsWith("/review-quality"),
      );
      assert.equal(ready.settings.autoDownload, true);
      assert.equal(job.holdForReview, true);
      const count = ready.jobs.length;
      await page
        .getByRole("button", { name: "Recheck formats", exact: true })
        .click();
      await until(
        (s) =>
          s.jobs.find((j) => j.id === job.id).formatsCheckedAt >
            job.formatsCheckedAt &&
          !s.jobs.find((j) => j.id === job.id).refreshing,
      );
      assert.equal((await state()).jobs.length, count);
      await page
        .getByRole("button", { name: "Recheck formats", exact: true })
        .waitFor();
      await page.screenshot({ path: path.join(runDir, "review-queue.png") });
      await page
        .getByRole("button", {
          name: "Select visible (first 500)",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: /^Start selected/ }).click();
      const finished = await until(
        (s) => s.jobs.find((j) => j.id === job.id).status === "completed",
      );
      assert.equal(
        finished.jobs.find((j) => j.id === job.id).quality,
        "1080p",
        "Label preference survives the 1080p cap",
      );
      const backupFile = path.join(runDir, "roundtrip.currentbackup");
      await app.evaluate(({ dialog }, file) => {
        globalThis.backupDialogs = {
          save: dialog.showSaveDialog,
          open: dialog.showOpenDialog,
        };
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, backupFile);
      try {
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await settingsTab(/^Advanced/).click();
        await page
          .getByRole("button", { name: "Export…", exact: true })
          .click();
        await page
          .getByLabel("Backup password (at least 12 characters)", {
            exact: true,
          })
          .fill("synthetic backup password");
        await page
          .getByLabel("Confirm password (to export)", { exact: true })
          .fill("synthetic backup password");
        await page
          .getByRole("button", { name: "Export encrypted backup", exact: true })
          .click();
        await page
          .getByText("Encrypted backup saved. Keep its password safe.", {
            exact: true,
          })
          .waitFor();
        assert(!(await fs.readFile(backupFile)).includes(Buffer.from(base)));
        await page.evaluate(
          (id) => window.current.action([id], "remove"),
          job.id,
        );
        await page
          .getByRole("button", { name: "Restore…", exact: true })
          .click();
        await page
          .getByLabel("Backup password (at least 12 characters)", {
            exact: true,
          })
          .fill("synthetic backup password");
        await page
          .getByRole("button", { name: "Restore backup", exact: true })
          .click();
        const restored = await until((s) =>
          s.jobs.some((j) => j.id === job.id),
        );
        assert.equal(restored.settings.autoDownload, false);
        assert.equal(restored.jobs.filter((j) => j.id === job.id).length, 1);
        assert.equal(
          restored.jobs.find((j) => j.id === job.id).status,
          "completed",
        );
        await page.screenshot({
          path: path.join(runDir, "backup-restore.png"),
        });
      } finally {
        await app.evaluate(({ dialog }) => {
          dialog.showSaveDialog = globalThis.backupDialogs.save;
          dialog.showOpenDialog = globalThis.backupDialogs.open;
          delete globalThis.backupDialogs;
        });
      }
    },
  );
  await check(
    "Close minimizes to tray; explicit quit persists history",
    async () => {
      await page.evaluate(() => window.current.windowAction("close"));
      assert.equal(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.getTitle() === "DriftFetch")
            .isVisible(),
        ),
        false,
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle() === "DriftFetch")
          .show(),
      );
      await page.evaluate(() =>
        window.current.settings({ clipboardWatch: false }),
      );
      if (originalClipboard !== undefined)
        await app.evaluate(
          async ({ clipboard }, text) => await clipboard.writeText(text),
          originalClipboard,
        );
      await app.close();
      app = undefined;
      await launch();
      const s = await state();
      assert(s.jobs.some((j) => j.status === "completed"));
      assert.equal(s.settings.quality, "1080");
      assert.equal(s.settings.autoDownload, false);
      assert.equal(s.settings.captureNotifications, false);
    },
  );
  assert.deepEqual(consoleErrors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = String(error);
  if (page)
    await page
      .screenshot({ path: path.join(runDir, "failure.png"), timeout: 5000 })
      .catch(() => {});
  throw error;
} finally {
  if (app) {
    if (originalClipboard !== undefined)
      await app
        .evaluate(
          async ({ clipboard }, text) => await clipboard.writeText(text),
          originalClipboard,
        )
        .catch(() => {});
    const closeDeadline = setTimeout(terminateTestApp, 5000);
    await app.close().catch(() => {});
    clearTimeout(closeDeadline);
  }
  server.closeAllConnections();
  server.close();
  report.consoleErrors = consoleErrors;
  report.engineLog = engineLog;
  await fs.writeFile(
    path.join(runDir, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Report: " + path.join(runDir, "report.json"));
}
