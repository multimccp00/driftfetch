import { expect, it, vi } from "vitest";
import {
  parseCollectionPage,
  readPagedCollection,
  type CollectionPage,
} from "../extension-sdk/paged-collection";
import {
  incompleteCollection,
  safeCollectionDiscovery,
} from "../shared/collection-discovery";
import { diagnosticReport } from "../shared/diagnostics";
import type { Job } from "../src/shared";

const signal = () => new AbortController().signal;
const post = (id: number, file = id) => ({
  id,
  file_url: `https://example.invalid/landscape-${file}.png`,
});
const list = (size: number) =>
  Array.from({ length: size }, (_, i) => post(i + 1));
const jobFor = (result: Awaited<ReturnType<typeof readPagedCollection>>) =>
  ({
    ...result,
    selectedAll: true,
    discoveredItems: result.entries.length,
  }) as Job;

it("reads the XML total and decodes file attributes without confusing sample_id with id", () => {
  expect(
    parseCollectionPage(
      `<?xml version="1.0"?><posts count="257" offset="0"><post sample_id="9" id="1" file_url="https://example.invalid/image.png?a=1&amp;b=2" /></posts>`,
    ),
  ).toEqual({
    total: 257,
    posts: [{ id: "1", file_url: "https://example.invalid/image.png?a=1&b=2" }],
  });
  expect(parseCollectionPage('<posts count="0"/>')).toEqual({
    total: 0,
    posts: [],
  });
});
it("keeps thumbnails separate from original download URLs", async () => {
  const page = parseCollectionPage(
    '<posts count="1"><post id="1" file_url="https://example.invalid/full.png" preview_url="https://example.invalid/small.jpg"/></posts>',
  );
  const result = await readPagedCollection(
    async (index) => (index ? { posts: [] } : page),
    signal(),
  );
  expect(result.entries[0]).toMatchObject({
    url: "https://example.invalid/full.png",
    thumbnail: "https://example.invalid/small.jpg",
  });
});

it("retains unknown JSON totals and accepts an explicit zero", () => {
  expect(parseCollectionPage(JSON.stringify([post(1)]))).toEqual({
    posts: [post(1)],
    total: undefined,
  });
  expect(parseCollectionPage('{"count":0,"post":[]}').total).toBe(0);
  expect(parseCollectionPage('{"count":true,"post":[]}').total).toBeUndefined();
  expect(parseCollectionPage('{"count":" ","post":[]}').total).toBeUndefined();
  expect(
    parseCollectionPage('{"@attributes":{"count":"257"},"post":[]}').total,
  ).toBe(257);
});

it.each([
  "<html>Access required</html>",
  "<error>Denied</error>",
  '{"error":"denied"}',
  '<posts count="257"><unexpected/></posts>',
])(
  "does not interpret an error or unexpected response as an empty page: %s",
  (body) => {
    expect(() => parseCollectionPage(body)).toThrow(SyntaxError);
  },
);

it("continues past short pages and counts all 257 distinct posts", async () => {
  const all = list(257);
  const pages = [
    all.slice(0, 49),
    all.slice(49, 149),
    all.slice(149, 249),
    all.slice(249),
    [],
  ];
  const read = vi.fn(async (index: number) => ({
    posts: pages[index],
    total: 257,
  }));
  const result = await readPagedCollection(read, signal());
  expect(read.mock.calls.map(([page]) => page)).toEqual([0, 1, 2, 3, 4]);
  expect(result.entries).toHaveLength(257);
  expect(result.sourceItemCount).toBe(257);
  expect(result.collectionDiscovery.stopReason).toBe("empty-page");
  expect(incompleteCollection(jobFor(result))).toBe(false);
});

it("distinguishes 257 posts from 249 unique file URLs instead of discarding eight post IDs", async () => {
  const all = [
    ...list(249),
    ...Array.from({ length: 8 }, (_, i) => post(250 + i, i + 1)),
  ];
  const result = await readPagedCollection(
    async (page) => ({ total: 257, posts: page ? [] : all }),
    signal(),
  );
  expect(result.entries).toHaveLength(257);
  expect(new Set(result.entries.map((entry) => entry.url)).size).toBe(249);
  expect(result.collectionDiscovery).toMatchObject({
    uniquePosts: 257,
    sharedFileUrls: 8,
    postsWithoutFiles: 0,
  });
  expect(incompleteCollection(jobFor(result))).toBe(false);
});

