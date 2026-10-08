import { expect, it } from "vitest";
import { uniqueCollectionEntries } from "../electron/collections";

it("keeps stable item IDs and order while removing alternate URLs", () => {
  const original = [
    { id: "7", title: "First", url: "https://example.invalid/full.png?sig=a" },
    {
      id: "7",
      title: "Alternate",
      url: "https://example.invalid/alternate.png",
    },
    {
      id: "42",
      title: "Second",
      url: "https://example.invalid/full.png?sig=b",
    },
  ];
  const unique = uniqueCollectionEntries(original);
  expect(unique).toEqual([original[0], original[2]]);
  expect(original).toHaveLength(3);
});

it("preserves distinct IDs sharing a URL and uses exact URLs only for missing IDs", () => {
  const make = (id: string, url: string) => ({ id, title: "Sample", url });
  expect(
    uniqueCollectionEntries([
      make("1", "https://example.invalid/shared.png"),
      make("2", "https://example.invalid/shared.png"),
      make("", "https://example.invalid/a.png"),
      make("", "https://example.invalid/b.png"),
      make("", "https://example.invalid/a.png"),
    ]),
  ).toHaveLength(4);
});
