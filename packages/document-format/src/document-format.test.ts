import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeEnvelope,
  decodeProject,
  DOCUMENT_MAGIC,
  DocumentFormatError,
  encodeEnvelope,
  encodeProject,
  projectFromDocument,
  projectFromLegacy,
  projectFromPlantUml,
  portableDocumentFromPlantUml,
  validateDocument,
  validateProject,
  validateEnvelopeHeader,
  type PortableDocument,
  type PortableProject,
} from "./index";

const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";

function validDocument(): PortableDocument {
  return {
    schemaVersion: 1,
    documentId: "11111111-1111-4111-8111-111111111111",
    savedAt: "2026-09-09T12:00:00.000Z",
    current: {
      source: "",
      sourceHash: EMPTY_HASH,
      diagramKind: "gantt",
      baselineVersionId: VERSION_ID,
    },
    settings: { resourceCapacities: { Alice: 100 } },
    historyPolicy: { maxVersions: 100, maxLogicalBytes: 16 * 1024 * 1024 },
    versions: [
      {
        id: VERSION_ID,
        contentId: EMPTY_HASH,
        createdAt: "2026-09-09T12:00:00.000Z",
        sequence: 0,
        reason: "manual",
        label: "Initial",
        pinned: true,
        diagramKind: "gantt",
      },
    ],
    contents: [{ id: EMPTY_HASH, kind: "full", source: "", byteLength: 0 }],
  };
}

function validProject(): PortableProject {
  return {
    schemaVersion: 2,
    projectId: "44444444-4444-4444-8444-444444444444",
    revisionId: "55555555-5555-4555-8555-555555555555",
    name: "Release plan",
    savedAt: "2026-09-11T10:00:00.000Z",
    diagrams: [{ id: "66666666-6666-4666-8666-666666666666", name: "Plan", document: validDocument() }],
    elements: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        documentId: "66666666-6666-4666-8666-666666666666",
        kind: "gantt-task",
        locator: {
          symbolKey: "Release",
          keyType: "semantic-key",
          declarationHash: EMPTY_HASH,
          sourceHash: EMPTY_HASH,
          from: 0,
          to: 1,
        },
      },
    ],
    links: [],
  };
}

function expectCode(action: () => unknown, code: DocumentFormatError["code"]): void {
  try {
    action();
    throw new Error("Expected document format failure");
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentFormatError);
    expect((error as DocumentFormatError).code).toBe(code);
  }
}

describe("validateDocument", () => {
  it("accepts the complete v1 schema and preserves sequence ties ordered by ID", () => {
    const value = validDocument();
    value.versions.push({
      ...value.versions[0]!,
      id: "33333333-3333-4333-8333-333333333333",
      parentVersionId: VERSION_ID,
    });
    expect(validateDocument(value)).toBeDefined();
  });

  it("rejects unsupported schema versions separately from malformed files", () => {
    expectCode(() => validateDocument({ ...validDocument(), schemaVersion: 2 }), "unsupported-version");
    expectCode(() => validateDocument({ ...validDocument(), schemaVersion: "1" }), "invalid-file");
  });

  it("rejects non-UUID portable identities and unexpected fields", () => {
    expectCode(() => validateDocument({ ...validDocument(), documentId: "local-id" }), "invalid-file");
    expectCode(() => validateDocument({ ...validDocument(), machinePath: "/private/document" }), "invalid-file");
  });

  it("rejects missing content, forward parents, and missing baselines", () => {
    const missingContent = validDocument();
    missingContent.versions[0]!.contentId = "a".repeat(64);
    expectCode(() => validateDocument(missingContent), "invalid-file");
    const forwardParent = validDocument();
    forwardParent.versions[0]!.parentVersionId = "33333333-3333-4333-8333-333333333333";
    expectCode(() => validateDocument(forwardParent), "invalid-file");
    const baseline = validDocument();
    baseline.current.baselineVersionId = "33333333-3333-4333-8333-333333333333";
    expectCode(() => validateDocument(baseline), "invalid-file");
  });

  it("rejects source and record limits", () => {
    const oversized = validDocument();
    oversized.current.source = "x".repeat(5 * 1024 * 1024 + 1);
    expectCode(() => validateDocument(oversized), "limit-exceeded");
    const tooMany = validDocument();
    tooMany.versions = Array.from({ length: 501 }, () => tooMany.versions[0]!);
    expectCode(() => validateDocument(tooMany), "limit-exceeded");
  });

  it("rejects malformed and forward-referencing splice records", () => {
    const value = validDocument();
    value.contents = [
      {
        id: "a".repeat(64),
        kind: "splice",
        baseContentId: EMPTY_HASH,
        prefixBytes: 0,
        deleteBytes: 0,
        insertBase64: "not base64",
        byteLength: 0,
      },
    ];
    value.versions[0]!.contentId = "a".repeat(64);
    expectCode(() => validateDocument(value), "invalid-file");
  });
});

