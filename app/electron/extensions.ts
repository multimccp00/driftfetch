import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AccountField,
  CollectionReadAttempt,
  ExtensionInfo,
  ExtensionManifest,
  ExtensionCheck,
  Job,
} from "../src/shared";
import {
  domainOf,
  maxCollectionEntries,
  normalizeUrl,
  validateDomain,
} from "./core";
import { readWithFallback } from "./reader-fallback";
import { ExtensionProcess, type Capabilities } from "./extension-process";
import { safeCollectionDiscovery } from "../shared/collection-discovery";

export interface ProviderContext {
  signal: AbortSignal;
  credentials(): Promise<Record<string, string>>;
}
/** What an extension must export. It runs in a sandboxed process (extension-host.cjs). */
export interface Provider {
  matches(url: string): boolean;
  resolve(
    url: string,
    context: ProviderContext,
  ): Promise<Partial<Job> | undefined>;
  fallback?(
    url: string,
    context: ProviderContext,
  ): Promise<Partial<Job> | undefined>;
  galleryArguments?(values: Record<string, string>): string[];
}
interface ExtensionPackage {
  manifest: ExtensionManifest;
  code: string;
}
interface Installed {
  info: ExtensionInfo;
  package: ExtensionPackage;
  host?: ExtensionProcess;
  capabilities?: Capabilities;
}
type ReadCredentials = (
  domain: string,
  fields: AccountField[],
) => Promise<Record<string, string>>;
const safeId = /^[a-z][a-z0-9-]{0,63}$/;
const safeKey = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
function label(value: unknown, max = 100): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\x00-\x1f]/.test(value)
  );
}
export function parseExtension(text: string): ExtensionPackage {
  if (Buffer.byteLength(text) > 2_000_000)
    throw new Error("Extension exceeds the 2 MB limit.");
  let value: any;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid extension file.");
  }
  const m = value?.manifest;
  if (
    !m ||
    m.apiVersion !== 1 ||
    typeof m.id !== "string" ||
    !safeId.test(m.id) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(m.id) ||
    !label(m.name) ||
    !label(m.version, 40) ||
    !Array.isArray(m.domains) ||
    !m.domains.length ||
    m.domains.length > 20 ||
    typeof value.code !== "string" ||
    !value.code.trim()
  )
    throw new Error("Invalid or unsupported extension manifest.");
  const domains = m.domains.map((domain: unknown) => {
    if (
      typeof domain !== "string" ||
      validateDomain(domain) !== domain ||
      domain.length > 253 ||
      !domain
        .split(".")
        .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
    )
      throw new Error("Use exact lowercase domains in extensions.");
    return domain;
  });
  if (new Set(domains).size !== domains.length)
    throw new Error("Duplicate extension domain.");
  let account: ExtensionManifest["account"];
  if (m.account !== undefined) {
    const a = m.account;
    if (
      !a ||
      !label(a.label) ||
      !["api", "credentials"].includes(a.kind) ||
      !Array.isArray(a.fields) ||
      !a.fields.length ||
      a.fields.length > 10
    )
      throw new Error("Invalid extension account schema.");
    const fields = a.fields.map((f: any): AccountField => {
      if (
        !f ||
        typeof f.key !== "string" ||
        !safeKey.test(f.key) ||
        ["__proto__", "constructor", "prototype"].includes(f.key) ||
        !label(f.label) ||
        typeof f.secret !== "boolean" ||
        typeof f.required !== "boolean"
      )
        throw new Error("Invalid extension account field.");
      return {
        key: f.key,
        label: f.label,
        secret: f.secret,
        required: f.required,
      };
    });
    if (new Set(fields.map((f: AccountField) => f.key)).size !== fields.length)
      throw new Error("Duplicate extension account field.");
    account = { label: a.label, kind: a.kind, fields };
  }
  return {
    manifest: {
      apiVersion: 1,
      id: m.id,
      name: m.name,
      version: m.version,
      domains,
      ...(account ? { account } : {}),
    },
    code: value.code,
  };
}

/**
 * Extensions run in a separate process under Node's permission model (see
 * extension-process.ts): no file access, no programs, no inherited environment.
 * They keep network access and receive only their own domain's credentials, so an
 * extension from an untrusted author can still misuse those; enabling asks first.
 * Disabled code never loads.
 */
