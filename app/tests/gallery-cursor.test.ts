import { expect, it } from "vitest";
import { partErrors, savedCursors } from "../electron/engine";

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
