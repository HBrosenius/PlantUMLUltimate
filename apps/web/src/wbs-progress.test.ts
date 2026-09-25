import { describe, expect, it } from "vitest";
import { wbsProgressInk } from "./wbs-progress";

describe("WBS progress shade", () => {
  it("uses a light shade over a custom dark node color", () => {
    expect(wbsProgressInk("rgb(34, 68, 102)")).toBe("#ffffff");
  });

  it("uses a dark shade over a light node color", () => {
    expect(wbsProgressInk("rgb(173, 216, 230)")).toBe("#102033");
  });
});
