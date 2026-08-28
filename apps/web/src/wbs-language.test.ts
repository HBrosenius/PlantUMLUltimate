import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { wbsCompletions, wbsDiagnostics, wbsQuickFixes } from "./wbs-language";

describe("WBS language service", () => {
  it("offers hierarchy snippets", () => {
    const state = EditorState.create({ doc: "@startwbs\n*" });
    const result = wbsCompletions(new CompletionContext(state, state.doc.length, true));
    expect(result?.options.map((item) => item.label)).toContain("** Work package");
  });
  it("maps diagnostics and repairs missing markers", () => {
    expect(wbsDiagnostics("*** Orphan").map((item) => item.message)).toContain("WBS node at level 3 has no parent");
    expect(wbsQuickFixes("* Project").map((item) => item.message)).toEqual(["Add @startwbs", "Add @endwbs"]);
  });
});
