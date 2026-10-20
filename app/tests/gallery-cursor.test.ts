import { expect, it } from "vitest";
import { savedCursors } from "../electron/engine";

it("keeps the last logged cursor for each profile part", () => {
  const log = [
    "None\tStarting DownloadJob for 'https://www.instagram.com/someone/'",
    "posts\tCursor: 111_1",
    "posts\tCursor: 222_1",
    "reels\tCursor: QVFE-abc==",
    "",
    // A resumed run appends; its later cursor wins.
    "posts\tCursor: 333_1",
    "None\thttps://i.instagram.com:443 \"GET /api/v1/feed HTTP/1.1\" 200 1",
  ].join("\r\n");
  expect(savedCursors(log)).toEqual({ posts: "333_1", reels: "QVFE-abc==" });
  expect(savedCursors("")).toEqual({});
});
