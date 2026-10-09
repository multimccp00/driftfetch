import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  powerMonitor,
  session,
  shell,
  Tray,
} from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, renameSync, watch, type FSWatcher } from "node:fs";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { encryptBackup, decryptBackup, maxBackupBytes } from "./backup";
import { CapturePopup } from "./popup";
import { CompletionTracker } from "./completion-tracker";
import { CollectionPreviews } from "./previews";
import { diagnosticReport } from "../shared/diagnostics";
import { chooseUpdate, createShortcut, isNewer } from "./app-updates";
import { Store } from "./store";
import { Engine } from "./engine";
import { Queue } from "./queue";
import { accountsPartition, Sessions } from "./sessions";
import { Extensions } from "./extensions";
import {
  ClipboardTracker,
  defaultSettings,
  maxLinksPerBatch,
  normalizeUrl,
  parseLinks,
  validateDomain,
  validateSettings,
} from "./core";
import type { Job, Settings, Snapshot, VideoFormat } from "../src/shared";

// Explicit troubleshooting option; normal launches use Electron's graphics defaults.
if (process.env.CURRENT_SOFTWARE_RENDERING === "1")
  app.disableHardwareAcceleration();
app.setName("DriftFetch");
if (process.env.CURRENT_USER_DATA)
  app.setPath("userData", path.resolve(process.env.CURRENT_USER_DATA));
else {
  // Builds before the rename were called Current and kept everything in
  // %APPDATA%\Current. Move it once so sign-ins, history and settings carry
  // over; if the old app still holds it, keep using it for this run.
  const appData = app.getPath("appData");
  const legacy = path.join(appData, "Current");
  const renamed = path.join(appData, "DriftFetch");
  if (!existsSync(renamed) && existsSync(path.join(legacy, "current.sqlite")))
    try {
      renameSync(legacy, renamed);
    } catch {
      app.setPath("userData", legacy);
    }
}
let window: BrowserWindow | undefined,
  tray: Tray | undefined,
  queue: Queue | undefined,
  store: Store | undefined,
  engine: Engine | undefined,
  sessions: Sessions | undefined,
  extensions: Extensions | undefined;
let quitting = false,
  quitReady = false,
  broadcastTimer: ReturnType<typeof setTimeout> | undefined,
  clipboardTimer: ReturnType<typeof setInterval> | undefined;
let chromeProfiles: string[] = [];
let popup: CapturePopup | undefined;
let updateInstaller: string | undefined;
let backupBusy = false;
const completionTracker = new CompletionTracker();
const collectionPreviews = new CollectionPreviews();
let folderWatcher: FSWatcher | undefined;
const devUrl = !app.isPackaged ? process.env.CURRENT_DEV_URL : undefined;
// History only grows, so finished jobs go to the renderer without their bulky
// format and entry lists; the details dialog fetches the full job on demand.
// qualityWarning still reads each format's id and height, so keep those.
const finished = ["completed", "cancelled", "duplicate"];
const listed = (job: Job): Job =>
  finished.includes(job.status) && (job.formats || job.entries)
    ? {
        ...job,
        // The list keeps one thumbnail for a finished gallery; the item list itself is dropped.
        thumbnailUrl:
          job.thumbnailUrl || job.entries?.find((e) => e.thumbnail)?.thumbnail,
        entries: undefined,
        formats: job.formats?.map(
          ({ id, height }) => ({ id, height }) as VideoFormat,
        ),
      }
    : job;
// Packaged builds carry the icon in dist; from source it sits in public, which may not be built yet.
// Source runs get their own ID. Windows ties the taskbar icon to it, so it must not match any old shortcut
// (an earlier dev shortcut claiming "local.driftfetch.app.dev" made the taskbar show Electron's icon).
const appUserModelId = app.isPackaged
  ? "local.driftfetch.app"
  : "local.driftfetch.app.source";
const appIcon = () =>
  path.join(app.getAppPath(), app.isPackaged ? "dist" : "public", "icon.png");
// Windows taskbar needs a multi-size .ico from source; the packaged exe already embeds it.
const windowIcon = () =>
  app.isPackaged
    ? appIcon()
    : path.join(app.getAppPath(), "resources", "icon.ico");
