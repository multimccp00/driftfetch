import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const input = process.argv[2];
const inlineUrl = input === "--url" ? process.argv[3] : undefined;
if (!input)
  throw new Error(
    "Usage: node scripts/verify-sources.mjs <links.txt> | --url <https-url>",
  );
const engineDir = path.resolve("resources/engines");
const engine = path.join(engineDir, "yt-dlp.exe");
const runtime = path.join(engineDir, "deno.exe");
const links = inlineUrl
  ? [inlineUrl].filter((value) => /^https?:\/\//i.test(value))
  : [
      ...new Set(
        (await fs.readFile(input, "utf8"))
          .split(/\s+/)
          .filter((value) => /^https?:\/\//i.test(value)),
      ),
    ].slice(0, 100);
if (!links.length)
  throw new Error("The file must contain at least one HTTP(S) link.");
const version = spawnSync(engine, ["--version"], {
  encoding: "utf8",
  windowsHide: true,
});
if (version.status !== 0)
  throw new Error("The bundled yt-dlp executable is unavailable.");
const results = links.map((url) => {
  const submitted = new URL(url);
  const safeLink = submitted.origin + submitted.pathname;
  const result = spawnSync(
    engine,
    [
      "--ignore-config",
      "--no-cache-dir",
      "--no-playlist",
      "--skip-download",
      "--dump-single-json",
      "--socket-timeout",
      "25",
      "--ffmpeg-location",
      engineDir,
      ...(existsSync(runtime) ? ["--js-runtimes", `deno:${runtime}`] : []),
      "--",
      url,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  try {
    const data = JSON.parse(result.stdout);
    const formats = Array.isArray(data.formats) ? data.formats : [];
    const height = Math.max(
      Number(data.height) || 0,
      ...formats.map((format) => Number(format.height) || 0),
    );
    return {
      submittedUrl: safeLink,
      source: new URL(data.webpage_url || url).hostname.replace(/^www\./, ""),
      status: Array.isArray(data.entries) ? "collection" : "identified",
      title: String(data.title || "Video").slice(0, 300),
      maxHeight: height || null,
      requiresSeparateAudio: formats.some(
        (format) => format.vcodec !== "none" && format.acodec === "none",
      ),
      engine: version.stdout.trim(),
    };
  } catch {
    return {
      submittedUrl: safeLink,
      status: "failed",
      reason: (
        result.stderr ||
        result.error?.message ||
        "No machine-readable metadata returned"
      )
        .replace(/[?&](?:token|sig|signature|expires)=[^\s&]+/gi, "[redacted]")
        .slice(-500),
      engine: version.stdout.trim(),
    };
  }
});
const output = path.resolve(
  inlineUrl ? "test-results" : path.dirname(input),
  `current-source-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
await fs.writeFile(
  output,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      engine: version.stdout.trim(),
      runtimeBundled: existsSync(runtime),
      links: results,
      inputSha256: createHash("sha256").update(links.join("\n")).digest("hex"),
    },
    null,
    2,
  ),
);
console.log(
  `Checked ${links.length} source links without downloading media. Report: ${output}`,
);
