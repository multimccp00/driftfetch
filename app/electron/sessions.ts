import type { AccountField } from "../src/shared";
import { validateAccountValues } from "./account-fields";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeStorage, session, type Cookie } from "electron";
import { domainOf, validateDomain } from "./core";
import { Store } from "./store";
/** Cookie storage of DriftFetch's own sign-in window, kept across restarts. */
export const accountsPartition = "persist:accounts";
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
  async setChrome(domain: string, profile: string) {
    domain = validateDomain(domain);
    if (!(await this.profiles()).includes(profile))
      throw new Error("Choose an available Chrome profile.");
    this.store.saveSession({
      domain,
      kind: "chrome",
      profile,
      updatedAt: Date.now(),
    });
  }
  private get browser() {
    return session.fromPartition(accountsPartition);
  }
  private async browserCookies(domain: string): Promise<string> {
    try {
      return filterCookies(
        netscapeCookies(await this.browser.cookies.get({})),
        domain,
      );
    } catch {
      throw new Error("Session unavailable");
    }
  }
  async saveBrowser(domain: string) {
    domain = validateDomain(domain);
    await this.browserCookies(domain).catch(() => {
      throw new Error(
        "No sign-in was found for this site. Log in in the window, then close it.",
      );
    });
    this.store.saveSession({ domain, kind: "browser", updatedAt: Date.now() });
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
    const info = this.store.sessions().find((s) => s.domain === domain);
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
  async remove(domain: string) {
    domain = validateDomain(domain);
    if (
      this.store.sessions().find((s) => s.domain === domain)?.kind === "browser"
    )
      for (const c of await this.browser.cookies.get({})) {
        const host = c.domain!.replace(/^\./, "");
        if (host === domain || host.endsWith("." + domain))
          await this.browser.cookies.remove(
            `https://${host}${c.path || "/"}`,
            c.name,
          );
      }
    this.store.removeSession(domain);
  }
  async importFile(domain: string, filename: string) {
    domain = validateDomain(domain);
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows credential encryption is unavailable.");
    const size = (await fs.stat(filename)).size;
    if (size > 5_000_000) throw new Error("Cookie file is too large.");
    const filtered = filterCookies(await fs.readFile(filename, "utf8"), domain);
    this.store.saveSession(
      { domain, kind: "file", updatedAt: Date.now() },
      safeStorage.encryptString(filtered),
    );
  }
  async argumentsFor(
    url: string,
  ): Promise<{ args: string[]; cleanup(): Promise<void> }> {
    const domain = domainOf(url);
    const info = this.store
      .sessions()
      .filter((s) => domain === s.domain || domain.endsWith("." + s.domain))
      .sort((a, b) => b.domain.length - a.domain.length)[0];
    if (!info) return { args: [], cleanup: async () => {} };
    if (info.kind === "api" || info.kind === "credentials")
      return { args: [], cleanup: async () => {} };
    if (info.kind === "chrome")
      return {
        args: ["--cookies-from-browser", `chrome:${info.profile}`],
        cleanup: async () => {},
      };
    let text: string;
    if (info.kind === "browser") text = await this.browserCookies(info.domain);
    else {
      const secret = this.store.sessionSecret(info.domain);
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
      args: ["--cookies", file],
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
