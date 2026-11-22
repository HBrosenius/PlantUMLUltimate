import { describe, expect, it } from "vitest";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { navigateMindmap, planMindmapKeyboardMove } from "./mindmap-keyboard";

const LTR = parseMindmap(
  [
    "@startmindmap",
    "* Root", // 0
    "** R1", // 1
    "*** R1a", // 2
    "*** R1b", // 3
    "** R2", // 4
    "-- L1", // 5
    "--- L1a", // 6
    "-- L2", // 7
    "@endmindmap",
  ].join("\n"),
);
const id = (label: string, document = LTR) => document.nodes.find((node) => node.label === label)!.id;
const label = (nodeId: string | undefined, document = LTR) => document.nodes.find((node) => node.id === nodeId)?.label;

describe("navigateMindmap in left to right", () => {
  it("walks the siblings with Up and Down", () => {
    expect(label(navigateMindmap(LTR, id("R1"), "ArrowDown"))).toBe("R2");
    expect(label(navigateMindmap(LTR, id("R2"), "ArrowUp"))).toBe("R1");
    expect(navigateMindmap(LTR, id("R1"), "ArrowUp")).toBeUndefined();
    expect(navigateMindmap(LTR, id("R2"), "ArrowDown")).toBeUndefined();
    expect(label(navigateMindmap(LTR, id("R1a"), "ArrowDown"))).toBe("R1b");
  });

  it("keeps a root's children on one side when walking siblings", () => {
    expect(navigateMindmap(LTR, id("R2"), "ArrowDown")).toBeUndefined();
    expect(label(navigateMindmap(LTR, id("L1"), "ArrowDown"))).toBe("L2");
  });

  it("goes into a child and out to the parent on the right side", () => {
    expect(label(navigateMindmap(LTR, id("R1"), "ArrowRight"))).toBe("R1a");
    expect(label(navigateMindmap(LTR, id("R1a"), "ArrowLeft"))).toBe("R1");
    expect(label(navigateMindmap(LTR, id("R1"), "ArrowLeft"))).toBe("Root");
  });

  it("swaps Left and Right for a branch drawn on the left", () => {
    expect(label(navigateMindmap(LTR, id("L1"), "ArrowLeft"))).toBe("L1a");
    expect(label(navigateMindmap(LTR, id("L1a"), "ArrowRight"))).toBe("L1");
    expect(label(navigateMindmap(LTR, id("L1"), "ArrowRight"))).toBe("Root");
  });

  it("leaves the root towards the first child on the side the key points to", () => {
    expect(label(navigateMindmap(LTR, id("Root"), "ArrowRight"))).toBe("R1");
    expect(label(navigateMindmap(LTR, id("Root"), "ArrowLeft"))).toBe("L1");
    expect(navigateMindmap(LTR, id("Root"), "ArrowDown")).toBeUndefined();
  });

  it("does nothing for a leaf or an unknown node", () => {
    expect(navigateMindmap(LTR, id("R2"), "ArrowRight")).toBeUndefined();
    expect(navigateMindmap(LTR, "nope", "ArrowRight")).toBeUndefined();
  });
});

describe("navigateMindmap in other directions", () => {
  const TTB = parseMindmap(
    ["@startmindmap", "top to bottom direction", "* Root", "** B1", "*** B1a", "** B2", "-- A1", "@endmindmap"].join(
      "\n",
    ),
  );
  it("walks siblings with Left and Right and into children with Down for the branch below the root", () => {
    expect(label(navigateMindmap(TTB, id("B1", TTB), "ArrowRight"), TTB)).toBe("B2");
    expect(label(navigateMindmap(TTB, id("B2", TTB), "ArrowLeft"), TTB)).toBe("B1");
    expect(label(navigateMindmap(TTB, id("B1", TTB), "ArrowDown"), TTB)).toBe("B1a");
    expect(label(navigateMindmap(TTB, id("B1a", TTB), "ArrowUp"), TTB)).toBe("B1");
    expect(label(navigateMindmap(TTB, id("B1", TTB), "ArrowUp"), TTB)).toBe("Root");
  });

  it("follows the picture for the branch above the root", () => {
    expect(label(navigateMindmap(TTB, id("Root", TTB), "ArrowUp"), TTB)).toBe("A1");
    expect(label(navigateMindmap(TTB, id("Root", TTB), "ArrowDown"), TTB)).toBe("B1");
    expect(label(navigateMindmap(TTB, id("A1", TTB), "ArrowDown"), TTB)).toBe("Root");
  });

  it("walks left into children when everything is drawn to the left of the root", () => {
    const RTL = parseMindmap(
      ["@startmindmap", "right to left direction", "* Root", "** A", "*** A1", "++ B", "@endmindmap"].join("\n"),
    );
    expect(label(navigateMindmap(RTL, id("A", RTL), "ArrowLeft"), RTL)).toBe("A1");
    expect(label(navigateMindmap(RTL, id("A1", RTL), "ArrowRight"), RTL)).toBe("A");
    expect(label(navigateMindmap(RTL, id("B", RTL), "ArrowRight"), RTL)).toBe("Root");
    expect(label(navigateMindmap(RTL, id("Root", RTL), "ArrowLeft"), RTL)).toBe("A");
    expect(navigateMindmap(RTL, id("Root", RTL), "ArrowRight")).toBeUndefined();
  });

  it("moves between several roots with Up and Down", () => {
    const roots = parseMindmap("@startmindmap\n* One\n* Two\n@endmindmap");
    expect(label(navigateMindmap(roots, id("One", roots), "ArrowDown"), roots)).toBe("Two");
    expect(label(navigateMindmap(roots, id("Two", roots), "ArrowUp"), roots)).toBe("One");
  });
});

