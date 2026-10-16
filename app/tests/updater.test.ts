import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as openpgp from "openpgp";
import { Engine, needsBundledEngine } from "../electron/engine";
import type { SigningKey } from "../electron/signature";
const paths: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const p of paths.splice(0))
    fs.rmSync(p, { recursive: true, force: true });
});

// Test keys: one the engine trusts, one an attacker would use.
async function makeKey() {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "Test signer" }],
    format: "object",
  });
  const publicKey = privateKey.toPublic();
  return {
    privateKey,
    trusted: {
      armored: publicKey.armor(),
      fingerprint: publicKey.getFingerprint(),
    } as SigningKey,
  };
}
let trustedKey: Awaited<ReturnType<typeof makeKey>>;
let otherKey: Awaited<ReturnType<typeof makeKey>>;
beforeAll(async () => {
  trustedKey = await makeKey();
  otherKey = await makeKey();
}, 30000);

async function sign(text: string, key: Awaited<ReturnType<typeof makeKey>>) {
  return (await openpgp.sign({
    message: await openpgp.createMessage({ text }),
    signingKeys: key.privateKey,
    detached: true,
    format: "binary",
  })) as Uint8Array;
}

function engine() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "driftfetch-update-"));
  paths.push(p);
  const e = new Engine(p, p, () => {});
  e.signingKey = trustedKey.trusted;
  fs.writeFileSync(e.executable, "existing version");
  return e;
}
async function release(
  binary: Buffer,
  checksum: string,
  options: {
    signedBy?: "trusted" | "other";
    omitSignature?: boolean;
    alterListAfterSigning?: boolean;
  } = {},
) {
  const list = checksum + "  yt-dlp.exe" + String.fromCharCode(10);
  const signature = await sign(
    list,
    options.signedBy === "other" ? otherKey : trustedKey,
  );
  const served = options.alterListAfterSigning
    ? list.replace(checksum, "f".repeat(64))
    : list;
  const base = "https://github.com/yt-dlp/yt-dlp/releases/download/test/";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api.github.com/"))
        return Response.json({
          assets: [
            { name: "yt-dlp.exe", browser_download_url: base + "yt-dlp.exe" },
            {
              name: "SHA2-256SUMS",
              browser_download_url: base + "SHA2-256SUMS",
            },
            ...(options.omitSignature
              ? []
              : [
                  {
                    name: "SHA2-256SUMS.sig",
                    browser_download_url: base + "SHA2-256SUMS.sig",
                  },
                ]),
          ],
        });
      if (url.endsWith("SHA2-256SUMS.sig"))
        return new Response(new Uint8Array(signature));
      return url.endsWith("SHA2-256SUMS")
        ? new Response(served)
        : new Response(new Uint8Array(binary));
    }),
  );
}
describe("engine updates", () => {
  it("rejects a checksum mismatch without replacing the current binary", async () => {
    const e = engine();
    await release(Buffer.from("new version"), "0".repeat(64));
    await expect(e.update()).rejects.toThrow("Checksum verification failed");
    expect(fs.readFileSync(e.executable, "utf8")).toBe("existing version");
    expect(e.info.busy).toBe(false);
  });
  it("rejects a checksum list signed by an untrusted key", async () => {
    const e = engine();
    const binary = Buffer.from("malicious build");
    await release(binary, createHash("sha256").update(binary).digest("hex"), {
      signedBy: "other",
    });
    await expect(e.update()).rejects.toThrow("Signature verification failed");
    expect(fs.readFileSync(e.executable, "utf8")).toBe("existing version");
  });
  it("rejects a checksum list changed after it was signed", async () => {
    const e = engine();
    const binary = Buffer.from("malicious build");
    await release(binary, createHash("sha256").update(binary).digest("hex"), {
      alterListAfterSigning: true,
    });
    await expect(e.update()).rejects.toThrow("Signature verification failed");
    expect(fs.readFileSync(e.executable, "utf8")).toBe("existing version");
  });
  it("refuses a release that ships no signature", async () => {
    const e = engine();
    const binary = Buffer.from("unsigned build");
    await release(binary, createHash("sha256").update(binary).digest("hex"), {
      omitSignature: true,
    });
    await expect(e.update()).rejects.toThrow("missing verification files");
    expect(fs.readFileSync(e.executable, "utf8")).toBe("existing version");
  });
  it("retains the installed engine when the network fails", async () => {
    const e = engine();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(e.update()).rejects.toThrow("offline");
    expect(fs.readFileSync(e.executable, "utf8")).toBe("existing version");
  });
  it("downloads nothing when the installed yt-dlp is already the latest", async () => {
    // Startup checks run every launch: they must not re-download or overwrite the rollback copy.
    const e = engine();
    e.info.available = true;
    e.info.version = "2026.08.19";
    const fetchMock = vi.fn(async () =>
      Response.json({ tag_name: "2026.08.19", assets: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await e.update();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(e.info.message).toBe("Engines are up to date.");
    expect(fs.existsSync(e.executable + ".previous")).toBe(false);
  });
  it.runIf(
    process.platform === "win32" &&
      fs.existsSync("resources/engines/yt-dlp.exe"),
  )(
    "verifies a real executable and retains a rollback copy",
    async () => {
      const e = engine();
      const binary = fs.readFileSync("resources/engines/yt-dlp.exe");
      fs.writeFileSync(e.executable, binary);
      await release(binary, createHash("sha256").update(binary).digest("hex"));
      await e.update();
      expect(e.info.available).toBe(true);
      expect(e.info.canRollback).toBe(true);
      expect(fs.readFileSync(e.executable + ".previous").equals(binary)).toBe(
        true,
      );
      await e.rollback();
      expect(e.info.available).toBe(true);
      expect(fs.readFileSync(e.executable).equals(binary)).toBe(true);
    },
    30000,
  );
});

describe("bundled engine refresh", () => {
  it("compares yt-dlp versions numerically", () => {
    expect(needsBundledEngine(undefined, "2026.08.19")).toBe(true);
    expect(needsBundledEngine("2026.03.01", "2026.08.19")).toBe(true);
    expect(needsBundledEngine("2026.08.19", "2026.08.19")).toBe(false);
    expect(needsBundledEngine("2026.09.01", "2026.08.19")).toBe(false);
    expect(needsBundledEngine("2026.08.19.232851", "2026.08.19")).toBe(false);
    expect(needsBundledEngine("2026.08.19", undefined)).toBe(false);
  });
  it("replaces an older installed yt-dlp and removes stale copies of the other tools", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "driftfetch-init-"));
    paths.push(dir);
    const installed = path.join(dir, "engines"),
      bundled = path.join(dir, "bundled");
    fs.mkdirSync(installed);
    fs.mkdirSync(bundled);
    fs.writeFileSync(path.join(bundled, "yt-dlp.exe"), "new binary");
    fs.writeFileSync(
      path.join(bundled, "manifest.json"),
      JSON.stringify({ "yt-dlp.exe": { version: "2026.08.19" } }),
    );
    // Not a runnable binary, so its version is unknown and it counts as stale.
    fs.writeFileSync(path.join(installed, "yt-dlp.exe"), "old binary");
    fs.writeFileSync(path.join(installed, "ffmpeg.exe"), "stale");
    fs.writeFileSync(path.join(installed, "deno.exe"), "stale");
    const e = new Engine(installed, bundled, () => {});
    await e.init();
    expect(fs.readFileSync(e.executable, "utf8")).toBe("new binary");
    expect(fs.readFileSync(e.executable + ".previous", "utf8")).toBe(
      "old binary",
    );
    expect(fs.existsSync(path.join(installed, "ffmpeg.exe"))).toBe(false);
    expect(fs.existsSync(path.join(installed, "deno.exe"))).toBe(false);
  });
});

