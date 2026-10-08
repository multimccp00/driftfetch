import { expect, it } from "vitest";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { encryptBackup, decryptBackup } from "../electron/backup";
import { defaultSettings } from "../electron/core";
import { qualityWarning } from "../shared/quality";
import type { Job } from "../src/shared";
import { Store } from "../electron/store";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const settings = defaultSettings("C:/Downloads");
const job = {
  id: "test-id",
  originalUrl: "https://example.com/video?token=private",
  title: "Private title",
  source: "example.com",
  mediaKey: "example:1",
  status: "completed",
  progress: 100,
  quality: "360p",
  availableHeight: 1080,
  createdAt: 100,
  updatedAt: 100,
  filePath: "C:/Downloads/video.mp4",
} as Job;

it("flags measured mismatches, low-only sources, and unknown resolutions without inventing HD", () => {
  expect(qualityWarning(job, settings)).toContain("below the expected 1080p");
  expect(qualityWarning({ ...job, availableHeight: 360 }, settings)).toContain(
    "below your 720p",
  );
  expect(
    qualityWarning(
      { ...job, status: "review", availableHeight: undefined },
      settings,
    ),
  ).toContain("Resolution is unknown");
  expect(
    qualityWarning(
      {
        ...job,
        selectedFormatId: "low",
        formats: [{ id: "low", height: 360, ext: "mp4", separateAudio: false }],
      },
      settings,
    ),
  ).toBeUndefined();
  expect(
    qualityWarning(
      {
        ...job,
        status: "review",
        availableHeight: 360,
        formats: [
          { id: "360p", height: 360, ext: "mp4", separateAudio: false },
          { id: "High_Quality", ext: "mp4", separateAudio: false },
        ],
      },
      settings,
    ),
  ).toContain("Resolution is unknown");
  expect(
    qualityWarning(
      {
        ...job,
        status: "collection",
        collectionKind: "images",
        linkType: "image gallery",
        mediaKey: "ImageSearch:images.example:long_hair",
        quality: undefined,
        availableHeight: undefined,
      },
      settings,
    ),
  ).toBeUndefined();
});
it("encrypts portable backups and restores work paused without executable settings or sessions", async () => {
  const encrypted = await encryptBackup(
    settings,
    [
      job,
      { ...job, id: "pending", status: "downloading", mediaKey: "example:2" },
    ],
    "correct horse battery",
  );
  expect(encrypted.includes(Buffer.from("Private title"))).toBe(false);
  const decoded = await decryptBackup(
    encrypted,
    "correct horse battery",
    "C:/Downloads",
  );
  expect(decoded.jobs[0].mediaKey).toBe("example:1");
  expect(decoded.jobs[1].status).toBe("paused");
  expect(decoded.jobs[1].mediaKey).toBeUndefined();
  expect(decoded.jobs[1].filePath).toBeUndefined();
  expect(decoded.settings.autoDownload).toBe(false);
  expect(decoded.settings.launchAtLogin).toBe(false);
  await expect(
    decryptBackup(encrypted, "incorrect password", "C:/Downloads"),
  ).rejects.toThrow("incorrect");
  const damaged = Buffer.from(encrypted);
  damaged[damaged.length - 1] ^= 1;
  await expect(
    decryptBackup(damaged, "correct horse battery", "C:/Downloads"),
  ).rejects.toThrow("damaged");
});
it("rejects malformed authenticated backup entries before they reach the database", async () => {
  const duplicate = await encryptBackup(
    settings,
    [job, job],
    "correct horse battery",
  );
  await expect(
    decryptBackup(duplicate, "correct horse battery", "C:/Downloads"),
  ).rejects.toThrow("Invalid download");
  const invalid = await encryptBackup(
    settings,
    [{ ...job, originalUrl: "file:///secret" }],
    "correct horse battery",
  );
  await expect(
    decryptBackup(invalid, "correct horse battery", "C:/Downloads"),
  ).rejects.toThrow("Invalid download");
});
it("preserves a corrupt database and starts with a clean local store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "current-corrupt-"));
  const file = path.join(dir, "current.sqlite");
  fs.writeFileSync(file, "not a sqlite database");
  const store = new Store(file);
  expect(store.recoveredDatabase).toBeTruthy();
  expect(fs.existsSync(store.recoveredDatabase!)).toBe(true);
  expect(store.jobs()).toEqual([]);
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
it("still restores a version 1 backup and writes version 2 with a stronger key derivation", async () => {
  const password = "correct horse battery";
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(password, salt, 32),
    iv,
  );
  const plain = Buffer.from(
    JSON.stringify({ version: 1, createdAt: 1, settings, jobs: [job] }),
  );
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const v1 = Buffer.concat([
    Buffer.from("CURRENT-BACKUP-1" + String.fromCharCode(10)),
    salt,
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
  const restored = await decryptBackup(v1, password, "C:/Downloads");
  expect(restored.jobs[0].id).toBe(job.id);
  const v2 = await encryptBackup(settings, [job], password);
  expect(v2.subarray(0, 16).toString()).toBe("CURRENT-BACKUP-2");
  expect(v2[17]).toBe(17);
  expect((await decryptBackup(v2, password, "C:/Downloads")).jobs).toHaveLength(
    1,
  );
  const tampered = Buffer.from(v2);
  tampered[17] = 30;
  await expect(
    decryptBackup(tampered, password, "C:/Downloads"),
  ).rejects.toThrow("not a supported");
});
it("keeps backups small by dropping fields restore never reads", async () => {
  const bulky = {
    ...job,
    formats: Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      ext: "mp4",
      height: 360,
      separateAudio: false,
    })),
    entries: Array.from({ length: 5000 }, (_, i) => ({
      id: String(i),
      title: "x".repeat(50),
      url: `https://example.invalid/${i}`,
    })),
  };
  const plain = await encryptBackup(settings, [job], "correct horse battery");
  const big = await encryptBackup(settings, [bulky], "correct horse battery");
  expect(big.length).toBe(plain.length);
});
it("runs schema migrations once and records the version", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "current-migrate-"));
  const file = path.join(dir, "old.sqlite");
  const old = new DatabaseSync(file);
  old.exec(
    "CREATE TABLE jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=1;",
  );
  old
    .prepare("INSERT INTO jobs VALUES (?,?)")
    .run("a", JSON.stringify({ id: "a", createdAt: 42 }));
  old.close();
  const store = new Store(file);
  expect(store.jobs()[0].queueOrder).toBe(42);
  expect(
    (store.db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
  ).toBe(2);
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
