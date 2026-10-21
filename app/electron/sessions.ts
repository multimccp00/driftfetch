import {
  privateSessionSuffix,
  sessionKey,
  type AccountField,
} from "../src/shared";
import { validateAccountValues } from "./account-fields";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeStorage, session, type Cookie } from "electron";
import { domainOf, validateDomain } from "./core";
import { Store } from "./store";
/** Cookie storage of DriftFetch's own sign-in window, kept across restarts. */
export const accountsPartition = "persist:accounts";
/** The private-profiles sign-in keeps its own cookies, so both accounts stay signed in. */
export const privateAccountsPartition = "persist:accounts-private";
export const partitionFor = (isPrivate: boolean) =>
  isPrivate ? privateAccountsPartition : accountsPartition;
/** Splits a session key (see sessionKey) into its domain and slot. */
export function parseSessionKey(key: string) {
  const isPrivate = key.endsWith(privateSessionSuffix);
  return {
    domain: validateDomain(
      isPrivate ? key.slice(0, -privateSessionSuffix.length) : key,
    ),
    isPrivate,
  };
}
/**
 * The sign-in window's user agent as Chrome itself would send it: no app or
 * Electron token (sites refuse embedded browsers) and Chrome's reduced
 * "major.0.0.0" version. The engines send the same one, so the session does
 * not look like it moved to another browser.
 */
export const browserUserAgent = (electronAgent: string) =>
  electronAgent
    .replace(/\s(?:DriftFetch|driftfetch|Electron)\/\S+/g, "")
    .replace(/Chrome\/(\d+)[\d.]*/, "Chrome/$1.0.0.0");
