import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  Extensions,
  hideSecretOptions,
  parseExtension,
} from "../electron/extensions";
import {
  fixtureCode,
  fixtureManifest,
  fixturePackage,
} from "./fixtures/extension";
import { validateAccountValues } from "../electron/account-fields";

const directories: string[] = [];
const started: Extensions[] = [];
afterEach(async () => {
  for (const extensions of started.splice(0)) extensions.shutdown();
  for (const dir of directories.splice(0))
    await fs.rm(dir, { recursive: true, force: true });
});
async function registry() {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "current-extension-test-"),
  );
  directories.push(dir);
  const extensions = new Extensions(dir);
  started.push(extensions);
  return { dir, extensions };
}
const credentials = vi.fn(async () => ({ apiKey: "SYNTHETIC", userId: "0" }));
const signal = () => new AbortController().signal;

it("uses the canonical account and extension for www links without matching unrelated subdomains", async () => {
  const { extensions } = await registry();
  await extensions.install(fixturePackage);
  await extensions.action("landscapes", "enable");
  const checked = vi.fn();
  const readCredentials = vi.fn(async () => ({
    apiKey: "SYNTHETIC",
    userId: "0",
  }));
  const result = await extensions.resolve(
    "https://www.example.invalid/landscapes",
    signal(),
    readCredentials,
    () => {},
    checked,
  );
  expect(result).toMatchObject({
    source: "example.invalid",
    extensionId: "landscapes",
  });
  expect(checked).toHaveBeenLastCalledWith("selected");
  expect(readCredentials).toHaveBeenCalledWith(
    "example.invalid",
    fixtureManifest.account.fields,
  );
  expect(extensions.forDomain("www.example.invalid")?.id).toBe("landscapes");
  expect(
    await extensions.galleryArguments(
      "https://www.example.invalid/landscapes",
      readCredentials,
    ),
  ).toEqual(["--option", "extractor.example.api-key=SYNTHETIC"]);
  expect(
    await extensions.resolve(
      "https://unrelated.example.invalid/landscapes",
      signal(),
      readCredentials,
      () => {},
      checked,
    ),
  ).toBeUndefined();
  expect(checked).toHaveBeenLastCalledWith("not-installed");
});

it("records absent, disabled, enabled but unmatched, and failed-to-load providers without running disabled code", async () => {
  const { extensions, dir } = await registry();
  const checked = vi.fn();
  const resolve = () =>
    extensions.resolve(
      "https://example.invalid/other",
      signal(),
      credentials,
      () => {},
      checked,
    );
  await resolve();
  expect(checked).toHaveBeenLastCalledWith("not-installed");
  await extensions.install(fixturePackage);
  await resolve();
  expect(checked).toHaveBeenLastCalledWith("disabled");
  await extensions.action("landscapes", "enable");
  await resolve();
  expect(checked).toHaveBeenLastCalledWith("not-matched");
  await fs.writeFile(
    path.join(dir, "landscapes.json"),
    JSON.stringify({
      manifest: fixtureManifest,
      enabled: true,
      code: "throw new Error('SECRET')",
    }),
  );
  const reopened = new Extensions(dir);
  await reopened.load();
  await reopened.resolve(
    "https://example.invalid/landscapes",
    signal(),
    credentials,
    () => {},
    checked,
  );
  expect(checked).toHaveBeenLastCalledWith("load-failed");
  expect(JSON.stringify(reopened.list())).not.toContain("SECRET");
});

