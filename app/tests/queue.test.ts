import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import asyncFs from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../electron/store";
import { Queue } from "../electron/queue";
import { defaultSettings } from "../electron/core";
import { downloadArgs } from "../electron/engine";
import type { Job } from "../src/shared";
import type { Engine, Running } from "../electron/engine";
import * as engineModule from "../electron/engine";
import type { Sessions } from "../electron/sessions";
import { Extensions } from "../electron/extensions";
import { fixturePackage } from "./fixtures/extension";
const resources: { store: Store; dir: string; queue: Queue }[] = [];
// The queue sends a HEAD request to follow redirects. Keep the suite off the network
// (slow DNS made tests time out); tests that need a response mock it themselves.
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new TypeError("fetch failed"),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of resources.splice(0)) {
    await r.queue.shutdown();
    r.store.close();
    fs.rmSync(r.dir, { recursive: true, force: true });
  }
});
const waitUntil = async (fn: () => boolean, timeout = 2_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out");
};
// Existing transfer tests explicitly exercise the opt-out automatic mode.
function create(auto = true, previewCollections = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftfetch-test-"));
  const store = new Store(path.join(dir, "test.sqlite"));
  const defaults = {
    ...defaultSettings(dir),
    autoDownload: auto,
    previewCollections,
  };
  let active = 0,
    maxActive = 0,
    probes = 0;
  const engine = {
    info: { available: true, ffmpegAvailable: true, busy: false },
    inspectFile: () => ({
      done: Promise.resolve({
        code: 0,
        stdout: JSON.stringify({
          streams: [{ codec_type: "video", height: 360 }],
        }),
        stderr: "",
      }),
      stop: async () => {},
    }),
    probe: (url: string) => {
      probes++;
      return {
        done: Promise.resolve({
          code: 0,
          stdout: JSON.stringify({
            id: url.endsWith("/same") ? "one" : url.split("/").pop(),
            extractor_key: "Fixture",
            title: "Synthetic sample",
            webpage_url: url,
            url: "https://media.example/file.mp4",
          }),
          stderr: "",
        }),
        stop: async () => {},
      };
    },
    download: (job: any, _auth: string[], line: (l: string) => void) => {
      active++;
      maxActive = Math.max(maxActive, active);
      let finish: (r: any) => void;
      const done = new Promise<any>((r) => (finish = r));
      const timer = setTimeout(() => {
        for (let i = 0; i < (job.imageUrls?.length || 1); i++) {
          const file = path.join(job.targetDir, job.id + `-${i}.mp4`);
          fs.writeFileSync(file, "fixture");
          line("DRIFTFETCH_FILE:" + JSON.stringify(file));
        }
        active--;
        finish({ code: 0, stdout: "", stderr: "" });
      }, 80);
      return {
        done,
        stop: async () => {
          clearTimeout(timer);
          active--;
          finish({ code: -1, stdout: "", stderr: "" });
        },
      } as Running;
    },
  } as unknown as Engine;
  const sessions = {
    argumentsFor: async () => ({ args: [], cleanup: async () => {} }),
    hasPrivate: () => false,
  } as unknown as Sessions;
  const extensions = new Extensions(path.join(dir, "extensions"));
  const queue = new Queue(
    store,
    defaults,
    engine,
    sessions,
    () => {},
    extensions,
  );
  resources.push({ store, dir, queue });
  return {
    engine,
    extensions,
    sessions,
    queue,
    store,
    dir,
    get maxActive() {
      return maxActive;
    },
    get probes() {
      return probes;
    },
  };
}
// .invalid resolves locally as an invalid DNS name; the engine itself is a deterministic fixture.
describe("persistent scheduler", () => {
  it("checks enabled extensions again after an ordinary redirect", async () => {
    const r = create(false);
    await r.extensions.install(fixturePackage);
    await r.extensions.action("landscapes", "enable");
    r.sessions.credentialsFor = vi
      .fn()
      .mockResolvedValue({ apiKey: "SYNTHETIC", userId: "0" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).startsWith("https://redirect.invalid/")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://www.example.invalid/landscapes" },
          })
        : new Response(null, { status: 200 }),
    );
    r.queue.addLinks("https://redirect.invalid/go/1");
    await waitUntil(() => r.queue.jobs[0].status === "collection");
    expect(r.store.jobs()[0]).toMatchObject({
      originalUrl: "https://redirect.invalid/go/1",
      resolvedUrl: "https://www.example.invalid/landscapes",
      extensionId: "landscapes",
      extensionChecks: [
        { stage: "submitted", outcome: "not-installed" },
        { stage: "redirect", outcome: "selected" },
      ],
    });
    expect(r.probes).toBe(0);
  });
  it("never follows a public link to a private address", async () => {
    const r = create(false);
    const asked: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      asked.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "http://192.168.1.1/admin/reboot" },
      });
    });
    r.queue.addLinks("https://redirect.invalid/go/2");
    await waitUntil(() => r.queue.jobs[0].status !== "resolving");
    expect(asked).toEqual(["https://redirect.invalid/go/2"]);
    expect(r.queue.jobs[0].resolvedUrl ?? "").not.toContain("192.168");
  });
  it("retains disabled-extension evidence when the regular engines cannot read the link", async () => {
    const r = create(false);
    await r.extensions.install(fixturePackage);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("fixture HEAD unavailable"),
    );
    vi.spyOn(r.engine, "probe").mockReturnValue({
      done: Promise.resolve({ code: 1, stdout: "", stderr: "Unsupported URL" }),
      stop: async () => {},
    } as Running);
    r.engine.listImages = () =>
      ({
        done: Promise.resolve({
          code: 1,
          stdout: "",
          stderr: "Unsupported URL",
        }),
        stop: async () => {},
      }) as Running;
    r.queue.addLinks("https://example.invalid/landscapes");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(r.store.jobs()[0].extensionChecks).toEqual([
      { stage: "submitted", outcome: "disabled" },
    ]);
    expect(r.store.jobs()[0].error).toContain("supported media");
    expect(r.store.jobs()[0].collectionReadAttempts).toBeUndefined();
  });
  it("persists reader diagnostics and replaces them on a fresh lookup", async () => {
    const r = create(false);
    await r.extensions.install(fixturePackage);
    await r.extensions.action("landscapes", "enable");
    const credentials = vi
      .fn()
      .mockResolvedValue({ apiKey: "FAIL", userId: "0" });
    r.sessions.credentialsFor = credentials;
    r.queue.addLinks("https://example.invalid/landscapes");
    await waitUntil(() => r.queue.jobs[0].status === "collection");
    expect(r.store.jobs()[0].collectionReadAttempts).toEqual([
      { reader: "api", outcome: "failed", failureCode: "HTTP_403" },
      { reader: "html", outcome: "succeeded" },
    ]);
    expect(JSON.stringify(r.store.jobs())).not.toContain("SECRET");
    credentials.mockResolvedValue({ apiKey: "SYNTHETIC", userId: "0" });
    r.queue.save(r.queue.jobs[0], {
      status: "failed",
      failureStage: "extraction",
      mediaKey: undefined,
    });
    await r.queue.action([r.queue.jobs[0].id], "retry");
    await waitUntil(() => r.queue.jobs[0].status === "collection");
    expect(r.store.jobs()[0].collectionReadAttempts).toEqual([
      { reader: "api", outcome: "succeeded" },
    ]);
    expect(credentials).toHaveBeenCalledTimes(2);
  });
  it.each(["collection", "paused", "completed"] as const)(
    "deduplicates restored lists without restarting %s jobs",
    async (status) => {
      const r = create(false);
      r.queue.addLinks("http://127.0.0.1:1/restored-list");
      await waitUntil(() => r.queue.jobs[0].status === "review");
      await r.queue.shutdown();
      const first = {
        id: "1",
        title: "First",
        url: "https://example.invalid/first.png",
      };
      const second = {
        id: "2",
        title: "Second",
        url: "https://example.invalid/second.png",
      };
      r.queue.save(r.queue.jobs[0], {
        status,
        collectionKind: "images",
        discoveredItems: 3,
        entries: [
          first,
          { ...first, url: "https://example.invalid/alternate.png" },
          second,
        ],
      });
      const reopened = new Queue(
        r.store,
        r.queue.settings,
        r.engine,
        r.sessions,
        () => {},
      );
      try {
        expect(reopened.jobs[0]).toMatchObject({
          status,
          discoveredItems: 2,
          entries: [first, second],
        });
        expect(r.store.jobs()[0].entries).toEqual([first, second]);
        expect(reopened.activeCount).toBe(0);
      } finally {
        await reopened.shutdown();
      }
    },
  );
  it("searches a collection again from scratch", async () => {
    const r = create(false);
    r.queue.settings.autoDownloadCollections = false;
    const read = vi
      .spyOn(engineModule, "imageGalleryMetadata")
      .mockResolvedValueOnce({
        status: "collection",
        collectionKind: "images",
        mediaKey: "fixture:again",
        entries: [
          { id: "1", title: "One", url: "https://example.invalid/1.png" },
        ],
      })
      .mockResolvedValueOnce({
        status: "collection",
        collectionKind: "images",
        mediaKey: "fixture:again",
        entries: [
          { id: "1", title: "One", url: "https://example.invalid/1.png" },
          { id: "2", title: "Two", url: "https://example.invalid/2.png" },
        ],
      });
    r.queue.addLinks("http://127.0.0.1:1/search-again");
    await waitUntil(() => r.queue.jobs[0].status === "collection", 5000);
    expect(r.queue.jobs[0].entries).toHaveLength(1);
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].entries?.length === 2, 5000);
    expect(r.queue.jobs[0].status).toBe("collection");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])(
    "keeps 272 URLs for 242 item IDs to 242 collection entries (automatic=%s)",
    async (automatic) => {
      const r = create(automatic);
      r.queue.settings.autoDownloadCollections = automatic;
      const originals = Array.from({ length: 242 }, (_, i) => ({
        id: String(i),
        title: `Item ${i}`,
        url: `https://example.invalid/original/${i}.png`,
        thumbnail: `https://example.invalid/thumb/${i}.png`,
      }));
      vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
        status: "collection",
        collectionKind: "images",
        mediaKey: "fixture:duplicates",
        sourceItemCount: 242,
        entries: [
          ...originals,
          ...originals.slice(0, 30).map((entry) => ({
            ...entry,
            url: entry.url.replace("original", "alternate"),
          })),
        ],
      });
      r.queue.addLinks("http://127.0.0.1:1/duplicate-entries");
      await waitUntil(
        () =>
          r.queue.jobs[0].status === (automatic ? "completed" : "collection"),
        5000,
      );
      const job = r.queue.jobs[0];
      expect(job.discoveredItems).toBe(242);
      if (automatic) {
        expect(job).toMatchObject({
          expectedFiles: 242,
          verifiedFiles: 242,
          missingFiles: 0,
          selectedAll: true,
        });
        expect(job.imageUrls).toEqual(
          originals.map((entry) => `${entry.url}#${entry.id}`),
        );
      } else {
        expect(job.entries).toEqual(originals);
        // Also protect old/restored selection lists and repeated checkbox IDs.
        job.entries!.push({
          ...originals[7],
          url: "https://example.invalid/alternate/7.png",
        });
        r.queue.selectCollection(job.id, ["7", "7", "42"]);
        expect(job.imageUrls).toEqual([
          `${originals[7].url}#7`,
          `${originals[42].url}#42`,
        ]);
        expect(job).toMatchObject({
          expectedFiles: 2,
          selectedAll: false,
          discoveredItems: 242,
          status: "review",
        });
        // The item list is gone after the choice, but the gallery keeps a thumbnail for the list.
        expect(job.entries).toBeUndefined();
        expect(job.thumbnailUrl).toBe(originals[0].thumbnail);
      }
    },
  );
  it("holds collections for preview despite automatic gallery and source settings, then downloads only the selection", async () => {
    expect(defaultSettings("C:/Downloads").previewCollections).toBe(true);
    const r = create(true, true);
    r.queue.settings.autoDownloadCollections = true;
    r.queue.settings.sourceRules = [
      { source: "127.0.0.1", autoDownload: true },
    ];
    vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
      source: "127.0.0.1",
      status: "collection",
      collectionKind: "images",
      mediaKey: "fixture:preview",
      entries: [
        {
          id: "1",
          title: "Landscape",
          url: "https://example.invalid/one.png",
          thumbnail: "https://example.invalid/thumb.png",
        },
        { id: "2", title: "Sky", url: "https://example.invalid/two.png" },
      ],
    });
    const download = vi.spyOn(r.engine, "download");
    r.queue.addLinks("http://127.0.0.1:1/preview");
    await waitUntil(
      () => r.queue.jobs[0].status === "collection" && !r.queue.activeCount,
    );
    const job = r.queue.jobs[0];
    expect(download).not.toHaveBeenCalled();
    expect(r.store.jobs()[0].entries?.[0].thumbnail).toBe(
      "https://example.invalid/thumb.png",
    );
    await r.queue.tick();
    expect(job.status).toBe("collection");
    r.queue.selectCollection(job.id, ["2"]);
    await waitUntil(() => job.status === "completed");
    expect(job.imageUrls).toEqual(["https://example.invalid/two.png#2"]);
    expect(job.selectedAll).toBe(false);
  });

  it("keeps the page title and site for selected media files", async () => {
    const r = create(true);
    vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
      source: "site.example",
      status: "collection",
      collectionKind: "videos",
      entries: [
        {
          id: "0",
          title: "Page title (1)",
          url: "http://127.0.0.1:1/1_720p.mp4",
          mediaFile: true,
        },
      ],
    });
    r.queue.addLinks("http://127.0.0.1:1/page");
    await waitUntil(
      () => r.queue.jobs[0].status === "collection" && !r.queue.activeCount,
    );
    r.queue.selectCollection(r.queue.jobs[0].id, ["0"]);
    expect(r.queue.jobs).toHaveLength(1);
    expect(r.queue.jobs[0]).toMatchObject({
      originalUrl: "http://127.0.0.1:1/1_720p.mp4",
      entryTitle: "Page title (1)",
      gallerySource: "site.example",
    });
    // Selecting it again must explain, not make the collection vanish.
    r.queue.addLinks("http://127.0.0.1:1/page", { force: true });
    await waitUntil(
      () =>
        r.queue.jobs.some((j) => j.status === "collection") &&
        !r.queue.activeCount,
    );
    const again = r.queue.jobs.find((j) => j.status === "collection")!;
    expect(() => r.queue.selectCollection(again.id, ["0"])).toThrow(
      /Already downloaded/,
    );
    expect(r.queue.jobs).toContain(again);
    // Downloading it again from History keeps the page title and site.
    const first = r.queue.jobs.find((j) => j.entryTitle)!;
    await r.queue.action([first.id], "again");
    expect(r.queue.jobs.at(-1)).toMatchObject({
      id: expect.not.stringMatching(first.id),
      entryTitle: "Page title (1)",
      gallerySource: "site.example",
    });
  });

  it("keeps title and referer on media-file entries, including after Download again", async () => {
    const r = create(false);
    const collection: Job = {
      id: "page",
      originalUrl: "https://example.invalid/page",
      title: "Page",
      source: "example.invalid",
      status: "collection",
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entries: [
        {
          id: "0",
          title: "Clip",
          url: "https://cdn.example.invalid/clip.mp4",
          mediaFile: true,
        },
      ],
    };
    r.queue.jobs.push(collection);
    r.queue.selectCollection("page", ["0"]);
    const clip = r.queue.jobs.find((j) => j.originalUrl.endsWith("clip.mp4"))!;
    expect(clip).toMatchObject({
      entryTitle: "Clip",
      refererUrl: "https://example.invalid/page",
      gallerySource: "example.invalid",
    });
    expect(downloadArgs(clip)).toContain("https://example.invalid/page");
    await waitUntil(() => clip.status !== "resolving");
    await r.queue.action([clip.id], "again");
    const copy = r.queue.jobs.find(
      (j) => j !== clip && j.originalUrl === clip.originalUrl,
    )!;
    expect(copy).toMatchObject({
      entryTitle: "Clip",
      refererUrl: "https://example.invalid/page",
    });
  });

  it("does not call 253 discovered items a complete 257-item source collection", async () => {
    const r = create(true);
    r.queue.settings.autoDownloadCollections = true;
    vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
      status: "collection",
      collectionKind: "images",
      mediaKey: "fixture:partial",
      sourceItemCount: 257,
      entries: Array.from({ length: 253 }, (_, i) => ({
        id: String(i),
        title: `Item ${i}`,
        url: `https://example.invalid/${i}.png`,
      })),
    });
    r.queue.addLinks("http://127.0.0.1:1/partial-collection");
    await waitUntil(() => r.queue.jobs[0].status === "failed", 5000);
    expect(r.queue.jobs[0]).toMatchObject({
      failureCode: "INCOMPLETE_DISCOVERY",
      sourceItemCount: 257,
      discoveredItems: 253,
      expectedFiles: 253,
      verifiedFiles: 253,
      missingFiles: 0,
    });
    expect(r.store.jobs()[0].verifiedFiles).toBe(253);
    expect(fs.existsSync(r.queue.jobs[0].filePath!)).toBe(true);
  });

  it.each(["missing-files", "repeating-pages"])(
    "keeps an incomplete API discovery visible with unknown total: %s",
    async (reason) => {
      const r = create(true);
      r.queue.settings.autoDownloadCollections = true;
      const audit = {
        pagesRead: 3,
        postsReturned: 3,
        uniquePosts: 2,
        duplicatePosts: 1,
        postsWithoutFiles: reason === "missing-files" ? 1 : 0,
        invalidPosts: 0,
        sharedFileUrls: 0,
        stopReason:
          reason === "missing-files"
            ? ("empty-page" as const)
            : ("repeated-page" as const),
      };
      vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
        status: "collection",
        collectionKind: "images",
        mediaKey: "fixture:incomplete-discovery",
        collectionDiscovery: audit,
        entries: [
          {
            id: "1",
            title: "Sample",
            url: "https://example.invalid/sample.png",
          },
        ],
      });
      r.queue.addLinks("http://127.0.0.1:1/discovery-evidence");
      await waitUntil(() => r.queue.jobs[0].status === "failed");
      expect(r.queue.jobs[0]).toMatchObject({
        failureCode: "INCOMPLETE_DISCOVERY",
        verifiedFiles: 1,
        missingFiles: 0,
        collectionDiscovery: audit,
      });
      expect(r.store.jobs()[0].collectionDiscovery).toEqual(audit);
      expect(fs.existsSync(r.queue.jobs[0].filePath!)).toBe(true);
    },
  );

  it.skipIf(process.platform !== "win32").each(["case", "namespace"])(
    "verifies Windows files reported with a different %s representation",
    async (representation) => {
      const r = create(true);
      r.queue.settings.autoDownloadCollections = true;
      vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
        status: "collection",
        collectionKind: "images",
        mediaKey: "fixture:paths",
        entries: [
          {
            id: "1",
            title: "Sample",
            url: "https://example.invalid/sample.png",
          },
        ],
      });
      vi.spyOn(r.engine, "download").mockImplementation((job, _auth, line) => {
        const file = path.join(job.targetDir!, "Sample.png");
        fs.writeFileSync(file, "fixture");
        const reported =
          representation === "case"
            ? file.toUpperCase()
            : path.toNamespacedPath(file);
        line("DRIFTFETCH_FILE:" + JSON.stringify(reported));
        // Duplicate event with an equivalent spelling still counts once.
        line("DRIFTFETCH_FILE:" + JSON.stringify(reported.toLowerCase()));
        return {
          done: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
          stop: async () => {},
        } as Running;
      });
      r.queue.addLinks("http://127.0.0.1:1/windows-file-report");
      await waitUntil(() =>
        ["completed", "failed"].includes(r.queue.jobs[0].status),
      );
      expect(r.queue.jobs[0]).toMatchObject({
        status: "completed",
        expectedFiles: 1,
        filesSaved: 1,
        verifiedFiles: 1,
        missingFiles: 0,
      });
    },
  );
  it.each(["collision", "deleted", "complete"])(
    "verifies every selected file with %s output",
    async (scenario) => {
      const r = create(true);
      r.queue.settings.autoDownloadCollections = true;
      vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
        status: "collection",
        collectionKind: "images",
        mediaKey: "fixture:two",
        entries: [0, 1].map((i) => ({
          id: String(i),
          title: `Item ${i}`,
          url: `https://example.invalid/${i}.png`,
        })),
      });
      vi.spyOn(r.engine, "download").mockImplementation((job, _auth, line) => {
        const a = path.join(job.targetDir!, "a.png");
        const b =
          scenario === "collision" ? a : path.join(job.targetDir!, "b.png");
        fs.writeFileSync(a, "fixture-a");
        fs.writeFileSync(b, "fixture-b");
        line("DRIFTFETCH_FILE:" + JSON.stringify(a));
        line("DRIFTFETCH_FILE:" + JSON.stringify(b));
        if (scenario === "deleted") fs.unlinkSync(a);
        return {
          done: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
          stop: async () => {},
        } as Running;
      });
      r.queue.addLinks("http://127.0.0.1:1/verify-files");
      await waitUntil(() =>
        ["completed", "failed"].includes(r.queue.jobs[0].status),
      );
      expect(r.queue.jobs[0]).toMatchObject({
        status: scenario === "complete" ? "completed" : "failed",
        expectedFiles: 2,
        verifiedFiles: scenario === "complete" ? 2 : 1,
        missingFiles: scenario === "complete" ? 0 : 1,
      });
      if (scenario !== "complete")
        expect(r.queue.jobs[0].failureCode).toBe("INCOMPLETE_FILES");
    },
  );
  it.each(["pause", "cancel", "shutdown", "suspend"] as const)(
    "aborts a pending gallery request on %s",
    async (action) => {
      const r = create(false);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
      let requestSignal: AbortSignal | undefined;
      vi.spyOn(engineModule, "imageGalleryMetadata").mockImplementation(
        (_url, signal) =>
          new Promise((_resolve, reject) => {
            requestSignal = signal;
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          }),
      );
      r.queue.addLinks("http://127.0.0.1:1/pending-gallery");
      await waitUntil(() => !!requestSignal);
      if (action === "shutdown" || action === "suspend")
        await r.queue[action]();
      else await r.queue.action([r.queue.jobs[0].id], action);
      expect(requestSignal!.aborted).toBe(true);
      expect(r.queue.activeCount).toBe(0);
      expect(r.probes).toBe(0);
      if (action === "pause") expect(r.queue.jobs[0].status).toBe("paused");
      if (action === "cancel") expect(r.queue.jobs[0].status).toBe("cancelled");
    },
  );

  it("ends link reading after the overall deadline and releases its worker", async () => {
    vi.useFakeTimers();
    try {
      const r = create(false);
      r.queue.settings.automaticRetries = false;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
      vi.spyOn(engineModule, "imageGalleryMetadata").mockImplementation(
        (_url, signal) =>
          new Promise((_resolve, reject) => {
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          }),
      );
      r.queue.addLinks("http://127.0.0.1:1/stalled-gallery");
      await vi.advanceTimersByTimeAsync(120_001);
      expect(r.queue.jobs[0]).toMatchObject({
        status: "failed",
        failureCode: "READ_TIMEOUT",
      });
      expect(r.queue.activeCount).toBe(0);
      expect(r.probes).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("tries session-aware image extraction when the unauthenticated gallery reader fails", async () => {
    const r = create(false);
    vi.spyOn(engineModule, "imageGalleryMetadata").mockRejectedValue(
      new TypeError("fetch failed"),
    );
    vi.spyOn(r.sessions, "argumentsFor").mockResolvedValue({
      args: ["--cookies", "fixture-session.txt"],
      cleanup: async () => {},
    });
    vi.spyOn(r.engine, "probe").mockReturnValue({
      done: Promise.resolve({ code: 1, stdout: "", stderr: "Unsupported URL" }),
      stop: async () => {},
    } as Running);
    const list = vi.fn(
      () =>
        ({
          done: Promise.resolve({
            code: 0,
            stdout: JSON.stringify([
              [
                3,
                "https://example.invalid/original.png",
                { id: "1", extension: "png" },
              ],
            ]),
            stderr: "",
          }),
          stop: async () => {},
        }) as Running,
    );
    r.engine.listImages = list;
    r.queue.addLinks("http://127.0.0.1:1/gallery-fallback");
    // A single item read by gallery-dl skips the chooser.
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(list).toHaveBeenCalledWith(
      "http://127.0.0.1:1/gallery-fallback",
      ["--cookies", "fixture-session.txt"],
      0,
    );
    expect(r.queue.jobs[0].imageUrls).toEqual([
      "https://example.invalid/original.png",
    ]);
  });
  it("says nothing was read, not 'sign in', when yt-dlp wants a login and gallery-dl lists nothing", async () => {
    const r = create(false);
    vi.spyOn(r.engine, "probe").mockReturnValue({
      done: Promise.resolve({
        code: 1,
        stdout: "",
        stderr:
          "ERROR: [instagram:story] You need to log in to access this content. Use --cookies",
      }),
      stop: async () => {},
    } as Running);
    r.engine.listImages = () =>
      ({
        done: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
        stop: async () => {},
      }) as Running;
    r.queue.addLinks("http://127.0.0.1:1/stories/nobody");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(r.queue.jobs[0].error).toContain("Nothing could be read");
    expect(r.queue.jobs[0].failureCode).toBe("NOTHING_READ");
  });
  it("still reports a login error when gallery-dl itself fails", async () => {
    const r = create(false);
    vi.spyOn(r.engine, "probe").mockReturnValue({
      done: Promise.resolve({
        code: 1,
        stdout: "",
        stderr: "ERROR: You need to log in to access this content.",
      }),
      stop: async () => {},
    } as Running);
    r.engine.listImages = () =>
      ({
        done: Promise.resolve({
          code: 1,
          stdout: "",
          stderr: "AuthRequired: 'login required'",
        }),
        stop: async () => {},
      }) as Running;
    r.queue.addLinks("http://127.0.0.1:1/stories/nobody2");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(r.queue.jobs[0].error).toContain("login required");
    expect(r.queue.jobs[0].error).not.toContain("Nothing could be read");
  });
  it("reports image-engine access errors instead of the video engine's unsupported URL", async () => {
    const r = create(false);
    vi.spyOn(r.engine, "probe").mockReturnValue({
      done: Promise.resolve({ code: 1, stdout: "", stderr: "Unsupported URL" }),
      stop: async () => {},
    } as Running);
    r.engine.listImages = () =>
      ({
        done: Promise.resolve({
          code: 1,
          stdout: "",
          stderr: "HTTP 403 Forbidden https://example.invalid/?token=SECRET",
        }),
        stop: async () => {},
      }) as Running;
    r.queue.addLinks("http://127.0.0.1:1/gallery-denied");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(r.queue.jobs[0].error).toContain("source refused access");
    expect(r.queue.jobs[0].error).not.toContain("SECRET");
  });
  it.each([
    {
      global: true,
      source: false,
      status: "queued",
      held: false,
      expected: "review",
    },
    {
      global: false,
      source: true,
      status: "downloading",
      held: false,
      expected: "queued",
    },
    {
      global: false,
      source: true,
      status: "paused",
      held: false,
      expected: "paused",
    },
    {
      global: true,
      source: true,
      status: "queued",
      held: true,
      expected: "review",
    },
  ] as const)(
    "recovers $status with global=$global, source=$source, held=$held",
    async (scenario) => {
      const r = create(false);
      r.queue.addLinks("http://127.0.0.1:1/restart-rule");
      await waitUntil(() => r.queue.jobs[0].status === "review");
      await r.queue.shutdown();
      r.queue.settings.autoDownload = scenario.global;
      r.queue.settings.sourceRules = [
        { source: "127.0.0.1", autoDownload: scenario.source },
      ];
      r.store.saveSettings(r.queue.settings);
      r.queue.save(r.queue.jobs[0], {
        status: scenario.status,
        holdForReview: scenario.held,
      });
      const reopened = new Queue(
        r.store,
        r.queue.settings,
        r.engine,
        r.sessions,
        () => {},
      );
      try {
        expect(reopened.jobs[0].status).toBe(scenario.expected);
        expect(r.store.jobs()[0].status).toBe(scenario.expected);
      } finally {
        await reopened.shutdown();
      }
    },
  );

  it.each([
    { kind: "images", automatic: true, held: false, expected: "completed" },
    { kind: "images", automatic: false, held: false, expected: "collection" },
    { kind: "images", automatic: true, held: true, expected: "collection" },
    { kind: "videos", automatic: true, held: false, expected: "collection" },
  ] as const)(
    "handles $kind collection with automatic=$automatic, held=$held",
    async (scenario) => {
      const r = create(true);
      r.queue.settings.autoDownloadCollections = scenario.automatic;
      vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
        status: "collection",
        collectionKind: scenario.kind,
        source: "127.0.0.1",
        title: "Neutral fixture collection",
        mediaKey: "fixture:gallery",
        entries: [
          {
            id: "0",
            title: "First image",
            url: "http://127.0.0.1:1/image.jpg",
          },
        ],
      });
      r.queue.addLinks("http://127.0.0.1:1/gallery", { review: scenario.held });
      await waitUntil(() => r.queue.jobs[0].status === scenario.expected);
      expect(r.queue.jobs).toHaveLength(1);
      if (scenario.expected === "completed")
        expect(r.queue.jobs[0].imageUrls).toEqual([
          "http://127.0.0.1:1/image.jpg#0",
        ]);
      else expect(r.maxActive).toBe(0);
    },
  );

  it("applies a source's automatic setting after image selection", async () => {
    const r = create(true);
    r.queue.settings.sourceRules = [
      { source: "127.0.0.1", autoDownload: false },
    ];
    vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
      status: "collection",
      collectionKind: "images",
      source: "127.0.0.1",
      title: "Neutral fixture collection",
      mediaKey: "fixture:gallery",
      entries: [
        { id: "0", title: "First image", url: "http://127.0.0.1:1/image.jpg" },
      ],
    });
    r.queue.addLinks("http://127.0.0.1:1/gallery-selection");
    await waitUntil(() => r.queue.jobs[0].status === "collection");
    r.queue.selectCollection(r.queue.jobs[0].id, ["0"]);
    expect(r.queue.jobs[0].status).toBe("review");
    expect(r.maxActive).toBe(0);
  });

  it("downloads image collections even when FFmpeg is unavailable", async () => {
    const r = create(true);
    r.engine.info.ffmpegAvailable = false;
    r.queue.settings.autoDownloadCollections = true;
    vi.spyOn(engineModule, "imageGalleryMetadata").mockResolvedValue({
      status: "collection",
      collectionKind: "images",
      source: "127.0.0.1",
      title: "Neutral image collection",
      mediaKey: "ImageSearch:127.0.0.1:fixture",
      entries: [{ id: "1", title: "Post 1", url: "http://127.0.0.1:1/1.jpg" }],
    });
    r.queue.addLinks("http://127.0.0.1:1/posts?tags=fixture");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
  });

  it("holds a source for review even with global automatic downloading enabled", async () => {
    const r = create(true);
    r.queue.settings.sourceRules = [
      { source: "127.0.0.1", autoDownload: false },
    ];
    r.queue.addLinks("http://127.0.0.1:1/source-review");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.maxActive).toBe(0);
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
  });

  it("applies source transfer settings and the batch folder to the saved download", async () => {
    const r = create(false);
    const sourceFolder = path.join(r.dir, "source-downloads");
    r.queue.settings.sourceRules = [
      {
        source: "127.0.0.1",
        autoDownload: true,
        quality: "720",
        speedLimitKiB: 128,
        fragmentConcurrency: 4,
        downloadDir: sourceFolder,
      },
    ];
    r.queue.addLinks("http://127.0.0.1:1/source-settings", {
      groupName: "My batch",
    });
    await waitUntil(() => r.queue.jobs[0].status === "completed");
    const saved = r.store.jobs()[0];
    expect(saved.qualityLimit).toBe("720");
    expect(saved.speedLimitKiB).toBe(128);
    expect(saved.fragmentConcurrency).toBe(4);
    expect(saved.filePath!.startsWith(sourceFolder + path.sep)).toBe(true);
    expect(saved.filePath).toContain("My batch");
    expect(fs.existsSync(saved.filePath!)).toBe(true);
  });

  it("keeps an explicitly reviewed batch held despite source automatic downloading", async () => {
    const r = create(true);
    r.queue.settings.sourceRules = [
      { source: "127.0.0.1", autoDownload: true },
    ];
    r.queue.addLinks("http://127.0.0.1:1/held-batch", { review: true });
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.maxActive).toBe(0);
  });
  it("records duplicate captures without creating duplicate jobs and retains only 100 events", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/one?secret=PRIVATE", {
      origin: "clipboard",
    });
    for (let i = 0; i < 102; i++)
      r.queue.addLinks("http://127.0.0.1:1/one?secret=PRIVATE", {
        origin: "clipboard",
      });
    expect(r.store.captures()).toHaveLength(100);
    expect(r.store.captures().every((c) => c.duplicate)).toBe(true);
    expect(JSON.stringify(r.store.captures())).not.toContain("PRIVATE");
    expect(r.queue.jobs).toHaveLength(1);
    r.store.clearCaptures();
    expect(r.store.captures()).toHaveLength(0);
    expect(r.queue.jobs).toHaveLength(1);
  });
  it("rejects unknown format choices and preserves the format of partial downloads", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/one");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    const job = r.queue.jobs[0];
    r.queue.save(job, {
      formats: [{ id: "high", ext: "mp4", height: 1080, separateAudio: false }],
    });
    expect(() => r.queue.setFormat(job.id, "unknown")).toThrow();
    r.queue.setFormat(job.id, "high");
    expect(r.store.jobs()[0].selectedFormatId).toBe("high");
    r.queue.save(job, { targetDir: "C:\\partial" });
    expect(() => r.queue.setFormat(job.id, "")).toThrow();
  });
  it("respects concurrency while completing and persisting files", async () => {
    const r = create();
    r.queue.addLinks(
      Array.from({ length: 5 }, (_, i) => `http://127.0.0.1:1/${i}`).join("\n"),
    );
    await waitUntil(() => r.queue.jobs.every((j) => j.status === "completed"));
    expect(r.maxActive).toBe(2);
    expect(r.store.jobs().filter((j) => j.status === "completed")).toHaveLength(
      5,
    );
  });
  it("holds resolved videos when automatic downloading is disabled", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/one");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.maxActive).toBe(0);
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
  });
  it("detects original URL and final media identity duplicates", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/one");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.queue.addLinks("http://127.0.0.1:1/one").duplicates).toBe(1);
    r.queue.addLinks("http://127.0.0.1:1/same");
    await waitUntil(() => r.queue.jobs[1].status === "duplicate");
    expect(r.queue.jobs[1].duplicateOf).toBe(r.queue.jobs[0].id);
  });
  it("keeps a 1,000-link queue responsive across normal paste-sized batches", async () => {
    const r = create(false);
    for (let batch = 0; batch < 5; batch++)
      r.queue.addLinks(
        Array.from(
          { length: 200 },
          (_, index) => `http://127.0.0.1:1/large-${batch * 200 + index}`,
        ).join("\n"),
      );
    await waitUntil(
      () =>
        r.queue.jobs.length === 1000 &&
        r.queue.jobs.every((job) => job.status === "review"),
      15000,
    );
    const first = r.queue.jobs[0];
    const last = r.queue.jobs.at(-1)!;
    r.queue.reorder(last.id, first.id);
    expect(r.queue.jobs).toHaveLength(1000);
    expect(last.queueOrder).toBeLessThan(first.queueOrder!);
  });
  it("reports links beyond the per-paste cap instead of dropping them silently", () => {
    const r = create(false);
    const links = Array.from(
      { length: 250 },
      (_, i) => `http://127.0.0.1:1/cap-${i}`,
    ).join(" ");
    expect(r.queue.addLinks(links)).toMatchObject({
      added: 200,
      truncated: 50,
    });
  });
  it("cancel and remove delete partial files, pause keeps them", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "partials-"));
    const make = (id: string): Job => ({
      id,
      originalUrl: `https://example.invalid/${id}`,
      title: id,
      source: "example.invalid",
      status: "paused",
      progress: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetDir,
    });
    const paused = make("aaaaaaaa-1"),
      cancelled = make("bbbbbbbb-2"),
      other = make("cccccccc-3");
    r.queue.jobs.push(paused, cancelled, other);
    for (const [, names] of [
      [paused, ["a-aaaaaaaa.f137.mp4.part"]],
      [
        cancelled,
        [
          "b-bbbbbbbb.f137.mp4.part",
          "b-bbbbbbbb.mp4.ytdl",
          "b-bbbbbbbb.mp4.part-Frag3",
          "b-bbbbbbbb.mkv",
        ],
      ],
      [other, ["c-cccccccc.mp4.part"]],
    ] as [Job, string[]][])
      for (const name of names)
        fs.writeFileSync(path.join(targetDir, name), "x");
    await r.queue.action([paused.id], "pause");
    await r.queue.action([cancelled.id], "cancel");
    expect(fs.readdirSync(targetDir).sort()).toEqual([
      "a-aaaaaaaa.f137.mp4.part",
      "b-bbbbbbbb.mkv",
      "c-cccccccc.mp4.part",
    ]);
  });
  it.each([
    ["search", 5, 6],
    ["profile", 0, 1],
  ] as const)(
    "resumes a stopped gallery-dl %s job after the files it already saved",
    async (kind, resumed, saved) => {
      const r = create(false);
      const targetDir = fs.mkdtempSync(path.join(r.dir, "resume-"));
      r.queue.jobs.push({
        id: "dddddddd-4",
        originalUrl: "https://example.invalid/search",
        title: "search",
        source: "example.invalid",
        mediaKey: "GalleryDL:https://example.invalid/search",
        ...(kind === "profile"
          ? { linkType: "profile" as const }
          : { imageSearch: true }),
        status: "paused",
        progress: 0,
        filesSaved: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        targetDir,
      });
      let resumedAt: number | undefined;
      vi.spyOn(r.engine, "download").mockImplementation((job, _auth, line) => {
        resumedAt = job.filesSaved;
        const file = path.join(targetDir, "six.png");
        fs.writeFileSync(file, "fixture");
        line("DRIFTFETCH_FILE:" + JSON.stringify(file));
        return {
          done: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
          stop: async () => {},
        } as Running;
      });
      await r.queue.action(["dddddddd-4"], "retry");
      await waitUntil(() =>
        ["completed", "failed"].includes(r.queue.jobs[0].status),
      );
      expect(resumedAt).toBe(resumed);
      expect(r.queue.jobs[0]).toMatchObject({
        status: "completed",
        filesSaved: saved,
      });
    },
  );
  it.each([
    ["one part fails", "", "completed"],
    ["the site limits requests", "HTTP Error 429: Too Many Requests", "failed"],
  ] as const)(
    "keeps a profile's saved files when %s",
    async (_case, stderr, status) => {
      const r = create(false);
      const targetDir = fs.mkdtempSync(path.join(r.dir, "partial-"));
      r.queue.jobs.push({
        id: "eeeeeeee-5",
        originalUrl: "https://example.invalid/someone/",
        title: "someone profile",
        source: "example.invalid",
        mediaKey: "GalleryDL:https://example.invalid/someone/",
        linkType: "profile",
        status: "paused",
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        targetDir,
      });
      const asked: (string[] | undefined)[] = [];
      vi.spyOn(r.engine, "download").mockImplementation((job, _auth, line) => {
        asked.push(job.partialFailure?.parts);
        const image = path.join(targetDir, `post-${asked.length}.jpg`);
        fs.writeFileSync(image, "fixture");
        line("DRIFTFETCH_FILE:" + JSON.stringify(image));
        // gallery-dl names a DASH video .mp4; yt-dlp merges it into .mkv.
        const video = path.join(targetDir, `reel-${asked.length}.mp4`);
        fs.writeFileSync(video.replace(/\.mp4$/, ".mkv"), "video");
        line("DRIFTFETCH_FILE:" + JSON.stringify(video));
        const failed = asked.length === 1;
        return {
          done: Promise.resolve({
            code: failed ? 1 : 0,
            stdout: "",
            stderr: failed ? stderr : "",
            partErrors: failed
              ? { reels: "HTTP redirect to home page", user: "ignored" }
              : undefined,
          }),
          stop: async () => {},
        } as Running;
      });
      const job = () => r.queue.jobs[0];
      await r.queue.action([job().id], "start");
      await waitUntil(() => ["completed", "failed"].includes(job().status));
      expect(job().status).toBe(status);
      if (status === "failed") return;
      expect(job().partialFailure).toEqual({
        parts: ["reels"],
        error: expect.stringContaining("home page instead of answering"),
      });
      // The size is the whole folder this run touched, not the last file.
      expect(job()).toMatchObject({
        totalBytes: "fixture".length + "video".length,
        filePath: path.join(targetDir, "reel-1.mkv"),
      });
      // Retry asks for only the failed part, and a clean run clears the gap.
      await r.queue.action([job().id], "start");
      await waitUntil(() => asked.length === 2 && job().status === "completed");
      expect(asked).toEqual([undefined, ["reels"]]);
      expect(job().partialFailure).toBeUndefined();
    },
  );
  const instagramProfileJob = (id: string, targetDir: string): Job => ({
    id,
    originalUrl: "https://www.instagram.com/someone/",
    title: "someone profile",
    source: "www.instagram.com",
    mediaKey: "GalleryDL:https://www.instagram.com/someone/",
    linkType: "profile",
    status: "paused",
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    targetDir,
  });
  it("retries a private profile once with the private-profiles sign-in", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "private-"));
    r.queue.jobs.push(instagramProfileJob("abababab-1", targetDir));
    r.sessions.hasPrivate = () => true;
    const slots: (boolean | undefined)[] = [];
    vi.spyOn(r.sessions, "argumentsFor").mockImplementation(
      async (_url, usePrivate) => {
        slots.push(usePrivate);
        return { args: [], cleanup: async () => {} };
      },
    );
    vi.spyOn(r.engine, "download").mockImplementation((job, _auth, line) => {
      if (job.usePrivateAccount) {
        const image = path.join(targetDir, "post.jpg");
        fs.writeFileSync(image, "fixture");
        line("DRIFTFETCH_FILE:" + JSON.stringify(image));
      }
      return {
        done: Promise.resolve({
          code: 0,
          stdout: "",
          stderr: job.usePrivateAccount
            ? ""
            : "[instagram][warning] someone's posts are private",
        }),
        stop: async () => {},
      } as Running;
    });
    const job = () => r.queue.jobs[0];
    await r.queue.action([job().id], "start");
    await waitUntil(() => job().status === "completed");
    expect(slots).toEqual([undefined, true]);
    expect(job().usePrivateAccount).toBe(true);
  });
  it("explains a private profile when there is no private-profiles sign-in", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "private-"));
    r.queue.jobs.push(instagramProfileJob("abababab-2", targetDir));
    vi.spyOn(r.engine, "download").mockReturnValue({
      done: Promise.resolve({
        code: 0,
        stdout: "",
        stderr: "[instagram][warning] someone's posts are private",
      }),
      stop: async () => {},
    } as Running);
    const job = () => r.queue.jobs[0];
    await r.queue.action([job().id], "start");
    await waitUntil(() => job().status === "failed");
    expect(job().error).toContain("private-profiles sign-in");
  });
  it("pauses Instagram when it sends the session to a security check", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "challenge-"));
    r.queue.jobs.push(instagramProfileJob("abababab-3", targetDir));
    vi.spyOn(r.engine, "download").mockReturnValue({
      done: Promise.resolve({
        code: 1,
        stdout: "",
        stderr:
          "[instagram][error] AbortExtraction: HTTP redirect to challenge page (https://www.instagram.com/challenge/)",
      }),
      stop: async () => {},
    } as Running);
    const job = () => r.queue.jobs[0];
    await r.queue.action([job().id], "start");
    await waitUntil(() => job().status === "failed");
    expect(job().error).toContain("security-check page");
    expect(job().error).toContain("paused for about 60 minutes");
  });
  it("reuses a link check until its download finishes instead of asking again", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/check-once");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.probes).toBe(1);
    // A retry of the same link goes back through the checking step without another request.
    r.queue.save(r.queue.jobs[0], { status: "resolving" });
    r.queue.pump();
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.probes).toBe(1);
  });
  it("checks a new Instagram link even when today's limit is used up", async () => {
    const r = create(false);
    r.queue.settings.instagramDailyRequests = 5;
    r.store.addUsage(
      `instagram:usual:${new Date().toLocaleDateString("sv")}`,
      5,
    );
    r.queue.addLinks("https://www.instagram.com/p/limitcheck1/");
    // The check runs even though the limit is used up; its outcome does not matter here.
    await waitUntil(() => r.probes === 1);
    expect(r.probes).toBe(1);
  });
  it("pauses only the account that was challenged, not the private-profiles one", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "per-account-"));
    r.queue.jobs.push(
      instagramProfileJob("abababab-4", targetDir),
      instagramProfileJob("abababab-5", targetDir),
    );
    r.queue.jobs[1].usePrivateAccount = true;
    vi.spyOn(r.engine, "download").mockImplementation(
      (job) =>
        ({
          done: Promise.resolve(
            job.usePrivateAccount
              ? { code: 0, stdout: "", stderr: "" }
              : {
                  code: 1,
                  stdout: "",
                  stderr:
                    "[instagram][error] AbortExtraction: HTTP redirect to challenge page (https://www.instagram.com/challenge/)",
                },
          ),
          stop: async () => {},
        }) as Running,
    );
    await r.queue.action([r.queue.jobs[0].id, r.queue.jobs[1].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(r.queue.jobs[1].status).not.toBe("failed");
    expect(r.queue.jobs[1].error).toBeUndefined();
  });
  it("counts Instagram requests and holds work past the daily limit", async () => {
    const r = create(false);
    r.queue.settings.instagramDailyRequests = 30;
    const targetDir = fs.mkdtempSync(path.join(r.dir, "limit-"));
    r.queue.jobs.push(instagramProfileJob("cdcdcdcd-1", targetDir), {
      ...instagramProfileJob("cdcdcdcd-2", targetDir),
      originalUrl: "https://www.instagram.com/other/",
      mediaKey: "GalleryDL:https://www.instagram.com/other/",
    });
    const download = vi
      .spyOn(r.engine, "download")
      .mockImplementation((_job, _auth, line) => {
        const image = path.join(targetDir, `${_job.id}.jpg`);
        fs.writeFileSync(image, "fixture");
        line("DRIFTFETCH_FILE:" + JSON.stringify(image));
        return {
          done: Promise.resolve({
            code: 0,
            stdout: "",
            stderr: "",
            requests: 31,
          }),
          stop: async () => {},
        } as Running;
      });
    const [first, second] = r.queue.jobs;
    await r.queue.action([first.id], "start");
    await waitUntil(() => first.status === "completed");
    await r.queue.action([second.id], "start");
    await waitUntil(() => !!second.limitHeld);
    expect(second.status).toBe("queued");
    expect(download).toHaveBeenCalledTimes(1);
    // The user can send one past the limit.
    await r.queue.action([second.id], "force");
    await waitUntil(() => second.status === "completed");
    expect(second.limitHeld).toBeUndefined();
    expect(download).toHaveBeenCalledTimes(2);
  });
  it("a private-profiles sign-in has its own daily count", async () => {
    const r = create(false);
    r.queue.settings.instagramDailyRequests = 30;
    const targetDir = fs.mkdtempSync(path.join(r.dir, "limit-"));
    r.queue.jobs.push(instagramProfileJob("cdcdcdcd-1", targetDir), {
      ...instagramProfileJob("cdcdcdcd-2", targetDir),
      originalUrl: "https://www.instagram.com/other/",
      mediaKey: "GalleryDL:https://www.instagram.com/other/",
    });
    vi.spyOn(r.engine, "download").mockImplementation((_job, _auth, line) => {
      const image = path.join(targetDir, `${_job.id}.jpg`);
      fs.writeFileSync(image, "fixture");
      line("DRIFTFETCH_FILE:" + JSON.stringify(image));
      return {
        done: Promise.resolve({
          code: 0,
          stdout: "",
          stderr: "",
          requests: 31,
        }),
        stop: async () => {},
      } as Running;
    });
    const [first, second] = r.queue.jobs;
    await r.queue.action([first.id], "start");
    await waitUntil(() => first.status === "completed");
    await r.queue.action([second.id], "start");
    await waitUntil(() => !!second.limitHeld);
    second.usePrivateAccount = true;
    await waitUntil(() => second.status === "completed");
    expect(second.limitHeld).toBeUndefined();
  });
  it("stops a repeat sync of a fully saved profile at its saved posts", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "repeat-"));
    r.queue.jobs.push(
      {
        ...instagramProfileJob("efefefef-1", targetDir),
        status: "completed",
        finishedAt: Date.now(),
      },
      instagramProfileJob("efefefef-2", targetDir),
    );
    const asked: (boolean | undefined)[] = [];
    vi.spyOn(r.engine, "download").mockImplementation((job) => {
      asked.push(job.stopAtSaved);
      return {
        done: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
        stop: async () => {},
      } as Running;
    });
    const job = r.queue.jobs[1];
    await r.queue.action([job.id], "start");
    await waitUntil(() => job.status === "completed");
    expect(asked).toEqual([true]);
  });
  it("keeps a profile saved with gaps when retrying its failed part saves nothing", async () => {
    const r = create(false);
    const targetDir = fs.mkdtempSync(path.join(r.dir, "gaps-"));
    const gap = { parts: ["reels"], error: "Earlier reason." };
    r.queue.jobs.push({
      id: "ffffffff-6",
      originalUrl: "https://example.invalid/someone/",
      title: "someone profile",
      source: "example.invalid",
      mediaKey: "GalleryDL:https://example.invalid/someone/",
      linkType: "profile",
      status: "completed",
      progress: 100,
      totalBytes: 5000,
      partialFailure: gap,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetDir,
    });
    const asked: (string[] | undefined)[] = [];
    vi.spyOn(r.engine, "download").mockImplementation((job, _auth, line) => {
      asked.push(job.partialFailure?.parts);
      if (asked.length === 2) {
        const reel = path.join(targetDir, "reel.mkv");
        fs.writeFileSync(reel, "video");
        line("DRIFTFETCH_FILE:" + JSON.stringify(reel));
      }
      const failed = asked.length === 1;
      return {
        done: Promise.resolve({
          code: failed ? 1 : 0,
          stdout: "",
          stderr: "",
          partErrors: failed
            ? { reels: "Failed to download 4 reels; retry later" }
            : undefined,
        }),
        stop: async () => {},
      } as Running;
    });
    const job = () => r.queue.jobs[0];
    await r.queue.action([job().id], "start");
    await waitUntil(() => asked.length === 1 && job().status === "completed");
    expect(asked[0]).toEqual(["reels"]);
    expect(job()).toMatchObject({
      totalBytes: 5000,
      partialFailure: { parts: ["reels"] },
    });
    // The next retry saves a reel: it adds to the size and clears the gap.
    await r.queue.action([job().id], "start");
    await waitUntil(() => asked.length === 2 && job().status === "completed");
    expect(job().totalBytes).toBe(5000 + "video".length);
    expect(job().partialFailure).toBeUndefined();
  });
  it("restores removed entries until something newer is removed", async () => {
    const r = create(false);
    const make = (id: string): Job => ({
      id,
      originalUrl: `https://example.invalid/${id}`,
      title: id,
      source: "example.invalid",
      status: "completed",
      progress: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    r.queue.jobs.push(make("one"), make("two"), make("three"));
    await r.queue.action(["one"], "remove");
    expect(r.queue.jobs.map((j) => j.id)).toEqual(["two", "three"]);
    expect(r.queue.restoreRemoved()).toBe(1);
    expect(r.queue.jobs.map((j) => j.id).sort()).toEqual([
      "one",
      "three",
      "two",
    ]);
    expect(r.store.jobs().some((j) => j.id === "one")).toBe(true);
    expect(r.queue.restoreRemoved()).toBe(0);
    r.queue.removeIdle(["two", "three"]);
    expect(r.queue.restoreRemoved()).toBe(2);
  });
  it("allows a copied link to retry after an earlier failure", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/try-again");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    r.queue.save(r.queue.jobs[0], { status: "failed", error: "Old error" });
    expect(r.queue.addLinks("http://127.0.0.1:1/try-again")).toMatchObject({
      added: 1,
      duplicates: 0,
    });
    expect(r.queue.jobs).toHaveLength(2);
  });
  it("pausing link analysis does not spawn another resolver", async () => {
    const r = create();
    r.queue.addLinks("http://127.0.0.1:1/one");
    await r.queue.action([r.queue.jobs[0].id], "pause");
    await new Promise((res) => setTimeout(res, 40));
    expect(r.queue.jobs[0].status).toBe("paused");
    expect(r.queue.activeCount).toBe(0);
  });
  it("an explicit start downloads a previously unresolved item even with auto-download off", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/one");
    await r.queue.action([r.queue.jobs[0].id], "pause");
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
  });
  it("cancelled work releases its worker slot and can be retried", async () => {
    const r = create();
    r.queue.addLinks("http://127.0.0.1:1/one");
    await waitUntil(() => r.queue.jobs[0].status === "downloading");
    await r.queue.action([r.queue.jobs[0].id], "cancel");
    expect(r.queue.jobs[0].status).toBe("cancelled");
    await r.queue.action([r.queue.jobs[0].id], "retry");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
  });
  it("explicit download-again creates a new job despite history", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/one");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    await r.queue.action([r.queue.jobs[0].id], "again");
    await waitUntil(() => r.queue.jobs[1].status === "review");
    expect(r.queue.jobs[1].force).toBe(true);
  });
  it("holds explicitly reviewed links despite automatic downloading", async () => {
    const r = create(true);
    r.queue.addLinks("http://127.0.0.1:1/review-me", { review: true });
    await waitUntil(() => r.queue.jobs[0].status === "review");
    expect(r.queue.jobs[0].holdForReview).toBe(true);
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
  });
  it("a successful recheck recovers an unidentified failed entry into review", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/recover-formats");
    await waitUntil(
      () => r.queue.jobs[0].status === "review" && !r.queue.activeCount,
    );
    const job = r.queue.jobs[0];
    r.queue.save(job, {
      mediaKey: undefined,
      status: "failed",
      error: "Old extraction error",
    });
    await r.queue.refreshFormats(job.id);
    expect(job.status).toBe("review");
    expect(job.mediaKey).toBeTruthy();
    expect(job.error).toBeUndefined();
    expect(job.holdForReview).toBe(true);
  });
  it("refreshes formats without replacing a completed file or creating a second job", async () => {
    const r = create(true);
    r.queue.addLinks("http://127.0.0.1:1/refresh-me");
    await waitUntil(
      () => r.queue.jobs[0].status === "completed" && !r.queue.activeCount,
    );
    const job = r.queue.jobs[0],
      file = job.filePath,
      quality = job.quality;
    await r.queue.refreshFormats(job.id);
    expect(r.queue.jobs).toHaveLength(1);
    expect(job.filePath).toBe(file);
    expect(job.quality).toBe(quality);
    expect(job.status).toBe("completed");
    expect(job.formatsCheckedAt).toBeGreaterThan(0);
    r.engine.probe = () =>
      ({
        done: Promise.resolve({
          code: 1,
          stdout: "",
          stderr: "Unsupported URL",
        }),
        stop: async () => {},
      }) as Running;
    await r.queue.refreshFormats(job.id);
    expect(job.status).toBe("completed");
    expect(job.formatsError).toContain("could not identify supported media");
    expect(job.filePath).toBe(file);
  });
  it("persists queue ordering and Download next starts a held item", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/first\nhttp://127.0.0.1:1/second");
    await waitUntil(
      () =>
        r.queue.jobs.every((j) => j.status === "review") &&
        !r.queue.activeCount,
    );
    const [first, second] = r.queue.jobs;
    r.queue.reorder(second.id, first.id);
    const saved = r.store.jobs().sort((a, b) => a.queueOrder! - b.queueOrder!);
    expect(saved[0].id).toBe(second.id);
    r.queue.reorder(second.id, first.id, true);
    expect(second.queueOrder).toBeGreaterThan(first.queueOrder!);
    await r.queue.action([second.id], "next");
    await waitUntil(() => second.status === "completed");
    expect(first.status).toBe("review");
  });
  it("persists retry countdown, retries once due, and pause cancels retry", async () => {
    const r = create(false);
    r.engine.download = () =>
      ({
        done: Promise.resolve({
          code: 1,
          stdout: "",
          stderr: "Connection reset by peer",
        }),
        stop: async () => {},
      }) as Running;
    r.queue.addLinks("http://127.0.0.1:1/retry");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    const job = r.queue.jobs[0];
    await r.queue.action([job.id], "start");
    await waitUntil(() => job.status === "failed" && !r.queue.activeCount);
    expect(job.retryCount).toBe(1);
    expect(r.store.jobs()[0].retryAt).toBe(job.retryAt);
    await r.queue.tick(new Date(job.retryAt! + 1));
    await waitUntil(() => job.retryCount === 2 && !r.queue.activeCount);
    await r.queue.action([job.id], "pause");
    await r.queue.tick(new Date(Date.now() + 120000));
    expect(job.retryAt).toBeUndefined();
    expect(job.status).toBe("paused");
  });
  it("detects missing files without forgetting duplicate identity and recovers when restored", async () => {
    const r = create();
    r.queue.addLinks("http://127.0.0.1:1/missing");
    await waitUntil(() => r.queue.jobs[0].status === "completed");
    const job = r.queue.jobs[0],
      file = job.filePath!;
    fs.renameSync(file, file + ".moved");
    await r.queue.checkFiles();
    expect(job.fileMissing).toBe(true);
    expect(r.queue.addLinks(job.originalUrl).duplicates).toBe(1);
    fs.renameSync(file + ".moved", file);
    await r.queue.checkFiles();
    expect(job.fileMissing).toBe(false);
  });
  it("holds transfers outside the schedule and never resumes a manual pause", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/scheduled\nhttp://127.0.0.1:1/manual");
    await waitUntil(() => r.queue.jobs.every((j) => j.status === "review"));
    const [scheduled, manual] = r.queue.jobs;
    await r.queue.action([manual.id], "pause");
    const hour = new Date().getHours();
    r.queue.settings.scheduleEnabled = true;
    r.queue.settings.scheduleStart = `${String((hour + 1) % 24).padStart(2, "0")}:00`;
    r.queue.settings.scheduleEnd = `${String((hour + 2) % 24).padStart(2, "0")}:00`;
    await r.queue.action([scheduled.id], "start");
    expect(scheduled.status).toBe("queued");
    expect(r.queue.activeCount).toBe(0);
    r.queue.settings.scheduleEnabled = false;
    await r.queue.tick();
    await waitUntil(() => scheduled.status === "completed");
    expect(manual.status).toBe("paused");
  });
  it("blocks a low-space transfer before launching the download engine", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/space");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    const spy = vi.spyOn(r.engine, "download");
    vi.spyOn(asyncFs, "statfs").mockResolvedValue({
      bavail: 1,
      bsize: 4096,
    } as any);
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(spy).not.toHaveBeenCalled();
    expect(r.queue.jobs[0].error).toContain("free space");
    expect(r.queue.jobs[0].retryAt).toBeUndefined();
  });
  it("keeps work retryable when the destination drive disappears", async () => {
    const r = create(false);
    r.queue.addLinks("http://127.0.0.1:1/disconnected-drive");
    await waitUntil(() => r.queue.jobs[0].status === "review");
    const spy = vi.spyOn(r.engine, "download");
    vi.spyOn(asyncFs, "statfs").mockRejectedValue(
      Object.assign(new Error("ENODEV: device not ready"), { code: "ENODEV" }),
    );
    await r.queue.action([r.queue.jobs[0].id], "start");
    await waitUntil(() => r.queue.jobs[0].status === "failed");
    expect(spy).not.toHaveBeenCalled();
    expect(r.queue.jobs[0].error).toContain("destination drive is unavailable");
    expect(r.queue.jobs[0].retryAt).toBeUndefined();
  });
  it("retains partial work at schedule close and resumes when scheduling is disabled", async () => {
    const r = create();
    r.queue.addLinks("http://127.0.0.1:1/close-window");
    await waitUntil(() => r.queue.jobs[0].status === "downloading");
    const job = r.queue.jobs[0],
      destination = job.targetDir;
    const hour = new Date().getHours();
    Object.assign(r.queue.settings, {
      scheduleEnabled: true,
      scheduleStart: `${String((hour + 1) % 24).padStart(2, "0")}:00`,
      scheduleEnd: `${String((hour + 2) % 24).padStart(2, "0")}:00`,
    });
    await r.queue.tick();
    expect(job.status).toBe("queued");
    expect(job.scheduleHeld).toBe(true);
    expect(job.targetDir).toBe(destination);
    r.queue.settings.scheduleEnabled = false;
    await r.queue.tick();
    await waitUntil(() => job.status === "completed");
  });
  it("returns an in-progress transfer to the queue during shutdown", async () => {
    const r = create();
    r.queue.addLinks("http://127.0.0.1:1/shutdown-transfer");
    await waitUntil(() => r.queue.jobs[0].status === "downloading");
    const job = r.queue.jobs[0];
    await r.queue.shutdown();
    expect(job.status).toBe("queued");
    expect(job.targetDir).toBeTruthy();
    expect(r.queue.activeCount).toBe(0);
  });
  it("safely pauses active work through sleep and resumes it after wake", async () => {
    const r = create();
    r.queue.addLinks("http://127.0.0.1:1/sleep-recovery");
    await waitUntil(() => r.queue.jobs[0].status === "downloading");
    const job = r.queue.jobs[0];
    await r.queue.suspend();
    expect(job.status).toBe("queued");
    expect(r.queue.activeCount).toBe(0);
    r.queue.resume();
    await waitUntil(() => job.status === "completed");
  });
});