/** The user agent of the installed Chrome, which a Chrome-profile session came from. */
export async function chromeUserAgent(): Promise<string | undefined> {
  try {
    const { stdout } = await promisify(execFile)("reg", [
      "query",
      "HKCU\\Software\\Google\\Chrome\\BLBeacon",
      "/v",
      "version",
    ]);
    const major = /version\s+REG_SZ\s+(\d+)\./.exec(stdout)?.[1];
    return major
      ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
      : undefined;
  } catch {
    return;
  }
}
export function netscapeCookies(cookies: Cookie[]): string {
  return (
    "# Netscape HTTP Cookie File\n" +
    cookies
      .filter((c) => c.domain && !/[\t\r\n]/.test(c.name + c.value))
      .map((c) =>
        [
          c.domain,
          c.hostOnly ? "FALSE" : "TRUE",
          c.path || "/",
          c.secure ? "TRUE" : "FALSE",
          Math.floor(c.expirationDate || 0),
          c.name,
          c.value,
        ].join("\t"),
      )
      .join("\n")
  );
}
export function filterCookies(text: string, domain: string): string {
  if (
    text.length > 5_000_000 ||
    !/^# (?:Netscape )?HTTP Cookie File/.test(text.replace(/^\uFEFF/, ""))
  )
    throw new Error("Choose a Netscape-format cookies.txt file.");
  const lines = text.split(/\r?\n/).filter((line) => {
    if (
      !line.trim() ||
      (line.startsWith("#") && !line.startsWith("#HttpOnly_"))
    )
      return false;
    const fields = line.replace(/^#HttpOnly_/, "").split("\t");
    const host = fields[0]?.replace(/^\./, "").toLowerCase();
    return (
      fields.length === 7 && (host === domain || host.endsWith("." + domain))
    );
  });
  if (!lines.length)
    throw new Error(
      "This file contains no cookies for the specified source domain.",
    );
  return "# Netscape HTTP Cookie File\r\n" + lines.join("\r\n") + "\r\n";
}
export class Sessions {
  constructor(
    private store: Store,
    private temp: string,
  ) {}
  async profiles(): Promise<string[]> {
    try {
      const folder = path.join(
        process.env.LOCALAPPDATA || "",
        "Google",
        "Chrome",
        "User Data",
      );
      return (await fs.readdir(folder, { withFileTypes: true }))
        .filter(
          (e) => e.isDirectory() && /^(Default|Profile \d+)$/.test(e.name),
        )
        .map((e) => e.name);
    } catch {
      return [];
    }
  }
  async setChrome(key: string, profile: string) {
    const { domain, isPrivate } = parseSessionKey(key);
    if (!(await this.profiles()).includes(profile))
      throw new Error("Choose an available Chrome profile.");
    this.store.saveSession({
      domain,
      kind: "chrome",
      profile,
      private: isPrivate || undefined,
      updatedAt: Date.now(),
    });
  }
  private browser(isPrivate: boolean) {
    return session.fromPartition(partitionFor(isPrivate));
  }
  private async browserCookies(
    domain: string,
    isPrivate: boolean,
  ): Promise<string> {
    try {
      return filterCookies(
        netscapeCookies(await this.browser(isPrivate).cookies.get({})),
        domain,
      );
    } catch {
      throw new Error("Session unavailable");
    }
  }
  async saveBrowser(key: string) {
    const { domain, isPrivate } = parseSessionKey(key);
    await this.browserCookies(domain, isPrivate).catch(() => {
      throw new Error(
        "No sign-in was found for this site. Log in in the window, then close it.",
      );
    });
    this.store.saveSession({
      domain,
      kind: "browser",
      private: isPrivate || undefined,
      updatedAt: Date.now(),
    });
  }
  /** Whether the site has a private-profiles sign-in to fall back on. */
  hasPrivate(source: string | undefined) {
    return this.store
      .sessions()
      .some(
        (s) =>
          s.private &&
          !!source &&
          (source === s.domain || source.endsWith("." + s.domain)),
      );
  }
  async saveCredentials(
    domain: string,
    kind: "api" | "credentials",
    fields: AccountField[],
    values: unknown,
  ) {
    domain = validateDomain(domain);
    const checked = validateAccountValues(fields, values, kind);
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows credential encryption is unavailable.");
    this.store.saveSession(
      { domain, kind, updatedAt: Date.now() },
      safeStorage.encryptString(JSON.stringify(checked)),
    );
  }
  async credentialsFor(
    domain: string,
    fields: AccountField[],
  ): Promise<Record<string, string>> {
    domain = validateDomain(domain);
    const info = this.store
      .sessions()
      .find((s) => s.domain === domain && !s.private);
    const secret = this.store.sessionSecret(domain);
    if (
      !info ||
      !["api", "credentials"].includes(info.kind) ||
      !secret ||
      !safeStorage.isEncryptionAvailable()
    )
      throw new Error("API credentials are unavailable.");
    try {
      return validateAccountValues(
        fields,
        JSON.parse(safeStorage.decryptString(secret)),
        info.kind === "api" ? "api" : "credentials",
      );
    } catch {
      throw new Error("API credentials are invalid.");
    }
  }
  async remove(key: string) {
    const { domain, isPrivate } = parseSessionKey(key);
    if (
      this.store
        .sessions()
        .find((s) => s.domain === domain && !!s.private === isPrivate)
        ?.kind === "browser"
    ) {
      const browser = this.browser(isPrivate);
      for (const c of await browser.cookies.get({})) {
        const host = c.domain!.replace(/^\./, "");
        if (host === domain || host.endsWith("." + domain))
          await browser.cookies.remove(
            `https://${host}${c.path || "/"}`,
            c.name,
          );
      }
    }
    this.store.removeSession(key);
  }
  async importFile(key: string, filename: string) {
    const { domain, isPrivate } = parseSessionKey(key);
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows credential encryption is unavailable.");
    const size = (await fs.stat(filename)).size;
    if (size > 5_000_000) throw new Error("Cookie file is too large.");
    const filtered = filterCookies(await fs.readFile(filename, "utf8"), domain);
    this.store.saveSession(
      {
        domain,
        kind: "file",
        private: isPrivate || undefined,
        updatedAt: Date.now(),
      },
      safeStorage.encryptString(filtered),
    );
  }
  /**
   * Engine arguments for the saved sign-in: its cookies and, where the browser
   * is known, that browser's user agent. `--user-agent` means the same to
   * yt-dlp and gallery-dl.
   */
  async argumentsFor(
    url: string,
    usePrivate = false,
  ): Promise<{ args: string[]; cleanup(): Promise<void> }> {
    const domain = domainOf(url);
    const info = this.store
      .sessions()
      .filter(
        (s) =>
          !!s.private === usePrivate &&
          (domain === s.domain || domain.endsWith("." + s.domain)),
      )
      .sort((a, b) => b.domain.length - a.domain.length)[0];
    if (!info) return { args: [], cleanup: async () => {} };
    if (info.kind === "api" || info.kind === "credentials")
      return { args: [], cleanup: async () => {} };
    if (info.kind === "chrome") {
      const agent = await chromeUserAgent();
      return {
        args: [
          "--cookies-from-browser",
          `chrome:${info.profile}`,
          ...(agent ? ["--user-agent", agent] : []),
        ],
        cleanup: async () => {},
      };
    }
    let text: string;
    if (info.kind === "browser")
      text = await this.browserCookies(info.domain, usePrivate);
    else {
      const secret = this.store.sessionSecret(sessionKey(info));
      if (!secret || !safeStorage.isEncryptionAvailable())
        throw new Error("Session unavailable");
      text = safeStorage.decryptString(secret);
    }
    await fs.mkdir(this.temp, { recursive: true });
    const file = path.join(this.temp, `${randomUUID()}.txt`);
    await fs.writeFile(file, text, {
      mode: 0o600,
    });
    return {
      args: [
        "--cookies",
        file,
        // Imported files come from an unknown browser: the engine's own agent stays.
        ...(info.kind === "browser"
          ? [
              "--user-agent",
              browserUserAgent(this.browser(usePrivate).getUserAgent()),
            ]
          : []),
      ],
      cleanup: async () => {
        await fs.rm(file, { force: true });
      },
    };
  }
  async cleanOrphans() {
    await fs.mkdir(this.temp, { recursive: true });
    for (const file of await fs.readdir(this.temp))
      if (/^[a-f0-9-]+\.txt$/.test(file))
        await fs.rm(path.join(this.temp, file), { force: true });
  }
}
