import { expect, it, vi } from "vitest";
import { CollectionPreviews } from "../electron/previews";
import type { Job } from "../src/shared";

// Names in these tests do not exist; the resolver says they are public.
const publicHost = async () => ["93.184.216.34"];

const job = {
  id: "gallery",
  status: "collection",
  originalUrl: "https://example.invalid/gallery",
  entries: [
    {
      id: "1",
      title: "Landscape",
      url: "https://example.invalid/full.png",
      thumbnail: "https://example.invalid/thumb.png",
    },
  ],
} as Job;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH9sAAAAASUVORK5CYII=",
  "base64",
);
it("loads only a known collection entry thumbnail and caches its image data without credentials", async () => {
  const request = vi.fn(
    async () => new Response(png, { headers: { "content-type": "image/png" } }),
  );
  const previews = new CollectionPreviews(request, publicHost);
  expect(await previews.load(job, "1")).toBe(
    `data:image/png;base64,${png.toString("base64")}`,
  );
  await previews.load(job, "1");
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]).toMatchObject([
    "https://example.invalid/thumb.png",
    { headers: { Referer: job.originalUrl } },
  ]);
  expect(JSON.stringify(request.mock.calls)).not.toContain("Cookie");
  expect(await previews.load(job, "missing")).toBeNull();
  expect(
    await previews.load({ ...job, status: "downloading" }, "1"),
  ).toBeNull();
  expect(request).toHaveBeenCalledOnce();
});
it.each(["image/svg+xml", "text/html", "video/mp4"])(
  "rejects non-raster preview content: %s",
  async (type) => {
    const previews = new CollectionPreviews(
      async () =>
        new Response("not an image", { headers: { "content-type": type } }),
      publicHost,
    );
    expect(await previews.load(job, "1")).toBeNull();
  },
);
it("rejects oversize and chunked oversize previews and does not fetch video originals", async () => {
  const request = vi.fn(
    async () =>
      new Response(png, {
        headers: { "content-type": "image/png", "content-length": "5000000" },
      }),
  );
  expect(
    await new CollectionPreviews(request, publicHost).load(job, "1"),
  ).toBeNull();
  const large = new CollectionPreviews(
    async () =>
      new Response(new Uint8Array(4 * 1024 * 1024 + 1), {
        headers: { "content-type": "image/png" },
      }),
    publicHost,
  );
  expect(await large.load(job, "1")).toBeNull();
  expect(
    await new CollectionPreviews(request, publicHost).load(
      {
        ...job,
        entries: [
          { id: "1", title: "Video", url: "https://example.invalid/video.mp4" },
        ],
      },
      "1",
    ),
  ).toBeNull();
  expect(request).toHaveBeenCalledOnce();
});
it("cancels in-flight previews when the collection closes", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const previews = new CollectionPreviews(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("Aborted")),
          { once: true },
        );
        started();
      }),
    publicHost,
  );
  const loading = previews.load(job, "1");
  await ready;
  previews.cancel(job.id);
  expect(await loading).toBeNull();
});
it("loads a list thumbnail from the job's own address, in any state, and skips private hosts", async () => {
  const request = vi.fn(
    async () => new Response(png, { headers: { "content-type": "image/png" } }),
  );
  const previews = new CollectionPreviews(request, publicHost);
  const video = {
    id: "video",
    status: "downloading",
    originalUrl: "https://example.invalid/watch",
    thumbnailUrl: "https://example.invalid/poster.png",
  } as Job;
  expect(await previews.thumbnail(video)).toBe(
    `data:image/png;base64,${png.toString("base64")}`,
  );
  expect(request.mock.calls[0]).toMatchObject([
    "https://example.invalid/poster.png",
    { headers: { Referer: video.originalUrl } },
  ]);
  expect(
    await previews.thumbnail({
      ...video,
      thumbnailUrl: "http://127.0.0.1/x.png",
    }),
  ).toBeNull();
  expect(
    await previews.thumbnail({ ...video, thumbnailUrl: undefined }),
  ).toBeNull();
  expect(await previews.thumbnail(undefined)).toBeNull();
});
it("follows image redirects by hand and refuses one into the local network", async () => {
  const hop = (location: string) =>
    new Response(null, { status: 302, headers: { location } });
  const ok = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
    String(url).includes("cdn")
      ? new Response(png, { headers: { "content-type": "image/png" } })
      : hop("https://cdn.example.invalid/real.png"),
  );
  expect(
    await new CollectionPreviews(ok, publicHost).thumbnail({
      id: "a",
      status: "review",
      originalUrl: "https://example.invalid/p",
      thumbnailUrl: "https://example.invalid/short",
    } as Job),
  ).toBe(`data:image/png;base64,${png.toString("base64")}`);
  expect(ok.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  const toLan = vi.fn(async () => hop("http://192.168.1.1/admin.png"));
  expect(
    await new CollectionPreviews(toLan, publicHost).thumbnail({
      id: "b",
      status: "review",
      originalUrl: "https://example.invalid/p",
      thumbnailUrl: "https://example.invalid/short",
    } as Job),
  ).toBeNull();
  expect(toLan).toHaveBeenCalledOnce();
});
it("refuses a host name that resolves into the local network", async () => {
  const request = vi.fn(async () => new Response(png));
  const previews = new CollectionPreviews(request, async (host) =>
    host === "rebind.example.invalid" ? ["192.168.0.5"] : ["93.184.216.34"],
  );
  const base = {
    id: "c",
    status: "review",
    originalUrl: "https://example.invalid/p",
  } as Job;
  expect(
    await previews.thumbnail({
      ...base,
      thumbnailUrl: "https://rebind.example.invalid/a.png",
    }),
  ).toBeNull();
  const unresolved = new CollectionPreviews(request, async () => {
    throw new Error("ENOTFOUND");
  });
  expect(
    await unresolved.thumbnail({
      ...base,
      thumbnailUrl: "https://nowhere.example.invalid/a.png",
    }),
  ).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
