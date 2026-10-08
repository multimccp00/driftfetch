import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = path.resolve("resources/engines");
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "manifest.json"), "utf8"),
);
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const packageLock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));

// Engine binaries: the five programs plus the FFmpeg DLLs recorded in the manifest.
const required = [
  "yt-dlp.exe",
  "ffmpeg.exe",
  "ffprobe.exe",
  "deno.exe",
  "gallery-dl.exe",
  ...Object.keys(manifest).filter((name) => name.endsWith(".dll")),
];
for (const file of required) {
  if (!existsSync(path.join(root, file)) || !manifest[file]?.sha256)
    throw new Error(`Missing release engine: ${file}`);
  const actual = createHash("sha256")
    .update(await fs.readFile(path.join(root, file)))
    .digest("hex");
  if (actual !== manifest[file].sha256)
    throw new Error(`Engine checksum mismatch: ${file}`);
}
if (!manifest["ffmpeg.exe"].source.includes("remux-only"))
  throw new Error(
    "FFmpeg must be DriftFetch's remux-only build (npm run ffmpeg:build): no encoders or decoders.",
  );
// The point of that build: the finished programs must contain no codec implementations.
if (process.platform === "win32")
  for (const listing of ["-decoders", "-encoders", "-hwaccels"]) {
    const { stdout } = spawnSync(
      path.join(root, "ffmpeg.exe"),
      ["-hide_banner", listing],
      { encoding: "utf8", windowsHide: true },
    );
    const lines = stdout.split(/\r?\n/);
    // Codec lists have a legend, then entries like " V....D h264"; hwaccels list names after a title.
    const entries =
      listing === "-hwaccels"
        ? lines.slice(1).filter((line) => line.trim())
        : lines.filter((line) =>
            /^ [VAS.][F.][S.][X.][B.][D.] [^\s=]/.test(line),
          );
    if (entries.length)
      throw new Error(
        `ffmpeg.exe ${listing} is not empty (${entries.slice(0, 3).join("; ")}); it must ship no codecs.`,
      );
  }
if (required.filter((name) => name.endsWith(".dll")).length < 5)
  throw new Error("The FFmpeg DLLs are missing from the engine manifest.");

// Licence texts and the source offer.
for (const notice of [
  "LICENSE",
  "THIRD-PARTY-NOTICES.md",
  "SOURCE-OFFER.md",
  path.join(root, "Deno-LICENSE.md"),
  path.join(root, "yt-dlp-LICENSE.txt"),
  path.join(root, "yt-dlp-THIRD-PARTY-LICENSES.txt"),
  path.join(root, "FFmpeg-LICENSE.txt"),
  path.join(root, "FFmpeg-BUILD.txt"),
  path.join(root, "gallery-dl-LICENSE.txt"),
])
  if (!existsSync(notice)) throw new Error(`Missing release notice: ${notice}`);
const offer = await fs.readFile("SOURCE-OFFER.md", "utf8");
if (offer.includes("SET-BEFORE-RELEASE"))
  throw new Error(
    "SOURCE-OFFER.md still has no contact address. Set the 'From us' contact before releasing.",
  );
const privacy = await fs.readFile("build/privacy-notice.txt", "utf8");
if (privacy.includes("SET-BEFORE-RELEASE"))
  throw new Error(
    "The privacy note still has no contact address (shared/privacy-note.ts). Set it, then run npm run privacy.",
  );
const notices = await fs.readFile("THIRD-PARTY-NOTICES.md", "utf8");
const missingFromNotices = [
  manifest["yt-dlp.exe"].version,
  manifest["deno.exe"].version,
  manifest["gallery-dl.exe"].version,
  manifest["ffmpeg.exe"].version.replace(/-remux-only$/, ""),
  packageLock.packages["node_modules/openpgp"].version,
  packageLock.packages["node_modules/electron"].version,
].filter((version) => !notices.includes(version));
if (missingFromNotices.length)
  throw new Error(
    `THIRD-PARTY-NOTICES.md is out of date; it does not mention: ${missingFromNotices.join(", ")}`,
  );
// LGPL: openpgp must stay a separate, replaceable module, not be bundled into DriftFetch.
if (!pkg.dependencies?.openpgp)
  throw new Error(
    "openpgp must be a runtime dependency so it ships as its own module.",
  );
console.log(
  "Release inputs verified: engine binaries and DLLs, checksums, licences, notices and source offer.",
);
