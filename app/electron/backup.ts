import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto";
import path from "node:path";
import type { Job, Settings } from "../src/shared";
import {
  defaultSettings,
  domainOf,
  normalizeUrl,
  validateSettings,
} from "./core";

// v1 used Node's scrypt defaults (N = 2^14) and no parameter byte.
// v2 stores log2(N) after the magic so the cost can rise without another format.
const magicV1 = Buffer.from("CURRENT-BACKUP-1\n");
const magic = Buffer.from("CURRENT-BACKUP-2\n");
const costExponent = 17,
  minExponent = 14,
  maxExponent = 18;
const kdf = (password: string, salt: Buffer, exponent: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 2 ** exponent, r: 8, p: 1, maxmem: 2 ** exponent * 128 * 8 * 2 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export const maxBackupBytes = 25 * 1024 * 1024;
function passwordCheck(password: string) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1024
  )
    throw new Error(
      "Use a backup password between 12 and 1,024 characters. Keep it somewhere safe; it cannot be recovered.",
    );
}
export async function encryptBackup(
  settings: Settings,
  jobs: Job[],
  password: string,
): Promise<Buffer> {
  passwordCheck(password);
  // Restore reads only these fields; skipping formats, entries and checks keeps big histories under the limit.
  const slim = jobs.map((job) => ({
    id: job.id,
    originalUrl: job.originalUrl,
    resolvedUrl: job.resolvedUrl,
    title: job.title,
    mediaKey: job.mediaKey,
    status: job.status,
    quality: job.quality,
    filePath: job.filePath,
    createdAt: job.createdAt,
  }));
  const plain = Buffer.from(
    JSON.stringify({
      version: 1,
      createdAt: Date.now(),
      settings,
      jobs: slim,
    }),
  );
  if (plain.length > maxBackupBytes)
    throw new Error("This backup exceeds the 25 MiB limit.");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const key = await kdf(password, salt, costExponent);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([
      magic,
      Buffer.from([costExponent]),
      salt,
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]);
  } finally {
    key.fill(0);
    plain.fill(0);
  }
}
export async function decryptBackup(
  bytes: Buffer,
  password: string,
  downloads: string,
): Promise<{ settings: Settings; jobs: Job[] }> {
  passwordCheck(password);
  const v2 = bytes.subarray(0, magic.length).equals(magic);
  if (
    bytes.length > maxBackupBytes + 100 ||
    bytes.length < magic.length + 45 ||
    (!v2 && !bytes.subarray(0, magicV1.length).equals(magicV1))
  )
    throw new Error("This is not a supported DriftFetch backup.");
  const exponent = v2 ? bytes[magic.length] : minExponent;
  if (!(exponent >= minExponent && exponent <= maxExponent))
    throw new Error("This is not a supported DriftFetch backup.");
  const offset = magic.length + (v2 ? 1 : 0);
  const key = await kdf(
    password,
    bytes.subarray(offset, offset + 16),
    exponent,
  );
  let data: any;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(offset + 16, offset + 28),
    );
    decipher.setAuthTag(bytes.subarray(offset + 28, offset + 44));
    const plain = Buffer.concat([
      decipher.update(bytes.subarray(offset + 44)),
      decipher.final(),
    ]);
    try {
      data = JSON.parse(plain.toString("utf8"));
    } finally {
      plain.fill(0);
    }
  } catch {
    throw new Error(
      "The backup password is incorrect, or the file is damaged.",
    );
  } finally {
    key.fill(0);
  }
  if (
    data?.version !== 1 ||
    !Array.isArray(data.jobs) ||
    data.jobs.length > 50000 ||
    !data.settings ||
    typeof data.settings !== "object" ||
    Array.isArray(data.settings)
  )
    throw new Error("Invalid backup contents.");
  const defaults = defaultSettings(downloads);
  const settings = validateSettings(defaults, data.settings);
  // Restored work never starts automatically; Windows launch preference stays local.
  settings.autoDownload = false;
  settings.launchAtLogin = false;
  const ids = new Set<string>();
  const text = (value: unknown, max = 4000): string | undefined =>
    typeof value === "string" && value.length <= max ? value : undefined;
  const jobs: Job[] = data.jobs.map((raw: any) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(raw.id) ||
      ids.has(raw.id) ||
      !normalizeUrl(raw.originalUrl)
    )
      throw new Error("Invalid download entry in backup.");
    ids.add(raw.id);
    const completed = raw.status === "completed";
    const file = text(raw.filePath);
    if (file && (!path.isAbsolute(file) || file.includes("\0")))
      throw new Error("Invalid saved file path in backup.");
    return {
      id: raw.id,
      originalUrl: normalizeUrl(raw.originalUrl)!,
      title: text(raw.title) || "Restored video",
      source: domainOf(normalizeUrl(raw.resolvedUrl) || raw.originalUrl),
      resolvedUrl: normalizeUrl(raw.resolvedUrl) || undefined,
      // Pending work must be identified afresh before downloading on another PC.
      mediaKey: completed ? text(raw.mediaKey) : undefined,
      status: completed ? "completed" : "paused",
      holdForReview: true,
      progress: completed ? 100 : 0,
      quality: text(raw.quality, 40),
      filePath: completed ? file : undefined,
      fileMissing: completed ? true : undefined,
      createdAt:
        Number.isSafeInteger(raw.createdAt) && raw.createdAt > 0
          ? raw.createdAt
          : Date.now(),
      updatedAt: Date.now(),
    };
  });
  return { settings, jobs };
}
