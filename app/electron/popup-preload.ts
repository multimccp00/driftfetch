import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("capturePopup", {
  action: (action: string) => ipcRenderer.send("popup-action", action),
  subscribe: (listener: (state: unknown) => void) => {
    const fn = (_event: unknown, state: unknown) => listener(state);
    ipcRenderer.on("popup-state", fn);
    ipcRenderer.send("popup-ready");
    return () => ipcRenderer.removeListener("popup-state", fn);
  },
});
