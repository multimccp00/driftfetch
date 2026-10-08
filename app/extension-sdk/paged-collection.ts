import { setTimeout as delay } from "node:timers/promises";
import type { CollectionDiscovery, Entry } from "../src/shared";

export interface CollectionPage {
  posts: Array<{
    id?: unknown;
    file_url?: unknown;
    file?: unknown;
    preview_url?: unknown;
  }>;
  total?: number;
}

function count(value: unknown): number | undefined {
  if (
    !["number", "string"].includes(typeof value) ||
    (typeof value === "string" && !value.trim())
  )
    return;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function attribute(tag: string, name: string): string | undefined {
  const value = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`,
    "is",
  ).exec(tag)?.[2];
  return value?.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
    (entity, code: string) => {
      const named: Record<string, string> = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
      };
      if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
      const number =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : entity;
    },
  );
}

/** Read post metadata only; unexpected HTML/error pages must not mean an empty list. */
export function parseCollectionPage(body: string): CollectionPage {
  const text = body.trim();
  if (/^[\[{]/.test(text)) {
    const value = JSON.parse(text);
    const posts = Array.isArray(value) ? value : value?.post;
    if (
      !Array.isArray(posts) ||
      posts.some(
        (post) => !post || typeof post !== "object" || Array.isArray(post),
      )
    )
      throw new SyntaxError("Invalid collection response");
    return {
      posts,
      total: count(value?.count ?? value?.["@attributes"]?.count),
    };
  }
  const xml = text.replace(/^<\?xml\s[^?]*\?>\s*/i, "");
  const root = /^<posts\b([^>]*)(?:\/\s*>|>([\s\S]*)<\/posts\s*>)\s*$/i.exec(
    xml,
  );
  if (!root) throw new SyntaxError("Invalid collection response");
  const posts: CollectionPage["posts"] = [];
  const remainder = (root[2] || "").replace(
    /<post\b([^>]*)(?:\/\s*>|>\s*<\/post\s*>)/gi,
    (_, attrs: string) => {
      posts.push({
        id: attribute(attrs, "id"),
        file_url: attribute(attrs, "file_url"),
        preview_url: attribute(attrs, "preview_url"),
      });
      return "";
    },
  );
  if (remainder.trim()) throw new SyntaxError("Invalid collection response");
  return { posts, total: count(attribute(root[1], "count")) };
}

function fileUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return;
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}

/** Count source posts before filtering; one URL can legitimately belong to several posts. */
export async function readPagedCollection(
  readPage: (index: number) => Promise<CollectionPage>,
  signal: AbortSignal,
  options: { maxPages?: number; intervalMs?: number } = {},
): Promise<{
  entries: Entry[];
  sourceItemCount?: number;
  collectionLimited: boolean;
  collectionDiscovery: CollectionDiscovery;
}> {
  const maxPages = Math.max(1, Math.min(1000, options.maxPages ?? 1000));
  const interval = Math.max(0, options.intervalMs ?? 0);
  const posts = new Map<string, Entry | undefined>();
  let total: number | undefined;
  let repeatedPages = 0;
  const audit: CollectionDiscovery = {
    pagesRead: 0,
    postsReturned: 0,
    uniquePosts: 0,
    duplicatePosts: 0,
    postsWithoutFiles: 0,
    invalidPosts: 0,
    sharedFileUrls: 0,
    stopReason: "page-limit",
  };
  for (let index = 0; index < maxPages; index++) {
    signal.throwIfAborted();
    if (audit.pagesRead && interval)
      await delay(interval, undefined, { signal });
    let page = await readPage(index);
    signal.throwIfAborted();
    audit.pagesRead++;
    if (page.total !== undefined) total = Math.max(total ?? 0, page.total);
    // An empty response before the stated end may be transient. Retry once,
    // bounded, rather than hanging or fetching an unrelated page reader.
    if (!page.posts.length && (total ?? 0) > posts.size) {
      if (interval) await delay(interval, undefined, { signal });
      page = await readPage(index);
      signal.throwIfAborted();
      audit.pagesRead++;
    }
    if (page.total !== undefined) total = Math.max(total ?? 0, page.total);
    if (!page.posts.length) {
      audit.stopReason = "empty-page";
      break;
    }
    audit.postsReturned += page.posts.length;
    const previousSize = posts.size;
    for (const post of page.posts) {
      const id =
        typeof post.id === "string" || typeof post.id === "number"
          ? String(post.id).trim()
          : "";
      if (!id || id.length > 200) {
        audit.invalidPosts++;
        continue;
      }
      const alreadySeen = posts.has(id);
      if (alreadySeen) audit.duplicatePosts++;
      const url = fileUrl(post.file_url ?? post.file);
      // A repeated post may supply a file omitted by an earlier page.
      if (!alreadySeen || (!posts.get(id) && url))
        posts.set(
          id,
          url
            ? {
                id,
                title: `Post ${id}`,
                url,
                thumbnail: fileUrl(post.preview_url),
              }
            : undefined,
        );
    }
    repeatedPages = posts.size === previousSize ? repeatedPages + 1 : 0;
    if (repeatedPages >= 2) {
      audit.stopReason = "repeated-page";
      break;
    }
  }
  const entries = [...posts.values()].filter(
    (entry): entry is Entry => !!entry,
  );
  audit.uniquePosts = posts.size;
  audit.postsWithoutFiles = posts.size - entries.length;
  audit.sharedFileUrls =
    entries.length - new Set(entries.map((entry) => entry.url)).size;
  return {
    entries,
    sourceItemCount: total,
    collectionLimited: audit.stopReason !== "empty-page",
    collectionDiscovery: audit,
  };
}