const snapshot = (): Snapshot => ({
  appVersion: app.getVersion(),
  captures: store!.captures(),
  jobs: queue!.jobs.map(listed).sort((a, b) => b.createdAt - a.createdAt),
  settings: queue!.settings,
  sessions: store!.sessions(),
  engine: engine!.info,
  chromeProfiles,
  extensions: extensions?.list() || [],
});
// Completions gathered between broadcasts, so a 50-item batch is one toast.
let finishedTitles: string[] = [];
function changed() {
  const completed = completionTracker.update(queue?.jobs ?? []);
  if (!quitting && queue?.settings.completionAction === "notify")
    finishedTitles.push(...completed.map((job) => job.title));
  if (broadcastTimer || quitting) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined;
    if (finishedTitles.length) {
      new Notification({
        title: "DriftFetch",
        body:
          finishedTitles.length === 1
            ? `Finished: ${finishedTitles[0]}`
            : `Finished ${finishedTitles.length} downloads`,
      }).show();
      finishedTitles = [];
    }
    if (window && !window.isDestroyed() && queue)
      window.webContents.send("state", snapshot());
    popup?.refresh();
  }, 150);
}
function showWindow() {
  // Automated runs keep the window off-screen and never take focus.
  if (window && process.env.CURRENT_BACKGROUND === "1") {
    window.showInactive();
    return;
  }
  if (window) {
    window.show();
    if (window.isMinimized()) window.restore();
    window.focus();
  }
}
// Matches parseLinks, which rejects larger text anyway.
const maxLinkFileBytes = 100_000;
let watchedFolder = "";
async function configureFolderWatch(folder: string) {
  folderWatcher?.close();
  folderWatcher = undefined;
  watchedFolder = folder;
  if (!folder) return;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();
  const intake = async (filename: string) => {
    const file = path.join(folder, filename);
    // Wait until the writer has finished: the size must hold still for a moment.
    const before = await fs.stat(file).catch(() => undefined);
    if (!before?.isFile() || before.size > maxLinkFileBytes) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await fs.stat(file).catch(() => undefined);
    if (!after || after.size !== before.size) return schedule(filename);
    const text = await fs.readFile(file, "utf8").catch(() => undefined);
    if (!text) return;
    // Feed long lists in batches so no link is dropped before the file is archived.
    let handled = 0;
    const links = parseLinks(text);
    for (let i = 0; i < links.length; i += maxLinksPerBatch) {
      const result = queue?.addLinks(
        links.slice(i, i + maxLinksPerBatch).join(" "),
      );
      handled += (result?.added ?? 0) + (result?.duplicates ?? 0);
    }
    if (!handled) return;
    const processed = path.join(folder, "processed");
    await fs.mkdir(processed, { recursive: true });
    await fs
      .rename(file, path.join(processed, `${Date.now()}-${filename}`))
      .catch(() => {});
    changed();
  };
  // fs.watch fires several events per file; handle it once, after the last one.
  const schedule = (filename: string) => {
    clearTimeout(timers.get(filename));
    timers.set(
      filename,
      setTimeout(() => {
        timers.delete(filename);
        if (inFlight.has(filename)) return schedule(filename);
        inFlight.add(filename);
        void intake(filename)
          .catch(() => {})
          .finally(() => inFlight.delete(filename));
      }, 500),
    );
  };
  try {
    const watcher = watch(folder, (_event, filename) => {
      if (!filename || !/\.txt$/i.test(filename) || filename.startsWith("."))
        return;
      schedule(filename);
    });
    // An ejected or deleted folder emits "error"; unhandled it would crash the app.
    watcher.on("error", () => {
      watcher.close();
      if (folderWatcher === watcher) folderWatcher = undefined;
    });
    watcher.on("close", () => timers.forEach(clearTimeout));
    folderWatcher = watcher;
  } catch {
    // Folder unavailable (unplugged drive, offline share): retried every minute.
  }
}
/** Settings side effects shared by the settings handler and backup restore. */
async function applySettings(previous: Settings, next: Settings) {
  if (next.downloadDir !== previous.downloadDir)
    await fs.mkdir(next.downloadDir, { recursive: true });
  if (next.folderWatchDir !== previous.folderWatchDir) {
    if (next.folderWatchDir)
      await fs.mkdir(next.folderWatchDir, { recursive: true });
    await configureFolderWatch(next.folderWatchDir);
  }
  if (!next.captureNotifications) popup?.hide();
}
function handle(channel: string, handler: (...args: any[]) => any) {
  ipcMain.handle(channel, (event, ...args) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("Untrusted request.");
    return handler(...args);
  });
}
async function init() {
  const userData = app.getPath("userData");
  await fs.mkdir(userData, { recursive: true });
  store = new Store(path.join(userData, "current.sqlite"));
  sessions = new Sessions(store, path.join(userData, "temporary-sessions"));
  extensions = new Extensions(
    path.join(userData, "extensions"),
    app.isPackaged
      ? path.join(process.resourcesPath, "extension-host.cjs")
      : path.join(app.getAppPath(), "electron", "extension-host.cjs"),
  );
  await extensions.load();
  await sessions.cleanOrphans();
  chromeProfiles = await sessions.profiles();
  engine = new Engine(
    path.join(userData, "engines"),
    app.isPackaged
      ? path.join(process.resourcesPath, "engines")
      : path.join(app.getAppPath(), "resources", "engines"),
    changed,
  );
  await engine.init();
  queue = new Queue(
    store,
    defaultSettings(app.getPath("downloads")),
    engine,
    sessions,
    changed,
    extensions,
  );
  completionTracker.update(queue.jobs);
  // Later checks happen when History opens; a sleeping disk stays asleep.
  void queue.checkFiles();
  await configureFolderWatch(queue.settings.folderWatchDir);
  powerMonitor.on("suspend", () => void queue?.suspend());
  powerMonitor.on("resume", () => queue?.resume());
  const tracker = new ClipboardTracker(await clipboard.readText());
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  const accounts = session.fromPartition(accountsPartition);
  accounts.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  accounts.setPermissionCheckHandler(() => false);
  // Sites often refuse logins from browsers that identify as embedded apps.
  accounts.setUserAgent(
    accounts.getUserAgent().replace(/\s(?:DriftFetch|Electron)\/\S+/g, ""),
  );
  window = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1020,
    minHeight: 680,
    ...(process.env.CURRENT_BACKGROUND === "1" ? { x: -32000, y: -32000 } : {}),
    frame: false,
    backgroundColor: "#0b0e17",
    title: "DriftFetch",
    show: false,
    icon: windowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window?.hide();
    }
  });
  window.once("ready-to-show", showWindow);
  const reportMaximized = () =>
    window?.webContents.send("maximized", window.isMaximized());
  window.on("maximize", reportMaximized);
  window.on("unmaximize", reportMaximized);
  const preserved = store.recoveredDatabase;
  if (preserved)
    window.once(
      "ready-to-show",
      () =>
        void dialog.showMessageBox(window!, {
          type: "warning",
          title: "DriftFetch",
          message: "Your download history could not be read.",
          detail: `The database was damaged, so DriftFetch started with an empty history and default settings. The damaged file was kept so it can be recovered:\n\n${preserved}`,
        }),
    );
  popup = new CapturePopup(
    () => ({
      captures: store!.captures(),
      jobs: queue!.jobs,
      theme: queue!.settings.theme,
    }),
    () => {
      showWindow();
      window!.webContents.send("navigate", "captures");
    },
    (job) => collectionPreviews.thumbnail(job),
    (jobId, action) => {
      if (action === "cancel") queue!.action([jobId], "cancel");
      else {
        showWindow();
        window!.webContents.send("open-job", jobId);
      }
    },
  );
  handle("snapshot", snapshot);
  handle("refresh-formats", (id) => {
    if (typeof id !== "string") throw new Error("Invalid download.");
    return queue!.refreshFormats(id);
  });
  handle("backup", async (action, password) => {
    if (!["export", "restore"].includes(action) || typeof password !== "string")
      throw new Error("Invalid backup request.");
    if (backupBusy) throw new Error("Another backup operation is in progress.");
    backupBusy = true;
    try {
      if (action === "export") {
        const result = await dialog.showSaveDialog(window!, {
          title: "Save encrypted DriftFetch backup",
          defaultPath: `DriftFetch-${new Date().toISOString().slice(0, 10)}.currentbackup`,
          filters: [
            { name: "DriftFetch backup", extensions: ["currentbackup"] },
          ],
        });
        if (result.canceled || !result.filePath) return "Backup cancelled";
        const encrypted = await encryptBackup(
          queue!.settings,
          queue!.jobs,
          password,
        );
        const temp = result.filePath + `.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temp, encrypted, { flag: "wx" });
          await fs.rename(temp, result.filePath);
        } finally {
          await fs.unlink(temp).catch(() => {});
        }
        return "Encrypted backup saved. Keep its password safe.";
      }
      const result = await dialog.showOpenDialog(window!, {
        title: "Restore DriftFetch backup",
        properties: ["openFile"],
        filters: [{ name: "DriftFetch backup", extensions: ["currentbackup"] }],
      });
      if (result.canceled || !result.filePaths[0]) return "Restore cancelled";
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > maxBackupBytes + 100)
        throw new Error("Backup exceeds the size limit.");
      const restored = await decryptBackup(
        await fs.readFile(file),
        password,
        app.getPath("downloads"),
      );
      if (queue!.activeCount || queue!.maintenance || engine!.info.busy)
        throw new Error(
          "Pause downloads and wait for active work to stop before restoring.",
        );
      const existing = queue!.jobs;
      const merged = [...existing];
      for (const job of restored.jobs) {
        if (
          !merged.some(
            (j) =>
              j.id === job.id ||
              j.originalUrl === job.originalUrl ||
              (job.mediaKey && j.mediaKey === job.mediaKey),
          )
        )
          merged.push(job);
      }
      const settings = {
        ...restored.settings,
        launchAtLogin: queue!.settings.launchAtLogin,
      };
      // One transaction; existing entries are retained and imported pending work stays paused.
      const retained = merged.map((j) =>
        ["queued", "resolving", "review"].includes(j.status)
          ? {
              ...j,
              status: "paused" as const,
              retryAt: undefined,
              holdForReview: true,
            }
          : { ...j, retryAt: undefined },
      );
      store!.restore(settings, retained);
      queue!.jobs = retained;
      const previous = queue!.settings;
      queue!.settings = settings;
      await applySettings(previous, settings).catch(() => {});
      changed();
      return `Restored settings and ${merged.length - existing.length} entries. Existing history and sessions were kept; automatic downloading is off.`;
    } finally {
      backupBusy = false;
    }
  });
  handle("reorder", (id, beforeId, after) => {
    if (after !== undefined && typeof after !== "boolean")
      throw new Error("Invalid queue order.");
    if (
      typeof id !== "string" ||
      (beforeId !== undefined && typeof beforeId !== "string")
    )
      throw new Error("Invalid queue order.");
    queue!.reorder(id, beforeId, after);
  });
  handle("check-files", () => queue!.checkFiles());
  handle("undo-remove", () => queue!.restoreRemoved());
  handle("clear-history", async () => {
    const ids = queue!.jobs
      .filter((job) => finished.includes(job.status))
      .map((job) => job.id);
    queue!.removeIdle(ids);
  });
  handle("export-history", async (ids) => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
      throw new Error("Invalid history selection.");
    const selected = queue!.jobs.filter(
      (job) =>
        ["completed", "cancelled", "duplicate"].includes(job.status) &&
        (!ids.length || ids.includes(job.id)),
    );
    const result = await dialog.showSaveDialog(window!, {
      title: "Export DriftFetch history",
      defaultPath: `DriftFetch-history-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath) return "Export cancelled";
    // Titles come from remote sites; stop spreadsheets from running them as formulas.
    const quote = (value: unknown) =>
      `"${String(value ?? "")
        .replace(/^[=+\-@\t\r]/, "'$&")
        .replace(/"/g, '""')}"`;
    const rows = [
      ["Title", "Source", "Status", "Quality", "Completed", "File path"],
      ...selected.map((job) => [
        job.title,
        job.source,
        job.status,
        job.quality,
        job.status === "completed" ? new Date(job.updatedAt).toISOString() : "",
        job.filePath,
      ]),
    ];
    await fs.writeFile(
      result.filePath,
      rows.map((row) => row.map(quote).join(",")).join("\r\n"),
      "utf8",
    );
    return `Exported ${selected.length} history entr${selected.length === 1 ? "y" : "ies"}.`;
  });
  handle("clear-downloads", async () => {
    const ids = queue!.jobs
      .filter((job) =>
        ["queued", "review", "collection", "paused", "failed"].includes(
          job.status,
        ),
      )
      .map((job) => job.id);
    queue!.removeIdle(ids);
  });
  handle("locate-file", async (id) => {
    const job = queue!.jobs.find(
      (j) => j.id === id && j.status === "completed",
    );
    if (!job) throw new Error("Completed download not found.");
    const result = await dialog.showOpenDialog(window!, {
      title: "Locate the downloaded video",
      properties: ["openFile"],
      filters: [
        {
          name: "Videos",
          extensions: ["mp4", "mkv", "webm", "mov", "avi", "m4v", "ts"],
        },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return;
    const file = result.filePaths[0];
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error("Choose a video file.");
    if (!queue!.jobs.includes(job)) return;
    queue!.save(job, {
      filePath: file,
      targetDir: path.dirname(file),
      fileMissing: false,
    });
  });
  handle("set-format", (id, formatId) => {
    if (typeof id !== "string" || typeof formatId !== "string")
      throw new Error("Invalid format selection.");
    queue!.setFormat(id, formatId);
  });
  handle("clear-captures", () => {
    store!.clearCaptures();
    popup?.hide();
    changed();
  });
  handle("copy-diagnostic", async (id) => {
    const job = queue!.jobs.find((j) => j.id === id);
    if (!job) throw new Error("Download not found.");
    const sourceSession = store!
      .sessions()
      .find(
        (s) => job.source === s.domain || job.source.endsWith("." + s.domain),
      );
    await clipboard.writeText(
      diagnosticReport(
        job,
        app.getVersion(),
        engine!.info.version,
        sourceSession?.kind || "none",
      ),
    );
  });
  handle("app-action", async (action) => {
    if (action === "shortcut") return createShortcut();
    if (action !== "update") throw new Error("Unknown app action.");
    const installer = await chooseUpdate(window!);
    if (installer) {
      updateInstaller = installer;
      app.quit();
    }
  });
  handle("add-links", (text, review, groupName) => {
    if (review !== undefined && typeof review !== "boolean")
      throw new Error("Invalid review preference.");
    if (
      groupName !== undefined &&
      (typeof groupName !== "string" ||
        groupName.length > 70 ||
        /[<>:"/\\|?*\x00-\x1f]/.test(groupName))
    )
      throw new Error("Use a short group name without path separators.");
    const { added, duplicates, truncated } = queue!.addLinks(text, {
      review,
      groupName: groupName?.trim() || undefined,
    });
    return { added, duplicates, truncated };
  });
  handle("job-detail", (id) => queue!.jobs.find((job) => job.id === id));
  handle("job-thumbnail", (id) =>
    typeof id === "string"
      ? collectionPreviews.thumbnail(queue!.jobs.find((job) => job.id === id))
      : null,
  );
  handle("action", (ids, action) => queue!.action(ids, action));
  handle("collection", (id, ids) => queue!.selectCollection(id, ids));
  handle("collection-preview", (id, entryId) => {
    if (typeof id !== "string" || typeof entryId !== "string") return null;
    return collectionPreviews.load(
      queue!.jobs.find((job) => job.id === id),
      entryId,
    );
  });
  handle("cancel-collection-previews", (id) => {
    if (typeof id === "string") collectionPreviews.cancel(id);
  });
  handle("settings", async (patch) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw new Error("Invalid settings.");
    const next = validateSettings(queue!.settings, patch);
    if (next.launchAtLogin !== queue!.settings.launchAtLogin)
      app.setLoginItemSettings({
        openAtLogin: next.launchAtLogin,
        path: process.execPath,
      });
    if (next.clipboardWatch !== queue!.settings.clipboardWatch)
      tracker.read(await clipboard.readText(), false);
    const wasAutomatic = queue!.settings.autoDownload;
    const previous = queue!.settings;
    await applySettings(previous, next);
    queue!.settings = next;
    store!.saveSettings(next);
    if (!wasAutomatic && next.autoDownload)
      for (const job of queue!.jobs)
        if (job.status === "review" && !job.holdForReview)
          queue!.save(job, { status: "queued" });
    if (wasAutomatic && !next.autoDownload)
      for (const job of queue!.jobs)
        if (job.status === "queued") queue!.save(job, { status: "review" });
    changed();
    queue!.pump();
    void queue!.tick();
  });
  handle("choose-folder", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "Choose download folder",
      defaultPath: queue!.settings.downloadDir,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("choose-folder-watch", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "Choose watched link folder",
      defaultPath:
        queue!.settings.folderWatchDir || queue!.settings.downloadDir,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("open-licenses", async () => {
    // Packaged: resources/licenses holds LICENSE, THIRD-PARTY-NOTICES.md and SOURCE-OFFER.md.
    const dir = app.isPackaged
      ? path.join(process.resourcesPath, "licenses")
      : app.getAppPath();
    if (await shell.openPath(dir))
      throw new Error("Could not open the licence folder.");
  });
  handle("open-folder", async (id) => {
    const job = id ? queue!.jobs.find((j) => j.id === id) : undefined;
    if (id && !job) throw new Error("Download not found.");
    if (job?.filePath && existsSync(job.filePath))
      shell.showItemInFolder(job.filePath);
    else {
      const dir = job?.targetDir || queue!.settings.downloadDir;
      await fs.mkdir(dir, { recursive: true });
      const error = await shell.openPath(dir);
      if (error) throw new Error("Could not open the download folder.");
    }
  });
  // Only media is opened with the default app; anything else could be a program.
  handle("open-file", async (id) => {
    const job = queue!.jobs.find((j) => j.id === id);
    if (!job?.filePath || !existsSync(job.filePath))
      throw new Error("The saved file could not be found.");
    if (
      /\.(?:mp4|m4v|mkv|webm|mov|avi|mp3|m4a|opus|ogg|flac|wav|jpe?g|png|gif|webp|avif)$/i.test(
        job.filePath,
      )
    ) {
      if (await shell.openPath(job.filePath))
        throw new Error("Could not open the file.");
    } else shell.showItemInFolder(job.filePath);
  });
  handle("open-source", async (id) => {
    const job = queue!.jobs.find((j) => j.id === id);
    const url = job && normalizeUrl(job.resolvedUrl || job.originalUrl);
    if (!url) throw new Error("This download has no source page.");
    await shell.openExternal(url);
  });
  handle("chrome-session", async (domain, profile) => {
    await sessions!.setChrome(domain, profile);
    changed();
  });
  handle("import-session", async (domain) => {
    domain = validateDomain(domain);
    const result = await dialog.showOpenDialog(window!, {
      title: "Import cookies for this source",
      filters: [{ name: "Cookie file", extensions: ["txt"] }],
      properties: ["openFile"],
    });
    if (result.canceled) return false;
    await sessions!.importFile(domain, result.filePaths[0]);
    changed();
    return true;
  });
  handle("browser-session", async (domain) => {
    domain = validateDomain(domain);
    const login = new BrowserWindow({
      parent: window,
      width: 520,
      height: 760,
      title: `Sign in · ${domain}`,
      icon: windowIcon(),
      autoHideMenuBar: true,
      webPreferences: {
        partition: accountsPartition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const closed = new Promise<void>((resolve) =>
      login.once("closed", () => resolve()),
    );
    login.loadURL(`https://${domain}/`).catch(() => {});
    await closed;
    await sessions!.saveBrowser(domain);
    changed();
  });
  handle("save-account", async (domain, values) => {
    if (typeof domain !== "string") throw new Error("Choose a source domain.");
    domain = validateDomain(domain);
    const account = extensions!.forDomain(domain)?.account;
    if (!account)
      throw new Error(
        "Enable an extension that supports accounts for this domain first.",
      );
    await sessions!.saveCredentials(
      domain,
      account.kind,
      account.fields,
      values,
    );
    changed();
  });
  handle("import-extension", async () => {
    // From source, open where `build-extension` writes its files.
    const folder = path.join(app.getAppPath(), "local-extensions");
    const defaultPath = app.isPackaged
      ? undefined
      : await fs.access(folder).then(() => folder, () => undefined);
    const chosen = await dialog.showOpenDialog(window!, {
      title: "Add an optional DriftFetch extension",
      defaultPath,
      properties: ["openFile"],
      filters: [
        { name: "DriftFetch extension", extensions: ["current-extension"] },
      ],
    });
    if (chosen.canceled || !chosen.filePaths[0]) return false;
    const file = chosen.filePaths[0];
    if ((await fs.stat(file)).size > 2_000_000)
      throw new Error("Extension exceeds the 2 MB limit.");
    const text = await fs.readFile(file, "utf8");
    await extensions!.install(text);
    changed();
    return true;
  });
  handle("extension-action", async (id, action) => {
    if (
      typeof id !== "string" ||
      !["enable", "disable", "remove"].includes(action)
    )
      throw new Error("Invalid extension action.");
    if (queue!.activeCount || queue!.maintenance)
      throw new Error(
        "Pause active work and wait for link analysis to finish before changing extensions.",
      );
    const extension = extensions!.list().find((e) => e.id === id);
    if (!extension) throw new Error("Extension not found.");
    queue!.maintenance = true;
    try {
      if (action === "enable" && !extension.enabled) {
        const choice = await dialog.showMessageBox(window!, {
          type: "warning",
          title: "Enable extension?",
          message: `Enable ${extension.name} (${extension.version})?`,
          detail: `Domains: ${extension.domains.join(", ")}\n\nThe extension runs in a restricted process: it cannot read or change your files or start programs. It can use the network and receives the saved login or API details for these domains, so only enable extensions from authors you trust.`,
          buttons: ["Cancel", "Enable extension"],
          defaultId: 0,
          cancelId: 0,
        });
        if (choice.response !== 1) return;
      }
      await extensions!.action(id, action);
      changed();
    } finally {
      queue!.maintenance = false;
      queue!.pump();
    }
  });
  handle("remove-session", async (domain) => {
    await sessions!.remove(domain);
    changed();
  });
  handle("engine-action", async (action) => {
    if (!["update", "rollback"].includes(action))
      throw new Error("Invalid engine action.");
    if (queue!.activeCount || queue!.maintenance)
      throw new Error(
        "Pause active downloads and wait for link analysis to finish before changing the engine.",
      );
    queue!.maintenance = true;
    try {
      if (action === "update") await engine!.update();
      else await engine!.rollback();
    } finally {
      queue!.maintenance = false;
      queue!.pump();
    }
  });
  handle("window-maximized", () => window!.isMaximized());
  handle("window-action", (action) => {
    if (action === "minimize") window!.minimize();
    else if (action === "maximize")
      window!.isMaximized() ? window!.unmaximize() : window!.maximize();
    else if (action === "close") window!.close();
    else if (action === "quit") app.quit();
  });
  const icon = nativeImage.createFromPath(appIcon());
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip("DriftFetch — download manager");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open DriftFetch", click: showWindow },
      {
        label: "Pause all downloads",
        click: () => {
          void queue!.action(
            queue!.jobs
              .filter((j) =>
                ["queued", "downloading", "processing", "resolving"].includes(
                  j.status,
                ),
              )
              .map((j) => j.id),
            "pause",
          );
        },
      },
      { type: "separator" },
      { label: "Quit DriftFetch", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", showWindow);
  if (devUrl) await window.loadURL(devUrl);
  else
    await window.loadURL(
      pathToFileURL(path.join(app.getAppPath(), "dist", "index.html")).href,
    );
  // Re-arm the watcher once its folder is reachable again.
  setInterval(() => {
    if (watchedFolder && !folderWatcher && !quitting)
      void configureFolderWatch(watchedFolder);
  }, 60_000).unref();
  clipboardTimer = setInterval(async () => {
    try {
      const links = tracker.read(
        await clipboard.readText(),
        queue!.settings.clipboardWatch,
      );
      if (links.length) {
        const before = new Set(store!.captures().map((c) => c.id));
        queue!.addLinks(links.join("\n"), { origin: "clipboard" });
        if (queue!.settings.captureNotifications && !window!.isFocused())
          popup!.show(
            store!
              .captures()
              .filter((c) => !before.has(c.id))
              .map((c) => c.id),
          );
      }
    } catch {
      /* Clipboard may briefly be locked by another application. */
    }
  }, 800);
  queue.pump();
  await fs.writeFile(
    path.join(userData, "running-version.json"),
    JSON.stringify({ version: app.getVersion() }),
  );
  if (app.isPackaged && !process.env.CURRENT_USER_DATA) {
    try {
      createShortcut();
    } catch {
      /* Shortcut can also be created from Settings. */
    }
  }
}
async function start() {
  const request = () =>
    app.requestSingleInstanceLock({ version: app.getVersion() });
  if (!request()) {
    const current = await fs
      .readFile(
        path.join(app.getPath("userData"), "running-version.json"),
        "utf8",
      )
      .then(JSON.parse)
      .catch(() => null);
    if (current && isNewer(app.getVersion(), current.version)) {
      let acquired = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (request()) {
          acquired = true;
          break;
        }
      }
      if (!acquired) {
        await app.whenReady();
        dialog.showErrorBox(
          "DriftFetch is still closing",
          "Wait for DriftFetch to finish saving its downloads, then open the update again.",
        );
        app.exit(0);
        return;
      }
    } else {
      if (!current) {
        await app.whenReady();
        dialog.showErrorBox(
          "An older DriftFetch is running",
          "Choose Settings → Advanced → Quit DriftFetch in the existing app, then open this version again.",
        );
      }
      app.exit(0);
      return;
    }
  }
  app.on("second-instance", (_event, _argv, _cwd, data) => {
    if (
      data &&
      typeof data === "object" &&
      "version" in data &&
      typeof data.version === "string" &&
      isNewer(data.version, app.getVersion())
    )
      app.quit();
    else showWindow();
  });
  // Same id as the installer's shortcut, so the taskbar shows DriftFetch's icon, not Electron's, when run from source.
  app.setAppUserModelId(appUserModelId);
  app
    .whenReady()
    .then(init)
    .catch((err) => {
      dialog.showErrorBox(
        "DriftFetch could not start",
        err instanceof Error ? err.message : "Unknown startup error",
      );
      app.exit(1);
    });
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    folderWatcher?.close();
    if (clipboardTimer) clearInterval(clipboardTimer);
    if (broadcastTimer) clearTimeout(broadcastTimer);
    // A failing step must not leave a windowless process holding the instance lock.
    setTimeout(() => app.exit(0), 15_000).unref();
    void (async () => {
      for (const step of [
        () => queue?.shutdown(),
        () => extensions?.shutdown(),
        () => popup?.destroy(),
        () => sessions?.cleanOrphans(),
        () => store?.close(),
        () => tray?.destroy(),
      ])
        try {
          await step();
        } catch {
          // Keep shutting down.
        }
      quitReady = true;
      if (updateInstaller) {
        try {
          await new Promise<void>((resolve, reject) => {
            const child = spawn(updateInstaller!, [], {
              shell: false,
              detached: true,
              stdio: "ignore",
            });
            child.once("error", reject);
            child.once("spawn", () => {
              child.unref();
              resolve();
            });
          });
        } catch {
          dialog.showErrorBox(
            "Could not start the update",
            "Your download state has been saved. Open the DriftFetch installer manually to complete the update.",
          );
        }
      }
      app.quit();
    })();
  });
}
void start();
