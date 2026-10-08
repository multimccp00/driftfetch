import dns from "node:dns/promises";
import type { Job } from "../src/shared";
import { isPrivateHost, normalizeUrl } from "./core";

/** Every address a host name points at. */
const lookupAll = async (host: string) =>
  (await dns.lookup(host, { all: true })).map((entry) => entry.address);

/** Transient, bounded previews; no files, credentials or arbitrary renderer URLs. */
export class CollectionPreviews {
  private active = new Map<AbortController, string>();
  private cache = new Map<string, string>();
  private cacheBytes = 0;
  constructor(
    private request: typeof fetch = fetch,
    private resolve: (host: string) => Promise<string[]> = lookupAll,
  ) {}
  /** A host that is, or resolves to, the local network (or cannot be resolved at all). */
  private async local(host: string) {
    if (isPrivateHost(host)) return true;
    if (/^[\d.]+$/.test(host) || host.includes(":")) return false;
    try {
      return (await this.resolve(host)).some(isPrivateHost);
    } catch {
      return true;
    }
  }

  cancel(jobId: string) {
    for (const [controller, id] of this.active)
      if (id === jobId) controller.abort();
  }
  async load(job: Job | undefined, entryId: string): Promise<string | null> {
    if (!job || job.status !== "collection") return null;
    const entry = job.entries?.find((entry) => entry.id === entryId);
    if (!entry) return null;
    const url = normalizeUrl(entry.thumbnail || entry.url);
    // Thumbnail URLs come from remote metadata: no blind requests into the LAN.
    if (
      !url ||
      isPrivateHost(new URL(url).hostname) ||
      (!entry.thumbnail && !/\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(url))
    )
      return null;
    return this.fetchImage(job, url, false);
  }
  /** The thumbnail shown in the download list: the job's own, or its first item's. */
  async thumbnail(job: Job | undefined): Promise<string | null> {
    if (!job) return null;
    const url = normalizeUrl(
      job.thumbnailUrl ||
        job.entries?.find((e) => e.thumbnail)?.thumbnail ||
        "",
    );
    if (!url || isPrivateHost(new URL(url).hostname)) return null;
    return this.fetchImage(job, url, true);
  }
  private async fetchImage(
    job: Job,
    url: string,
    wait: boolean,
  ): Promise<string | null> {
    const key = `${job.id}:${url}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    // List thumbnails queue for a slot; collection previews give up instead.
    for (let i = 0; wait && this.active.size >= 4 && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (this.active.size >= 4) return null;
    const controller = new AbortController();
    this.active.set(controller, job.id);
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      // Redirects are followed by hand, so none can lead into the local network.
      let response: Response | undefined;
      for (let hop = 0, next: string | null = url; next; hop++) {
        if (hop > 3) return null;
        // Names are looked up first, so a host that points into the LAN is refused too.
        if (await this.local(new URL(next).hostname)) return null;
        response = await this.request(next, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            Accept: "image/png,image/jpeg,image/webp,image/gif,image/avif",
            Referer: job.resolvedUrl || job.originalUrl,
          },
        });
        const where: string | null =
          response.status >= 300 && response.status < 400
            ? response.headers.get("location")
            : null;
        if (!where) break;
        await response.body?.cancel().catch(() => {});
        next = normalizeUrl(new URL(where, next).href);
        if (!next || isPrivateHost(new URL(next).hostname)) return null;
      }
      if (!response) return null;
      reader = response.body?.getReader();
      const type = response.headers
        .get("content-type")
        ?.split(";")[0]
        .toLowerCase();
      const limit = 4 * 1024 * 1024;
      if (
        !response.ok ||
        !reader ||
        !type ||
        !/^image\/(png|jpeg|webp|gif|avif)$/.test(type) ||
        Number(response.headers.get("content-length")) > limit
      )
        return null;
      let bytes = 0;
      const chunks: Buffer[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) return null;
        chunks.push(Buffer.from(value));
      }
      if (!bytes || controller.signal.aborted) return null;
      const data = `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
      while (
        this.cache.size &&
        (this.cacheBytes + data.length > 24 * 1024 * 1024 ||
          this.cache.size >= 200)
      ) {
        const first = this.cache.keys().next().value!;
        this.cacheBytes -= this.cache.get(first)!.length;
        this.cache.delete(first);
      }
      this.cache.set(key, data);
      this.cacheBytes += data.length;
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      await reader?.cancel().catch(() => {});
      controller.abort();
      this.active.delete(controller);
    }
  }
}
