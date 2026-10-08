import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
const sample = await fs.readFile(process.argv[2]);
const dir = path.resolve("test-results", `format-recovery-${Date.now()}`);
await fs.mkdir(dir, { recursive: true });
let playable = false;
const server = http.createServer((req, res) => {
  if (req.url === "/sample.mp4") {
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": sample.length,
    });
    res.end(req.method === "HEAD" ? undefined : sample);
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      playable
        ? '<html><head><title>Recovery sample</title></head><body><video src="/sample.mp4"></video></body></html>'
        : "<html><body>No media yet</body></html>",
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = {
  ...process.env,
  CURRENT_USER_DATA: path.join(dir, "userdata"),
  PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`,
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    executablePath: path.resolve("release/0.4.0/win-unpacked/Current.exe"),
    env,
  });
  await app.evaluate(({ clipboard }) => {
    clipboard.readText = async () => "";
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.current);
  await page.evaluate(() =>
    window.current.settings({ clipboardWatch: false, autoDownload: true }),
  );
  await page.evaluate(
    (url) => window.current.addLinks(url),
    `http://127.0.0.1:${server.address().port}/changing`,
  );
  await page.waitForFunction(
    async () => (await window.current.snapshot()).jobs[0]?.status === "failed",
    { timeout: 60000 },
  );
  const before = await page.evaluate(() => window.current.snapshot());
  await page.evaluate(
    (id) => window.current.action([id], "pause"),
    before.jobs[0].id,
  );
  playable = true;
  await page.evaluate(
    (id) => window.current.refreshFormats(id),
    before.jobs[0].id,
  );
  const after = await page.evaluate(() => window.current.snapshot());
  assert.equal(after.jobs.length, 1);
  assert.equal(after.jobs[0].id, before.jobs[0].id);
  assert.equal(after.jobs[0].status, "review");
  assert.equal(after.jobs[0].holdForReview, true);
  assert(after.jobs[0].mediaKey);
  assert.equal(after.jobs[0].error, undefined);
  await page.getByRole("button", { name: /^Review queue/ }).click();
  await page
    .getByRole("button", { name: "Recheck formats", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(dir, "recovered-review.png") });
  await fs.writeFile(
    path.join(dir, "report.json"),
    JSON.stringify(
      {
        success: true,
        packaged: true,
        check:
          "Unidentified failed link recovers into held review on the same entry, even with Auto-download enabled",
        version: after.appVersion,
      },
      null,
      2,
    ),
  );
  console.log(`PASS Final packaged format recovery. Report: ${dir}`);
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  server.close();
}