describe("validateProject", () => {
  it("accepts an embedded project with a validated v1 document", () => {
    expect(validateProject(validProject())).toMatchObject({ schemaVersion: 2, name: "Release plan" });
  });

  it("keeps the project schema strict and validates graph references", () => {
    expectCode(() => validateProject({ ...validProject(), unexpected: true }), "invalid-file");
    const unknownDiagram = validProject();
    unknownDiagram.elements[0]!.documentId = "88888888-8888-4888-8888-888888888888";
    expectCode(() => validateProject(unknownDiagram), "invalid-file");
    const invalidLink = validProject();
    invalidLink.links.push({
      id: "99999999-9999-4999-8999-999999999999",
      kind: "represents",
      from: invalidLink.elements[0]!.id,
      to: invalidLink.elements[0]!.id,
    });
    expectCode(() => validateProject(invalidLink), "invalid-file");
  });
});

describe("v1 envelope", () => {
  it("matches and decodes the golden uncompressed fixture", () => {
    const fixture = readFileSync(new URL("../fixtures/uncompressed-v1.pumlu.base64", import.meta.url), "utf8").trim();
    const bytes = Uint8Array.from(Buffer.from(fixture, "base64"));
    const decoded = decodeEnvelope(bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe(DOCUMENT_MAGIC);
    expect(decoded.header).toEqual({ compression: "none", encryption: "none" });
    expect(validateDocument(JSON.parse(new TextDecoder().decode(decoded.payload)))).toEqual(validDocument());
    expect(encodeEnvelope(decoded.header, decoded.payload)).toEqual(bytes);
  });

  it("uses little-endian header length and returns exact authenticated bytes", () => {
    const payload = new TextEncoder().encode("payload");
    const bytes = encodeEnvelope({ compression: "gzip", encryption: "none" }, payload);
    const decoded = decodeEnvelope(bytes);
    expect(new DataView(bytes.buffer).getUint32(9, true)).toBe(decoded.headerBytes.byteLength);
    expect(decoded.authenticatedData).toEqual(bytes.slice(0, 13 + decoded.headerBytes.byteLength));
    expect(decoded.payload).toEqual(payload);
  });

  it("distinguishes unsupported envelope versions and rejects malformed headers", () => {
    const bytes = encodeEnvelope({ compression: "none", encryption: "none" }, new Uint8Array());
    bytes[8] = 3;
    expectCode(() => decodeEnvelope(bytes), "unsupported-version");
    expectCode(() => validateEnvelopeHeader({ compression: "none", encryption: "none", extra: true }), "invalid-file");
  });

  it("validates encrypted algorithm parameters before key derivation", () => {
    expect(
      validateEnvelopeHeader({
        compression: "gzip",
        encryption: "aes-256-gcm",
        kdf: "pbkdf2-sha256",
        iterations: 600_000,
        salt: "AAAAAAAAAAAAAAAAAAAAAA==",
        iv: "AAAAAAAAAAAAAAAA",
        tagBits: 128,
      }),
    ).toBeDefined();
    expectCode(
      () =>
        validateEnvelopeHeader({
          compression: "gzip",
          encryption: "aes-256-gcm",
          kdf: "pbkdf2-sha256",
          iterations: 599_999,
          salt: "AAAAAAAAAAAAAAAAAAAAAA==",
          iv: "AAAAAAAAAAAAAAAA",
          tagBits: 128,
        }),
      "invalid-file",
    );
  });
});

describe("v2 project envelope", () => {
  it.each([
    ["uncompressed", "none" as const, undefined],
    ["compressed", "gzip" as const, undefined],
    ["encrypted uncompressed", "none" as const, "project-secret"],
    ["encrypted compressed", "gzip" as const, "project-secret"],
  ])("round-trips a %s project", async (_label, compression, password) => {
    const encoded = await encodeProject(validProject(), { compression, ...(password ? { password } : {}) });
    expect(encoded.bytes[8]).toBe(2);
    const decoded = await decodeProject(encoded.bytes, password ? { password } : {});
    expect(decoded.project).toEqual(validProject());
    expect(decoded.compression).toBe(compression);
  });

  it("keeps v1 and v2 decoders separate", async () => {
    const project = await encodeProject(validProject(), { compression: "none" });
    await expect(import("./decode").then(({ decodeDocument }) => decodeDocument(project.bytes))).rejects.toMatchObject({
      code: "unsupported-version",
    });
  });
});

describe("project conversion", () => {
  it("wraps an existing v1 document without changing its history identity", () => {
    const project = projectFromDocument(validDocument(), "Imported plan", "2026-09-11T10:00:00.000Z");
    expect(project.diagrams[0]!.document).toEqual(validDocument());
  });

  it("creates a standalone PlantUML project with a native checkpoint", async () => {
    const project = await projectFromPlantUml("@startgantt\n@endgantt\n", "gantt", "Plan", "2026-09-11T10:00:00.000Z");
    expect(project.diagrams[0]!.document.versions).toHaveLength(1);
    expect(project.diagrams[0]!.document.current.source).toContain("@startgantt");
  });

  it("creates an embeddable logical document from PlantUML", async () => {
    const document = await portableDocumentFromPlantUml("@startuml\n@enduml\n", "class", "2026-09-11T10:00:00.000Z");
    expect(document.current.diagramKind).toBe("class");
    expect(document.contents[0]?.kind).toBe("full");
  });

  it("preserves legacy diagram, element, and link identities", () => {
    const source = validProject();
    const converted = projectFromLegacy(
      {
        projectId: source.projectId,
        revisionId: source.revisionId,
        name: source.name,
        diagrams: source.diagrams,
        elements: source.elements,
        links: source.links,
      },
      source.savedAt,
    );
    expect(converted).toEqual(source);
  });
});