describe("planMindmapKeyboardMove", () => {
  it("reorders among siblings", () => {
    expect(planMindmapKeyboardMove(LTR, id("R1b"), "ArrowUp")).toEqual({
      nodeId: id("R1b"),
      parentId: id("R1"),
      beforeId: id("R1a"),
    });
    expect(planMindmapKeyboardMove(LTR, id("R1a"), "ArrowDown")).toEqual({ nodeId: id("R1a"), parentId: id("R1") });
    expect(planMindmapKeyboardMove(LTR, id("R1a"), "ArrowUp")).toBeUndefined();
  });

  it("keeps a first-level branch on its side when reordering", () => {
    expect(planMindmapKeyboardMove(LTR, id("L2"), "ArrowUp")).toEqual({
      nodeId: id("L2"),
      parentId: id("Root"),
      beforeId: id("L1"),
      side: "left",
    });
    expect(planMindmapKeyboardMove(LTR, id("R1"), "ArrowDown")).toEqual({
      nodeId: id("R1"),
      parentId: id("Root"),
      side: "right",
    });
  });

  it("changes the side of a first-level branch with Left and Right", () => {
    expect(planMindmapKeyboardMove(LTR, id("R1"), "ArrowLeft")).toEqual({
      nodeId: id("R1"),
      parentId: id("Root"),
      side: "left",
    });
    expect(planMindmapKeyboardMove(LTR, id("R1"), "ArrowRight")).toBeUndefined();
    expect(planMindmapKeyboardMove(LTR, id("L1"), "ArrowRight")?.side).toBe("right");
  });

  it("indents under the previous sibling and outdents after the parent", () => {
    expect(planMindmapKeyboardMove(LTR, id("R1b"), "ArrowRight")).toEqual({ nodeId: id("R1b"), parentId: id("R1a") });
    expect(planMindmapKeyboardMove(LTR, id("R1a"), "ArrowRight")).toBeUndefined();
    expect(planMindmapKeyboardMove(LTR, id("R1b"), "ArrowLeft")).toEqual({
      nodeId: id("R1b"),
      parentId: id("Root"),
      beforeId: id("R2"),
      side: "right",
    });
    // The mirror image on the left side.
    expect(planMindmapKeyboardMove(LTR, id("L1a"), "ArrowRight")).toEqual({
      nodeId: id("L1a"),
      parentId: id("Root"),
      beforeId: id("L2"),
      side: "left",
    });
  });

  it("never moves a root or creates a second one", () => {
    expect(planMindmapKeyboardMove(LTR, id("Root"), "ArrowUp")).toBeUndefined();
    expect(planMindmapKeyboardMove(LTR, id("R1"), "ArrowUp")).toBeUndefined();
  });

  it("offers no side change where sides mean nothing", () => {
    const RTL = parseMindmap(
      ["@startmindmap", "right to left direction", "* Root", "** A", "** B", "@endmindmap"].join("\n"),
    );
    expect(planMindmapKeyboardMove(RTL, id("A", RTL), "ArrowRight")).toBeUndefined();
    expect(planMindmapKeyboardMove(RTL, id("B", RTL), "ArrowUp")).toEqual({
      nodeId: id("B", RTL),
      parentId: id("Root", RTL),
      beforeId: id("A", RTL),
    });
  });
});
