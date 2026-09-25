import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { lintGutter } from "@codemirror/lint";
import { languageExtensions } from "./diagram-language-extensions";

export function ScenarioSourceEditor({
  value,
  onChange,
  readOnly = false,
  label,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValue = useRef(value);
  const synchronizingValue = useRef(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          languageExtensions("gantt"),
          lintGutter(),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !synchronizingValue.current) onChangeRef.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    if (!readOnly) editor.focus();
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, [label, readOnly]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    synchronizingValue.current = true;
    try {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    } finally {
      synchronizingValue.current = false;
    }
  }, [value]);

  return (
    <div className={`scenario-source-host editor-host${readOnly ? " scenario-source-readonly" : ""}`} ref={host} />
  );
}