export class Extensions {
  private installed = new Map<string, Installed>();
  /** hostPath is extension-host.cjs; the default suits running from the repository. */
  constructor(
    private directory: string,
    private hostPath = path.resolve("electron", "extension-host.cjs"),
  ) {}
  /** Stops every extension process (app quit). */
  shutdown() {
    for (const item of this.installed.values()) item.host?.stop();
  }
  list(): ExtensionInfo[] {
    return [...this.installed.values()].map(({ info }) =>
      structuredClone(info),
    );
  }
  private filename(id: string) {
    if (!safeId.test(id)) throw new Error("Invalid extension ID.");
    return path.join(this.directory, id + ".json");
  }
  private async persist(item: Installed) {
    await fs.mkdir(this.directory, { recursive: true });
    const target = this.filename(item.info.id);
    const temp = path.join(this.directory, randomUUID() + ".tmp");
    try {
      await fs.writeFile(
        temp,
        JSON.stringify({ ...item.package, enabled: item.info.enabled }),
        { flag: "wx" },
      );
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  async load() {
    await fs.mkdir(this.directory, { recursive: true });
    for (const file of await fs.readdir(this.directory, {
      withFileTypes: true,
    })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      try {
        const full = path.join(this.directory, file.name);
        if ((await fs.stat(full)).size > 2_000_000) continue;
        const text = await fs.readFile(full, "utf8");
        const pkg = parseExtension(text);
        if (file.name !== pkg.manifest.id + ".json") continue;
        const item: Installed = {
          package: pkg,
          info: { ...pkg.manifest, enabled: false },
        };
        this.installed.set(item.info.id, item);
        if (JSON.parse(text).enabled === true) {
          try {
            await this.activate(item);
          } catch {
            item.info.error =
              "Could not load this extension. Reinstall a compatible version.";
          }
        }
      } catch {
        /* Ignore malformed files; no code from them is executed. */
      }
    }
  }
  async install(text: string) {
    const pkg = parseExtension(text);
    if (this.installed.has(pkg.manifest.id))
      throw new Error(
        "Remove the existing extension before installing another version. Saved accounts are kept.",
      );
    const item: Installed = {
      package: pkg,
      info: { ...pkg.manifest, enabled: false },
    };
    await this.persist(item);
    this.installed.set(item.info.id, item);
  }
  private async activate(item: Installed) {
    for (const other of this.installed.values())
      if (
        other !== item &&
        other.info.enabled &&
        other.info.domains.some((d) => item.info.domains.includes(d))
      )
        throw new Error(
          "Another enabled extension already handles this domain.",
        );
    // The user explicitly enables the code, which then runs sandboxed in its own process.
    const host = new ExtensionProcess(item.package.code, this.hostPath);
    try {
      item.capabilities = await host.start();
    } catch {
      host.stop();
      throw new Error(
        "Could not load this extension. Check its format and app compatibility.",
      );
    }
    item.host = host;
    item.info.enabled = true;
    item.info.error = undefined;
  }
  async action(id: string, action: "enable" | "disable" | "remove") {
    const item = this.installed.get(id);
    if (!item) throw new Error("Extension not found.");
    if (action === "remove") {
      item.host?.stop();
      await fs.unlink(this.filename(id));
      this.installed.delete(id);
      return;
    }
    if (!["enable", "disable"].includes(action))
      throw new Error("Invalid extension action.");
    const previous = { ...item, info: { ...item.info } };
    if (action === "enable") await this.activate(item);
    else {
      item.host?.stop();
      item.host = undefined;
      item.info.enabled = false;
      item.info.error = undefined;
    }
    try {
      await this.persist(item);
    } catch (error) {
      this.installed.set(id, previous);
      throw error;
    }
  }
  forDomain(domain: string): ExtensionInfo | undefined {
    domain = validateDomain(domain);
    return this.list().find(
      (info) => info.enabled && info.domains.includes(domain),
    );
  }
  async resolve(
    url: string,
    signal: AbortSignal,
    credentials: ReadCredentials,
    record: (attempts: CollectionReadAttempt[]) => void,
    checked: (outcome: ExtensionCheck["outcome"]) => void = () => {},
  ): Promise<Partial<Job> | undefined> {
    const domain = domainOf(url);
    const candidates = [...this.installed.values()].filter((item) =>
      item.info.domains.includes(domain),
    );
    const item = candidates.find((item) => item.info.enabled) || candidates[0];
    if (!item?.host) {
      checked(
        !item ? "not-installed" : item.info.error ? "load-failed" : "disabled",
      );
      return;
    }
    let matches: boolean;
    try {
      matches = await item.host.call("matches", [url], { timeoutMs: 5000 });
    } catch {
      checked("check-failed");
      throw new Error("Extension could not recognize this link.");
    }
    if (!matches) {
      checked("not-matched");
      return;
    }
    checked("selected");
    const host = item.host;
    // The sandboxed process asks for credentials through this reader, scoped to the extension's own domain.
    const options = {
      signal,
      credentials: () => credentials(domain, item.info.account?.fields || []),
    };
    const result: Partial<Job> | undefined = item.capabilities?.fallback
      ? await readWithFallback(
          () => host.call("resolve", [url], options),
          () => host.call("fallback", [url], options),
          signal,
          record,
        )
      : await host.call("resolve", [url], options);
    if (!result)
      throw new Error("The extension returned no collection for this link.");
    if (
      !Array.isArray(result.entries) ||
      result.entries.length > 100000 ||
      !result.entries.length ||
      result.entries.some(
        (e) =>
          !e ||
          !label(e.id, 200) ||
          !label(e.title, 500) ||
          !normalizeUrl(e.url),
      )
    )
      throw new Error("The extension returned invalid collection metadata.");
    // Extensions supply collection metadata, never queue state, paths, or executable arguments here.
    return {
      extensionId: item.info.id,
      source: domain,
      resolvedUrl: url,
      title: label(result.title, 500) ? result.title : "Image collection",
      mediaKey: label(result.mediaKey, 2000)
        ? result.mediaKey
        : `Extension:${item.info.id}:${url}`,
      status: "collection",
      collectionKind: "images",
      linkType: "image gallery",
      entries: result.entries
        .slice(0, maxCollectionEntries)
        .map(({ id, title, url, thumbnail }) => ({
          id,
          title,
          url: normalizeUrl(url)!,
          thumbnail:
            typeof thumbnail === "string"
              ? normalizeUrl(thumbnail) || undefined
              : undefined,
        })),
      collectionLimited:
        !!result.collectionLimited ||
        result.entries.length > maxCollectionEntries,
      collectionDiscovery: safeCollectionDiscovery(result.collectionDiscovery),
      sourceItemCount:
        Number.isSafeInteger(result.sourceItemCount) &&
        result.sourceItemCount! >= 0
          ? result.sourceItemCount
          : undefined,
    };
  }
  async galleryArguments(
    url: string,
    credentials: ReadCredentials,
  ): Promise<string[]> {
    const domain = domainOf(url);
    const item = [...this.installed.values()].find(
      (item) => item.info.enabled && item.info.domains.includes(domain),
    );
    if (
      !item?.host ||
      !item.capabilities?.galleryArguments ||
      !item.info.account
    )
      return [];
    const args = await item.host.call(
      "galleryArguments",
      [await credentials(domain, item.info.account.fields)],
      { timeoutMs: 5000 },
    );
    if (
      !Array.isArray(args) ||
      args.length > 40 ||
      args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
    )
      throw new Error("Invalid extension engine options.");
    return args;
  }
}

/**
 * Moves secret-looking gallery-dl `--option key=value` pairs into a temporary
 * config file so they do not appear in the process list.
 */
export async function hideSecretOptions(
  args: string[],
): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  const kept: string[] = [],
    config: Record<string, any> = {};
  for (let i = 0; i < args.length; i++) {
    const match =
      args[i] === "--option" && /^([^=]+)=(.*)$/s.exec(args[i + 1] ?? "");
    if (!match || !/key|token|secret|password/i.test(match[1])) {
      kept.push(args[i]);
      continue;
    }
    const keys = match[1].split(".");
    let node = config;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    node[keys.at(-1)!] = match[2];
    i++;
  }
  if (!Object.keys(config).length) return { args, cleanup: async () => {} };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "current-gallery-"));
  const file = path.join(dir, "config.json");
  await fs.writeFile(file, JSON.stringify(config), { mode: 0o600 });
  return {
    args: [...kept, "--config", file],
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}
