import { describe, expect, it } from "vitest";
import { mergeChangedFields } from "./inspector-sync";

describe("mergeChangedFields", () => {
  it("keeps an in-progress edit when another field changes in the source", () => {
    const previous = { label: "Design", color: "" };
    const local = { label: "Experience design", color: "LightBlue" };
    const next = { label: "Experience design", color: "" };
    expect(mergeChangedFields(local, previous, next)).toEqual({ label: "Experience design", color: "LightBlue" });
  });

  it("takes a field whose source value changed", () => {
    const previous = { title: "", actorBackgroundColor: "" };
    const local = { title: "Customer portal", actorBackgroundColor: "#LightBlue" };
    const next = { title: "Renamed elsewhere", actorBackgroundColor: "" };
    expect(mergeChangedFields(local, previous, next)).toEqual({
      title: "Renamed elsewhere",
      actorBackgroundColor: "#LightBlue",
    });
  });

  it("returns the same object when nothing needs to change", () => {
    const local = { a: 1, b: 2 };
    expect(mergeChangedFields(local, { a: 1, b: 2 }, { a: 1, b: 2 })).toBe(local);
    expect(mergeChangedFields(local, { a: 0, b: 2 }, { a: 1, b: 2 })).toBe(local);
  });
});
