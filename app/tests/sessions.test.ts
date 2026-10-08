import { vi, describe, it, expect } from "vitest";
vi.mock("electron", () => ({ safeStorage: {} }));
import { filterCookies, netscapeCookies } from "../electron/sessions";
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