describe("gallery-dl updater", () => {
  const base = "https://codeberg.org/mikf/gallery-dl/releases/download/v9.9.9/";
  async function galleryEngine(bundledBinary: Buffer | string) {
    const e = engine();
    e.galleryKey = trustedKey.trusted;
    fs.writeFileSync(path.join(e.directory, "gallery-dl.exe"), bundledBinary);
    return e;
  }
  async function galleryRelease(
    binary: Buffer,
    options: { signedBy?: "trusted" | "other"; host?: string } = {},
  ) {
    const list =
      createHash("sha256").update(binary).digest("hex") +
      "  gallery-dl.exe" +
      String.fromCharCode(10);
    const signature = await sign(
      list,
      options.signedBy === "other" ? otherKey : trustedKey,
    );
    const at = options.host ?? base;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/v1/repos/mikf/gallery-dl/releases/latest"))
          return Response.json({
            tag_name: "v9.9.9",
            assets: ["gallery-dl.exe", "SHA256SUMS", "SHA256SUMS.sig"].map(
              (name) => ({ name, browser_download_url: at + name }),
            ),
          });
        if (url.endsWith("gallery-dl.exe")) return new Response(new Uint8Array(binary));
        if (url.endsWith("SHA256SUMS")) return new Response(list);
        if (url.endsWith("SHA256SUMS.sig")) return new Response(new Uint8Array(signature));
        return new Response("", { status: 404 });
      }),
    );
  }
  it("pins gallery-dl's maintainer key", async () => {
    const { galleryDlKeyFingerprint, galleryDlPublicKey } =
      await import("../electron/gallery-dl-public-key");
    const key = await openpgp.readKey({ armoredKey: galleryDlPublicKey });
    expect(key.getFingerprint()).toBe(galleryDlKeyFingerprint);
    expect(galleryDlKeyFingerprint).toBe(
      "3e09f5908333dd83dbdce7375680ca389d365a88",
    );
  });
  it("rejects a gallery-dl release signed by another key", async () => {
    const e = await galleryEngine("bundled build");
    await galleryRelease(Buffer.from("malicious build"), { signedBy: "other" });
    await expect((e as any).updateGalleryDl()).rejects.toThrow(
      "Signature verification failed",
    );
    expect(
      fs.readFileSync(path.join(e.directory, "gallery-dl.exe"), "utf8"),
    ).toBe("bundled build");
  });
  it("refuses a gallery-dl download from an unexpected host", async () => {
    const e = await galleryEngine("bundled build");
    await galleryRelease(Buffer.from("build"), {
      host: "https://example.invalid/",
    });
    await expect((e as any).updateGalleryDl()).rejects.toThrow(
      "Unexpected update source",
    );
  });
  it("skips the update when no gallery-dl is installed", async () => {
    const e = engine();
    e.galleryKey = trustedKey.trusted;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await (e as any).updateGalleryDl();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.runIf(
    process.platform === "win32" &&
      fs.existsSync("resources/engines/gallery-dl.exe"),
  )(
    "installs a verified gallery-dl and keeps the previous one for rollback",
    async () => {
      const real = fs.readFileSync("resources/engines/gallery-dl.exe");
      // Engine(dir, dir): the "bundled" copy and the updated copy share a folder here,
      // so the bundled one is a real binary placed under the updated name.
      const e = await galleryEngine(real);
      await galleryRelease(real);
      await (e as any).updateGalleryDl();
      const updated = path.join(e.directory, "gallery-dl.exe");
      expect(fs.readFileSync(updated).equals(real)).toBe(true);
      expect(fs.existsSync(updated + ".previous")).toBe(true);
    },
    60000,
  );
});
