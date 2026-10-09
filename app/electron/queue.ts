import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Action, Job, Settings } from "../src/shared";
import { Store } from "./store";
import {
  Engine,
  galleryDlLinks,
  galleryDlMetadata,
  imageGalleryMetadata,
  metadataJob,
  type Running,
} from "./engine";
import { Sessions } from "./sessions";
import { failureCode } from "../shared/diagnostics";
import { hideSecretOptions, type Extensions } from "./extensions";
import { uniqueCollectionEntries } from "./collections";
import { incompleteCollection } from "../shared/collection-discovery";
import { reportedDownloadFile } from "./download-files";
import { savedFileQuality } from "../shared/quality";
import {
  rateLimitWait,
  requiredSpace,
  retryDelay,
  scheduleAllows,
  sourceLimits,
} from "../shared/transfer-policy";
import {
  domainOf,
  friendlyError,
  instagramProfile,
  redditFeed,
  normalizeUrl,
  outputLocation,
  maxLinksPerBatch,
  parseLinks,
  sanitizeSettings,
  recoveryStatus,
} from "./core";

type Token = {
  process?: Running;
  stop: boolean;
  done?: Promise<void>;
  controller?: AbortController;
};
/** Stops an engine run as soon as it announces a rate-limit wait. */
function stopOnRateLimit(running: Running | undefined) {
  let seen = "";
  running?.child?.stderr?.on("data", (chunk) => {
    seen = (seen + chunk).slice(-4000);
    if (rateLimitWait(seen) !== undefined) void running.stop();
  });
}
export class Queue {
  jobs: Job[];
  settings: Settings;
  stopping = false;
  private sleeping = false;
  maintenance = false;
  private running = new Map<string, Token>();
  private resolving = new Set<string>();
  private timer: ReturnType<typeof setInterval>;
  private ticking = false;
  private checkingFiles = false;
  /** Highest queueOrder handed out; new links go after it. */
  private maxQueueOrder = 0;
  private reservations = new Map<
    string,
    { disk: number | bigint; bytes: number }
  >();
  constructor(
    private store: Store,
    defaults: Settings,
    private engine: Engine,
    private sessions: Sessions,
    private changed: () => void,
    private extensions?: Extensions,
  ) {
    this.settings = sanitizeSettings(defaults, store.settings(defaults));
    this.jobs = store.jobs();
    // Rewrite only rows the recovery pass changed, in one commit.
    this.store.transaction(() => {
      for (const job of this.jobs) {
        const before = JSON.stringify(job);
        job.refreshing = false;
        this.maxQueueOrder = Math.max(
          this.maxQueueOrder,
          job.queueOrder ?? job.createdAt,
        );
        if (job.collectionKind === "images" && job.entries) {
          job.entries = uniqueCollectionEntries(job.entries);
          job.discoveredItems = job.entries.length;
        }
        job.status = recoveryStatus(
          job.status,
          this.autoFor(job.source) && !job.holdForReview,
        );
        if (JSON.stringify(job) !== before) this.store.saveJob(job);
      }
    });
    this.timer = setInterval(() => void this.tick().catch(() => {}), 1000);
    this.timer.unref();
  }
  async tick(now = new Date()) {
    if (this.ticking || this.stopping) return;
    this.ticking = true;
    try {
      if (!scheduleAllows(this.settings, now)) {
        for (const job of this.jobs) {
          if (job.status !== "downloading") continue;
          const token = this.running.get(job.id);
          if (!token || token.stop) continue;
          token.stop = true;
          this.save(job, {
            status: "queued",
            scheduleHeld: true,
            speed: undefined,
            eta: undefined,
          });
          await token.process?.stop();
          await token.done;
        }
      }
      for (const job of this.jobs) {
        if (!job.retryAt) continue;
        if (!this.settings.automaticRetries)
          this.save(job, { retryAt: undefined });
        else if (job.status === "failed" && job.retryAt <= now.getTime())
          this.save(job, {
            status: job.failureStage === "extraction" ? "resolving" : "queued",
            retryAt: undefined,
          });
      }
      this.pump();
    } finally {
      this.ticking = false;
    }
  }
  async checkFiles() {
    if (this.checkingFiles || this.stopping) return;
    this.checkingFiles = true;
    try {
      for (const job of this.jobs) {
        if (
          job.status !== "completed" ||
          (job.linkType === "profile" && !job.filePath)
        )
          continue;
        const stat = job.filePath
          ? await fs.stat(job.filePath).catch(() => null)
          : null;
        if (this.stopping || !this.jobs.includes(job)) return;
        const missing = !stat?.isFile();
        if (job.fileMissing !== missing)
          this.save(job, { fileMissing: missing });
      }
    } finally {
      this.checkingFiles = false;
    }
  }
  reorder(id: string, beforeId?: string, after = false) {
    const waiting = this.jobs
      .filter(
        (j) =>
          ["queued", "review", "paused", "failed"].includes(j.status) &&
          !this.running.has(j.id),
      )
      .sort(
        (a, b) => (a.queueOrder ?? a.createdAt) - (b.queueOrder ?? b.createdAt),
      );
    const job = waiting.find((j) => j.id === id);
    if (!job) throw new Error("Only waiting downloads can be reordered.");
    if (beforeId === id) return;
    const rest = waiting.filter((j) => j !== job);
    const index = beforeId ? rest.findIndex((j) => j.id === beforeId) : 0;
    if (index < 0) throw new Error("That download is no longer waiting.");
    rest.splice(index + (beforeId && after ? 1 : 0), 0, job);
    rest.forEach((item, i) => this.save(item, { queueOrder: i }));
  }
  private fail(job: Job, err: unknown, stage: "extraction" | "download") {
    const raw = String(err),
      attempts = job.retryCount || 0;
    const delay = this.settings.automaticRetries
      ? retryDelay(raw, attempts)
      : undefined;
    this.save(job, {
      status: "failed",
      failureStage: stage,
      failureCode: failureCode(err),
      checkedEngineVersion: this.engine.info.version,
      error: raw.includes("FFmpeg unavailable")
        ? "FFmpeg is missing. Reinstall DriftFetch to restore the bundled tools."
        : raw.includes("CURRENT_LOW_SPACE")
          ? "Not enough free space to safely start this download. Free up space on the destination drive, then retry."
          : friendlyError(raw),
      retryCount: delay ? attempts + 1 : attempts,
      retryAt: delay ? Date.now() + delay : undefined,
      speed: undefined,
      eta: undefined,
    });
  }
  /** When each job was last written to SQLite, so progress ticks can skip it. */
  private persistedAt = new WeakMap<Job, number>();
  save(job: Job, patch: Partial<Job> = {}, persist = true) {
    Object.assign(job, patch, { updatedAt: Date.now() });
    if (persist) {
      this.store.saveJob(job);
      this.persistedAt.set(job, job.updatedAt);
    }
    this.changed();
  }
  addLinks(
    text: string,
    {
      force = false,
      origin = "manual",
      review = false,
      gallery,
      groupName,
      extra,
    }: {
      force?: boolean;
      origin?: "clipboard" | "manual";
      review?: boolean;
      gallery?: { folder: string; source: string };
      groupName?: string;
      /** Applied to every job created, e.g. the title/referer of a collection entry. */
      extra?: Partial<Job>;
    } = {},
  ) {
    let duplicates = 0;
    const created: Job[] = [];
    const found = parseLinks(text);
    const truncated = Math.max(0, found.length - maxLinksPerBatch);
    for (const url of found.slice(0, maxLinksPerBatch)) {
      const existing = this.jobs.find(
        (j) =>
          (j.originalUrl === url || j.resolvedUrl === url) &&
          // A failed extraction must never permanently suppress a later copy:
          // the engine, account state, or DriftFetch itself may have changed.
          !["cancelled", "duplicate", "failed"].includes(j.status),
      );
      if (existing && !force) {
        this.store.saveCapture({
          id: randomUUID(),
          at: Date.now(),
          origin,
          source: domainOf(url),
          jobId: existing.id,
          duplicate: true,
        });
        duplicates++;
        continue;
      }
      const job: Job = {
        id: randomUUID(),
        originalUrl: url,
        title: "Video link",
        source: domainOf(url),
        status: "resolving",
        progress: 0,
        force,
        holdForReview: review,
        galleryFolder: gallery?.folder,
        gallerySource: gallery?.source,
        groupName,
        createdAt: Date.now(),
        queueOrder: (this.maxQueueOrder = Math.max(
          Date.now(),
          this.maxQueueOrder + 1,
        )),
        updatedAt: Date.now(),
        ...extra,
      };
      this.jobs.push(job);
      this.store.saveCapture({
        id: randomUUID(),
        at: Date.now(),
        origin,
        source: domainOf(url),
        jobId: job.id,
        duplicate: false,
      });
      this.save(job);
      created.push(job);
    }
    this.pump();
    this.changed();
    return { added: created.length, duplicates, truncated, jobs: created };
  }
  setFormat(id: string, formatId: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (
      !job ||
      this.running.has(id) ||
      job.targetDir ||
      !["review", "queued", "failed"].includes(job.status)
    )
      throw new Error(
        "Choose quality before starting the transfer. For an existing file, add a new copy with Auto-download off.",
      );
    if (formatId && !job.formats?.some((f) => f.id === formatId))
      throw new Error("That format is not available for this video.");
    this.save(job, { selectedFormatId: formatId || undefined });
  }
  async refreshFormats(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (
      !job ||
      this.running.has(id) ||
      this.stopping ||
      this.maintenance ||
      this.engine.info.busy
    )
      throw new Error(
        "Pause this item and wait for its worker to stop before rechecking formats.",
      );
    const token: Token = { stop: false };
    this.running.set(id, token);
    // Deliberately outside the 2-slot resolve cap: a recheck is user-initiated and bounded by its own timeout.
    this.resolving.add(id);
    this.save(job, {
      refreshing: true,
      formatsError: undefined,
      retryAt: undefined,
      ...(job.status === "queued"
        ? { status: "review" as const, holdForReview: true }
        : {}),
    });
    token.done = (async () => {
      let auth: Awaited<ReturnType<Sessions["argumentsFor"]>> | undefined;
      try {
        const url = job.resolvedUrl || job.originalUrl;
        auth = await this.sessions.argumentsFor(url);
        if (token.stop) return;
        token.process = this.engine.probe(url, auth.args);
        const result = await token.process.done;
        if (token.stop) return;
        if (result.timedOut) throw new Error("CURRENT_TIMEOUT");
        if (result.code !== 0) throw new Error(result.stderr);
        const metadata = metadataJob(
          JSON.parse(result.stdout),
          job.originalUrl,
        );
        if (
          metadata.status === "collection" ||
          (job.mediaKey && metadata.mediaKey !== job.mediaKey)
        )
          throw new Error(
            "The page now identifies a different video or collection. Add its link separately.",
          );
        this.save(job, {
          formats: metadata.formats,
          ...(!job.mediaKey && job.status !== "completed"
            ? {
                ...metadata,
                status: "review" as const,
                holdForReview: true,
                error: undefined,
                failureStage: undefined,
              }
            : {}),
          availableHeight: metadata.availableHeight,
          preferredFormatId: metadata.preferredFormatId,
          selectedFormatId:
            !job.targetDir &&
            !metadata.formats?.some((f) => f.id === job.selectedFormatId)
              ? undefined
              : job.selectedFormatId,
          ...(job.status !== "completed" ? { quality: metadata.quality } : {}),
          formatsCheckedAt: Date.now(),
          checkedEngineVersion: this.engine.info.version,
          linkType: metadata.linkType,
        });
      } catch (error) {
        if (!token.stop)
          this.save(job, {
            formatsError: String(error).includes("different video")
              ? "This page now identifies a different video or collection. Add its link separately."
              : friendlyError(String(error)),
          });
      } finally {
        await auth?.cleanup().catch(() => {});
        this.save(job, { refreshing: false });
        this.running.delete(id);
        this.resolving.delete(id);
        this.pump();
      }
    })();
    await token.done;
  }
  pump() {
    if (
      this.stopping ||
      this.sleeping ||
      this.maintenance ||
      this.engine.info.busy ||
      !this.engine.info.available
    )
      return;
    for (const job of this.jobs) {
      if (
        job.status === "resolving" &&
        !this.running.has(job.id) &&
        this.resolving.size < 2
      ) {
        this.resolving.add(job.id);
        const token: Token = { stop: false };
        this.running.set(job.id, token);
        token.done = this.resolve(job, token).finally(() => {
          this.resolving.delete(job.id);
          this.running.delete(job.id);
          this.pump();
        });
      }
    }
    let active = [...this.running.keys()].filter(
      (id) => !this.resolving.has(id),
    ).length;
    if (!scheduleAllows(this.settings)) return;
    for (const job of [...this.jobs].sort(
      (a, b) => (a.queueOrder ?? a.createdAt) - (b.queueOrder ?? b.createdAt),
    ))
      if (
        job.status === "queued" &&
        !this.running.has(job.id) &&
        (this.settings.concurrency === 0 ||
          active < this.settings.concurrency) &&
        this.sourceHasRoom(job)
      ) {
        active++;
        const token: Token = { stop: false };
        this.running.set(job.id, token);
        token.done = this.download(job, token).finally(() => {
          this.running.delete(job.id);
          this.pump();
        });
      }
  }
  /** Respects the per-source limit on simultaneous downloads. */
  private sourceHasRoom(job: Job) {
    const limit = sourceLimits(this.settings, job.source).maxSimultaneous;
    if (!limit) return true;
    const site = (source?: string) => source?.split(".").slice(-2).join(".");
    const running = this.jobs.filter(
      (j) =>
        j.id !== job.id &&
        this.running.has(j.id) &&
        !this.resolving.has(j.id) &&
        site(j.source) === site(job.source),
    ).length;
    return running < limit;
  }
  private sourceRule(source: string | undefined) {
    return this.settings.sourceRules.find(
      (item) =>
        !!source &&
        (source === item.source || source.endsWith("." + item.source)),
    );
  }
  private autoFor(source: string | undefined) {
    return this.sourceRule(source)?.autoDownload ?? this.settings.autoDownload;
  }
  private acceptCollection(job: Job, metadata: Partial<Job>) {
    const entries =
      metadata.collectionKind === "images" && metadata.entries
        ? uniqueCollectionEntries(metadata.entries)
        : metadata.entries;
    this.save(job, {
      ...metadata,
      entries,
      discoveredItems: entries
        ? new Set(entries.map((entry) => entry.id || entry.url)).size
        : undefined,
    });
    // A post read by gallery-dl with a single item has nothing to choose: treat
    // it like one video or image. Searches keep their list.
    const single =
      job.mediaKey?.startsWith("GalleryDL:") &&
      job.collectionKind === "images" &&
      job.entries?.length === 1;
    if (
      single ||
      (!job.holdForReview &&
        !this.settings.previewCollections &&
        (this.sourceRule(job.source)?.autoDownload ??
          this.settings.autoDownloadCollections) &&
        job.collectionKind === "images" &&
        job.entries?.length)
    )
      this.selectCollection(
        job.id,
        (job.entries || []).map((entry) => entry.id),
      );
  }
  private async resolve(job: Job, token: Token) {
    let auth: Awaited<ReturnType<Sessions["argumentsFor"]>> | undefined;
    const controller = (token.controller = new AbortController());
    let expired = false;
    const deadline = setTimeout(() => {
      expired = true;
      controller.abort();
      void token.process?.stop();
    }, 120_000);
    try {
      this.save(job, {
        collectionReadAttempts: undefined,
        collectionDiscovery: undefined,
        extensionChecks: undefined,
      });
      const readExtension = (url: string, stage: "submitted" | "redirect") =>
        this.extensions?.resolve(
          url,
          controller.signal,
          (domain, fields) => this.sessions.credentialsFor(domain, fields),
          (collectionReadAttempts) =>
            this.save(job, { collectionReadAttempts }),
          (outcome) =>
            this.save(job, {
              extensionChecks: [
                ...(job.extensionChecks || []),
                { stage, outcome },
              ],
            }),
        );
      const extension = await readExtension(job.originalUrl, "submitted");
      if (token.stop) return;
      controller.signal.throwIfAborted();
      if (extension) {
        this.acceptCollection(job, extension);
        return;
      }
      // Follow ordinary redirects before selecting a source-specific account session.
      let url = job.originalUrl;
      try {
        const response = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        const destination = normalizeUrl(response.url);
        // Do not mistake an unauthenticated redirect to a login page for the video host.
        if (
          destination &&
          response.ok &&
          !/\/(?:login|signin|sign-in|auth)(?:\/|$)/i.test(
            new URL(destination).pathname,
          )
        )
          url = destination;
        await response.body?.cancel();
      } catch {
        /* The extractor can handle hosts rejecting HEAD. */
      }
      if (token.stop) return;
      controller.signal.throwIfAborted();
      if (url !== job.originalUrl) {
        const redirectedExtension = await readExtension(url, "redirect");
        if (token.stop) return;
        controller.signal.throwIfAborted();
        if (redirectedExtension) {
          this.acceptCollection(job, redirectedExtension);
          return;
        }
      }
      // Whole profiles skip listing: gallery-dl downloads them directly.
      const account = instagramProfile(url) ?? redditFeed(url);
      if (account) {
        this.save(job, {
          title: `${account} ${/^reddit_/.test(account) ? "posts" : "profile"}`,
          galleryFolder: account,
          source: domainOf(url),
          resolvedUrl: url,
          mediaKey: `GalleryDL:${url}`,
          linkType: "profile",
          status:
            (this.autoFor(domainOf(url)) && !job.holdForReview) ||
            job.startRequested
              ? "queued"
              : "review",
          startRequested: false,
          error: undefined,
          failureStage: undefined,
          retryAt: undefined,
        });
        return;
      }
      let gallery: Partial<Job> | undefined;
      let galleryError: unknown;
      try {
        gallery = await imageGalleryMetadata(url, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        // This reader makes unauthenticated requests. Its failure must not
        // prevent the external engines from trying the user's saved session.
        galleryError = error;
      }
      if (token.stop) return;
      if (gallery) {
        this.acceptCollection(job, gallery);
        return;
      }
      job.resolvedUrl = url;
      auth = await this.sessions.argumentsFor(url);
      if (token.stop) return;
      controller.signal.throwIfAborted();
      // Reddit blocks yt-dlp (HTTP 403) and counts the attempt against its small
      // request budget; gallery-dl reads every Reddit post, videos included.
      const skipVideoEngine = /(^|\.)(reddit\.com|redd\.it)$/i.test(
        domainOf(url),
      );
      token.process = skipVideoEngine
        ? undefined
        : this.engine.probe(url, auth.args);
      const result = token.process
        ? await token.process.done
        : { code: 1, stdout: "", stderr: "", timedOut: false };
      if (token.stop) return;
      controller.signal.throwIfAborted();
      if (result.timedOut) throw new Error("CURRENT_TIMEOUT");
      let extractionError: unknown = galleryError || result.stderr;
      // A story link to a photo story makes yt-dlp print null (it lists videos only).
      const info = result.code === 0 ? JSON.parse(result.stdout) : undefined;
      let metadata = info ? metadataJob(info, url) : undefined;
      // yt-dlp only extracts video: image posts fail outright and Instagram
      // carousels lose their photos, so ask gallery-dl for every item.
      if (
        !metadata ||
        (metadata.status === "collection" &&
          /(^|\.)instagram\.com$/i.test(domainOf(url)))
      ) {
        token.process = this.engine.listImages(
          url,
          auth.args,
          sourceLimits(this.settings, domainOf(url)).requestDelaySec,
        );
        stopOnRateLimit(token.process);
        const listed = await token.process?.done;
        if (token.stop) return;
        controller.signal.throwIfAborted();
        // The source announced a wait: fail now so the job retries after it,
        // instead of sitting in the engine until the lookup deadline.
        if (listed && rateLimitWait(listed.stderr) !== undefined)
          throw new Error(listed.stderr);
        if (listed?.timedOut)
          throw new Error(
            /rate limit|\b429\b/i.test(listed.stderr)
              ? listed.stderr
              : "CURRENT_TIMEOUT",
          );
        // A recognized image source can fail on access even though yt-dlp
        // only reports an unsupported URL. Keep the relevant engine's error.
        if (
          listed?.code &&
          listed.stderr &&
          !/unsupported url/i.test(listed.stderr)
        )
          extractionError = listed.stderr;
        const media =
          listed?.code === 0
            ? galleryDlMetadata(listed.stdout, url)
            : undefined;
        if (
          media &&
          (media.entries?.length || 0) > (metadata?.entries?.length || 0)
        )
          metadata = media;
        // gallery-dl only warns when the post or its media were removed.
        if (!media && /: deleted\s*$|\bremoved\b/im.test(listed?.stderr || ""))
          extractionError = new Error("CURRENT_REMOVED");
        // A post that only links elsewhere (RedGIFs, Imgur, ...) makes gallery-dl
        // hand the link on instead of listing files. One link is looked up at its
        // own site; several become a list to choose from.
        const linked =
          !metadata && listed?.code === 0 ? galleryDlLinks(listed.stdout) : [];
        if (linked.length === 1) {
          const target = linked[0];
          const targetAuth = await this.sessions.argumentsFor(target);
          token.process = this.engine.probe(target, targetAuth.args);
          const probed = await token.process.done;
          await targetAuth.cleanup().catch(() => {});
          if (token.stop) return;
          controller.signal.throwIfAborted();
          if (probed.timedOut) throw new Error("CURRENT_TIMEOUT");
          const info =
            probed.code === 0 ? JSON.parse(probed.stdout) : undefined;
          if (info) metadata = metadataJob(info, target);
          else extractionError = probed.stderr;
        } else if (linked.length > 1)
          metadata = {
            title: `Links in ${domainOf(url)} post`,
            source: domainOf(url),
            resolvedUrl: url,
            status: "collection",
            linkType: "collection",
            entries: linked.slice(0, 100).map((link, index) => ({
              id: String(index),
              title: link,
              url: link,
            })),
            collectionLimited: linked.length > 100,
          };
        // gallery-dl read the link without error but listed nothing, while yt-dlp asked for a
        // login. That does not prove the sign-in is bad (expired stories, a changed site and a
        // stale engine look the same), so don't blame the sign-in alone.
        if (
          !metadata &&
          listed?.code === 0 &&
          !listed.timedOut &&
          /log.?in|sign.?in|cookies|authentication/i.test(
            String(extractionError),
          )
        )
          extractionError = new Error("CURRENT_NOTHING_READ");
      }
      if (!metadata)
        throw extractionError instanceof Error
          ? extractionError
          : new Error(String(extractionError));
      metadata.formatsCheckedAt = Date.now();
      metadata.checkedEngineVersion = this.engine.info.version;
      if (domainOf(job.originalUrl) !== domainOf(metadata.resolvedUrl || url))
        metadata.linkType = "redirect";
      if (metadata.status === "collection") {
        this.acceptCollection(job, metadata);
        return;
      }
      const duplicate = this.jobs.find(
        (j) =>
          j.id !== job.id &&
          j.mediaKey === metadata.mediaKey &&
          !["cancelled", "duplicate", "failed"].includes(j.status),
      );
      this.save(job, {
        ...metadata,
        ...(job.entryTitle ? { title: job.entryTitle } : {}),
        status:
          duplicate && !job.force
            ? "duplicate"
            : (this.autoFor(metadata.source) && !job.holdForReview) ||
                job.startRequested
              ? "queued"
              : "review",
        startRequested: false,
        duplicateOf: duplicate?.id,
        error: undefined,
        failureStage: undefined,
        retryAt: undefined,
      });
    } catch (err) {
      if (!token.stop)
        this.fail(
          job,
          expired ? new Error("CURRENT_TIMEOUT") : err,
          "extraction",
        );
    } finally {
      clearTimeout(deadline);
      await auth?.cleanup().catch(() => {});
    }
  }
  private async download(job: Job, token: Token) {
    let auth: Awaited<ReturnType<Sessions["argumentsFor"]>> | undefined;
    const savedPaths = new Map<string, string>();
    const expectedFiles = job.imageUrls?.length
      ? new Set(job.imageUrls).size
      : undefined;
    try {
      if (
        !this.engine.info.ffmpegAvailable &&
        !job.imageUrls?.length &&
        !job.imageSearch
      )
        throw new Error("FFmpeg unavailable");
      const rule = this.sourceRule(job.source);
      if (!job.targetDir)
        Object.assign(
          job,
          outputLocation(job, {
            ...this.settings,
            downloadDir: rule?.downloadDir || this.settings.downloadDir,
          }),
          {
            qualityLimit: rule?.quality || this.settings.quality,
          },
        );
      await fs.mkdir(job.targetDir!, { recursive: true });
      const [disk, directory] = await Promise.all([
        fs.statfs(job.targetDir!),
        fs.stat(job.targetDir!),
      ]);
      if (token.stop) return;
      const needed = requiredSpace(job);
      const reserved = [...this.reservations.values()]
        .filter((r) => r.disk === directory.dev)
        .reduce((sum, r) => sum + r.bytes, 0);
      if (disk.bavail * disk.bsize - reserved < needed)
        throw new Error("CURRENT_LOW_SPACE");
      this.reservations.set(job.id, { disk: directory.dev, bytes: needed });
      const sourceUrl = job.resolvedUrl || job.originalUrl;
      if (
        job.extensionId &&
        !this.extensions
          ?.list()
          .some((e) => e.id === job.extensionId && e.enabled)
      )
        throw new Error("CURRENT_EXTENSION_REQUIRED");
      auth = await this.sessions.argumentsFor(sourceUrl);
      if (job.imageSearch && this.extensions) {
        const hidden = await hideSecretOptions(
          await this.extensions.galleryArguments(sourceUrl, (domain, fields) =>
            this.sessions.credentialsFor(domain, fields),
          ),
        );
        auth.args.push(...hidden.args);
        const cleanup = auth.cleanup;
        auth.cleanup = async () => {
          await cleanup();
          await hidden.cleanup();
        };
      }
      if (token.stop) return;
      if (!scheduleAllows(this.settings)) {
        this.save(job, { scheduleHeld: true });
        return;
      }
      this.save(job, {
        status: "downloading",
        speedLimitKiB: rule?.speedLimitKiB ?? this.settings.speedLimitKiB,
        fragmentConcurrency:
          rule?.fragmentConcurrency ?? this.settings.fragmentConcurrency,
        requestDelaySec: sourceLimits(this.settings, job.source)
          .requestDelaySec,
        scheduleHeld: false,
        retryAt: undefined,
        error: undefined,
        failureStage: undefined,
        failureCode: undefined,
        speed: undefined,
        eta: undefined,
        expectedFiles,
        verifiedFiles: undefined,
        missingFiles: undefined,
        ...(job.linkType === "profile" ||
        job.imageSearch ||
        job.imageUrls?.length
          ? { filePath: undefined, filesSaved: 0 }
          : {}),
      });
      token.process = this.engine.download(job, auth.args, (line) => {
        if (token.stop) return;
        try {
          if (line.startsWith("CURRENT_PROGRESS:")) {
            const p = JSON.parse(line.slice(17));
            const downloaded = Number(p.downloaded_bytes) || 0;
            const total = Number(p.total_bytes || p.total_bytes_estimate) || 0;
            const status =
              p.status === "finished" ? "processing" : "downloading";
            // Progress is rewritten twice a second; persist it every 5 s at most.
            const persist =
              status !== job.status ||
              Date.now() - (this.persistedAt.get(job) ?? 0) >= 5000;
            this.save(
              job,
              {
                status,
                downloadedBytes: downloaded,
                totalBytes: total || undefined,
                progress: total
                  ? Math.min(99.9, (downloaded / total) * 100)
                  : 0,
                speed: Number(p.speed) || undefined,
                eta: Number(p.eta) || undefined,
              },
              persist,
            );
          } else if (line.startsWith("CURRENT_FILE:")) {
            const reported = reportedDownloadFile(
              JSON.parse(line.slice(13)),
              job.targetDir!,
            );
            if (reported) {
              savedPaths.set(reported.key, reported.file);
              this.save(job, {
                filePath: reported.file,
                filesSaved: savedPaths.size,
              });
            }
          } else if (line.startsWith("CURRENT_FORMAT_ID:")) {
            const formatId = JSON.parse(line.slice(18));
            if (typeof formatId === "string")
              this.save(job, { actualFormatId: formatId.slice(0, 160) });
          } else if (line.startsWith("CURRENT_FORMAT:")) {
            const height = JSON.parse(line.slice(15));
            if (height) this.save(job, { quality: `${height}p` });
          }
        } catch {
          /* Non-JSON engine chatter is not exposed to the UI. */
        }
      });
      const result = await token.process.done;
      if (token.stop) return;
      if (result.timedOut) throw new Error("CURRENT_TIMEOUT");
      if (job.collectionKind === "images" || expectedFiles !== undefined) {
        this.save(job, { status: "processing" });
        let verifiedFiles = 0;
        for (const file of savedPaths.values()) {
          if (token.stop) return;
          const stat = await fs.stat(file).catch(() => null);
          if (stat?.isFile() && stat.size > 0) verifiedFiles++;
        }
        this.save(job, {
          verifiedFiles,
          missingFiles: Math.max(
            0,
            (expectedFiles ?? savedPaths.size) - verifiedFiles,
          ),
        });
        if (result.code === 0 && (job.missingFiles || 0) > 0)
          throw new Error("CURRENT_INCOMPLETE_FILES");
        if (result.code === 0 && incompleteCollection(job))
          throw new Error("CURRENT_INCOMPLETE_DISCOVERY");
      }
      const profile = job.linkType === "profile";
      // An archive can mean no new files, but any engine error is still a failure.
      if (result.code !== 0) throw new Error(result.stderr);
      if (job.imageSearch && !job.filePath)
        throw new Error("CURRENT_NO_IMAGES");
      if (profile && !job.filePath) {
        this.save(job, {
          status: "completed",
          finishedAt: Date.now(),
          progress: 100,
          retryCount: 0,
          retryAt: undefined,
          speed: undefined,
          eta: undefined,
        });
        return;
      }
      const file = job.filePath
        ? await fs.stat(job.filePath).catch(() => null)
        : null;
      if (!file?.isFile()) throw new Error("Final file missing");
      if (token.stop) return;
      this.save(job, { status: "processing" });
      let quality = "Unknown";
      try {
        token.process = this.engine.inspectFile(job.filePath!);
        const inspection = await token.process.done;
        if (inspection.code === 0)
          quality = savedFileQuality(JSON.parse(inspection.stdout));
      } catch {
        /* A missing inspector must not discard an otherwise completed download. */
      }
      if (token.stop) return;
      this.save(job, {
        status: "completed",
        finishedAt: Date.now(),
        retryCount: 0,
        retryAt: undefined,
        fileMissing: false,
        quality,
        totalBytes: file.size,
        downloadedBytes: file.size,
        progress: 100,
        speed: undefined,
        eta: undefined,
      });
    } catch (err) {
      if (!token.stop) this.fail(job, err, "download");
    } finally {
      this.reservations.delete(job.id);
      await auth?.cleanup().catch(() => {});
    }
  }
  /** Deletes yt-dlp's .part/.ytdl/fragment files for this job; the per-job name suffix keeps the match exact. */
  private async discardPartials(job: Job) {
    if (!job.targetDir) return;
    const tag = `-${job.id.slice(0, 8)}.`;
    const names = await fs.readdir(job.targetDir).catch(() => [] as string[]);
    await Promise.all(
      names
        .filter(
          (name) =>
            name.includes(tag) && /\.(?:part|ytdl)(?:-Frag\d+)?$/.test(name),
        )
        .map((name) =>
          fs
            .rm(path.join(job.targetDir!, name), { force: true })
            .catch(() => {}),
        ),
    );
  }
  async action(ids: string[], action: Action) {
    if (
      !Array.isArray(ids) ||
      ids.length > 500 ||
      ![
        "start",
        "pause",
        "cancel",
        "retry",
        "again",
        "remove",
        "next",
      ].includes(action)
    )
      throw new Error("Invalid queue action.");
    const removedNow: Job[] = [];
    for (const id of ids) {
      const job = this.jobs.find((j) => j.id === id);
      if (!job) continue;
      if (action === "next") this.reorder(id);
      if (["pause", "cancel", "remove"].includes(action)) {
        const finishedBefore = [
          "completed",
          "duplicate",
          "collection",
        ].includes(job.status);
        this.save(job, { retryAt: undefined, scheduleHeld: false });
        const token = this.running.get(id);
        if (token)
          this.save(job, {
            status: action === "pause" ? "paused" : "cancelled",
            speed: undefined,
            eta: undefined,
          });
        if (token) {
          token.stop = true;
          token.controller?.abort();
          await token.process?.stop();
          await token.done;
        }
        // Pause keeps partial data for --continue; cancel and remove must not leave it behind.
        if (action !== "pause" && !finishedBefore)
          await this.discardPartials(job);
        if (action === "remove") {
          removedNow.push(job);
          this.jobs = this.jobs.filter((j) => j.id !== id);
          this.store.removeJob(id);
          this.changed();
        } else if (
          !["completed", "duplicate", "collection"].includes(job.status)
        )
          this.save(job, {
            status: action === "pause" ? "paused" : "cancelled",
            speed: undefined,
            eta: undefined,
          });
      } else if (action === "again") {
        this.addLinks(job.originalUrl, {
          force: true,
          extra: {
            entryTitle: job.entryTitle,
            gallerySource: job.gallerySource,
            refererUrl: job.refererUrl,
          },
        });
      } else if (
        !this.running.has(id) &&
        ["review", "paused", "failed", "cancelled"].includes(job.status)
      )
        this.save(job, {
          status: job.mediaKey ? "queued" : "resolving",
          startRequested: !job.mediaKey,
          holdForReview: false,
          retryAt: undefined,
          retryCount: 0,
          scheduleHeld: false,
          error: undefined,
        });
    }
    if (removedNow.length) this.undoable = { jobs: removedNow, at: Date.now() };
    this.pump();
  }
  /** The latest removed entries, restorable for a short while. */
  private undoable?: { jobs: Job[]; at: number };
  restoreRemoved(): number {
    const batch = this.undoable;
    this.undoable = undefined;
    if (!batch || Date.now() - batch.at > 30_000) return 0;
    const back = batch.jobs.filter(
      (job) => !this.jobs.some((item) => item.id === job.id),
    );
    this.jobs.push(...back);
    this.store.transaction(() =>
      back.forEach((job) => this.store.saveJob(job)),
    );
    this.changed();
    return back.length;
  }
  /** Bulk removal of jobs with no running worker: one filter, one commit, one broadcast. */
  removeIdle(ids: string[]) {
    const doomed = new Set(ids.filter((id) => !this.running.has(id)));
    if (!doomed.size) return;
    const removed = this.jobs.filter((job) => doomed.has(job.id));
    this.undoable = { jobs: removed, at: Date.now() };
    this.jobs = this.jobs.filter((job) => !doomed.has(job.id));
    this.store.removeJobs([...doomed]);
    this.changed();
    for (const job of removed)
      if (!["completed", "duplicate", "collection"].includes(job.status))
        void this.discardPartials(job);
  }
  selectCollection(id: string, ids: string[]) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status !== "collection" || !Array.isArray(ids))
      throw new Error("Collection not found.");
    const available =
      job.collectionKind === "images"
        ? uniqueCollectionEntries(job.entries || [])
        : job.entries || [];
    const selectedIds = new Set(ids);
    const entries = available.filter((entry) => selectedIds.has(entry.id));
    if (!entries.length) throw new Error("Select at least one item.");
    if (job.collectionKind === "images") {
      this.save(job, {
        // The item list goes once the choice is made; the list keeps a thumbnail of the gallery.
        thumbnailUrl:
          job.thumbnailUrl ||
          available.find((entry) => entry.thumbnail)?.thumbnail,
        entries: undefined,
        imageUrls: entries.map((entry) => entry.url),
        selectedAll: entries.length === available.length,
        discoveredItems: available.length,
        expectedFiles: new Set(entries.map((entry) => entry.url)).size,
        verifiedFiles: undefined,
        missingFiles: undefined,
        galleryRange: job.mediaKey?.startsWith("GalleryDL:")
          ? entries.map((entry) => Number(entry.id) + 1).join(",")
          : undefined,
        status:
          this.autoFor(job.source) && !job.holdForReview ? "queued" : "review",
        error: undefined,
        failureStage: undefined,
        progress: 0,
      });
      this.pump();
      return;
    }
    let added = 0,
      duplicates = 0;
    for (const entry of entries) {
      // A bare media file has no page title or site, and often needs the
      // collection page as Referer; keep the collection's.
      const result = this.addLinks(entry.url, {
        review: !!job.holdForReview,
        extra: entry.mediaFile
          ? {
              entryTitle: entry.title,
              gallerySource: job.gallerySource || job.source,
              refererUrl: job.resolvedUrl || job.originalUrl,
            }
          : undefined,
      });
      added += result.added;
      duplicates += result.duplicates;
    }
    // Keep the collection instead of silently dropping it.
    if (!added)
      throw new Error(
        "Already downloaded or in your list. Remove the earlier copy from History to download it again.",
      );
    this.save(job, {
      entries: job.entries?.filter((e) => !selectedIds.has(e.id)),
      error: undefined,
    });
    if (!job.entries?.length) {
      this.jobs = this.jobs.filter((j) => j.id !== id);
      this.store.removeJob(id);
      this.changed();
    }
    return { added, duplicates };
  }
  /** Stops every running transfer and returns it to the queue. */
  private async stopAll() {
    await Promise.all(
      [...this.running].map(async ([id, token]) => {
        token.stop = true;
        token.controller?.abort();
        await token.process?.stop();
        await token.done;
        const job = this.jobs.find((item) => item.id === id);
        if (job && ["downloading", "processing"].includes(job.status))
          this.save(job, {
            status: "queued",
            speed: undefined,
            eta: undefined,
          });
      }),
    );
  }
  async shutdown() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.stopAll();
  }
  async suspend() {
    if (this.stopping || this.sleeping) return;
    this.sleeping = true;
    await this.stopAll();
  }
  resume() {
    if (!this.sleeping || this.stopping) return;
    this.sleeping = false;
    this.pump();
  }
  get activeCount() {
    return this.running.size;
  }
}
