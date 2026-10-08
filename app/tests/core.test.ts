import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  ClipboardTracker,
  defaultSettings,
  friendlyError,
  isPrivateHost,
  instagramProfile,
  redditFeed,
  normalizeUrl,
  outputLocation,
  parseLinks,
  recoveryStatus,
  safeSegment,
  sanitizeSettings,
  validateSettings,
} from "../electron/core";
import {
  downloadArgs,
  galleryDlLinks,
  galleryDlMetadata,
  metadataJob,
} from "../electron/engine";
import type { Job } from "../src/shared";
const job: Job = {
  id: "12345678-1234-1234-1234-123456789abc",
  originalUrl: "https://index.example/go/1",
  resolvedUrl: "https://video.example/watch/7",
  mediaKey: "Example:7",
  title: "A sample video",
  source: "video.example",
  status: "queued",
  progress: 0,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};
describe("clipboard intake", () => {
  it("ignores initial clipboard and repeated polling", () => {
    const c = new ClipboardTracker("https://example.com/1");
    expect(c.read("https://example.com/1", true)).toEqual([]);
    expect(c.read("https://example.com/2", true)).toEqual([
      "https://example.com/2",
    ]);
    expect(c.read("https://example.com/2", true)).toEqual([]);
  });
  it("does not collect content copied while disabled or private prose", () => {
    const c = new ClipboardTracker("");
    c.read("https://example.com/1", false);
    expect(c.read("https://example.com/1", true)).toEqual([]);
    expect(c.read("private note https://example.com/2", true)).toEqual([]);
  });
  it("never auto-captures private-network or one-time account links", () => {
    for (const url of [
      "http://192.168.1.1/admin",
      "http://localhost:3000/video",
      "http://nas/share/clip.mp4",
      "https://example.com/account/reset-password/abc123",
      "https://example.com/verify?token=abc",
      "https://example.com/auth/magic/xyz",
    ])
      expect(new ClipboardTracker("").read(url, true), url).toEqual([]);
    expect(isPrivateHost("172.20.0.5")).toBe(true);
    expect(isPrivateHost("172.32.0.5")).toBe(false);
    expect(isPrivateHost("[::1]")).toBe(true);
    expect(
      new ClipboardTracker("").read("https://example.com/watch?v=abc", true),
    ).toEqual(["https://example.com/watch?v=abc"]);
  });
  it("accepts URL batches but removes repeated entries", () =>
    expect(
      parseLinks(
        "https://example.com/1\nhttps://example.com/2\nhttps://example.com/1",
      ),
    ).toHaveLength(2));
  it("rejects executable schemes and credential-bearing URLs, preserves signed query data", () => {
    expect(normalizeUrl("file:///C:/Windows/test")).toBeNull();
    expect(normalizeUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizeUrl("https://example.com/?signature=x&a=2#player")).toBe(
      "https://example.com/?signature=x&a=2",
    );
  });
});
describe("download preferences", () => {
  it("keeps optional folders short when the download folder is long", () => {
    const settings = {
      ...defaultSettings("C:/" + "d".repeat(120)),
      grouping: "source" as const,
    };
    const { targetDir } = outputLocation(
      {
        id: "abcdefgh-1",
        originalUrl: "https://example.com/a",
        title: "t",
        source: "example.com",
        status: "queued",
        progress: 0,
        createdAt: 0,
        updatedAt: 0,
        groupName: "g".repeat(70),
        galleryFolder: "f".repeat(70),
      },
      settings,
    );
    expect(targetDir.length).toBeLessThan(215);
  });
  it("repairs bad or legacy stored settings one key at a time", () => {
    const defaults = defaultSettings("C:/Downloads");
    const repaired = sanitizeSettings(defaults, {
      ...defaults,
      quality: "4k" as any,
      downloadDir: "relative/folder",
      speedLimitKiB: 500,
      legacyFlag: true,
    } as any);
    expect(repaired.quality).toBe(defaults.quality);
    expect(repaired.downloadDir).toBe(defaults.downloadDir);
    expect(repaired.speedLimitKiB).toBe(500);
    expect("legacyFlag" in repaired).toBe(false);
  });
  it("defaults to auto capture and start, best quality, two workers, source grouping", () =>
    expect(defaultSettings(path.resolve("downloads"))).toMatchObject({
      clipboardWatch: true,
      autoDownload: true,
      quality: "best",
      concurrency: 2,
      grouping: "source",
      launchAtLogin: false,
    }));
  it("validates destination and templates before process launch", () => {
    const defaults = defaultSettings(path.resolve("downloads"));
    expect(() =>
      validateSettings(defaults, { downloadDir: "relative" }),
    ).toThrow();
    expect(() =>
      validateSettings(defaults, { filenameTemplate: "../{id}" }),
    ).toThrow();
    expect(() =>
      validateSettings(defaults, { filenameTemplate: "%(title)s" }),
    ).toThrow();
    expect(() => validateSettings(defaults, { concurrency: -1 })).toThrow();
    expect(validateSettings(defaults, { concurrency: 0 }).concurrency).toBe(0);
  });
  it("uses the final host and produces collision-safe Windows filenames", () => {
    const defaults = defaultSettings(path.resolve("downloads"));
    const a = outputLocation(job, defaults),
      b = outputLocation({ ...job, id: "87654321-abcd" }, defaults);
    expect(a.targetDir).toBe(path.join(defaults.downloadDir, "video.example"));
    expect(a.outputTemplate).not.toBe(b.outputTemplate);
    expect(safeSegment("CON")).toBe("_CON");
    expect(safeSegment("a:/b?. ")).toBe("a__b_");
  });
  it("retains percent characters as literal text rather than engine templates", () => {
    const location = outputLocation(
      { ...job, title: "100% fun %(url)s" },
      defaultSettings(path.resolve("downloads")),
    );
    expect(location.outputTemplate).toContain("100%% fun %%(url)s");
  });
  it("builds explicit bounded-quality formats without shell commands", () => {
    const args = downloadArgs({
      ...job,
      ...outputLocation(job, defaultSettings(path.resolve("downloads"))),
      qualityLimit: "1080",
    });
    expect(args[args.indexOf("--format") + 1]).toBe(
      "bv*[height<=?1080]+ba/b[height<=?1080]",
    );
    expect(args).toContain("--continue");
    expect(args).toContain("--no-overwrites");
  });
  it("keeps all selected gallery images under one parent output folder", () => {
    const gallery = {
      ...job,
      title: "A gallery",
      imageUrls: ["https://images.example/1.jpg"],
    };
    const location = outputLocation(
      gallery,
      defaultSettings(path.resolve("downloads")),
    );
    expect(location.targetDir).toContain("A gallery");
    expect(location.outputTemplate).toBe("%(id)s.%(ext)s");
    const args = downloadArgs({ ...gallery, ...location });
    expect(args[args.indexOf("--format") + 1]).toBe("b");
    expect(args[args.indexOf("--referer") + 1]).toBe(gallery.resolvedUrl);
  });
});
describe("metadata and recovery", () => {
  it("keeps generic pages that differ only by query string distinct", () => {
    const page = (v: string) =>
      metadataJob(
        {
          id: "watch",
          extractor_key: "Generic",
          title: "Clip",
          webpage_url: `https://site.example/watch.php?v=${v}`,
          formats: [{ format_id: "hd", height: 720, vcodec: "h264" }],
        },
        `https://site.example/watch.php?v=${v}`,
      ).mediaKey;
    expect(page("1")).not.toBe(page("2"));
    expect(page("1")).toBe(page("1"));
  });
  it("preserves the host video identity behind another source URL", () =>
    expect(
      metadataJob(
        {
          id: "7",
          extractor_key: "Example",
          webpage_url: "https://video.example/watch/7",
          title: "Sample",
          formats: [{ height: 720 }, { height: 1080 }],
        },
        job.originalUrl,
      ),
    ).toMatchObject({
      source: "video.example",
      mediaKey: "Example:7",
      quality: "1080p",
    }));
  it("does not confuse generic videos with equal IDs on unrelated hosts", () => {
    const a = metadataJob(
      {
        id: "sample",
        extractor_key: "Generic",
        url: "https://one.example/sample.mp4",
        webpage_url: "https://one.example/sample.mp4",
      },
      job.originalUrl,
    );
    const b = metadataJob(
      {
        id: "sample",
        extractor_key: "Generic",
        url: "https://two.example/sample.mp4",
        webpage_url: "https://two.example/sample.mp4",
      },
      job.originalUrl,
    );
    expect(a.mediaKey).not.toBe(b.mediaKey);
  });
  it("holds collections for selection and bounds their size", () => {
    const metadata = metadataJob(
      {
        _type: "playlist",
        entries: Array.from({ length: 105 }, (_, i) => ({
          id: i,
          title: "Sample",
          url: `https://example.com/${i}`,
        })),
      },
      job.originalUrl,
    );
    expect(metadata.status).toBe("collection");
    expect(metadata.entries).toHaveLength(100);
    expect(metadata.collectionLimited).toBe(true);
  });
  it("turns gallery-dl JSON into an account-named collection", () => {
    const post = "https://www.instagram.com/p/abc/";
    const image = "https://scontent.cdninstagram.com/v/a_n.jpg?stp=x&oh=1";
    const video = "https://scontent.cdninstagram.com/o1/v/b_n.mp4?efg=y";
    const file = { username: "someone", shortcode: "abc" };
    const result = galleryDlMetadata(
      JSON.stringify([
        [2, file],
        [3, image, { ...file, num: 1, extension: "jpg" }],
        [3, video, { ...file, num: 2, extension: "mp4" }],
      ]),
      post,
    );
    expect(result).toMatchObject({
      title: "someone abc",
      galleryFolder: "someone",
      mediaKey: `GalleryDL:${post}`,
      status: "collection",
      collectionKind: "images",
      entries: [
        { id: "0", title: "Image 1", url: image },
        { id: "1", title: "Video 2", url: video },
      ],
    });
    expect(galleryDlMetadata("[error] login required\n", post)).toBeUndefined();
    expect(galleryDlMetadata("[]", post)).toBeUndefined();
  });
  it("recognises Instagram profile links but not posts", () => {
    expect(instagramProfile("https://www.instagram.com/some.user_1/")).toBe(
      "some.user_1",
    );
    expect(instagramProfile("https://instagram.com/someone?igsh=x")).toBe(
      "someone",
    );
    expect(
      instagramProfile("https://www.instagram.com/p/abc/"),
    ).toBeUndefined();
    expect(
      instagramProfile("https://www.instagram.com/reels/"),
    ).toBeUndefined();
    expect(instagramProfile("https://example.com/someone/")).toBeUndefined();
  });
  it("recognises whole subreddit and user pages but not posts", () => {
    expect(redditFeed("https://www.reddit.com/r/aww/")).toBe("reddit_aww");
    expect(redditFeed("https://old.reddit.com/r/aww/top?t=all")).toBe(
      "reddit_aww",
    );
    expect(redditFeed("https://www.reddit.com/user/bob/submitted")).toBe(
      "reddit_u_bob",
    );
    expect(
      redditFeed("https://www.reddit.com/r/aww/comments/abc/title/"),
    ).toBeUndefined();
    expect(redditFeed("https://example.com/r/aww/")).toBeUndefined();
  });
  it("resumes interrupted work without overriding manual pauses", () => {
    expect(recoveryStatus("downloading", true)).toBe("queued");
    expect(recoveryStatus("processing", false)).toBe("review");
    expect(recoveryStatus("paused", true)).toBe("paused");
  });
  it.each([
    ["Unable to decrypt cookies with DPAPI", "Session unavailable"],
    ["Please log in to this site", "Session expired"],
    [
      "This content isn't available to everyone: It can't be seen by certain audiences.",
      "Session expired",
    ],
    ["No space left on device", "disk is full"],
    [
      "Error: spawn C:\\app\\resources\\ffprobe.exe ENOENT",
      "download tool is missing or blocked",
    ],
    [
      "ENOENT: no such file or directory, open 'D:\\Videos\\a.mkv'",
      "destination drive is unavailable",
    ],
    ["ENODEV: device not ready", "destination drive is unavailable"],
    ["Unsupported URL", "DriftFetch could not identify supported media"],
    ["Connection timed out", "Connection failed"],
    ["HTTP Error 403 Forbidden", "source refused access"],
    ["HTTP Error 429 Too Many Requests", "source is limiting requests"],
    ["CURRENT_TIMEOUT", "took too long"],
    ["This video has DRM", "DRM-protected"],
  ])("turns %s into an actionable message", (input, expected) =>
    expect(friendlyError(input)).toContain(expected),
  );
  it("never exposes raw signed URLs from stderr", () =>
    expect(
      friendlyError("unexpected at https://example.com/?token=SECRET"),
    ).not.toContain("SECRET"));
});

describe("gallery-dl hand-offs", () => {
  it("lists links a post hands to another site", () => {
    const out = JSON.stringify([
      [2, {}],
      [6, "https://www.redgifs.com/watch/abc", {}],
      [6, "https://www.redgifs.com/watch/abc", {}],
      [3, "https://i.redd.it/x.jpg", {}],
    ]);
    expect(galleryDlLinks(out)).toEqual(["https://www.redgifs.com/watch/abc"]);
    expect(galleryDlLinks("not json")).toEqual([]);
  });
});

describe("gallery-dl posts with one video", () => {
  it("calls an all-video post a video and uses the post title", () => {
    const out = JSON.stringify([
      [
        3,
        "ytdl:https://v.redd.it/x/DASHPlaylist.mpd",
        { extension: "mp4", title: "A post", author: "someone" },
      ],
    ]);
    const job = galleryDlMetadata(out, "https://www.reddit.com/comments/x");
    expect(job?.linkType).toBe("video page");
    expect(job?.title).toBe("A post");
    expect(job?.entries?.[0].title).toBe("Video 1");
  });
});
