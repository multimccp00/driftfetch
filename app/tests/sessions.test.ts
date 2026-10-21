import { vi, describe, it, expect } from "vitest";
vi.mock("electron", () => ({ safeStorage: {} }));
import {
  browserUserAgent,
  filterCookies,
  netscapeCookies,
} from "../electron/sessions";
import { galleryDelayArgs } from "../electron/engine";
describe("cookie isolation", () => {
  it("exports sign-in window cookies in a format the engines accept", () => {
    const text = netscapeCookies([
      {
        name: "sessionid",
        value: "s1",
        domain: ".instagram.com",
        hostOnly: false,
        path: "/",
        secure: true,
        httpOnly: true,
        session: false,
        expirationDate: 1900000000.5,
        sameSite: "no_restriction",
      },
      {
        name: "other",
        value: "x",
        domain: "example.com",
        hostOnly: true,
        path: "/",
        secure: false,
        httpOnly: false,
        session: true,
        sameSite: "lax",
      },
    ]);
    const filtered = filterCookies(text, "instagram.com");
    expect(filtered).toContain(
      ".instagram.com\tTRUE\t/\tTRUE\t1900000000\tsessionid\ts1",
    );
    expect(filtered).not.toContain("example.com");
  });
  it("keeps cookies only for the selected source, including HttpOnly records", () => {
    const result = filterCookies(
      "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\ta\tsecret1\n#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tb\tsecret2\n.other.com\tTRUE\t/\tTRUE\t0\tc\tprivate\n",
      "example.com",
    );
    expect(result).toContain("secret1");
    expect(result).toContain("#HttpOnly_");
    expect(result).not.toContain("private");
  });
  it("rejects non-cookie files and unrelated domains", () => {
    expect(() => filterCookies("not a cookie file", "example.com")).toThrow();
    expect(() =>
      filterCookies(
        "# Netscape HTTP Cookie File\n.badexample.com\tTRUE\t/\tTRUE\t0\ta\tb",
        "example.com",
      ),
    ).toThrow();
  });
});

describe("matching the sign-in browser", () => {
  it("sends the agent real Chrome would, without app or Electron tokens", () => {
    expect(
      browserUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) DriftFetch/0.9.1 Chrome/142.0.7444.59 Electron/44.7.2 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    );
  });
  it("randomises the wait between requests above the configured delay", () => {
    expect(galleryDelayArgs(10)).toEqual(["--sleep-request", "10-15"]);
  });
});
