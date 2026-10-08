import { expect, it } from "vitest";
import fs from "node:fs";
import { verifyDetached } from "../electron/signature";
import {
  ytDlpKeyFingerprint,
  ytDlpPublicKey,
} from "../electron/yt-dlp-public-key";

// A real yt-dlp release (2026.08.19): proves the embedded key is the one that signs releases.
const key = { armored: ytDlpPublicKey, fingerprint: ytDlpKeyFingerprint };
const sums = new Uint8Array(
  fs.readFileSync("tests/fixtures/yt-dlp-2026.08.19-SHA2-256SUMS"),
);
const signature = new Uint8Array(
  fs.readFileSync("tests/fixtures/yt-dlp-2026.08.19-SHA2-256SUMS.sig"),
);

it("accepts the genuine yt-dlp release signature with the embedded key", async () => {
  await expect(verifyDetached(sums, signature, key)).resolves.toBeUndefined();
});
it("rejects the same signature over altered content", async () => {
  const altered = new Uint8Array([...sums, 32]);
  await expect(verifyDetached(altered, signature, key)).rejects.toThrow();
});
it("rejects a key that is not the pinned one", async () => {
  await expect(
    verifyDetached(sums, signature, {
      ...key,
      fingerprint: "0".repeat(40),
    }),
  ).rejects.toThrow("pinned fingerprint");
});
