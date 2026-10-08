import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI, Snapshot } from "../src/shared";
const api: DesktopAPI = {
  refreshFormats: (id) => ipcRenderer.invoke("refresh-formats", id),
  backup: (action, password) => ipcRenderer.invoke("backup", action, password),
  reorder: (id, beforeId, after) =>
    ipcRenderer.invoke("reorder", id, beforeId, after),
  checkFiles: () => ipcRenderer.invoke("check-files"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  exportHistory: (ids) => ipcRenderer.invoke("export-history", ids),
  clearDownloads: () => ipcRenderer.invoke("clear-downloads"),
  undoRemove: () => ipcRenderer.invoke("undo-remove"),
  locateFile: (id) => ipcRenderer.invoke("locate-file", id),
  setFormat: (id, formatId) => ipcRenderer.invoke("set-format", id, formatId),
  copyDiagnostic: (id) => ipcRenderer.invoke("copy-diagnostic", id),
  clearCaptures: () => ipcRenderer.invoke("clear-captures"),
  appAction: (action) => ipcRenderer.invoke("app-action", action),
  onNavigate: (listener) => {
    const fn = (_e: unknown, page: "downloads" | "captures") => listener(page);
    ipcRenderer.on("navigate", fn);
    return () => ipcRenderer.removeListener("navigate", fn);
  },
  onOpenJob: (listener: (id: string) => void) => {
    const fn = (_e: unknown, id: string) => listener(id);
    ipcRenderer.on("open-job", fn);
    return () => ipcRenderer.removeListener("open-job", fn);
  },
  isMaximized: () => ipcRenderer.invoke("window-maximized"),
  onMaximized: (listener: (maximized: boolean) => void) => {
    const fn = (_e: unknown, maximized: boolean) => listener(maximized);
    ipcRenderer.on("maximized", fn);
    return () => ipcRenderer.removeListener("maximized", fn);
  },
  snapshot: () => ipcRenderer.invoke("snapshot"),
  jobDetail: (id: string) => ipcRenderer.invoke("job-detail", id),
  jobThumbnail: (id: string) => ipcRenderer.invoke("job-thumbnail", id),
  addLinks: (text, review, groupName) =>
    ipcRenderer.invoke("add-links", text, review, groupName),
  action: (ids, action) => ipcRenderer.invoke("action", ids, action),
  selectCollection: (id, ids) => ipcRenderer.invoke("collection", id, ids),
  previewCollectionEntry: (id, entryId) =>
    ipcRenderer.invoke("collection-preview", id, entryId),
  cancelCollectionPreviews: (id) =>
    ipcRenderer.invoke("cancel-collection-previews", id),
  settings: (patch) => ipcRenderer.invoke("settings", patch),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  chooseFolderWatch: () => ipcRenderer.invoke("choose-folder-watch"),
  openFolder: (id) => ipcRenderer.invoke("open-folder", id),
  openFile: (id) => ipcRenderer.invoke("open-file", id),
  openSource: (id) => ipcRenderer.invoke("open-source", id),
  openLicenses: () => ipcRenderer.invoke("open-licenses"),
  chromeSession: (domain, profile) =>
    ipcRenderer.invoke("chrome-session", domain, profile),
  importSession: (domain) => ipcRenderer.invoke("import-session", domain),
  browserSession: (domain) => ipcRenderer.invoke("browser-session", domain),
  saveAccount: (domain, values) =>
    ipcRenderer.invoke("save-account", domain, values),
  importExtension: () => ipcRenderer.invoke("import-extension"),
  extensionAction: (id, action) =>
    ipcRenderer.invoke("extension-action", id, action),
  removeSession: (domain) => ipcRenderer.invoke("remove-session", domain),
  engineAction: (action) => ipcRenderer.invoke("engine-action", action),
  windowAction: (action) => ipcRenderer.invoke("window-action", action),
  subscribe: (listener) => {
    const handler = (_event: unknown, data: Snapshot) => listener(data);
    ipcRenderer.on("state", handler);
    return () => ipcRenderer.removeListener("state", handler);
  },
};
contextBridge.exposeInMainWorld("current", api);
