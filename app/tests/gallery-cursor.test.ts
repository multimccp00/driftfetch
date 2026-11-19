import { expect, it } from "vitest";
import { partErrors, rewindCursors, savedCursors } from "../electron/engine";
import { onlyFileFailures } from "../electron/core";

it("keeps the last logged cursor for each profile part", () => {
  const log = [
    "None\tStarting DownloadJob for 'https://www.instagram.com/someone/'",
    "posts\tCursor: 111_1",
    "posts\tCursor: 222_1",
    "reels\tCursor: QVFE-abc==",
    "",
    // A resumed run appends; its later cursor wins.
    "posts\tCursor: 333_1",
    'None\thttps://i.instagram.com:443 "GET /api/v1/feed HTTP/1.1" 200 1',
  ].join("\r\n");
  expect(savedCursors(log)).toEqual({ posts: "333_1", reels: "QVFE-abc==" });
  expect(savedCursors("")).toEqual({});
  // A failed part's cursor is reset so its retry starts from the top.
  expect(savedCursors(log + "\r\nposts\tCursor: \n")).toEqual({
    reels: "QVFE-abc==",
  });
});

it("reads the first error logged for each profile part", () => {
  const log = [
    "posts\tCursor: 111_1",
    "reels\tERROR HTTP redirect to home page (https://www.instagram.com/)",
    "reels\tERROR a later, less useful error",
    "reels\t",
    "Traceback (most recent call last):",
    "highlights\tERROR 401 Unauthorized",
  ].join("\r\n");
  expect(partErrors(log)).toEqual({
    reels: "HTTP redirect to home page (https://www.instagram.com/)",
    highlights: "401 Unauthorized",
  });
});

it("rewinds a failed part to its failing page, once per file", () => {
  const prev = "posts\tCursor: A\n";
  const run = [
    "posts\tCursor: B", // page 2's cursor, logged while page 1 (cursor A) is read
    "posts\tCursor: C",
    "posts\tERROR Failed to download x_1.mkv", // on page 2, which was fetched with B
    "posts\tCursor: D",
    "reels\tCursor: R1",
  ].join("\n");
  expect(rewindCursors(prev, run)).toEqual(["posts\tCursor: B"]);
  // First page of a run that started from the top: rewinds to the top.
  expect(
    rewindCursors("", "posts\tCursor: B\nposts\tERROR Failed to download x_1.mkv"),
  ).toEqual(["posts\tCursor: "]);
  // The same file failed in an earlier run: left behind, no rewind.
  expect(
    rewindCursors(prev + "posts\tERROR Failed to download x_1.mkv\n", run),
  ).toEqual([]);
});

it("tells a run where only single files failed from one that did not read everything", () => {
  const file = "[x][error] Failed to download a.mkv\n[x][error] [download] Got error: HTTP Error 500";
  expect(onlyFileFailures(file)).toBe(true);
  expect(onlyFileFailures(file + "\n[x][error] HTTP redirect to login")).toBe(false);
  expect(onlyFileFailures("")).toBe(false);
});

it("drops share-button tracking values so a repeat paste is recognised", async () => {
  const { normalizeUrl, parseLinks } = await import("../electron/core");
  expect(normalizeUrl("https://www.instagram.com/p/abc/?igsh=XYZ")).toBe(
    "https://www.instagram.com/p/abc/",
  );
  expect(normalizeUrl("https://youtu.be/x?si=1&t=30&utm_source=a")).toBe(
    "https://youtu.be/x?t=30",
  );
  expect(normalizeUrl("https://example.com/v?si=7&id=2")).toBe(
    "https://example.com/v?si=7&id=2",
  );
  expect(
    parseLinks("https://youtu.be/x?si=1 https://youtu.be/x?si=2"),
  ).toHaveLength(1);
});
