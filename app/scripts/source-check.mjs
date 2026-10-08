import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const engines = path.join(root, "resources", "engines");
const ytDlp = path.join(engines, "yt-dlp.exe");
const deno = path.join(engines, "deno.exe");
const checks = [
  {
    source: "YouTube",
    linkType: "Individual video",
    url: "https://www.youtube.com/watch?v=YE7VzlLtp-4",
    runtime: true,
  },
  {
    source: "Internet Archive",
    linkType: "Individual item",
    url: "https://archive.org/details/BigBuckBunny_328",
  },
  {
    source: "Vimeo",
    linkType: "Individual video",
    url: "https://vimeo.com/76979871",
  },
  {
    source: "Dailymotion",
    linkType: "Individual public video",
    url: "https://www.dailymotion.com/video/x6nqmd",
  },
  {
    source: "TED",
    linkType: "Individual public talk",
    url: "https://www.ted.com/talks/sir_ken_robinson_do_schools_kill_creativity",
  },
  {
    source: "Wikimedia Commons",
    linkType: "Individual public media file",
    url: "https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm",
  },
  {
    source: "Rumble",
    linkType: "Individual public video",
    url: "https://rumble.com/v7bb07y-big-buck-bunny.html",
  },
  {
    source: "PeerTube",
    linkType: "Individual public video",
    url: "https://peertube.tv/videos/watch/2d528570-bb67-4ebe-a569-4529448b6b2f",
  },
];

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(ytDlp, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
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

const engineVersion = (await run(["--version"])).stdout.trim();
const results = [];
for (const check of checks) {
  const result = await run([
    "--ignore-config",
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    ...(check.runtime ? ["--js-runtimes", `deno:${deno}`] : []),
    check.url,
  ]);
  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch {
    metadata = undefined;
  }
  results.push({
    source: check.source,
    linkType: check.linkType,
    url: check.url,
    status: metadata ? "metadata available" : "needs attention",
    extractor: metadata?.extractor_key,
    title: metadata?.title,
    availableHeight: metadata?.height,
    formats: Array.isArray(metadata?.formats) ? metadata.formats.length : 0,
    message: metadata
      ? undefined
      : result.stderr.replace(/\s+/g, " ").trim().slice(-500),
  });
}
const report = {
  testedAt: new Date().toISOString(),
  engine: { ytDlp: engineVersion },
  results,
};
const destination = path.join(
  root,
  "test-results",
  `source-check-${Date.now()}.json`,
);
await fs.writeFile(destination, JSON.stringify(report, null, 2));
console.log(destination);
for (const result of results)
  console.log(
    `${result.status.toUpperCase()}: ${result.source} — ${result.linkType}`,
  );
