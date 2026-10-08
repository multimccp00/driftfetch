import { expect, it } from "vitest";
import { reportedDownloadFile } from "../electron/download-files";

it("uses one Windows key for case differences and extended paths", () => {
  const base = String.raw`E:\Downloads\Samples`;
  const normal = reportedDownloadFile(
    String.raw`E:\Downloads\Samples\one.png`,
    base,
    "win32",
  );
  expect(normal).toBeDefined();
  expect(
    reportedDownloadFile(
      String.raw`e:\downloads\samples\ONE.PNG`,
      base,
      "win32",
    )?.key,
  ).toBe(normal!.key);
  expect(
    reportedDownloadFile(
      String.raw`\\?\E:\Downloads\Samples\one.png`,
      base,
      "win32",
    )?.key,
  ).toBe(normal!.key);
  expect(
    reportedDownloadFile(
      String.raw`E:\Downloads\Samples\one.png`,
      String.raw`\\?\E:\Downloads\Samples`,
      "win32",
    )?.key,
  ).toBe(normal!.key);
});
it("recognizes extended UNC paths on the same share", () => {
  const base = String.raw`\\server\share\Downloads`;
  expect(
    reportedDownloadFile(
      String.raw`\\?\UNC\server\share\Downloads\one.png`,
      base,
      "win32",
    )?.key,
  ).toBe(String.raw`\\server\share\downloads\one.png`);
  expect(
    reportedDownloadFile(
      String.raw`\\other\share\Downloads\one.png`,
      base,
      "win32",
    ),
  ).toBeUndefined();
});
it.each([
  String.raw`E:\Downloads\Samples-elsewhere\one.png`,
  String.raw`E:\Downloads\Samples\..\one.png`,
  String.raw`D:\Downloads\Samples\one.png`,
  String.raw`E:\Downloads\Samples`,
  String.raw`relative\one.png`,
  String.raw`\\.\device`,
  null,
])("rejects output outside the destination: %s", (file) => {
  expect(
    reportedDownloadFile(file, String.raw`E:\Downloads\Samples`, "win32"),
  ).toBeUndefined();
});
it("retains case-sensitive POSIX containment", () => {
  expect(
    reportedDownloadFile("/Downloads/one.png", "/Downloads", "linux"),
  ).toBeDefined();
  expect(
    reportedDownloadFile("/downloads/one.png", "/Downloads", "linux"),
  ).toBeUndefined();
});
