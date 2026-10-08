// Downloads the source archives of the GPL/LGPL components that ship with a release
// (see SOURCE-OFFER.md) and zips them with their checksums.
//   npm run sources            -> release/<version>/corresponding-source-<version>.zip
//   node scripts/fetch-sources.mjs <output folder>
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const lock = JSON.parse(await fs.readFile("engines.lock.json", "utf8"));
const packageLock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const out = path.resolve(process.argv[2] || path.join("release", pkg.version));
const folder = path.join(out, "source");
await fs.rm(folder, { recursive: true, force: true });
await fs.mkdir(folder, { recursive: true });

const ffmpegCommit = lock["ffmpeg.exe"]?.commit;
const openpgpVersion = packageLock.packages["node_modules/openpgp"]?.version;
const sources = [
  {
    name: `yt-dlp-${lock["yt-dlp.exe"].version}.tar.gz`,
    url: `https://github.com/yt-dlp/yt-dlp/archive/refs/tags/${lock["yt-dlp.exe"].version}.tar.gz`,
  },
  {
    name: `gallery-dl-${lock["gallery-dl.exe"].version}.tar.gz`,
    url: `https://codeberg.org/mikf/gallery-dl/archive/${lock["gallery-dl.exe"].version}.tar.gz`,
  },
  {
    name: `FFmpeg-${ffmpegCommit}.tar.gz`,
    url: `https://github.com/FFmpeg/FFmpeg/archive/${ffmpegCommit}.tar.gz`,
  },
  {
    name: `openpgp-${openpgpVersion}.tgz`,
    url: `https://registry.npmjs.org/openpgp/-/openpgp-${openpgpVersion}.tgz`,
  },
];
if (!ffmpegCommit || !openpgpVersion)
  throw new Error("Could not work out the FFmpeg commit or openpgp version.");

const sums = [];
for (const source of sources) {
  console.log(`Downloading ${source.name}…`);
  const response = await fetch(source.url, {
    headers: { "User-Agent": "DriftFetch-Downloader" },
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok)
    throw new Error(`${response.status} fetching ${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000)
    throw new Error(`${source.name} is suspiciously small.`);
  await fs.writeFile(path.join(folder, source.name), bytes);
  sums.push(
    `${createHash("sha256").update(bytes).digest("hex")}  ${source.name}`,
  );
}
await fs.writeFile(path.join(folder, "SHA256SUMS"), sums.join("\n") + "\n");
await fs.writeFile(
  path.join(folder, "README.txt"),
  [
    `Corresponding source for the GPL/LGPL components shipped with DriftFetch ${pkg.version}.`,
    "See SOURCE-OFFER.md in the DriftFetch repository or in resources/licenses of the installed app.",
    "FFmpeg is built with scripts/build-ffmpeg.sh and the patches in scripts/ffmpeg-patches/ (copied into ffmpeg-build/).",
    "",
  ].join("\n"),
);
// The build script and patches are part of the corresponding source of the FFmpeg build.
await fs.cp(
  "scripts/ffmpeg-patches",
  path.join(folder, "ffmpeg-build", "ffmpeg-patches"),
  { recursive: true },
);
await fs.copyFile(
  "scripts/build-ffmpeg.sh",
  path.join(folder, "ffmpeg-build", "build-ffmpeg.sh"),
);
const zip = path.join(out, `corresponding-source-${pkg.version}.zip`);
await fs.rm(zip, { force: true });
await promisify(execFile)(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Compress-Archive -Path (Join-Path $env:CURRENT_SOURCE '*') -DestinationPath $env:CURRENT_ZIP -Force",
  ],
  {
    windowsHide: true,
    env: { ...process.env, CURRENT_SOURCE: folder, CURRENT_ZIP: zip },
    timeout: 300000,
  },
);
console.log(`Wrote ${zip}`);