it("starts empty and installing a file never runs its code", async () => {
  const { extensions } = await registry();
  await extensions.load();
  expect(extensions.list()).toEqual([]);
  await extensions.install(
    JSON.stringify({
      manifest: fixtureManifest,
      code: "throw new Error('CODE EXECUTED')",
    }),
  );
  expect(extensions.list()[0].enabled).toBe(false);
  expect(
    await extensions.resolve(
      "https://example.invalid/landscapes",
      signal(),
      credentials,
      () => {},
    ),
  ).toBeUndefined();
  await expect(extensions.action("landscapes", "enable")).rejects.toThrow(
    "Could not load",
  );
  expect(extensions.list()[0].enabled).toBe(false);
});
it("loads only enabled domain providers, persists state, and removes them", async () => {
  const { extensions, dir } = await registry();
  await extensions.install(fixturePackage);
  await extensions.action("landscapes", "enable");
  const reloaded = new Extensions(dir);
  await reloaded.load();
  const result = await reloaded.resolve(
    "https://example.invalid/landscapes",
    signal(),
    credentials,
    () => {},
  );
  expect(result).toMatchObject({
    extensionId: "landscapes",
    sourceItemCount: 1,
    entries: [{ id: "1" }],
  });
  expect(
    await reloaded.resolve(
      "https://other.invalid/landscapes",
      signal(),
      credentials,
      () => {},
    ),
  ).toBeUndefined();
  expect(
    await reloaded.resolve(
      "https://example.invalid/other",
      signal(),
      credentials,
      () => {},
    ),
  ).toBeUndefined();
  expect(credentials).toHaveBeenCalledWith(
    "example.invalid",
    fixtureManifest.account.fields,
  );
  expect(JSON.stringify(reloaded.list())).not.toContain("SYNTHETIC");
  await reloaded.action("landscapes", "disable");
  expect(
    await reloaded.resolve(
      "https://example.invalid/landscapes",
      signal(),
      credentials,
      () => {},
    ),
  ).toBeUndefined();
  const disabled = new Extensions(dir);
  await disabled.load();
  expect(disabled.list()[0].enabled).toBe(false);
  await disabled.action("landscapes", "remove");
  expect(disabled.list()).toEqual([]);
  expect(await fs.readdir(dir)).toEqual([]);
});
it("rejects conflicting domains and duplicate installs without replacing the first provider", async () => {
  const { extensions } = await registry();
  await extensions.install(fixturePackage);
  await extensions.action("landscapes", "enable");
  await expect(extensions.install(fixturePackage)).rejects.toThrow(
    "Remove the existing",
  );
  await extensions.install(
    JSON.stringify({
      manifest: { ...fixtureManifest, id: "other" },
      code: fixtureCode,
    }),
  );
  await expect(extensions.action("other", "enable")).rejects.toThrow(
    "already handles",
  );
});
it.each(["../outside", "con", "nul", undefined, 123])(
  "rejects unsafe extension ID %s",
  (id) => {
    expect(() =>
      parseExtension(
        JSON.stringify({
          manifest: { ...fixtureManifest, id },
          code: fixtureCode,
        }),
      ),
    ).toThrow();
  },
);
it("rejects incompatible manifests and invalid account fields", () => {
  expect(() =>
    parseExtension(
      JSON.stringify({
        manifest: { ...fixtureManifest, apiVersion: 2 },
        code: fixtureCode,
      }),
    ),
  ).toThrow();
  expect(() =>
    parseExtension(
      JSON.stringify({
        manifest: { ...fixtureManifest, domains: ["*.example.invalid"] },
        code: fixtureCode,
      }),
    ),
  ).toThrow();
  expect(() =>
    parseExtension(
      JSON.stringify({
        manifest: {
          ...fixtureManifest,
          account: {
            ...fixtureManifest.account,
            fields: [
              {
                key: "constructor",
                label: "Key",
                secret: true,
                required: true,
              },
            ],
          },
        },
        code: fixtureCode,
      }),
    ),
  ).toThrow();
});
it("accepts only collection metadata, never extension-supplied file paths or status", async () => {
  const { extensions } = await registry();
  await extensions.install(
    JSON.stringify({
      manifest: fixtureManifest,
      code: `module.exports={matches:()=>true,resolve:async()=>({status:'completed',id:'replacement',targetDir:'C:/private',entries:[{id:'1',title:'Sample',url:'https://example.invalid/1.png'}]})}`,
    }),
  );
  await extensions.action("landscapes", "enable");
  const result = await extensions.resolve(
    "https://example.invalid/landscapes",
    signal(),
    credentials,
    () => {},
  );
  expect(result?.status).toBe("collection");
  expect(result).not.toHaveProperty("targetDir");
  expect(result).not.toHaveProperty("id");
});
it("rejects non-HTTP collection URLs", async () => {
  const { extensions } = await registry();
  await extensions.install(
    JSON.stringify({
      manifest: fixtureManifest,
      code: `module.exports={matches:()=>true,resolve:async()=>({entries:[{id:'1',title:'Sample',url:'file:///C:/private'}]})}`,
    }),
  );
  await extensions.action("landscapes", "enable");
  await expect(
    extensions.resolve(
      "https://example.invalid/landscapes",
      signal(),
      credentials,
      () => {},
    ),
  ).rejects.toThrow("invalid collection metadata");
});
it("preserves discovery counters while excluding extra provider data", async () => {
  const { extensions } = await registry();
  const audit = {
    pagesRead: 4,
    postsReturned: 257,
    uniquePosts: 257,
    duplicatePosts: 0,
    postsWithoutFiles: 8,
    invalidPosts: 0,
    sharedFileUrls: 0,
    stopReason: "empty-page",
  };
  await extensions.install(
    JSON.stringify({
      manifest: fixtureManifest,
      code: `module.exports={matches:()=>true,resolve:async()=>({entries:[{id:'1',title:'Sample',url:'https://example.invalid/1.png'}],collectionDiscovery:${JSON.stringify({ ...audit, privateToken: "SECRET" })}})}`,
    }),
  );
  await extensions.action("landscapes", "enable");
  const result = await extensions.resolve(
    "https://example.invalid/landscapes",
    signal(),
    credentials,
    () => {},
  );
  expect(result?.collectionDiscovery).toEqual(audit);
  expect(JSON.stringify(result)).not.toContain("SECRET");
});
it("validates dynamic account schemas without echoing secrets", () => {
  const fields = fixtureManifest.account.fields;
  expect(
    validateAccountValues(fields, { apiKey: "SYNTHETIC", userId: "0" }),
  ).toEqual({ apiKey: "SYNTHETIC", userId: "0" });
  expect(() => validateAccountValues(fields, { apiKey: "SECRET" })).toThrow(
    "required account fields",
  );
  expect(() =>
    validateAccountValues(fields, {
      apiKey: "SECRET",
      userId: "0",
      extra: "unexpected",
    }),
  ).toThrow("Unexpected account fields");
  expect(() =>
    validateAccountValues(fields, { apiKey: "SECRET\n", userId: "0" }),
  ).toThrow("An account field is invalid");
  expect(
    validateAccountValues(
      [{ key: "password", label: "Password", secret: true, required: true }],
      { password: " spaces allowed " },
    ).password,
  ).toBe(" spaces allowed ");
});

it("keeps secret engine options out of the command line", async () => {
  const hidden = await hideSecretOptions([
    "--option",
    "extractor.x.api-key=SECRET",
    "--option",
    "extractor.x.user-id=7",
  ]);
  expect(hidden.args.join(" ")).not.toContain("SECRET");
  expect(hidden.args.slice(0, 2)).toEqual([
    "--option",
    "extractor.x.user-id=7",
  ]);
  const file = hidden.args[hidden.args.indexOf("--config") + 1];
  expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
    extractor: { x: { "api-key": "SECRET" } },
  });
  await hidden.cleanup();
  await expect(fs.access(file)).rejects.toThrow();
  const plain = ["--option", "extractor.x.user-id=7"];
  expect((await hideSecretOptions(plain)).args).toEqual(plain);
});
