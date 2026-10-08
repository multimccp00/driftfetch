import { describe, it, expect } from "vitest";
import { preferredLabelFormat, savedFileQuality } from "../shared/quality";
import {
  downloadArgs,
  metadataJob,
  Engine,
  probeArgs,
} from "../electron/engine";
import type { Job } from "../src/shared";
const formats = [
  { format_id: "High_Quality", ext: "mp4", protocol: "https", quality: 1 },
  { format_id: "Low_Quality", ext: "mp4", protocol: "https", quality: 1 },
];
describe("quality selection with missing dimensions", () => {
  it("uses a requested video format with audio merging and never stores media URLs in its format list", () => {
    const metadata = metadataJob(
      {
        id: "one",
        formats: [
          {
            format_id: "137",
            height: 1080,
            vcodec: "h264",
            acodec: "none",
            ext: "mp4",
            url: "https://example.com/secret?token=PRIVATE",
          },
        ],
      },
      "https://example.com/video",
    );
    expect(JSON.stringify(metadata.formats)).not.toContain("PRIVATE");
    const args = downloadArgs({
      ...metadata,
      selectedFormatId: "137",
      qualityLimit: "720",
      targetDir: "C:\\Downloads",
      outputTemplate: "file.%(ext)s",
    } as Job);
    expect(args[args.indexOf("--format") + 1]).toBe("137+ba");
  });
  it("chooses the high label rather than the lexicographically last low label", () => {
    const metadata = metadataJob(
      { id: "fixture", formats },
      "https://example.com/video",
    );
    expect(metadata.preferredFormatId).toBe("High_Quality");
    expect(metadata.quality).toBe("Unknown");
    const args = downloadArgs({
      ...metadata,
      qualityLimit: "best",
      targetDir: "C:\\Downloads",
      outputTemplate: "fixture.%(ext)s",
    } as Job);
    expect(args[args.indexOf("--format") + 1]).toBe("High_Quality");
  });
  it("keeps normal selection when actual resolution or bitrate is supplied", () => {
    expect(
      preferredLabelFormat(
        formats.map((f, i) => ({ ...f, height: i ? 1080 : 360 })),
      ),
    ).toBeUndefined();
    expect(
      preferredLabelFormat(
        formats.map((f, i) => ({ ...f, tbr: i ? 5000 : 1000 })),
      ),
    ).toBeUndefined();
  });
  it("does not override differing numeric priorities or formats with separate audio", () => {
    expect(
      preferredLabelFormat(formats.map((f, i) => ({ ...f, quality: i }))),
    ).toBeUndefined();
    expect(
      preferredLabelFormat(formats.map((f) => ({ ...f, acodec: "none" }))),
    ).toBeUndefined();
  });
  it("leaves unrecognised or unsafe labels to the engine", () => {
    expect(
      preferredLabelFormat([...formats, { ...formats[0], format_id: "other" }]),
    ).toBeUndefined();
    expect(
      preferredLabelFormat([
        { ...formats[0], format_id: "High_Quality/best" },
        formats[1],
      ]),
    ).toBeUndefined();
  });
  it("retains resolution-cap selectors when the user sets a cap", () => {
    const args = downloadArgs({
      preferredFormatId: "High_Quality",
      qualityLimit: "720",
      targetDir: "C:\\Downloads",
      outputTemplate: "fixture.%(ext)s",
    } as Job);
    expect(args[args.indexOf("--format") + 1]).toBe(
      "High_Quality[height<=?720]/bv*[height<=?720]+ba/b[height<=?720]",
    );
  });
  it("adds the bundled Deno runtime only when verified available", () => {
    const engine = new Engine(
      "C:\\DriftFetch engines",
      "C:\\Bundled",
      () => {},
    );
    engine.info.jsRuntimeAvailable = true;
    expect(engine.commonArgs()).toContain("--js-runtimes");
    expect(engine.commonArgs()).toContain("deno:C:\\Bundled\\deno.exe");
    engine.info.jsRuntimeAvailable = false;
    expect(engine.commonArgs()).not.toContain("--js-runtimes");
  });
  it("impersonates a browser on generic pages behind Cloudflare", () => {
    const args = new Engine("C:\\E", "C:\\B", () => {}).commonArgs();
    expect(args[args.indexOf("--extractor-args") + 1]).toBe(
      "generic:impersonate",
    );
    expect(args[args.indexOf("--plugin-dirs") + 1]).toMatch(/yt-dlp-plugins$/);
  });
  it("queues media files for HTML5 entries that report their own page", () => {
    const page = "https://site.example/video/1/";
    const metadata = metadataJob(
      {
        _type: "playlist",
        webpage_url: page,
        entries: [
          {
            webpage_url: page,
            url: "https://site.example/get_file/1_720p.mp4",
          },
          {
            webpage_url: page,
            url: "https://site.example/get_file/1_preview.mp4",
          },
          { webpage_url: "https://site.example/video/2/" },
        ],
      },
      page,
    );
    expect(metadata.entries?.map((e) => !!e.mediaFile)).toEqual([
      true,
      true,
      false,
    ]);
    expect(metadata.entries?.map((e) => e.url)).toEqual([
      "https://site.example/get_file/1_720p.mp4",
      "https://site.example/get_file/1_preview.mp4",
      "https://site.example/video/2/",
    ]);
  });
  it("probes individual pages without flattening away their available formats", () => {
    const args = probeArgs(
      ["--ignore-config"],
      "https://example.invalid/video",
    );
    expect(args).not.toContain("--flat-playlist");
    expect(args).toContain("--dump-single-json");
  });
  it("asks for one item when an Instagram story link names it, not the whole reel", () => {
    const story = "https://www.instagram.com/stories/syrn/4000782211233694928";
    expect(probeArgs([], story)).toContain("--no-playlist");
    expect(
      probeArgs([], "https://www.instagram.com/stories/syrn/"),
    ).not.toContain("--no-playlist");
  });
  it("reports the saved resolution and ignores audio or attached artwork", () => {
    expect(
      savedFileQuality({
        streams: [
          { codec_type: "video", height: 360 },
          {
            codec_type: "video",
            height: 3000,
            disposition: { attached_pic: 1 },
          },
          { codec_type: "audio" },
        ],
      }),
    ).toBe("360p");
    expect(
      savedFileQuality({ streams: [{ codec_type: "video", height: 1080 }] }),
    ).toBe("1080p");
    expect(savedFileQuality({ streams: [] })).toBe("Unknown");
  });
});
