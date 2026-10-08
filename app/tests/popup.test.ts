import { expect, it, vi } from "vitest";

// A stand-in for Electron: just enough window and IPC for the popup's own logic.
const handlers = new Map<string, (event: unknown, action: unknown) => void>();
const sent: { channel: string; payload: any }[] = [];
const webContents = {
  mainFrame: {},
  send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
  setWindowOpenHandler: () => {},
  on: () => {},
  loadURL: () => {},
};
vi.mock("electron", () => ({
  app: { isPackaged: true, getAppPath: () => "." },
  screen: {
    getDisplayNearestPoint: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  },
  ipcMain: { on: (name: string, fn: any) => handlers.set(name, fn) },
  BrowserWindow: class {
    webContents = webContents;
    once(_event: string, fn: () => void) {
      fn();
    }
    loadFile() {}
    loadURL() {}
    isDestroyed = () => false;
    isVisible = () => true;
    setPosition() {}
    showInactive() {}
    hide() {}
    destroy() {}
  },
}));
const { CapturePopup } = await import("../electron/popup");

const job = (id: string, status = "downloading") =>
  ({ id, title: id, status, source: "example.com" }) as any;
function make() {
  const acted: [string, string][] = [];
  const opened = vi.fn();
  const popup = new CapturePopup(
    () => ({
      captures: [
        { id: "c1", jobId: "j1", source: "example.com", duplicate: false },
        { id: "c2", jobId: "j2", source: "example.com", duplicate: false },
      ] as any,
      jobs: [job("j1"), job("j2")],
      theme: "dark",
    }),
    opened,
    async () => "data:image/png;base64,AAAA",
    (id, action) => acted.push([id, action]),
  );
  popup.show(["c1"]);
  const act = (action: unknown) =>
    handlers.get("popup-action")!(
      { sender: webContents, senderFrame: webContents.mainFrame },
      action,
    );
  return { acted, opened, act };
}

it("passes the job, a thumbnail and the theme to the window", async () => {
  sent.length = 0;
  make();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const state = sent.filter((m) => m.channel === "popup-state").at(-1)!.payload;
  expect(state.theme).toBe("dark");
  expect(state.items[0]).toMatchObject({
    jobId: "j1",
    thumbnail: "data:image/png;base64,AAAA",
  });
});
it("acts only on a download the popup is showing", () => {
  const { acted, act } = make();
  act("choose:j1");
  act("cancel:j1");
  // j2 is a real download, but this popup is not showing it.
  act("cancel:j2");
  act("cancel:nope");
  act(42);
  expect(acted).toEqual([
    ["j1", "choose"],
    ["j1", "cancel"],
  ]);
});
it("still opens the app and ignores messages from other windows", () => {
  const { opened, act } = make();
  act("open");
  expect(opened).toHaveBeenCalledOnce();
  handlers.get("popup-action")!({ sender: {}, senderFrame: {} }, "open");
  expect(opened).toHaveBeenCalledOnce();
});
