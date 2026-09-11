import { describe, expect, it } from "vitest";
import {
  PROJECT_FORMAT,
  ProjectFormatError,
  applyIdentityMapping,
  applyIdentityMappings,
  canCreateLink,
  parseProjectManifest,
  parseProjectManifestJson,
  resolveElement,
  reverseImpact,
  serializeProjectManifest,
} from "./index";

const hash = "a".repeat(64);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const locator = (symbolKey: string, declarationHash = hash) => ({
  symbolKey,
  keyType: "alias" as const,
  declarationHash,
  sourceHash: hash,
  from: 0,
  to: 10,
});
const manifest = () => ({
  format: PROJECT_FORMAT,
  schemaVersion: 1 as const,
  projectId: id(1),
  revisionId: id(2),
  name: "Order system",
  documents: [
    { id: id(3), path: "diagrams/sequence.puml", format: "plantuml" as const, observedSourceHash: hash },
    {
      id: id(4),
      path: "diagrams/domain.pumlu",
      format: "pumlu" as const,
      observedSourceHash: hash,
      expectedNativeDocumentId: id(40),
    },
    { id: id(5), path: "plans/release.puml", format: "plantuml" as const, observedSourceHash: hash },
  ],
  elements: [
    { id: id(6), documentId: id(3), kind: "sequence-participant" as const, locator: locator("Checkout") },
    { id: id(7), documentId: id(4), kind: "class-entity" as const, locator: locator("Order") },
    { id: id(8), documentId: id(5), kind: "gantt-task" as const, locator: locator("Release") },
  ],
  links: [
    { id: id(9), kind: "represents" as const, from: id(6), to: id(7) },
    { id: id(10), kind: "implements" as const, from: id(8), to: id(6) },
  ],
});

describe("project manifest", () => {
  it("strictly validates and canonically serializes a manifest", () => {
    const parsed = parseProjectManifest(manifest());
    expect(parseProjectManifestJson(serializeProjectManifest(parsed))).toEqual(parsed);
  });

  it.each([
    [
      "traversal path",
      (value: ReturnType<typeof manifest>) => {
        value.documents[0]!.path = "../secret.puml";
      },
    ],
    [
      "case-fold collision",
      (value: ReturnType<typeof manifest>) => {
        value.documents[1]!.path = "DIAGRAMS/sequence.puml";
      },
    ],
    [
      "unknown field",
      (value: ReturnType<typeof manifest>) => {
        Object.assign(value, { future: true });
      },
    ],
    [
      "wrong endpoint",
      (value: ReturnType<typeof manifest>) => {
        value.links[0]!.from = id(8);
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const value = manifest();
    mutate(value);
    expect(() => parseProjectManifest(value)).toThrow(ProjectFormatError);
  });

  it("allows a missing declaration registration without making the graph invalid", () => {
    expect(parseProjectManifest(manifest()).elements).toHaveLength(3);
  });

  it("allows a task to implement a task in another Gantt diagram", () => {
    const value = manifest();
    value.documents.push({ id: id(11), path: "plans/delivery.puml", format: "plantuml", observedSourceHash: hash });
    value.elements.push({ id: id(12), documentId: id(11), kind: "gantt-task", locator: locator("Deploy") });
    value.links.push({ id: id(13), kind: "implements", from: id(8), to: id(12) });
    expect(parseProjectManifest(value).links).toHaveLength(3);
  });
});

describe("conservative element resolution", () => {
  const element = manifest().elements[0]!;
  const declaration = {
    kind: "sequence-participant" as const,
    symbolKey: "Checkout",
    declarationHash: hash,
    from: 0,
    to: 10,
  };

  it("resolves exact source evidence and relocates an unchanged reordered declaration", () => {
    expect(resolveElement(element, hash, [declaration]).state).toBe("resolved");
    const reordered = { ...declaration, from: 20, to: 30 };
    const resolved = resolveElement(element, "b".repeat(64), [reordered]);
    expect(resolved).toMatchObject({ state: "resolved", locator: { from: 20, to: 30 } });
  });

  it("does not silently attach a changed or duplicate declaration", () => {
    expect(resolveElement(element, "b".repeat(64), [{ ...declaration, declarationHash: "c".repeat(64) }]).state).toBe(
      "needs-review",
    );
    expect(
      resolveElement(element, "b".repeat(64), [
        { ...declaration, from: 20, to: 30 },
        { ...declaration, from: 40, to: 50 },
      ]).state,
    ).toBe("ambiguous");
  });

  it("applies only explicit same-kind identity mappings", () => {
    const mapped = applyIdentityMapping(
      element,
      { ...declaration, symbolKey: "CheckoutApi", from: 4, to: 14 },
      "b".repeat(64),
    );
    expect(mapped.locator).toMatchObject({ symbolKey: "CheckoutApi", from: 4, sourceHash: "b".repeat(64) });
  });

  it("leaves unrelated endpoints untouched when applying explicit mappings", () => {
    const elements = manifest().elements;
    const mapped = applyIdentityMappings(
      elements,
      [{ elementId: id(6), declaration: { ...declaration, symbolKey: "CheckoutApi", from: 4, to: 14 } }],
      "b".repeat(64),
    );
    expect(mapped[0]!.locator.symbolKey).toBe("CheckoutApi");
    expect(mapped[1]).toEqual(elements[1]);
    expect(mapped[2]).toEqual(elements[2]);
  });
});

describe("reverse impact", () => {
  it("returns bounded incoming evidence paths and tolerates cycles", () => {
    const links = [...manifest().links, { id: id(11), kind: "implements" as const, from: id(8), to: id(7) }];
    expect(reverseImpact(links, id(7))).toMatchObject({
      depth: 2,
      paths: [{ elementIds: [id(6), id(7)] }, { elementIds: [id(8), id(7)] }, { elementIds: [id(8), id(6), id(7)] }],
    });
    expect(reverseImpact(links, id(7), 99).depth).toBe(5);
  });
});

describe("project link compatibility", () => {
  it("allows a Gantt task to link to another Gantt task", () => {
    const [first] = manifest().elements.filter((element) => element.kind === "gantt-task");
    const second = { ...first!, id: id(12) };
    expect(canCreateLink("implements", first, second)).toBe(true);
  });
});
