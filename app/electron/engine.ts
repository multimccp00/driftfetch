import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { EngineInfo, Job, Entry } from "../src/shared";
import { domainOf, normalizeUrl } from "./core";
import { preferredLabelFormat } from "../shared/quality";
import { verifyDetached, type SigningKey } from "./signature";
import { ytDlpKeyFingerprint, ytDlpPublicKey } from "./yt-dlp-public-key";
import {
  galleryDlKeyFingerprint,
  galleryDlPublicKey,
} from "./gallery-dl-public-key";

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}
export interface Running {
  child: ChildProcess;
  done: Promise<ProcessResult>;
  stop(): Promise<void>;
}
// The frozen Windows engine otherwise writes the local code page, which loses
// Unicode output paths. Its own settings work even when Python env vars do not.
const galleryOutputArgs = [
  "--config-ignore",
  "--no-colors",
  "--option",
  "output.stdout=utf-8",
  "--option",
  "output.stderr=utf-8",
  "--option",
  "output.mode=pipe",
];
export function runProcess(
  exe: string,
  args: string[],
  onLine?: (line: string) => void,
  timeout = 0,
  idleTimeout = 0,
): Running {
  const child = spawn(exe, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Preserve UTF-8 code points split across separate OS pipe chunks.
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  let stdout = "",
    stderr = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const activity = () => {
    if (!idleTimeout) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      void stop();
    }, idleTimeout);
  };
  const done = new Promise<ProcessResult>((resolve, reject) => {
    child.once("error", reject);
    child.stdout!.on("data", (data) => {
      activity();
      // Streamed output goes to onLine; do not also buffer it.
      if (!onLine && stdout.length < 16_000_000) stdout += data.toString();
    });
    child.stderr!.on("data", (data) => {
      activity();
      stderr = (stderr + data.toString()).slice(-12000);
    });
    if (onLine) {
      const lines = createInterface({ input: child.stdout! });
      lines.on("line", onLine);
    }
    child.once("close", (code) => {
      if (timer) clearTimeout(timer);
      clearTimeout(idleTimer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
  const stop = async () => {
    if (child.exitCode !== null || !child.pid) return;
    if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      await new Promise<void>((resolve) => {
        const killer = spawn(
          path.join(systemRoot, "System32", "taskkill.exe"),
          ["/pid", String(child.pid), "/T", "/F"],
          { windowsHide: true, shell: false },
        );
        killer.once("close", (code) => {
          if (code !== 0) child.kill();
          resolve();
        });
        killer.once("error", () => {
          child.kill();
          resolve();
        });
      });
    } else child.kill("SIGTERM");
    await done.catch(() => {});
  };
  if (timeout)
    timer = setTimeout(() => {
      timedOut = true;
      void stop();
    }, timeout);
  activity();
  return { child, done, stop };
}
export function metadataJob(info: any, originalUrl: string): Partial<Job> {
  const sourceUrl =
    normalizeUrl(info.webpage_url || info.original_url || "") || originalUrl;
  if (
    info._type === "playlist" ||
    info._type === "multi_video" ||
    Array.isArray(info.entries)
  ) {
    const entries: Entry[] = (info.entries || [])
      .filter(Boolean)
      .slice(0, 100)
      .flatMap((e: any, index: number) => {
        let url = normalizeUrl(e.webpage_url || e.url || "");
        // HTML5 <video> entries all report the page itself; re-adding it
        // would dedupe against this collection, so queue the media file.
        const mediaFile = url === sourceUrl && !!normalizeUrl(e.url || "");
        if (mediaFile) url = normalizeUrl(e.url);
        if (!url && /youtube/i.test(e.ie_key || "") && e.id)
          url = `https://www.youtube.com/watch?v=${encodeURIComponent(e.id)}`;
        return url
          ? [
              {
                id: String(index),
                title: String(e.title || e.id || "Video"),
                url,
                thumbnail:
                  normalizeUrl(
                    e.thumbnail || e.thumbnails?.at(-1)?.url || "",
                  ) || undefined,
                ...(mediaFile ? { mediaFile } : {}),
              },
            ]
          : [];
      });
    return {
      title: String(info.title || "Collection"),
      source: domainOf(sourceUrl),
      resolvedUrl: sourceUrl,
      status: "collection",
      linkType: "collection",
      entries,
      collectionLimited:
        (info.entries?.length || 0) > 100 || (info.playlist_count || 0) > 100,
    };
  }
  if (
    !info.id ||
    (!info.url && !info.formats?.length && !info.requested_downloads?.length)
  )
    throw new Error("No video formats");
  const formats: any[] = info.formats || [];
  const maxHeight = Math.max(
    Number(info.height) || 0,
    ...formats.map((f) => Number(f.height) || 0),
  );
  const extractor = String(info.extractor_key || info.extractor || "Generic");
  const generic = /generic|html5/i.test(extractor);
  const namespace = generic ? `${extractor}@${domainOf(sourceUrl)}` : extractor;
  // yt-dlp's generic id is the path basename without the query, so pages told
  // apart only by their query (watch.php?v=1 / ?v=2) would collide: add the page URL.
  const identity = generic
    ? `${info.id}:${createHash("sha1").update(sourceUrl).digest("hex").slice(0, 8)}`
    : info.id;
  const account = /instagram/i.test(extractor)
    ? info.channel || info.uploader_id
    : undefined;
  return {
    title: String(info.title || info.id),
    ...(account ? { galleryFolder: String(account) } : {}),
    source: domainOf(sourceUrl),
    resolvedUrl: sourceUrl,
    mediaKey: `${namespace}:${identity}`,
    duration: Number(info.duration) || undefined,
    thumbnailUrl:
      normalizeUrl(
        String(info.thumbnail || info.thumbnails?.at(-1)?.url || ""),
      ) || undefined,
    quality: maxHeight ? `${maxHeight}p` : "Unknown",
    availableHeight: maxHeight || undefined,
    linkType:
      domainOf(originalUrl) !== domainOf(sourceUrl)
        ? "redirect"
        : /html5/i.test(extractor)
          ? "embedded video"
          : /\.(mp4|webm|mkv|mov)(?:\?|$)/i.test(originalUrl)
            ? "direct file"
            : "video page",
    preferredFormatId: preferredLabelFormat(formats),
    formats: formats
      .filter(
        (f) =>
          f.vcodec !== "none" && /^[a-zA-Z0-9_.-]+$/.test(String(f.format_id)),
      )
      .slice(-200)
      .map((f) => ({
        id: String(f.format_id),
        height: Number(f.height) || undefined,
        ext: String(f.ext || "unknown"),
        bitrate: Number(f.tbr) || undefined,
        size: Number(f.filesize || f.filesize_approx) || undefined,
        separateAudio: f.acodec === "none",
      })),
    totalBytes: Number(info.filesize || info.filesize_approx) || undefined,
  };
}

/** Links gallery-dl hands on to another site's extractor ([6, url, data] messages). */
export function galleryDlLinks(stdout: string): string[] {
  let messages: unknown;
  try {
    messages = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(messages)) return [];
  const links = messages.flatMap((m) =>
    Array.isArray(m) && m[0] === 6 && typeof m[1] === "string"
      ? [normalizeUrl(m[1])]
      : [],
  );
  return [...new Set(links.filter((link): link is string => !!link))];
}

export function galleryDlMetadata(
  stdout: string,
  originalUrl: string,
): Partial<Job> | undefined {
  // gallery-dl --dump-json prints [[2, directory], [3, url, file], ...].
  let messages: unknown;
  try {
    messages = JSON.parse(stdout);
  } catch {
    return;
  }
  if (!Array.isArray(messages)) return;
  const files = messages.filter(
    (m): m is [number, string, any] =>
      Array.isArray(m) && m[0] === 3 && typeof m[1] === "string",
  );
  if (!files.length) return;
  const info = files[0][2] || {};
  const text = (...values: unknown[]) =>
    values.find((v): v is string | number =>
      typeof v === "string" ? !!v : typeof v === "number",
    );
  const account = text(info.username, info.uploader, info.author);
  const post = text(info.shortcode, info.post_shortcode, info.post_id, info.id);
  const video = (url: string, file: any) =>
    url.startsWith("ytdl:") ||
    /^(mp4|webm|mov|m4v)$/i.test(String(file?.extension));
  const videos = files.filter(([, url, file]) => video(url, file)).length;
  const postTitle = text(info.title);
  return {
    title: postTitle
      ? String(postTitle).slice(0, 200)
      : account
        ? `${account} ${post ?? ""}`.trim()
        : `Images from ${domainOf(originalUrl)}`,
    galleryFolder: account ? String(account) : undefined,
    source: domainOf(originalUrl),
    resolvedUrl: originalUrl,
    mediaKey: `GalleryDL:${originalUrl}`,
    status: "collection",
    linkType: videos === files.length ? "video page" : "image gallery",
    collectionKind: "images",
    entries: files.slice(0, 100).map(([, url, file], index) => ({
      id: String(index),
      title: `${video(url, file) ? "Video" : "Image"} ${index + 1}`,
      url,
      thumbnail:
        normalizeUrl(file?.thumbnail || file?.preview_url || "") || undefined,
    })),
    collectionLimited: files.length > 100,
  };
}

/**
 * Site-specific gallery readers are not built in; they ship as extensions
 * (see docs/EXTENSIONS.md). Kept as the core hook the queue calls first.
 */
export async function imageGalleryMetadata(
  _url: string,
  _signal?: AbortSignal,
): Promise<Partial<Job> | undefined> {
  return undefined;
}
export function downloadArgs(job: Job): string[] {
  const format = job.imageUrls?.length
    ? "b"
    : job.selectedFormatId &&
        job.formats?.some((f) => f.id === job.selectedFormatId) &&
        /^[a-zA-Z0-9_.-]+$/.test(job.selectedFormatId)
      ? job.selectedFormatId +
        (job.formats.find((f) => f.id === job.selectedFormatId)?.separateAudio
          ? "+ba"
          : "")
      : job.qualityLimit && job.qualityLimit !== "best"
        ? `${job.preferredFormatId && /^[a-zA-Z0-9_.-]+$/.test(job.preferredFormatId) ? `${job.preferredFormatId}[height<=?${job.qualityLimit}]/` : ""}bv*[height<=?${job.qualityLimit}]+ba/b[height<=?${job.qualityLimit}]`
        : job.preferredFormatId &&
            /^[a-zA-Z0-9_.-]+$/.test(job.preferredFormatId)
          ? job.preferredFormatId
          : "bv*+ba/b";
  return [
    ...(job.speedLimitKiB ? ["--limit-rate", `${job.speedLimitKiB}K`] : []),
    ...(job.fragmentConcurrency && job.fragmentConcurrency > 1
      ? ["--concurrent-fragments", String(job.fragmentConcurrency)]
      : []),
    ...(job.refererUrl
      ? ["--referer", job.refererUrl]
      : job.imageUrls?.length && (job.resolvedUrl || job.originalUrl)
        ? ["--referer", job.resolvedUrl || job.originalUrl]
        : []),
    "--no-playlist",
    ...(job.requestDelaySec
      ? ["--sleep-requests", String(job.requestDelaySec)]
      : []),
    "--continue",
    "--no-overwrites",
    "--newline",
    "--progress",
    "--progress-delta",
    "0.5",
    "--progress-template",
    "download:CURRENT_PROGRESS:%(progress)j",
    "--print",
    "before_dl:CURRENT_FORMAT:%(height)j",
    "--print",
    "before_dl:CURRENT_FORMAT_ID:%(format_id)j",
    "--print",
    "after_move:CURRENT_FILE:%(filepath)j",
    "--no-simulate",
    "--format",
    format,
    "--merge-output-format",
    "mkv",
    "--windows-filenames",
    "--trim-filenames",
    "180",
    "--paths",
    job.targetDir!,
    "--output",
    job.outputTemplate!,
  ];
}
export function probeArgs(
  common: string[],
  url: string,
  auth: string[] = [],
): string[] {
  return [
    ...common,
    "--dump-single-json",
    "--playlist-end",
    "101",
    "--skip-download",
    // A shared story link names one item; yt-dlp returns just that one with --no-playlist.
    ...(/instagram\.com\/stories\/[^/?#]+\/\d+/i.test(url)
      ? ["--no-playlist"]
      : []),
    ...auth,
    "--",
    url,
  ];
}
/** yt-dlp versions are YYYY.MM.DD[.HHMMSS]; compare segment by segment. */
export function needsBundledEngine(
  installed: string | undefined,
  bundled: string | undefined,
): boolean {
  if (!bundled) return false;
  if (!installed) return true;
  const a = installed.split(".").map(Number),
    b = bundled.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0,
      y = b[i] || 0;
    if (Number.isNaN(x)) return true;
    if (x !== y) return x < y;
  }
  return false;
}
export class Engine {
  info: EngineInfo = {
    version: "Not installed",
    available: false,
    ffmpegAvailable: false,
    jsRuntimeAvailable: false,
    canRollback: false,
    busy: false,
  };
  /** Pinned key that must have signed the checksum list of any downloaded update. */
  signingKey: SigningKey = {
    armored: ytDlpPublicKey,
    fingerprint: ytDlpKeyFingerprint,
  };
  /** Pinned key that must have signed gallery-dl's checksum list. */
  galleryKey: SigningKey = {
    armored: galleryDlPublicKey,
    fingerprint: galleryDlKeyFingerprint,
  };
  constructor(
    public directory: string,
    private bundled: string,
    private changed: () => void,
  ) {}
  get executable() {
    return path.join(this.directory, "yt-dlp.exe");
  }
  /** Tools that never self-update run straight from the install folder. */
  private tool(file: string) {
    return path.join(this.bundled, file);
  }
  /** gallery-dl updated from inside the app lives in userData; until then the bundled copy runs. */
  get galleryExecutable() {
    const updated = path.join(this.directory, "gallery-dl.exe");
    return existsSync(updated) ? updated : this.tool("gallery-dl.exe");
  }
  private async versionOf(exe: string): Promise<string | undefined> {
    try {
      const result = await runProcess(exe, ["--version"], undefined, 15000)
        .done;
      return result.code ? undefined : result.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    // Earlier versions copied every tool here and never refreshed them.
    for (const file of ["ffmpeg.exe", "ffprobe.exe", "deno.exe"])
      await fs.rm(path.join(this.directory, file), { force: true });
    // An updated gallery-dl is dropped once this release bundles one at least as new.
    const updatedGallery = path.join(this.directory, "gallery-dl.exe");
    if (existsSync(updatedGallery)) {
      const bundled = await fs
        .readFile(this.tool("manifest.json"), "utf8")
        .then((text) =>
          String(JSON.parse(text)["gallery-dl.exe"]?.version ?? "").replace(
            /^v/,
            "",
          ),
        )
        .catch(() => undefined);
      const updated = await this.versionOf(updatedGallery);
      if (!updated || (bundled && !needsBundledEngine(bundled, updated)))
        for (const file of [updatedGallery, updatedGallery + ".previous"])
          await fs.rm(file, { force: true });
    }
    // yt-dlp self-updates, so it lives in userData; replace it only when this
    // release ships a newer one.
    const bundledExe = this.tool("yt-dlp.exe");
    if (existsSync(bundledExe)) {
      const manifest = await fs
        .readFile(this.tool("manifest.json"), "utf8")
        .then((text) => JSON.parse(text)["yt-dlp.exe"]?.version as string)
        .catch(() => undefined);
      let installed: string | undefined;
      if (existsSync(this.executable))
        try {
          const result = await runProcess(
            this.executable,
            ["--version"],
            undefined,
            15000,
          ).done;
          if (!result.code) installed = result.stdout.trim();
        } catch {
          // A broken binary counts as missing.
        }
      if (needsBundledEngine(installed, manifest)) {
        if (existsSync(this.executable))
          await fs.copyFile(this.executable, this.executable + ".previous");
        await fs.copyFile(bundledExe, this.executable);
      }
    }
    await this.refresh();
  }
  async refresh() {
    this.info.available = existsSync(this.executable);
    this.info.ffmpegAvailable = existsSync(this.tool("ffmpeg.exe"));
    const runtime = this.tool("deno.exe");
    this.info.jsRuntimeAvailable = existsSync(runtime);
    this.info.jsRuntimeVersion = undefined;
    if (this.info.jsRuntimeAvailable) {
      try {
        const result = await runProcess(
          runtime,
          ["--version"],
          undefined,
          15000,
        ).done;
        if (result.code) throw new Error();
        const version = /^deno\s+(.+)$/m.exec(result.stdout)?.[1]?.trim();
        if (!version) throw new Error();
        this.info.jsRuntimeVersion = version;
      } catch {
        this.info.jsRuntimeAvailable = false;
      }
    }
    this.info.galleryVersion = await this.versionOf(this.galleryExecutable);
    this.info.canRollback =
      existsSync(this.executable + ".previous") ||
      existsSync(path.join(this.directory, "gallery-dl.exe.previous"));
    if (this.info.available) {
      try {
        const result = await runProcess(
          this.executable,
          ["--version"],
          undefined,
          15000,
        ).done;
        if (result.code) throw new Error();
        this.info.version = result.stdout.trim();
      } catch {
        this.info.available = false;
        this.info.version = "Unavailable";
      }
    }
    this.changed();
  }
  commonArgs(): string[] {
    return [
      "--ignore-config",
      "--no-cache-dir",
      "--no-colors",
      "--socket-timeout",
      "25",
      "--retries",
      "3",
      "--fragment-retries",
      "3",
      "--abort-on-unavailable-fragments",
      // Unknown sites behind Cloudflare 403 a plain request; a browser TLS
      // fingerprint (curl_cffi, bundled in yt-dlp.exe) gets through.
      "--extractor-args",
      "generic:impersonate",
      // Patches yt-dlp extractors (resources/yt-dlp-plugins) until upstream fixes land.
      "--plugin-dirs",
      path.join(this.bundled, "..", "yt-dlp-plugins"),
      "--ffmpeg-location",
      this.bundled,
      ...(this.info.jsRuntimeAvailable
        ? ["--js-runtimes", `deno:${this.tool("deno.exe")}`]
        : []),
    ];
  }
  probe(url: string, auth: string[] = []): Running {
    if (!this.info.available) throw new Error("Engine unavailable");
    return runProcess(
      this.executable,
      probeArgs(this.commonArgs(), url, auth),
      undefined,
      120000,
    );
  }
  /** gallery-dl hands videos (Reddit and Instagram DASH streams) to its bundled yt-dlp, which needs FFmpeg to merge audio. */
  private galleryVideoArgs(): string[] {
    return [
      "--option",
      `downloader.ytdl.raw-options=${JSON.stringify({
        ffmpeg_location: path.dirname(this.tool("ffmpeg.exe")),
        // The remux-only FFmpeg cannot describe VP9 inside MP4 (it would need a
        // decoder); MKV needs no such data, and is what yt-dlp downloads use too.
        merge_output_format: "mkv",
      })}`,
    ];
  }
  /** Lists direct media URLs with gallery-dl, for image posts yt-dlp cannot extract. */
  listImages(
    url: string,
    auth: string[] = [],
    requestDelaySec = 0,
  ): Running | undefined {
    const exe = this.galleryExecutable;
    if (!existsSync(exe)) return;
    // gallery-dl accepts yt-dlp's --cookies / --cookies-from-browser syntax.
    return runProcess(
      exe,
      [
        ...galleryOutputArgs,
        "--dump-json",
        ...(requestDelaySec
          ? ["--sleep-request", String(requestDelaySec)]
          : []),
        ...auth,
        "--",
        url,
      ],
      undefined,
      120000,
    );
  }
  download(job: Job, auth: string[], onLine: (line: string) => void): Running {
    if (job.mediaKey?.startsWith("GalleryDL:"))
      return runProcess(
        this.galleryExecutable,
        [
          ...galleryOutputArgs,
          "--directory",
          job.targetDir!,
          "--filename",
          "{username|category}_{shortcode|id|filename}_{num|filename}.{extension}",
          ...(job.galleryRange ? ["--range", job.galleryRange] : []),
          // Remembers saved profile items so later runs fetch only new posts.
          ...(job.linkType === "profile"
            ? [
                "--download-archive",
                path.join(this.directory, "..", "gallery-dl-archive.sqlite3"),
              ]
            : []),
          ...(job.speedLimitKiB
            ? ["--limit-rate", `${job.speedLimitKiB}k`]
            : []),
          ...(job.requestDelaySec
            ? ["--sleep-request", String(job.requestDelaySec)]
            : []),
          ...this.galleryVideoArgs(),
          ...auth,
          "--",
          job.resolvedUrl || job.originalUrl,
        ],
        // gallery-dl prints each saved path; already-present files start with "# ".
        (line) => {
          const file = line.replace(/^# /, "").trim();
          if (path.isAbsolute(file))
            onLine("CURRENT_FILE:" + JSON.stringify(file));
        },
        0,
        job.imageSearch ? 120_000 : 0,
      );
    if (job.imageUrls?.length) {
      // Outside the download folder, so a crash leaves nothing behind there.
      const batchFile = path.join(
        os.tmpdir(),
        `current-gallery-${randomUUID()}.txt`,
      );
      writeFileSync(batchFile, job.imageUrls.join("\n"), "utf8");
      const running = runProcess(
        this.galleryExecutable,
        [
          ...galleryOutputArgs,
          "--directory",
          job.targetDir!,
          "--filename",
          // Direct image URLs have no post id. Hash the URL to distinguish
          // identical basenames, with stable names when retrying the same job.
          "\fF {filename[:80]}_{hash_sha1(_url)[:16]}.{extension}",
          "--windows-filenames",
          "--option",
          `downloader.http.headers.Referer=${job.resolvedUrl || job.originalUrl}`,
          ...(job.speedLimitKiB
            ? ["--limit-rate", `${job.speedLimitKiB}k`]
            : []),
          ...this.galleryVideoArgs(),
          "--input-file",
          batchFile,
          ...auth,
        ],
        (line) => {
          const file = line.replace(/^# /, "").trim();
          if (path.isAbsolute(file))
            onLine("CURRENT_FILE:" + JSON.stringify(file));
        },
      );
      const cleanup = () => fs.rm(batchFile, { force: true }).catch(() => {});
      return {
        ...running,
        done: running.done.then(
          async (result) => {
            await cleanup();
            return result;
          },
          async (error) => {
            await cleanup();
            throw error;
          },
        ),
      };
    }
    const running = runProcess(
      this.executable,
      [
        ...this.commonArgs(),
        ...downloadArgs(job),
        ...auth,
        "--",
        job.resolvedUrl || job.originalUrl,
      ],
      onLine,
      0,
      // A hung merge or post-processor would otherwise hold its slot forever.
      10 * 60_000,
    );
    return running;
  }
  inspectFile(filePath: string): Running {
    return runProcess(
      this.tool("ffprobe.exe"),
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height:stream_disposition=attached_pic",
        "-of",
        "json",
        filePath,
      ],
      undefined,
      15000,
    );
  }
  /** Updates yt-dlp and gallery-dl, each verified against its maintainers' pinned key. */
  async update() {
    if (this.info.busy)
      throw new Error("An engine operation is already running.");
    this.info.busy = true;
    this.info.message = "Downloading and verifying the engines…";
    this.changed();
    const failures: string[] = [];
    let updated = false;
    for (const [name, step] of [
      ["yt-dlp", () => this.updateYtDlp()],
      ["gallery-dl", () => this.updateGalleryDl()],
    ] as const)
      try {
        if (await step()) updated = true;
      } catch (err) {
        failures.push(
          `${name}: ${err instanceof Error ? err.message : "Update failed. The installed engine was kept."}`,
        );
      }
    this.info.message = failures.length
      ? failures.join(" ")
      : updated
        ? "Engines updated and verified."
        : "Engines are up to date.";
    this.info.busy = false;
    await this.refresh();
    if (failures.length) throw new Error(this.info.message);
  }
  private async updateYtDlp() {
    const staged = path.join(this.directory, `yt-dlp-${randomUUID()}.exe`);
    try {
      const release = await fetch(
        "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
        {
          headers: { "User-Agent": "DriftFetch-Downloader" },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!release.ok) throw new Error("Could not check for engine updates.");
      const data = (await release.json()) as any;
      if (!Array.isArray(data?.assets))
        throw new Error("Could not check for engine updates.");
      // Already current: nothing to download, and Restore previous keeps the older copy.
      const latest = String(data.tag_name ?? "");
      if (
        latest &&
        this.info.available &&
        !needsBundledEngine(this.info.version, latest)
      )
        return false;
      const asset = data.assets.find((a: any) => a.name === "yt-dlp.exe");
      const sums = data.assets.find((a: any) => a.name === "SHA2-256SUMS");
      const signature = data.assets.find(
        (a: any) => a.name === "SHA2-256SUMS.sig",
      );
      if (!asset || !sums || !signature)
        throw new Error("The release is missing verification files.");
      for (const u of [
        asset.browser_download_url,
        sums.browser_download_url,
        signature.browser_download_url,
      ])
        if (
          !String(u).startsWith(
            "https://github.com/yt-dlp/yt-dlp/releases/download/",
          )
        )
          throw new Error("Unexpected update source.");
      const [binary, checksum, signed] = await Promise.all([
        fetch(asset.browser_download_url, {
          signal: AbortSignal.timeout(180000),
        }),
        fetch(sums.browser_download_url, {
          signal: AbortSignal.timeout(30000),
        }),
        fetch(signature.browser_download_url, {
          signal: AbortSignal.timeout(30000),
        }),
      ]);
      if (!binary.ok || !checksum.ok || !signed.ok)
        throw new Error("The engine download failed.");
      const buffer = Buffer.from(await binary.arrayBuffer());
      // The checksum list is only trusted if the pinned maintainer key signed it.
      const listBytes = new Uint8Array(await checksum.arrayBuffer());
      try {
        await verifyDetached(
          listBytes,
          new Uint8Array(await signed.arrayBuffer()),
          this.signingKey,
        );
      } catch {
        throw new Error(
          "Signature verification failed. The installed engine was kept.",
        );
      }
      const list = Buffer.from(listBytes).toString("utf8");
      const expected = list
        .split(/\r?\n/)
        .find((l) => /\s\*?yt-dlp\.exe$/.test(l))
        ?.split(/\s+/)[0];
      if (
        !expected ||
        createHash("sha256").update(buffer).digest("hex") !== expected
      )
        throw new Error(
          "Checksum verification failed. The installed engine was kept.",
        );
      await fs.writeFile(staged, buffer);
      const test = await runProcess(staged, ["--version"], undefined, 15000)
        .done;
      if (test.code || !test.stdout.trim())
        throw new Error("The new engine failed its startup check.");
      if (existsSync(this.executable))
        await fs.copyFile(this.executable, this.executable + ".previous");
      await fs.rename(staged, this.executable);
      return true;
    } finally {
      await fs.rm(staged, { force: true });
    }
  }
  private async updateGalleryDl() {
    // Only refresh a gallery-dl that is installed; a build without one stays without.
    if (!existsSync(this.galleryExecutable)) return false;
    const target = path.join(this.directory, "gallery-dl.exe");
    const staged = path.join(this.directory, `gallery-dl-${randomUUID()}.exe`);
    try {
      // gallery-dl publishes Windows builds and signed checksums on Codeberg.
      const release = await fetch(
        "https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/latest",
        {
          headers: { "User-Agent": "DriftFetch-Downloader" },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!release.ok) throw new Error("Could not check for engine updates.");
      const data = (await release.json()) as any;
      if (!Array.isArray(data?.assets))
        throw new Error("Could not check for engine updates.");
      const latest = String(data.tag_name ?? "").replace(/^v/, "");
      // Already current: nothing to download.
      if (
        this.info.galleryVersion &&
        !needsBundledEngine(this.info.galleryVersion, latest)
      )
        return false;
      const find = (name: string) =>
        data.assets.find((a: any) => a.name === name);
      const asset = find("gallery-dl.exe"),
        sums = find("SHA256SUMS"),
        signature = find("SHA256SUMS.sig");
      if (!asset || !sums || !signature)
        throw new Error("The release is missing verification files.");
      for (const u of [
        asset.browser_download_url,
        sums.browser_download_url,
        signature.browser_download_url,
      ])
        if (
          !String(u).startsWith(
            "https://codeberg.org/mikf/gallery-dl/releases/download/",
          )
        )
          throw new Error("Unexpected update source.");
      const [binary, checksum, signed] = await Promise.all([
        fetch(asset.browser_download_url, {
          signal: AbortSignal.timeout(180000),
        }),
        fetch(sums.browser_download_url, {
          signal: AbortSignal.timeout(30000),
        }),
        fetch(signature.browser_download_url, {
          signal: AbortSignal.timeout(30000),
        }),
      ]);
      if (!binary.ok || !checksum.ok || !signed.ok)
        throw new Error("The engine download failed.");
      const buffer = Buffer.from(await binary.arrayBuffer());
      // The checksum list is only trusted if the pinned maintainer key signed it.
      const listBytes = new Uint8Array(await checksum.arrayBuffer());
      try {
        await verifyDetached(
          listBytes,
          new Uint8Array(await signed.arrayBuffer()),
          this.galleryKey,
        );
      } catch {
        throw new Error(
          "Signature verification failed. The installed engine was kept.",
        );
      }
      const expected = Buffer.from(listBytes)
        .toString("utf8")
        .split(/\r?\n/)
        .find((l) => /\s\*?gallery-dl\.exe$/.test(l))
        ?.split(/\s+/)[0];
      if (
        !expected ||
        createHash("sha256").update(buffer).digest("hex") !== expected
      )
        throw new Error(
          "Checksum verification failed. The installed engine was kept.",
        );
      await fs.writeFile(staged, buffer);
      const version = await this.versionOf(staged);
      if (!version || !/^\d+\.\d+/.test(version))
        throw new Error("The new engine failed its startup check.");
      // Keep what ran before (the bundled copy on a first update) for Restore previous.
      await fs.copyFile(this.galleryExecutable, target + ".previous");
      await fs.rename(staged, target);
      return true;
    } finally {
      await fs.rm(staged, { force: true });
    }
  }
  async rollback() {
    if (this.info.busy)
      throw new Error("An engine operation is already running.");
    if (!this.info.canRollback)
      throw new Error("No previous engine is available.");
    this.info.busy = true;
    this.changed();
    try {
      for (const exe of [
        this.executable,
        path.join(this.directory, "gallery-dl.exe"),
      ]) {
        if (!existsSync(exe + ".previous")) continue;
        const temp = exe + ".swap";
        try {
          if (existsSync(exe)) await fs.copyFile(exe, temp);
          await fs.copyFile(exe + ".previous", exe);
          if (existsSync(temp)) await fs.copyFile(temp, exe + ".previous");
        } finally {
          await fs.rm(temp, { force: true });
        }
      }
      this.info.message = "Previous engines restored.";
    } finally {
      this.info.busy = false;
      await this.refresh();
    }
  }
}
