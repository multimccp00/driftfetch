import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Renderer-only check with synthetic account/provider data; no live sign-in or source request.
const root = path.resolve("dist");
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const name = path.resolve(
    root,
    "." + (url.pathname === "/" ? "/index.html" : url.pathname),
  );
  if (!name.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const contents = await fs.readFile(name);
    res.setHeader(
      "Content-Type",
      name.endsWith(".js")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".png")
            ? "image/png"
            : "text/html",
    );
    res.end(contents);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let subscriber = () => {};
    const state = {
      appVersion: "fixture",
      jobs: [
        {
          id: "failure-fixture",
          originalUrl: "https://images.example.com/landscapes",
          source: "images.example.com",
          title: "Synthetic failure",
          status: "failed",
          failureStage: "extraction",
          progress: 0,
          createdAt: 1,
          updatedAt: 1,
          error: "DriftFetch could not identify supported media on this page.",
          extensionChecks: [{ stage: "submitted", outcome: "disabled" }],
        },
        {
          id: "collection-fixture",
          originalUrl: "https://images.example.com/collection",
          source: "images.example.com",
          title: "Collection mismatch",
          status: "failed",
          failureStage: "download",
          failureCode: "INCOMPLETE_DISCOVERY",
          progress: 100,
          createdAt: 2,
          updatedAt: 2,
          collectionKind: "images",
          sourceItemCount: 257,
          discoveredItems: 249,
          expectedFiles: 249,
          verifiedFiles: 249,
          missingFiles: 0,
          error: "The collection could not be fully read.",
          collectionDiscovery: {
            pagesRead: 4,
            postsReturned: 257,
            uniquePosts: 257,
            duplicatePosts: 0,
            postsWithoutFiles: 8,
            invalidPosts: 0,
            sharedFileUrls: 0,
            stopReason: "empty-page",
          },
        },
      ],
      captures: [],
      sessions: [],
      extensions: [],
      chromeProfiles: ["Default"],
      engine: {
        available: true,
        version: "fixture",
        ffmpegAvailable: true,
        jsRuntimeAvailable: true,
      },
      settings: {
        warnBelowHeight: 720,
        speedLimitKiB: 0,
        automaticRetries: true,
        scheduleEnabled: false,
        scheduleStart: "00:00",
        scheduleEnd: "07:00",
        clipboardWatch: true,
        captureNotifications: true,
        autoDownload: true,
        autoDownloadCollections: false,
        previewCollections: true,
        quality: "best",
        concurrency: 2,
        fragmentConcurrency: 1,
        downloadDir: "C:/Downloads/DriftFetch",
        folderWatchDir: "",
        completionAction: "none",
        sourceRules: [],
        grouping: "source",
        filenameTemplate: "{title} [{id}]",
        launchAtLogin: false,
      },
    };
    state.jobs.push({
      id: "preview-fixture",
      originalUrl: "https://images.example.com/preview",
      title: "Landscape collection",
      source: "images.example.com",
      status: "collection",
      progress: 0,
      createdAt: 3,
      updatedAt: 3,
      collectionKind: "images",
      entries: Array.from({ length: 24 }, (_, index) => ({
        id: String(index + 1),
        title: `Landscape ${index + 1}`,
        url: `https://images.example.com/original-${index + 1}.png`,
      })),
    });
    const publish = () => subscriber(structuredClone(state));
    window.publishState = publish;
    window.previewRequests = [];
    window.previewCancellations = [];
    window.downloadSelection = undefined;
    window.savedFixture = undefined;
    window.current = {
      snapshot: async () => structuredClone(state),
      previewCollectionEntry: async (id, entryId) => {
        window.previewRequests.push(entryId);
        // Slow enough that fresh snapshots arrive while previews are still loading.
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (entryId === "3") return null;
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d");
        context.fillStyle = `hsl(${195 + Number(entryId) * 3} 40% 55%)`;
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = "#f4dc8d";
        context.beginPath();
        context.arc(240, 45, 18, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#284e48";
        context.beginPath();
        context.moveTo(0, 180);
        context.lineTo(90, 60);
        context.lineTo(195, 180);
        context.fill();
        context.fillStyle = "#487568";
        context.beginPath();
        context.moveTo(95, 180);
        context.lineTo(210, 80);
        context.lineTo(320, 180);
        context.fill();
        return canvas.toDataURL("image/png");
      },
      cancelCollectionPreviews: async (id) => {
        window.previewCancellations.push(id);
      },
      selectCollection: async (id, ids) => {
        window.downloadSelection = { id, ids };
        state.jobs.find((job) => job.id === id).status = "review";
        publish();
      },
      subscribe: (callback) => {
        subscriber = callback;
        return () => {};
      },
      onNavigate: () => () => {},
      onOpenJob: () => () => {},
      isMaximized: async () => false,
      onMaximized: () => () => {},
      windowAction: async () => {},
      jobThumbnail: async () => null,
      jobDetail: async (id) => state.jobs.find((j) => j.id === id),
      checkFiles: async () => {},
      importExtension: async () => {
        state.extensions = [
          {
            apiVersion: 1,
            id: "samples",
            name: "Landscape samples",
            version: "1.0.0",
            domains: ["images.example.com"],
            enabled: false,
            account: {
              kind: "api",
              label: "API credentials",
              fields: [
                {
                  key: "apiKey",
                  label: "API key",
                  secret: true,
                  required: true,
                },
                {
                  key: "userId",
                  label: "User ID",
                  secret: false,
                  required: true,
                },
              ],
            },
          },
        ];
        publish();
        return true;
      },
      extensionAction: async (id, action) => {
        if (action === "remove") state.extensions = [];
        else state.extensions[0].enabled = action === "enable";
        publish();
      },
      saveAccount: async (domain, values) => {
        window.savedFixture = { domain, values };
        state.sessions = [{ domain, kind: "api", updatedAt: Date.now() }];
        publish();
      },
      removeSession: async () => {
        state.sessions = [];
        publish();
      },
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const tab = (name) =>
    page.locator(".settings-nav").getByRole("button", { name });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await tab(/^Sites & sign-ins/).click();
  assert.equal(await page.getByLabel("API key", { exact: true }).count(), 0);
  await tab(/^Advanced/).click();
  await page.getByRole("button", { name: "Add extension file" }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await tab(/^Sites & sign-ins/).click();
  await page
    .getByLabel("Source domain", { exact: true })
    .fill("images.example.com");
  const key = page.getByLabel("API key", { exact: true });
  assert.equal(await key.getAttribute("type"), "password");
  await key.fill("SYNTHETIC_SECRET");
  await page.getByLabel("User ID", { exact: true }).fill("42");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await page.waitForFunction(() => !!window.savedFixture);
  assert.deepEqual(await page.evaluate(() => window.savedFixture), {
    domain: "images.example.com",
    values: { apiKey: "SYNTHETIC_SECRET", userId: "42" },
  });
  assert.equal(await key.inputValue(), "");
  assert.equal(
    await page.getByLabel("User ID", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    (await page.locator("body").innerText()).includes("SYNTHETIC_SECRET"),
    false,
  );
  await key.fill("DISCARD_ON_DOMAIN_CHANGE");
  await page
    .getByLabel("Source domain", { exact: true })
    .fill("other.example.com");
  assert.equal(await key.count(), 0);
  await page
    .getByLabel("Source domain", { exact: true })
    .fill("images.example.com");
  assert.equal(await key.inputValue(), "");
  await fs.mkdir("test-results/accounts-ui", { recursive: true });
  await page.screenshot({
    path: "test-results/accounts-ui/accounts.png",
    fullPage: true,
  });
  await tab(/^Advanced/).click();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await tab(/^Sites & sign-ins/).click();
  await page
    .getByLabel("Source domain", { exact: true })
    .fill("images.example.com");
  assert.equal(await key.count(), 0);
  assert.equal(
    await page
      .getByText("Enable a matching extension to use this account.")
      .count(),
    1,
  );
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /^Downloads/ })
    .click();
  await page
    .getByRole("button", { name: "Synthetic failure", exact: true })
    .click();
  await page.getByRole("button", { name: "Technical details" }).click();
  await page.getByText("Extension check", { exact: true }).first().waitFor();
  await page
    .getByText(
      "The extension for this domain is disabled. Enable it in Settings → Advanced → Extensions, then retry.",
      { exact: false },
    )
    .waitFor();
  await page.screenshot({
    path: "test-results/accounts-ui/extension-details.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Collection mismatch", exact: true })
    .click();
  await page.getByRole("button", { name: "Technical details" }).click();
  await page.getByText("249 of 257 reported", { exact: true }).waitFor();
  await page.getByText("257 distinct · 0 repeated", { exact: true }).waitFor();
  await page.getByText("8 · 0 invalid records", { exact: true }).waitFor();
  await page.getByText("API returned an empty page", { exact: true }).waitFor();
  await page.screenshot({
    path: "test-results/accounts-ui/collection-discovery.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /^Review queue/ })
    .click();
  await page
    .getByRole("button", { name: "Preview & select", exact: true })
    .click();
  await page.waitForFunction(() => window.previewRequests.length === 12);
  // Snapshots keep arriving while downloads progress; they must not drop previews in flight.
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.publishState());
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(
    () => document.querySelectorAll(".tile img").length === 11,
  );
  assert.equal(
    await page.evaluate(() => window.previewRequests.length),
    12,
    "previews are requested once each",
  );
  await page
    .getByRole("button", { name: "Enlarge preview: Landscape 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to items", exact: true })
    .click();
  assert.equal(await page.locator(".tile").count(), 12);
  assert.equal(await page.getByText("No preview", { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.downloadSelection), undefined);
  await page.screenshot({
    path: "test-results/accounts-ui/collection-preview.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.downloadSelection), undefined);
  await page
    .getByRole("button", { name: "Preview & select", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByLabel("Select Landscape 1", { exact: true }).check();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByLabel("Select Landscape 13", { exact: true }).check();
  await page.getByLabel("Search collection items").fill("Landscape 24");
  await page
    .getByRole("button", { name: "Select all results", exact: true })
    .click();
  await page.getByRole("button", { name: /^Download 3 selected/ }).click();
  assert.deepEqual(await page.evaluate(() => window.downloadSelection), {
    id: "preview-fixture",
    ids: ["1", "13", "24"],
  });
  assert.ok(
    (await page.evaluate(() => window.previewCancellations.length)) >= 2,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Renderer smoke passed: extension controls, account forms, secret clearing, and disabled-provider evidence in download details.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
