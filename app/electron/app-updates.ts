import { app, dialog, shell, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
export function isNewer(a: string, b: string) {
  if (!/^\d+\.\d+\.\d+$/.test(a) || !/^\d+\.\d+\.\d+$/.test(b)) return false;
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}
/** Windows groups taskbar icons and shortcuts by this id, so the installer, shortcut and running app must share it. */
export const packagedAppUserModelId = "local.driftfetch.app";
export function createShortcut(target = process.execPath) {
  if (!app.isPackaged)
    throw new Error("Shortcuts are available in the packaged app.");
  if (
    !shell.writeShortcutLink(
      path.join(app.getPath("desktop"), "DriftFetch.lnk"),
      "create",
      {
        target,
        cwd: path.dirname(target),
        description: "DriftFetch download manager",
        appUserModelId: packagedAppUserModelId,
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
  await verifyInstaller(file);
  return file;
}
/** Checks the installer against the .sha256 file beside it. Run again right before launching it. */
export async function verifyInstaller(file: string): Promise<void> {
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
}

const releaseApi =
  "https://api.github.com/repos/multimccp00/driftfetch/releases/latest";
/** Only files attached to this project's own releases are ever downloaded. */
const assetUrl =
  /^https:\/\/github\.com\/multimccp00\/driftfetch\/releases\/download\/[^/]+\/[^/]+$/;
const maxInstallerBytes = 1_000_000_000;
export interface AppUpdate {
  version: string;
  installer: string;
  checksum: string;
}
/** Looks for a newer published release that carries an installer and its .sha256 file. */
export async function findUpdate(
  current: string,
  signal: AbortSignal,
  get: typeof fetch = fetch,
): Promise<AppUpdate | undefined> {
  const response = await get(releaseApi, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "DriftFetch",
    },
    signal,
  });
  if ([403, 429].includes(response.status))
    throw new Error(
      "GitHub's limit on update checks was reached. Try again in about an hour.",
    );
  if (!response.ok)
    throw new Error(`Update check returned HTTP ${response.status}.`);
  const release = await response.json();
  if (release?.draft || release?.prerelease) return;
  const version = String(release?.tag_name ?? "").replace(/^v/, "");
  if (!isNewer(version, current)) return;
  const name = `DriftFetch-Setup-${version}-x64.exe`;
  const url = (file: string): string | undefined => {
    const found = (release.assets as any[])?.find((a) => a?.name === file);
    return typeof found?.browser_download_url === "string" &&
      assetUrl.test(found.browser_download_url)
      ? found.browser_download_url
      : undefined;
  };
  const installer = url(name),
    checksum = url(name + ".sha256");
  return installer && checksum ? { version, installer, checksum } : undefined;
}
/** Downloads the installer and its checksum into `dir`, checks them, and returns the installer path. */
export async function downloadUpdate(
  update: AppUpdate,
  dir: string,
  signal: AbortSignal,
  get: typeof fetch = fetch,
): Promise<string> {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `DriftFetch-Setup-${update.version}-x64.exe`);
  for (const [url, target, limit] of [
    [update.checksum, file + ".sha256", 1_000],
    [update.installer, file, maxInstallerBytes],
  ] as const) {
    const response = await get(url, { signal });
    if (!response.ok || !response.body)
      throw new Error(`Update download returned HTTP ${response.status}.`);
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("The update file is larger than expected.");
    await pipeline(
      Readable.fromWeb(response.body as any),
      createWriteStream(target),
      { signal },
    );
  }
  await verifyInstaller(file);
  return file;
}
