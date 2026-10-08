import { app, dialog, shell, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
export function isNewer(a: string, b: string) {
  if (!/^\d+\.\d+\.\d+$/.test(a) || !/^\d+\.\d+\.\d+$/.test(b)) return false;
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}
export function createShortcut() {
  if (!app.isPackaged)
    throw new Error("Shortcuts are available in the packaged app.");
  if (
    !shell.writeShortcutLink(
      path.join(app.getPath("desktop"), "DriftFetch.lnk"),
      "create",
      {
        target: process.execPath,
        cwd: path.dirname(process.execPath),
        description: "DriftFetch download manager",
        appUserModelId: "local.current.downloader",
      },
    )
  )
    throw new Error("Could not create the desktop shortcut.");
}
export async function chooseUpdate(
  window: BrowserWindow,
): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(window, {
    title: "Choose a DriftFetch update installer",
    filters: [{ name: "DriftFetch installer", extensions: ["exe"] }],
    properties: ["openFile"],
  });
  if (result.canceled) return;
  const file = result.filePaths[0];
  const match = /^DriftFetch-Setup-(\d+\.\d+\.\d+)-x64\.exe$/.exec(
    path.basename(file),
  );
  if (!match || !isNewer(match[1], app.getVersion()))
    throw new Error("Choose a newer DriftFetch x64 installer.");
  const expected = (await fs.readFile(file + ".sha256", "utf8").catch(() => ""))
    .trim()
    .split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected))
    throw new Error(
      "Keep the installer's .sha256 file beside it so DriftFetch can check the update.",
    );
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex").toLowerCase() !== expected.toLowerCase())
    throw new Error(
      "The installer checksum does not match. Obtain a fresh update.",
    );
  return file;
}
