import { describe, expect, it } from "vitest";
import { chooseSelection } from "./use-ai-edit-launcher";

describe("chooseSelection", () => {
  const task = { from: 40, to: 90 };

  it("uses the whole selected object when the editor only shows its highlight", () => {
    expect(chooseSelection({ from: 40, to: 70 }, task)).toEqual(task);
    expect(chooseSelection({ from: 40, to: 90 }, task)).toEqual(task);
  });

  it("keeps an editor selection the user made elsewhere", () => {
    expect(chooseSelection({ from: 0, to: 30 }, task)).toEqual({ from: 0, to: 30 });
    expect(chooseSelection({ from: 30, to: 95 }, task)).toEqual({ from: 30, to: 95 });
  });

  it("falls back to whichever one exists", () => {
    expect(chooseSelection(undefined, task)).toEqual(task);
    expect(chooseSelection({ from: 5, to: 9 }, undefined)).toEqual({ from: 5, to: 9 });
    expect(chooseSelection(undefined, undefined)).toBeUndefined();
  });
});
