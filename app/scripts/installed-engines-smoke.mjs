import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const run = promisify(execFile);
const installed = path.resolve(process.argv[2]);
const root = path.resolve("test-results", `installed-engines-${Date.now()}`);
await fs.mkdir(root, { recursive: true });
const engines = path.join(installed, "resources", "engines");
// Child processes only see Windows system executables, never development tools.
const env = { ...process.env };
for (const key of Object.keys(env))
  if (key.toLowerCase() === "path") delete env[key];
env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
const checks = [];
const report = { installed, root, checks, success: false };
const execute = (name, args) =>
  run(path.join(engines, name), args, {
    env,
    cwd: root,
    windowsHide: true,
    shell: false,
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024,
  });
let server;
try {
  await fs.access(path.join(installed, "DriftFetch.exe"));
  await fs.access(path.join(installed, "resources", "app.asar"));
  const manifest = JSON.parse(
    await fs.readFile(path.join(engines, "manifest.json"), "utf8"),
  );
  for (const name of [
    "yt-dlp.exe",
    "ffmpeg.exe",
    "ffprobe.exe",
    "deno.exe",
    "gallery-dl.exe",
  ]) {
    const hash = createHash("sha256")
      .update(await fs.readFile(path.join(engines, name)))
      .digest("hex");
    assert.equal(hash, manifest[name].sha256, `${name} checksum`);
    await execute(name, [name.startsWith("ff") ? "-version" : "--version"]);
    checks.push(`${name}: installed checksum and execution passed`);
  }
  // The installed FFmpeg has no encoders; cut a DASH stream out of a committed fixture.
  await execute("ffmpeg.exe", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.resolve("tests/fixtures/media/sample.mp4"),
    "-t",
    "2",
    "-map",
    "0",
    "-c",
    "copy",
    "-f",
    "dash",
    "-seg_duration",
    "1",
    "manifest.mpd",
  ]);
  server = http.createServer(async (req, res) => {
    try {
      const name = path.basename(new URL(req.url, "http://localhost").pathname);
      if (!/^(manifest\.mpd|(?:init|chunk)-stream[^/]+\.m4s)$/.test(name))
        throw new Error("Not a fixture");
      const data = await fs.readFile(path.join(root, name));
      res.writeHead(200, {
        "Content-Length": data.length,
        "Content-Type": name.endsWith(".mpd")
          ? "application/dash+xml"
          : "video/mp4",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const output = path.join(root, "downloaded.mp4");
  await execute("yt-dlp.exe", [
    "--ignore-config",
    "--no-playlist",
    "--ffmpeg-location",
    engines,
    "-f",
    "bestvideo+bestaudio",
    "--merge-output-format",
    "mp4",
    "-o",
    output,
    `http://127.0.0.1:${server.address().port}/manifest.mpd`,
  ]);
  const probe = JSON.parse(
    (
      await execute("ffprobe.exe", [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        output,
      ])
    ).stdout,
  );
  assert(
    probe.streams.some((s) => s.codec_type === "video" && s.height === 360),
  );
  assert(probe.streams.some((s) => s.codec_type === "audio"));
  checks.push(
    "Installed yt-dlp downloaded separate streams and installed FFmpeg merged playable audio/video",
  );
  report.success = true;
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
