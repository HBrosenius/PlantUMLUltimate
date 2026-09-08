import { describe, expect, it } from "vitest";
import { closeDocumentConfirmation, closeOtherDocumentsConfirmation } from "./use-document-tab-lifecycle";
import type { DocumentSnapshot } from "./workspace-storage";

function document(id: string, dirty = false): DocumentSnapshot {
  return {
    id,
    historyId: `history-${id}`,
    diagramKind: "gantt",
    source: "@startgantt\n@endgantt",
    fileName: `${id}.puml`,
    dirty,
    zoom: 1,
    cursor: { line: 1, column: 1 },
  };
}

describe("document tab lifecycle confirmations", () => {
  it("only warns when closing a dirty document", () => {
    expect(closeDocumentConfirmation(document("clean"))).toBeUndefined();
    expect(closeDocumentConfirmation(document("draft", true))).toBe("Close “draft.puml” without saving?");
  });

  it("counts only other dirty documents when closing other tabs", () => {
    const documents = [document("keep", true), document("clean"), document("draft", true)];
    expect(closeOtherDocumentsConfirmation(documents, "keep")).toBe("Close 2 other tabs? 1 contain unsaved changes.");
    expect(closeOtherDocumentsConfirmation(documents, "draft")).toBe("Close 2 other tabs? 1 contain unsaved changes.");
    expect(closeOtherDocumentsConfirmation([document("keep"), document("clean")], "keep")).toBeUndefined();
  });

  it("uses singular wording when one other tab will close", () => {
    expect(closeOtherDocumentsConfirmation([document("keep"), document("draft", true)], "keep")).toBe(
      "Close 1 other tab? 1 contain unsaved changes.",
    );
  });
});
