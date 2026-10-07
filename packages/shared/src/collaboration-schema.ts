import * as Y from "yjs";
import { validateDocument, validateProject } from "../../document-format/src/validate";

/** Validate semantic values before committing a CRDT update, not only its binary encoding. */
export function validateCollaborationState(document: Y.Doc): void {
  const metadata = document.getMap("document-metadata");
  for (const key of ["id", "name"]) {
    const value = metadata.get(key);
    if (value !== undefined && (typeof value !== "string" || !value || value.length > 1000))
      throw new Error("Invalid shared document metadata");
  }
  const diagrams = document.getMap("document-diagrams");
  const portableDiagrams = [];
  if (diagrams.size > 200) throw new Error("Too many shared diagrams");
  for (const [id, fields] of diagrams) {
    if (!id || id.length > 1000 || !(fields instanceof Y.Map)) throw new Error("Invalid shared diagram");
    const source = fields.get("source");
    if (!(source instanceof Y.Text) || source.length > 500_000) throw new Error("Invalid shared source");
    for (const key of ["name", "documentId", "kind"]) {
      const value = fields.get(key);
      if (typeof value !== "string" || !value || value.length > 1000) throw new Error("Invalid shared diagram fields");
    }
    const position = fields.get("position");
    if (position !== undefined && (!Number.isSafeInteger(position) || Number(position) < 0))
      throw new Error("Invalid shared diagram position");
    const portable = validateDocument({
      schemaVersion: 1,
      documentId: fields.get("documentId"),
      savedAt: "2026-01-01T00:00:00.000Z",
      current: { source: source.toString(), sourceHash: "0".repeat(64), diagramKind: fields.get("kind") },
      settings: fields.get("settings"),
      historyPolicy: fields.get("historyPolicy"),
      versions: [],
      contents: [],
    });
    portableDiagrams.push({
      id,
      name: fields.get("name"),
      document: portable,
      ...(fields.has("wbsGantt") ? { wbsGantt: fields.get("wbsGantt") } : {}),
    });
  }
  for (const name of ["document-elements", "document-links"]) {
    const entries = document.getMap(name);
    if (entries.size > 10_000) throw new Error("Too many shared entries");
    for (const [id, value] of entries) {
      if (
        !id ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        typeof (value as { id?: unknown }).id !== "string" ||
        (value as { id: string }).id !== id
      )
        throw new Error("Invalid shared entry");
    }
  }
  if (
    metadata.size ||
    diagrams.size ||
    document.getMap("document-elements").size ||
    document.getMap("document-links").size
  ) {
    validateProject({
      schemaVersion: 2,
      projectId: metadata.get("id"),
      name: metadata.get("name"),
      revisionId: "00000000-0000-4000-8000-000000000001",
      savedAt: "2026-01-01T00:00:00.000Z",
      diagrams: portableDiagrams,
      elements: [...document.getMap("document-elements").values()],
      links: [...document.getMap("document-links").values()],
    });
  }
}
