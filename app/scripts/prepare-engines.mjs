import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as openpgp from "openpgp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const root = path.resolve("resources/engines");
const cache = path.resolve(".cache/engines");
await fs.mkdir(root, { recursive: true });
await fs.mkdir(cache, { recursive: true });
async function get(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "DriftFetch-Downloader" },
    signal: AbortSignal.timeout(240000),
  });
  if (!r.ok) throw new Error(`${r.status} fetching ${url}`);
  return r;
}
async function verified(url, expected, destination) {
  console.log(`Downloading ${path.basename(destination)}…`);
  const buffer = Buffer.from(await (await get(url)).arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (hash.toLowerCase() !== expected.toLowerCase())
    throw new Error("SHA-256 mismatch: " + url);
  await fs.writeFile(destination, buffer);
  return hash;
}
// engines.lock.json (tracked) pins each tool's release and checksum so a build
// does not depend on what is "latest" that day. --bump fetches the newest releases and rewrites it.
const lockFile = path.resolve("engines.lock.json");
const bump = process.argv.includes("--bump");
const lock =
  !bump && existsSync(lockFile)
    ? JSON.parse(await fs.readFile(lockFile, "utf8"))
    : {};
const tagOf = (file) => lock[file]?.source?.match(/\/download\/([^/]+)\//)?.[1];
const releaseUrl = (base, file) =>
  tagOf(file) ? `${base}/tags/${tagOf(file)}` : `${base}/latest`;
// The checksum list for yt-dlp must be signed by the key pinned in the app.
const keySource = await fs.readFile("electron/yt-dlp-public-key.ts", "utf8");
const pinnedKey = keySource.match(
  /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/,
)?.[0];
const pinnedFingerprint = keySource.match(
  /ytDlpKeyFingerprint = "([0-9a-f]{40})"/,
)?.[1];
if (!pinnedKey || !pinnedFingerprint)
  throw new Error("Could not read the pinned yt-dlp signing key.");
async function verifyYtDlpSums(sums, signature) {
  const key = await openpgp.readKey({ armoredKey: pinnedKey });
  if (key.getFingerprint() !== pinnedFingerprint)
    throw new Error("Pinned yt-dlp key does not match its fingerprint.");
  const result = await openpgp.verify({
    message: await openpgp.createMessage({ binary: sums }),
    signature: await openpgp.readSignature({ binarySignature: signature }),
    verificationKeys: key,
  });
  await result.signatures[0].verified;
  console.log("yt-dlp checksum list: signature verified.");
}
const manifestFile = path.join(root, "manifest.json");
const manifest = existsSync(manifestFile)
  ? JSON.parse(await fs.readFile(manifestFile, "utf8"))
  : {};
async function valid(file) {
  if (bump) return false;
  if (!existsSync(path.join(root, file)) || !manifest[file]?.sha256)
    return false;
  if (lock[file]?.sha256 && lock[file].sha256 !== manifest[file].sha256)
    return false;
  return (
    createHash("sha256")
      .update(await fs.readFile(path.join(root, file)))
      .digest("hex") === manifest[file].sha256
  );
}
if (!(await valid("yt-dlp.exe"))) {
  const release = await (
    await get(
      releaseUrl(
        "https://api.github.com/repos/yt-dlp/yt-dlp/releases",
        "yt-dlp.exe",
      ),
    )
  ).json();
  const asset = release.assets.find((a) => a.name === "yt-dlp.exe");
  const sumsAsset = release.assets.find((a) => a.name === "SHA2-256SUMS");
  const sigAsset = release.assets.find((a) => a.name === "SHA2-256SUMS.sig");
  if (!sumsAsset || !sigAsset)
    throw new Error("The yt-dlp release is missing its signed checksum list.");
  const sumsBytes = new Uint8Array(
    await (await get(sumsAsset.browser_download_url)).arrayBuffer(),
  );
  await verifyYtDlpSums(
    sumsBytes,
    new Uint8Array(
      await (await get(sigAsset.browser_download_url)).arrayBuffer(),
    ),
  );
  const sums = Buffer.from(sumsBytes).toString("utf8");
  const hash = sums
    .split(/\r?\n/)
    .find((line) => /\s\*?yt-dlp\.exe$/.test(line))
    ?.split(/\s+/)[0];
  if (!hash) throw new Error("Missing yt-dlp checksum");
  await verified(
    asset.browser_download_url,
    hash,
    path.join(root, "yt-dlp.exe"),
  );
  manifest["yt-dlp.exe"] = {
    version: release.tag_name,
    sha256: hash,
    source: asset.browser_download_url,
  };
  await fs.writeFile(
    path.join(root, "yt-dlp-LICENSE.txt"),
    await (
      await get(
        "https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/LICENSE",
      )
    ).text(),
  );
}
// FFmpeg: DriftFetch's own remux-only build (scripts/build-ffmpeg.sh, run by
// npm run ffmpeg:build). It has no encoders and no decoders, only container,
// parser and network code, and its DLLs stay separate files so they can be replaced (LGPL).
const ffmpegBuild = path.resolve(".cache/ffmpeg-remux");
const ffmpegFiles = () =>
  Object.keys(manifest).filter(
    (name) => /^(ffmpeg|ffprobe)\.exe$/.test(name) || name.endsWith(".dll"),
  );
async function ffmpegValid() {
  if (!manifest["ffmpeg.exe"]?.source?.includes("remux-only")) return false;
  const files = ffmpegFiles();
  if (files.length < 3) return false;
  for (const file of files) if (!(await valid(file))) return false;
  return true;
}
if (!(await ffmpegValid())) {
  if (!existsSync(path.join(ffmpegBuild, "ffmpeg.exe")))
    throw new Error(
      "FFmpeg is built from source: run npm run ffmpeg:build first (needs WSL Ubuntu or Linux with mingw-w64).",
    );
  // Remove an earlier build's files (for example a full BtbN one) before copying.
  for (const name of await fs.readdir(root))
    if (
      /^(ffmpeg|ffprobe)\.exe$/.test(name) ||
      name.endsWith(".dll") ||
      /^FFmpeg-/.test(name)
    )
      await fs.rm(path.join(root, name), { force: true });
  for (const name of Object.keys(manifest))
    if (/^(ffmpeg|ffprobe)\.exe$/.test(name) || name.endsWith(".dll"))
      delete manifest[name];
  const buildInfo = await fs.readFile(
    path.join(ffmpegBuild, "FFmpeg-BUILD.txt"),
    "utf8",
  );
  const commit = /commit ([0-9a-f]{40})/.exec(buildInfo)?.[1];
  const tag = /^FFmpeg (n[0-9.]+) /.exec(buildInfo)?.[1];
  if (!commit || !tag)
    throw new Error("FFmpeg-BUILD.txt is missing the source commit.");
  for (const file of await fs.readdir(ffmpegBuild)) {
    if (!/\.(exe|dll)$/.test(file)) continue;
    await fs.copyFile(path.join(ffmpegBuild, file), path.join(root, file));
    const sha256 = createHash("sha256")
      .update(await fs.readFile(path.join(root, file)))
      .digest("hex");
    manifest[file] = {
      version: `${tag}-remux-only`,
      sha256,
      source: "built from source by scripts/build-ffmpeg.sh (remux-only)",
      commit,
    };
  }
  await fs.copyFile(
    path.join(ffmpegBuild, "FFmpeg-LICENSE.txt"),
    path.join(root, "FFmpeg-LICENSE.txt"),
  );
  // Finish the build note with what the finished program reports about itself.
  const { stdout: versionText } = await promisify(execFile)(
    path.join(root, "ffmpeg.exe"),
    ["-hide_banner", "-version"],
    { windowsHide: true, timeout: 30000 },
  );
  await fs.writeFile(
    path.join(root, "FFmpeg-BUILD.txt"),
    buildInfo.replace(/\n*Output of ffmpeg -version needs[^\n]*\n?$/, "\n") +
      "\nOutput of ffmpeg -version:\n" +
      versionText.trim() +
      "\n",
  );
}
if (!(await valid("deno.exe"))) {
  const release = await (
    await get(
      releaseUrl(
        "https://api.github.com/repos/denoland/deno/releases",
        "deno.exe",
      ),
    )
  ).json();
  const asset = release.assets.find(
    (a) => a.name === "deno-x86_64-pc-windows-msvc.zip",
  );
  const checksum = String(asset?.digest || "").replace(/^sha256:/i, "");
  if (!asset || !/^[a-f0-9]{64}$/i.test(checksum))
    throw new Error("Deno's release is missing a SHA-256 digest.");
  const zip = path.join(cache, "deno.zip");
  await verified(asset.browser_download_url, checksum, zip);
  const extracted = path.join(cache, "deno-" + checksum.slice(0, 12));
  await fs.mkdir(extracted, { recursive: true });
  await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:CURRENT_ZIP -DestinationPath $env:CURRENT_EXTRACT -Force",
    ],
    {
      windowsHide: true,
      env: { ...process.env, CURRENT_ZIP: zip, CURRENT_EXTRACT: extracted },
      timeout: 180000,
    },
  );
  const runtime = path.join(extracted, "deno.exe");
  if (!existsSync(runtime)) throw new Error("Unexpected Deno archive layout.");
  await fs.copyFile(runtime, path.join(root, "deno.exe"));
  manifest["deno.exe"] = {
    version: release.tag_name,
    sha256: createHash("sha256")
      .update(await fs.readFile(path.join(root, "deno.exe")))
      .digest("hex"),
    source: asset.browser_download_url,
    archiveSha256: checksum,
  };
}
if (!(await valid("gallery-dl.exe"))) {
  // gallery-dl publishes Windows builds on Codeberg, not GitHub.
  const release = await (
    await get(
      releaseUrl(
        "https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases",
        "gallery-dl.exe",
      ),
    )
  ).json();
  const asset = release.assets.find((a) => a.name === "gallery-dl.exe");
  const sumsAsset = release.assets.find((a) => a.name === "SHA256SUMS");
  if (!asset || !sumsAsset)
    throw new Error("gallery-dl's release is missing verification files.");
  const sums = await (await get(sumsAsset.browser_download_url)).text();
  const hash = sums
    .split(/\r?\n/)
    .find((line) => /\s\*?gallery-dl\.exe$/.test(line))
    ?.split(/\s+/)[0];
  if (!hash) throw new Error("Missing gallery-dl checksum");
  await verified(
    asset.browser_download_url,
    hash,
    path.join(root, "gallery-dl.exe"),
  );
  manifest["gallery-dl.exe"] = {
    version: release.tag_name,
    sha256: hash,
    source: asset.browser_download_url,
  };
  await fs.writeFile(
    path.join(root, "gallery-dl-LICENSE.txt"),
    await (
      await get(
        `https://codeberg.org/mikf/gallery-dl/raw/tag/${release.tag_name}/LICENSE`,
      )
    ).text(),
  );
}
const denoLicense = path.join(root, "Deno-LICENSE.md");
if (!existsSync(denoLicense))
  await fs.writeFile(
    denoLicense,
    await (
      await get(
        `https://raw.githubusercontent.com/denoland/deno/${manifest["deno.exe"].version}/LICENSE.md`,
      )
    ).text(),
  );
const thirdParty = path.join(root, "yt-dlp-THIRD-PARTY-LICENSES.txt");
if (!existsSync(thirdParty))
  await fs.writeFile(
    thirdParty,
    await (
      await get(
        `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${manifest["yt-dlp.exe"].version}/THIRD_PARTY_LICENSES.txt`,
      )
    ).text(),
  );
for (const [file, entry] of Object.entries(manifest))
  if (lock[file]?.sha256 && lock[file].sha256 !== entry.sha256)
    throw new Error(
      `${file} does not match engines.lock.json; delete the cached binary or run with --bump to update the lock.`,
    );
await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
if (bump || Object.keys(manifest).some((file) => !lock[file]))
  await fs.writeFile(lockFile, JSON.stringify(manifest, null, 2) + "\n");
console.log("Bundled engines are ready and checksum-verified.");
