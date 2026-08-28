import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { ganttCompletions, ganttDiagnostics, ganttQuickFixes, type GanttQuickFix } from "./gantt-language";
import { plantUmlGanttHighlightStyle, plantUmlGanttMode } from "./plantuml-gantt-mode";
import { plantUmlSequenceHighlightStyle, plantUmlSequenceMode } from "./plantuml-sequence-mode";
import { sequenceCompletions, sequenceDiagnostics, sequenceQuickFixes } from "./sequence-language";
import { plantUmlUseCaseHighlightStyle, plantUmlUseCaseMode } from "./plantuml-usecase-mode";
import { getUseCaseQuickFixes, useCaseCompletions, useCaseDiagnostics } from "./usecase-language";
import { plantUmlClassHighlightStyle, plantUmlClassMode } from "./plantuml-class-mode";
import { classCompletions, classDiagnostics, classQuickFixes } from "./class-language";
import { plantUmlActivityHighlightStyle, plantUmlActivityMode } from "./plantuml-activity-mode";
import { activityCompletions, activityDiagnostics, activityQuickFixes } from "./activity-language";
import { plantUmlWbsHighlightStyle, plantUmlWbsMode } from "./plantuml-wbs-mode";
import { wbsCompletions, wbsDiagnostics, wbsQuickFixes } from "./wbs-language";
import type { DiagramKind } from "./model";

interface Props {
  diagramKind: DiagramKind;
  value: string;
  onChange(value: string): void;
  onCursorChange(line: number, column: number, position: number): void;
  selectedRange?: { from: number; to: number } | undefined;
}

function languageExtensions(kind: DiagramKind): Extension {
  const mode =
    kind === "gantt"
      ? plantUmlGanttMode
      : kind === "sequence"
        ? plantUmlSequenceMode
        : kind === "usecase"
          ? plantUmlUseCaseMode
          : kind === "class"
            ? plantUmlClassMode
            : kind === "activity"
              ? plantUmlActivityMode
              : plantUmlWbsMode;
  const highlights =
    kind === "gantt"
      ? plantUmlGanttHighlightStyle
      : kind === "sequence"
        ? plantUmlSequenceHighlightStyle
        : kind === "usecase"
          ? plantUmlUseCaseHighlightStyle
          : kind === "class"
            ? plantUmlClassHighlightStyle
            : kind === "activity"
              ? plantUmlActivityHighlightStyle
              : plantUmlWbsHighlightStyle;
  const completions =
    kind === "gantt"
      ? ganttCompletions
      : kind === "sequence"
        ? sequenceCompletions
        : kind === "usecase"
          ? useCaseCompletions
          : kind === "class"
            ? classCompletions
            : kind === "activity"
              ? activityCompletions
              : wbsCompletions;
  const diagnostics =
    kind === "gantt"
      ? ganttDiagnostics
      : kind === "sequence"
        ? sequenceDiagnostics
        : kind === "usecase"
          ? useCaseDiagnostics
          : kind === "class"
            ? classDiagnostics
            : kind === "activity"
              ? activityDiagnostics
              : wbsDiagnostics;
  return [
    StreamLanguage.define(mode),
    syntaxHighlighting(highlights),
    autocompletion({ override: [completions] }),
    linter((current) => diagnostics(current.state.doc.toString()), { delay: 120 }),
  ];
}

const quickFixesFor = (kind: DiagramKind, source: string): GanttQuickFix[] =>
  kind === "gantt"
    ? ganttQuickFixes(source)
    : kind === "sequence"
      ? sequenceQuickFixes(source)
      : kind === "usecase"
        ? getUseCaseQuickFixes(source)
        : kind === "class"
          ? classQuickFixes(source)
          : kind === "activity"
            ? activityQuickFixes(source)
            : wbsQuickFixes(source);

export function CodeEditor({ diagramKind, value, onChange, onCursorChange, selectedRange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorChange);
  const synchronizingValue = useRef(false);
  const initialValue = useRef(value);
  const initialKind = useRef(diagramKind);
  const kindRef = useRef(diagramKind);
  const language = useRef(new Compartment());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [quickFixes, setQuickFixes] = useState<GanttQuickFix[]>(() => quickFixesFor(diagramKind, value));
  onChangeRef.current = onChange;
  onCursorRef.current = onCursorChange;
  kindRef.current = diagramKind;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          language.current.of(languageExtensions(initialKind.current)),
          lintGutter(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "PlantUML source editor" }),
          EditorView.domEventHandlers({
            click: (_event, currentView) => {
              const position = currentView.state.selection.main.head;
              const line = currentView.state.doc.lineAt(position);
              onCursorRef.current(line.number, position - line.from + 1, position);
              return false;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (synchronizingValue.current) return;
            if (update.docChanged) {
              const source = update.state.doc.toString();
              onChangeRef.current(source);
              setQuickFixes(quickFixesFor(kindRef.current, source));
            }
            if (update.selectionSet || update.docChanged) {
              const position = update.state.selection.main.head;
              const line = update.state.doc.lineAt(position);
              onCursorRef.current(line.number, position - line.from + 1, position);
            }
          }),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, []);

  useEffect(() => {
    if (!view.current) return;
    view.current.dispatch({ effects: language.current.reconfigure(languageExtensions(diagramKind)) });
    setQuickFixes(quickFixesFor(diagramKind, view.current.state.doc.toString()));
  }, [diagramKind]);

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

  useEffect(() => {
    const editor = view.current;
    if (!editor || !selectedRange) return;
    const from = Math.min(selectedRange.from, editor.state.doc.length);
    const to = Math.min(selectedRange.to, editor.state.doc.length);
    editor.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    editor.focus();
  }, [selectedRange]);

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(view.current?.state.doc.toString() ?? value);
      setCopyState("copied");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = view.current?.state.doc.toString() ?? value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      setCopyState(copied ? "copied" : "failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  const applyQuickFix = () => {
    const editor = view.current;
    if (!editor || !quickFixes.length) return;
    const position = editor.state.selection.main.head;
    const fix =
      quickFixes.find((item) => position >= item.from && position <= item.to) ??
      [...quickFixes].sort((a, b) => Math.abs(a.from - position) - Math.abs(b.from - position))[0];
    if (!fix) return;
    editor.dispatch({
      changes: { from: fix.from, to: fix.to, insert: fix.replacement },
      selection: { anchor: fix.from + fix.replacement.length },
    });
    editor.focus();
  };

  return (
    <section className="editor-pane" aria-label="Code editor section">
      <div className="editor-actions">
        {quickFixes.length > 0 && (
          <button
            type="button"
            className="fix-source"
            onClick={applyQuickFix}
            title={quickFixes[0]?.message}
            aria-label="Fix nearest source issue"
          >
            Fix issue{quickFixes.length > 1 ? ` (${quickFixes.length})` : ""}
          </button>
        )}
        <button type="button" onClick={() => void copySource()}>
          {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy code"}
        </button>
      </div>
      <div className="editor-host" ref={host} aria-label="PlantUML source editor" data-inspector-trigger />
    </section>
  );
}
