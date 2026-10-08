import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const browserIndex = args.indexOf("--browser");
const browser = browserIndex >= 0 ? args.splice(browserIndex, 2)[1] : undefined;
const urls = args.filter((value) => /^https?:\/\//i.test(value));
if (!urls.length) throw new Error("Pass one or more HTTP(S) links to check.");

const engines = path.join(process.cwd(), "resources", "engines");
const ytDlp = path.join(engines, "yt-dlp.exe");
const deno = path.join(engines, "deno.exe");
function run(exe, command) {
  return new Promise((resolve) => {
    const child = spawn(exe, command, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: error.message });
    });
  });
}
const results = [];
for (const url of urls) {
  const result = await run(ytDlp, [
    "--ignore-config",
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    "--js-runtimes",
    `deno:${deno}`,
    ...(browser ? ["--cookies-from-browser", browser] : []),
    url,
  ]);
  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch {
    metadata = undefined;
  }
  results.push({
    source: new URL(url).hostname,
    checkedAt: new Date().toISOString(),
    browserSession: browser ? "requested" : "not used",
    status: metadata ? "metadata available" : "needs attention",
    extractor: metadata?.extractor_key,
    availableHeight: metadata?.height,
    formats: Array.isArray(metadata?.formats) ? metadata.formats.length : 0,
    message: metadata
      ? undefined
      : result.stderr.replace(/\s+/g, " ").trim().slice(-500),
  });
}
const reportPath = path.join(
  process.cwd(),
  "test-results",
  `private-source-check-${Date.now()}.json`,
);
await fs.writeFile(reportPath, JSON.stringify({ results }, null, 2));
console.log(reportPath);
for (const result of results)
  console.log(`${result.status.toUpperCase()}: ${result.source}`);
