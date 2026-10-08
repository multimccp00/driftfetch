import { afterEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Extensions } from "../electron/extensions";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const task of cleanup.splice(0)) await task();
});
const manifest = {
  apiVersion: 1,
  id: "probe",
  name: "Sandbox probe",
  version: "1.0.0",
  domains: ["example.invalid"],
};
const entries = `[{id:'1',title:'t',url:'https://example.invalid/a.png'}]`;
async function install(code: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "current-sandbox-"));
  const extensions = new Extensions(dir);
  cleanup.push(async () => {
    extensions.shutdown();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await extensions.install(JSON.stringify({ manifest, code }));
  await extensions.action("probe", "enable");
  return extensions;
}
const ask = (
  extensions: Extensions,
  query = "",
  signal = new AbortController().signal,
) =>
  extensions.resolve(
    `https://example.invalid/page${query}`,
    signal,
    async () => ({}),
    () => {},
  );

it("denies file access to extension code", async () => {
  const secret = path.join(os.tmpdir(), `current-secret-${Date.now()}.txt`);
  await fs.writeFile(secret, "private");
  cleanup.push(() => fs.rm(secret, { force: true }));
  const extensions = await install(`
    module.exports = {
      matches: () => true,
      async resolve(url) {
        const file = new URL(url).searchParams.get('file');
        let outcome = 'read-allowed';
        try { require('fs').readFileSync(file); } catch (e) { outcome = String(e.code); }
        try { require('fs').writeFileSync(file + '.x', 'x'); outcome += '/write-allowed'; } catch (e) { outcome += '/' + e.code; }
        return { title: outcome, entries: ${entries} };
      }
    };`);
  const result = await ask(extensions, "?file=" + encodeURIComponent(secret));
  expect(result?.title).toBe("ERR_ACCESS_DENIED/ERR_ACCESS_DENIED");
  await expect(fs.access(secret + ".x")).rejects.toThrow();
});

it("denies starting programs and hides the app's environment", async () => {
  process.env.CURRENT_TEST_SECRET = "shh";
  cleanup.push(() => void delete process.env.CURRENT_TEST_SECRET);
  const extensions = await install(`
    module.exports = {
      matches: () => true,
      async resolve() {
        let spawned = 'spawn-allowed';
        try { require('child_process').spawnSync(process.execPath, ['-v']); }
        catch (e) { spawned = String(e.code); }
        return { title: spawned + '/' + String(process.env.CURRENT_TEST_SECRET), entries: ${entries} };
      }
    };`);
  expect((await ask(extensions))?.title).toBe("ERR_ACCESS_DENIED/undefined");
});

it("stops waiting when the app cancels, and keeps working afterwards", async () => {
  const extensions = await install(`
    module.exports = {
      matches: () => true,
      resolve(url) {
        if (new URL(url).searchParams.get('hang')) return new Promise(() => {});
        return Promise.resolve({ title: 'fine', entries: ${entries} });
      }
    };`);
  const controller = new AbortController();
  const hung = ask(extensions, "?hang=1", controller.signal);
  setTimeout(() => controller.abort(new Error("deadline")), 100);
  await expect(hung).rejects.toThrow("deadline");
  expect((await ask(extensions))?.title).toBe("fine");
});

it("reports a crashed extension and starts a fresh process on the next call", async () => {
  const extensions = await install(`
    module.exports = {
      matches: () => true,
      async resolve(url) {
        if (new URL(url).searchParams.get('crash')) process.exit(1);
        return { title: 'recovered', entries: ${entries} };
      }
    };`);
  await expect(ask(extensions, "?crash=1")).rejects.toThrow("stopped");
  expect((await ask(extensions))?.title).toBe("recovered");
});

it("refuses to enable code that does not export the provider functions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "current-sandbox-"));
  const extensions = new Extensions(dir);
  cleanup.push(async () => {
    extensions.shutdown();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await extensions.install(
    JSON.stringify({ manifest, code: "module.exports = {};" }),
  );
  await expect(extensions.action("probe", "enable")).rejects.toThrow(
    "Could not load this extension",
  );
});
