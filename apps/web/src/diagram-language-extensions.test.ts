// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceLinting, forEachDiagnostic, type Diagnostic } from "@codemirror/lint";
import { languageExtensions } from "./diagram-language-extensions";

const source = "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgantt";

it("tooltip actions preview without editing and reject stale or read-only sources", async () => {
  const preview = vi.fn();
  const view = new EditorView({
    state: EditorState.create({ doc: source, extensions: languageExtensions("gantt", preview) }),
  });
  try {
    forceLinting(view);
    let diagnostic: Diagnostic | undefined;
    await vi.waitFor(() => {
      forEachDiagnostic(view.state, (item) => {
        if (item.actions?.length) diagnostic = item;
      });
      expect(diagnostic).toBeDefined();
    });
    const action = diagnostic!.actions![0]!;
    expect(action.name).toBe("Preview fixes");
    action.apply(view, diagnostic!.from, diagnostic!.to);
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        from: diagnostic!.from,
        to: diagnostic!.to,
        message: diagnostic!.message,
      }),
    );
    expect(view.state.doc.toString()).toBe(source);
    preview.mockClear();
    view.dispatch({ changes: { from: 0, insert: "' changed\n" } });
    action.apply(view, diagnostic!.from, diagnostic!.to);
    expect(preview).not.toHaveBeenCalled();
    view.setState(EditorState.create({ doc: source, extensions: EditorState.readOnly.of(true) }));
    action.apply(view, diagnostic!.from, diagnostic!.to);
    expect(preview).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(source);
  } finally {
    view.destroy();
  }
});