it("reports eight posts without files instead of counting them as downloadable", async () => {
  const result = await readPagedCollection(
    async (page) => ({
      posts: page
        ? []
        : [
            ...list(249),
            ...Array.from({ length: 8 }, (_, i) => ({ id: 250 + i })),
          ],
      total: 257,
    }),
    signal(),
  );
  expect(result.entries).toHaveLength(249);
  expect(result.collectionDiscovery).toMatchObject({
    uniquePosts: 257,
    postsWithoutFiles: 8,
  });
  expect(incompleteCollection(jobFor(result))).toBe(true);
  expect(incompleteCollection({ ...jobFor(result), selectedAll: false })).toBe(
    false,
  );
});

it("does not certify 249 returned posts against a stated total of 257", async () => {
  const read = vi.fn(async (page: number) => ({
    posts: page ? [] : list(249),
    total: 257,
  }));
  const result = await readPagedCollection(read, signal());
  expect(read.mock.calls.map(([page]) => page)).toEqual([0, 1, 1]);
  expect(result.collectionDiscovery).toMatchObject({
    uniquePosts: 249,
    postsWithoutFiles: 0,
    stopReason: "empty-page",
  });
  expect(incompleteCollection(jobFor(result))).toBe(true);
});

it("retries one premature empty response without losing its source total", async () => {
  const responses: CollectionPage[] = [
    { posts: [post(1)], total: 2 },
    { posts: [] },
    { posts: [post(2)] },
    { posts: [] },
  ];
  const read = vi.fn(async () => responses.shift()!);
  const result = await readPagedCollection(read, signal());
  expect(result.entries).toHaveLength(2);
  expect(result.sourceItemCount).toBe(2);
  expect(incompleteCollection(jobFor(result))).toBe(false);
});

it("accounts for repeated IDs, missing files, invalid records and protocol-relative URLs", async () => {
  const pages: CollectionPage[] = [
    {
      posts: [
        { id: 1 },
        { id: 2, file_url: "file:///private" },
        { id: null },
        { id: 3, file_url: "//example.invalid/three.png" },
      ],
    },
    { posts: [post(1), post(3), post(3)] },
    { posts: [] },
  ];
  const result = await readPagedCollection(
    async (page) => pages[page],
    signal(),
  );
  expect(result.entries.map((entry) => entry.id)).toEqual(["1", "3"]);
  expect(result.entries[1].url).toBe("https://example.invalid/three.png");
  expect(result.collectionDiscovery).toMatchObject({
    postsReturned: 7,
    uniquePosts: 3,
    duplicatePosts: 3,
    invalidPosts: 1,
    postsWithoutFiles: 1,
  });
  expect(incompleteCollection(jobFor(result))).toBe(true);
});

it("stops a repeating server within a bounded number of pages and marks it incomplete", async () => {
  const read = vi.fn(async () => ({ posts: [post(1)] }));
  const result = await readPagedCollection(read, signal());
  expect(read).toHaveBeenCalledTimes(3);
  expect(result.collectionDiscovery.stopReason).toBe("repeated-page");
  expect(incompleteCollection(jobFor(result))).toBe(true);
});

it("marks a page limit incomplete and cancels without further requests", async () => {
  const result = await readPagedCollection(
    async (page) => ({ posts: [post(page + 1)] }),
    signal(),
    { maxPages: 2 },
  );
  expect(result.collectionDiscovery.stopReason).toBe("page-limit");
  expect(incompleteCollection(jobFor(result))).toBe(true);
  const controller = new AbortController();
  const read = vi.fn(async () => {
    controller.abort();
    return { posts: [post(1)] };
  });
  await expect(readPagedCollection(read, controller.signal)).rejects.toThrow();
  expect(read).toHaveBeenCalledOnce();
});

it("only includes bounded discovery counters in diagnostic reports", async () => {
  const result = await readPagedCollection(
    async (page) => ({ posts: page ? [] : [post(1)] }),
    signal(),
  );
  const audit = result.collectionDiscovery;
  expect(safeCollectionDiscovery({ ...audit, extra: "SECRET" })).toEqual(audit);
  expect(
    safeCollectionDiscovery({ ...audit, stopReason: "SECRET" }),
  ).toBeUndefined();
  expect(
    safeCollectionDiscovery({ ...audit, uniquePosts: -1 }),
  ).toBeUndefined();
  expect(
    safeCollectionDiscovery({ ...audit, uniquePosts: Infinity }),
  ).toBeUndefined();
  const report = diagnosticReport(
    {
      ...jobFor(result),
      collectionDiscovery: { ...audit, extra: "SECRET" },
    } as Job,
    "test",
    "test",
    "api",
  );
  expect(report).not.toContain("SECRET");
  expect(JSON.parse(report).collectionDiscovery).toEqual(audit);
});
