import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import type { Capture, Job } from "../src/shared";
export class CapturePopup {
  private window?: BrowserWindow;
  private ids: string[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private dismissed = false;
  private hovering = false;
  /** Thumbnails by job id; null once a load failed, so it is not asked again. */
  private thumbs = new Map<string, string | null>();
  constructor(
    private data: () => { captures: Capture[]; jobs: Job[]; theme: string },
    private open: () => void,
    private thumbnail: (job: Job) => Promise<string | null>,
    private act: (jobId: string, action: "choose" | "cancel") => void,
  ) {
    ipcMain.on("popup-action", (event, action) => {
      if (
        event.sender !== this.window?.webContents ||
        event.senderFrame !== this.window.webContents.mainFrame
      )
        return;
      if (typeof action !== "string") return;
      const [verb, jobId] = action.split(":");
      if (
        (verb === "choose" || verb === "cancel") &&
        // Only a job this popup is showing can be acted on.
        this.data().captures.some(
          (c) => this.ids.includes(c.id) && c.jobId === jobId,
        )
      ) {
        this.act(jobId, verb);
        this.hide();
      } else if (action === "open") {
        this.open();
        this.hide();
      } else if (action === "dismiss") this.hide();
      else if (action === "hover") {
        this.hovering = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
      } else if (action === "leave") {
        this.hovering = false;
        this.refresh();
      }
    });
    ipcMain.on("popup-ready", (event) => {
      if (
        event.sender === this.window?.webContents &&
        event.senderFrame === this.window.webContents.mainFrame
      )
        this.refresh();
    });
  }
  show(ids: string[]) {
    this.ids = [
      ...new Set([...ids, ...(this.window?.isVisible() ? this.ids : [])]),
    ].slice(0, 20);
    this.dismissed = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        width: 340,
        height: 330,
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: false,
        backgroundColor: "#11151f",
        title: "DriftFetch — link capture",
        webPreferences: {
          preload: path.join(__dirname, "popup-preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.window.webContents.on("will-navigate", (e) => e.preventDefault());
      this.window.once("ready-to-show", () => {
        if (!this.dismissed) {
          this.position();
          this.window?.showInactive();
          this.refresh();
        }
      });
      const dev = !app.isPackaged ? process.env.CURRENT_DEV_URL : undefined;
      void (dev
        ? this.window.loadURL(new URL("popup.html", dev).href)
        : this.window.loadFile(
            path.join(app.getAppPath(), "dist", "popup.html"),
          ));
    } else {
      this.position();
      this.window.showInactive();
      this.refresh();
    }
  }
  private position() {
    const area = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    this.window?.setPosition(
      area.x + area.width - 356,
      area.y + area.height - 346,
    );
  }
  refresh() {
    if (!this.window || this.window.isDestroyed() || this.dismissed) return;
    const data = this.data();
    const captures = this.ids
      .map((id) => data.captures.find((c) => c.id === id))
      .filter((c): c is Capture => !!c);
    const items = captures.map((c) => {
      const j = data.jobs.find((j) => j.id === c.jobId);
      if (j && !this.thumbs.has(j.id)) {
        this.thumbs.set(j.id, null);
        void this.thumbnail(j).then((image) => {
          if (!image) return;
          this.thumbs.set(j.id, image);
          this.refresh();
        });
      }
      return {
        id: c.id,
        jobId: j?.id,
        thumbnail: (j && this.thumbs.get(j.id)) || undefined,
        source: c.source,
        title: j?.title || "Video link",
        status: c.duplicate ? "duplicate" : j?.status || "removed",
        collectionKind: j?.collectionKind,
        quality: j?.quality,
      };
    });
    const checking = items.some((i) => i.status === "resolving");
    this.window.webContents.send("popup-state", {
      items,
      checking,
      theme: data.theme,
    });
    if (this.window.isVisible() && !this.timer && !this.hovering)
      this.timer = setTimeout(() => this.hide(), 5000);
  }
  hide() {
    this.dismissed = true;
    this.hovering = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.window?.hide();
  }
  destroy() {
    this.hide();
    this.window?.destroy();
  }
}
