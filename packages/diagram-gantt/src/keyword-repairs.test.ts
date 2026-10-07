import { expect, it } from "vitest";
import { ganttKeywordRepair } from "./keyword-repairs";

it("preserves clause whitespace when repairing a compound task", () => {
  const source = "  [Research and Design] lasts 2 days  \tand\t  is 50% completdd  ";
  expect(ganttKeywordRepair(source)).toEqual({
    label: "Use completed",
    replacement: "  [Research and Design] lasts 2 days  \tand\t  is 50% completed  ",
  });
});

it("handles a long whitespace run without a clause separator", () => {
  expect(ganttKeywordRepair("[A] lasts 2 days" + " ".repeat(50_000) + "X")).toBeUndefined();
});
