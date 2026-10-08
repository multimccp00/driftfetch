import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const storage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) =>
    Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x55)),
  ),
  decryptString: vi.fn((value: Buffer) =>
    Buffer.from(value)
      .map((byte) => byte ^ 0x55)
      .toString(),
  ),
}));
// Verify safeStorage integration and persistence; this mock does not test Windows encryption itself.
vi.mock("electron", () => ({ safeStorage: storage, session: {} }));
import { Sessions } from "../electron/sessions";
import { Store } from "../electron/store";
import { fixtureManifest } from "./fixtures/extension";

let dir: string, store: Store, sessions: Sessions;
beforeEach(() => {
  vi.clearAllMocks();
  storage.isEncryptionAvailable.mockReturnValue(true);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "current-account-test-"));
  store = new Store(path.join(dir, "accounts.sqlite"));
  sessions = new Sessions(store, path.join(dir, "temp"));
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const fields = fixtureManifest.account.fields;
const values = { apiKey: "SYNTHETIC_SECRET", userId: "42" };
it("encrypts schema-based credentials and exposes only account metadata", async () => {
  await sessions.saveCredentials("example.invalid", "api", fields, values);
  expect(storage.encryptString).toHaveBeenCalledOnce();
  expect(
    store
      .sessionSecret("example.invalid")
      ?.includes(Buffer.from(values.apiKey)),
  ).toBe(false);
  expect(JSON.stringify(store.sessions())).not.toContain(values.apiKey);
  expect(await sessions.credentialsFor("example.invalid", fields)).toEqual(
    values,
  );
  await expect(
    sessions.credentialsFor("other.invalid", fields),
  ).rejects.toThrow("unavailable");
  expect(
    await sessions.argumentsFor("https://example.invalid/landscapes"),
  ).toMatchObject({ args: [] });
});
it("reuses legacy API records without source-specific migration or returning secrets to the UI", async () => {
  store.saveSession(
    { domain: "example.invalid", kind: "api", updatedAt: 1 },
    storage.encryptString(JSON.stringify(values)),
  );
  expect(await sessions.credentialsFor("example.invalid", fields)).toEqual(
    values,
  );
  expect(store.sessions()[0].updatedAt).toBe(1);
});
it("keeps previous credentials if validation or encryption availability fails", async () => {
  await sessions.saveCredentials("example.invalid", "api", fields, values);
  await expect(
    sessions.saveCredentials("example.invalid", "api", fields, {
      apiKey: "OTHER",
    }),
  ).rejects.toThrow("required");
  storage.isEncryptionAvailable.mockReturnValue(false);
  await expect(
    sessions.saveCredentials("example.invalid", "api", fields, values),
  ).rejects.toThrow("encryption is unavailable");
  storage.isEncryptionAvailable.mockReturnValue(true);
  expect(await sessions.credentialsFor("example.invalid", fields)).toEqual(
    values,
  );
});
it("removes pasted surrounding whitespace from API fields on save and from existing records on read", async () => {
  const pasted = { apiKey: "  SYNTHETIC_SECRET  ", userId: "\t42 " };
  await sessions.saveCredentials("example.invalid", "api", fields, pasted);
  expect(storage.encryptString).toHaveBeenCalledWith(JSON.stringify(values));
  expect(await sessions.credentialsFor("example.invalid", fields)).toEqual(
    values,
  );
  store.saveSession(
    { domain: "example.invalid", kind: "api", updatedAt: 1 },
    storage.encryptString(JSON.stringify(pasted)),
  );
  expect(await sessions.credentialsFor("example.invalid", fields)).toEqual(
    values,
  );
  expect(store.sessions()[0].updatedAt).toBe(1);
});
it("supports username/password schemas and removes encrypted records", async () => {
  const accountFields = [
    { key: "username", label: "Username", required: true, secret: false },
    { key: "password", label: "Password", required: true, secret: true },
  ];
  const account = { username: "sample", password: " space matters " };
  await sessions.saveCredentials(
    "example.invalid",
    "credentials",
    accountFields,
    account,
  );
  expect(
    await sessions.credentialsFor("example.invalid", accountFields),
  ).toEqual(account);
  expect(
    await sessions.argumentsFor("https://example.invalid/landscapes"),
  ).toMatchObject({ args: [] });
  await sessions.remove("example.invalid");
  expect(store.sessions()).toEqual([]);
  expect(store.sessionSecret("example.invalid")).toBeUndefined();
});
