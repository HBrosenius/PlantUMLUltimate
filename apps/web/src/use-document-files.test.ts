import { expect, it } from "vitest";
import { externalFileChanged } from "./use-document-files";

const snapshot = (source: string, lastModified = 1) => ({ source, lastModified, size: source.length });

it("detects external edits by content rather than file metadata", () => {
  expect(externalFileChanged(undefined, snapshot("A"))).toBe(false);
  expect(externalFileChanged(snapshot("A", 1), snapshot("A", 2))).toBe(false);
  expect(externalFileChanged(snapshot("A", 2), snapshot("B", 2))).toBe(true);
});
