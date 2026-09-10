import { encodeDocument, hashSource } from "@plantuml-studio/document-format";
import { expect, it, vi } from "vitest";
import { externalFileChanged, readExternalFileSnapshot } from "./use-document-files";
import type { WritableFileHandle } from "./file-service";

const snapshot = (source: string, lastModified = 1) => ({ source, lastModified, size: source.length });

it("detects external edits by content rather than file metadata", () => {
  expect(externalFileChanged(undefined, snapshot("A"))).toBe(false);
  expect(externalFileChanged(snapshot("A", 1), snapshot("A", 2))).toBe(false);
  expect(externalFileChanged(snapshot("A", 2), snapshot("B", 2))).toBe(true);
});

it("decodes changed native documents instead of treating their envelope bytes as source", async () => {
  const source = "@startgantt\n[Release] lasts 2 days\n@endgantt";
  const bytes = (
    await encodeDocument(
      {
        schemaVersion: 1,
        documentId: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        current: { source, sourceHash: await hashSource(source), diagramKind: "gantt" },
        settings: { resourceCapacities: {} },
        historyPolicy: { maxVersions: 10, maxLogicalBytes: 1024 * 1024 },
        versions: [],
        contents: [],
      },
      { compression: "none" },
    )
  ).bytes;
  const handle: WritableFileHandle = {
    name: "release.pumlu",
    getFile: vi.fn(async () => new File([Uint8Array.from(bytes)], "release.pumlu")),
    createWritable: vi.fn(),
  };
  const result = await readExternalFileSnapshot(handle, {
    source: "old source",
    lastModified: 0,
    size: 0,
    rawDigest: "0".repeat(64),
    native: true,
  });
  expect(result.snapshot.source).toBe(source);
  expect(result.snapshot.rawDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(result.decodedNative?.document.current.source).toBe(source);
});
