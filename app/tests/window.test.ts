import { expect, it } from "vitest";
import { windowRange } from "../src/window";

it("renders a short list whole", () => {
  expect(windowRange(0, 400, 40, 56)).toEqual({ start: 0, end: 40 });
  expect(windowRange(900, 400, 80, 56)).toEqual({ start: 0, end: 80 });
});
it("renders only the rows in view and a margin for a long list", () => {
  expect(windowRange(0, 560, 1000, 56)).toEqual({ start: 0, end: 20 });
  // Scrolled 100 rows down: rows 100-109 are in view, 10 more either side.
  expect(windowRange(5600, 560, 1000, 56)).toEqual({ start: 90, end: 120 });
  // The end of the list is clamped.
  expect(windowRange(55_000, 560, 1000, 56)).toEqual({ start: 972, end: 1000 });
  // Scrolled past a list that has since shrunk.
  expect(windowRange(90_000, 560, 100, 56)).toEqual({ start: 100, end: 100 });
});
