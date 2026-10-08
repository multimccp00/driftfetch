import { expect, it } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { Engine } from "../electron/engine";
import { reportedDownloadFile } from "../electron/download-files";
import type { Job } from "../src/shared";

const engineDirectory = path.resolve(
  process.env.CURRENT_TEST_ENGINE_DIR || "resources/engines",
);

// Use the real bundled engine: mocked queue workers cannot catch filename
// collisions or missing output events from an external download process.
it
  .skipIf(
    process.platform !== "win32" ||
      !existsSync(path.join(engineDirectory, "gallery-dl.exe")),
  )
  .each(["normal", "long", "unicode", "unicode-gallery-engine"])(
  "saves every direct image separately and reports existing files on retry with %s Windows paths",
  async (pathLength) => {
    await fs.mkdir("test-results", { recursive: true });
    const root = await fs.mkdtemp(path.resolve("test-results/image-transfer-"));
    const destination =
      pathLength === "long"
        ? path.join(root, "Long sample folder ".repeat(9).trim())
        : pathLength.startsWith("unicode")
          ? path.join(root, "Image samples · café — 日本語")
          : root;
    await fs.mkdir(destination, { recursive: true });
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH9sAAAAASUVORK5CYII=",
      "base64",
    );
    let expectedReferer = "";
    const server = http.createServer((req, res) => {
      if (
        req.headers.referer !== expectedReferer ||
        req.headers.cookie !== "fixture=allowed"
      ) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": image.length,
      });
      res.end(req.method === "HEAD" ? undefined : image);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    expectedReferer = base + "/gallery";
    const cookies = path.join(root, "cookies.txt");
    await fs.writeFile(
      cookies,
      "# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tfixture\tallowed\n",
    );
    const job = {
      id: "fixture-gallery",
      originalUrl: base + "/gallery",
      title: "Two images",
      mediaKey: "ImageSearch:fixture:two",
      collectionKind: "images",
      imageUrls: [base + "/a/same.png", base + "/b/same.png"],
      targetDir: destination,
    } as Job;
    if (pathLength === "unicode-gallery-engine") {
      job.mediaKey = "GalleryDL:fixture";
      job.resolvedUrl = base + "/a/same.png";
      job.imageUrls = undefined;
    }
    const engine = new Engine(engineDirectory, engineDirectory, () => {});
    let worker: ReturnType<Engine["download"]> | undefined;
    try {
      const saved: string[] = [];
      const auth = [
        "--cookies",
        cookies,
        "--option",
        `downloader.http.headers.Referer=${expectedReferer}`,
      ];
      worker = engine.download(job, auth, (line) => {
        if (line.startsWith("CURRENT_FILE:"))
          saved.push(JSON.parse(line.slice(13)));
      });
      const result = await worker.done;
      expect(result.code, result.stderr).toBe(0);
      expect(new Set(saved).size, result.stdout + result.stderr).toBe(
        pathLength === "unicode-gallery-engine" ? 1 : 2,
      );
      for (const file of saved) {
        expect(await fs.readFile(file)).toEqual(image);
        expect(reportedDownloadFile(file, destination)).toBeDefined();
        if (pathLength === "long") expect(file.length).toBeGreaterThan(260);
      }
      const retried: string[] = [];
      worker = engine.download(job, auth, (line) => {
        if (line.startsWith("CURRENT_FILE:"))
          retried.push(JSON.parse(line.slice(13)));
      });
      const retry = await worker.done;
      expect(retry.code, retry.stderr).toBe(0);
      expect(new Set(retried)).toEqual(new Set(saved));
      for (const file of retried)
        expect(reportedDownloadFile(file, destination)).toBeDefined();
      const denied: string[] = [];
      worker = engine.download(
        {
          ...job,
          mediaKey: "fixture:denied",
          imageUrls: [base + "/restricted.png"],
        },
        [],
        (line) => {
          if (line.startsWith("CURRENT_FILE:")) denied.push(line);
        },
      );
      const blocked = await worker.done;
      expect(blocked.code).not.toBe(0);
      expect(blocked.stderr).toContain("403");
      expect(denied).toEqual([]);
      expect(
        (await fs.readdir(destination)).some((file) =>
          file.startsWith(".current-gallery-"),
        ),
      ).toBe(false);
    } finally {
      await worker?.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  30_000,
);
