import { describe, expect, test } from "vitest";
import { checkSelector, createTextPositionSelector } from "../../../../src/utils/helper/selector";

describe("checkSelector", () => {
  test("a valid TextPositionSelector on a text: a range (inclusive) and a zero point", () => {
    expect(checkSelector({ type: "TextPositionSelector", start: 4, end: 8 }, "text")).toEqual([]);
    expect(checkSelector({ type: "TextPositionSelector", start: 4, end: 4 }, "text")).toEqual([]);
  });

  test.for([
    [null, "must be an object"],
    [{ type: "SvgSelector", value: "<svg/>" }, "need a TextPositionSelector"],
    [{ type: "TextPositionSelector", start: -1, end: 4 }, "'start' must be an integer"],
    [{ type: "TextPositionSelector", start: 5, end: 4 }, "must not be greater"],
    [{ type: "TextPositionSelector", start: 0, end: 4, exact: "Abcd" }, "'exact' is not allowed"],
  ])("%j is reported: %s", ([selector, problem]) => {
    expect(checkSelector(selector, "text")).toEqual([expect.stringContaining(problem as string)]);
  });

  test("media without a selector type only accept known selector types", () => {
    expect(checkSelector({ type: "TextPositionSelector", start: 0, end: 1 }, "image")).toEqual([]);
    expect(checkSelector({ type: "toString" }, "image")).toEqual([expect.stringContaining("Unknown selector type")]);
  });
});

describe("createTextPositionSelector", () => {
  test("keeps start and end as given", () => {
    expect(createTextPositionSelector(4, 8)).toEqual({ type: "TextPositionSelector", start: 4, end: 8 });
  });
});
