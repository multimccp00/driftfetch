import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const runDir = path.resolve("test-results", `youtube-package-${Date.now()}`);
const env = {
  ...process.env,
  DRIFTFETCH_USER_DATA: path.join(runDir, "userdata"),
  // Runs against the bundled engines, not whatever is newest today.
  DRIFTFETCH_NO_ENGINE_UPDATE: "1",
  PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`,
};
delete env.ELECTRON_RUN_AS_NODE;
await fs.mkdir(runDir, { recursive: true });
async function waitForState(page, predicate, timeout = 180000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await page.evaluate(() => window.driftfetch.snapshot());
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for DriftFetch state.");
}
let app;
try {
  app = await electron.launch({
    executablePath: path.resolve("release/0.5.0/win-unpacked/DriftFetch.exe"),
    env,
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.driftfetch, { timeout: 30000 });
  await page.evaluate(
    (downloadDir) =>
      window.driftfetch.settings({
        clipboardWatch: false,
        autoDownload: false,
        downloadDir,
        quality: "720",
      }),
    path.join(runDir, "downloads"),
  );
  await page.evaluate((link) => window.driftfetch.addLinks(link), url);
  const ready = await waitForState(
    page,
    (state) => state.jobs[0]?.status === "review" && !state.jobs[0]?.refreshing,
  );
  const job = ready.jobs[0];
  assert.equal(ready.engine.jsRuntimeAvailable, true);
  const format = job.formats
    ?.filter((f) => f.height && f.height <= 720 && f.separateAudio)
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  assert(format, "Expected a separate-audio HD format at or below 720p");
  await page.evaluate(
    ({ id, formatId }) => window.driftfetch.setFormat(id, formatId),
    { id: job.id, formatId: format.id },
  );
  await page.evaluate((id) => window.driftfetch.action([id], "start"), job.id);
  const done = await waitForState(
    page,
    (state) =>
      ["completed", "failed"].includes(
        state.jobs.find((candidate) => candidate.id === job.id)?.status || "",
      ),
    600000,
  );
  const completed = done.jobs.find((candidate) => candidate.id === job.id);
  assert.equal(completed.status, "completed", completed.error);
  assert.equal(completed.quality, `${format.height}p`);
  assert.match(
    completed.actualFormatId || "",
    new RegExp(`^${format.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\+`),
  );
  await fs.access(completed.filePath);
  await page.screenshot({ path: path.join(runDir, "completed-youtube.png") });
  await fs.writeFile(
    path.join(runDir, "report.json"),
    JSON.stringify(
      {
        success: true,
        packaged: true,
        url: "https://www.youtube.com/watch",
        requestedFormat: format.id,
        height: format.height,
        savedQuality: completed.quality,
        runtime: ready.engine.jsRuntimeVersion,
        engine: ready.engine.version,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: packaged YouTube ${format.height}p merge. Report: ${runDir}`,
  );
} finally {
  if (app) await app.close();
}
