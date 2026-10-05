import { isCurrentFix, type FixSnapshot } from "./source-fix-snapshot";
import { errorLocations, nextErrorIndex } from "./error-navigation";
import { sourceFixPreview } from "./source-fix-preview";
import { useEffect, useMemo, useRef, useState } from "react";
import { Compartment, EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { lintGutter } from "@codemirror/lint";
import { codeEditorSetup } from "./code-editor-setup";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram, type DiagramQuickFix } from "./diagram-diagnostics";
import type { CollaborationParticipant } from "./collaboration";
import { languageExtensions } from "./diagram-language-extensions";

interface Props {
  documentId?: string | undefined;
  diagramKind: DiagramKind;
  value: string;
  onChange(value: string): void;
  onCursorChange(line: number, column: number, position: number, anchor: number, head: number): void;
  selectedRange?: { from: number; to: number } | undefined;
  symbolHighlights?: Array<{ from: number; to: number; active?: boolean }> | undefined;
  remoteParticipants?: CollaborationParticipant[] | undefined;
  remoteEditFlash?:
    { participantId: string; name: string; color: string; range: { from: number; to: number } } | undefined;
  readOnly?: boolean | undefined;
  onRenameRequest?: ((position: number) => boolean) | undefined;
  onSymbolContextMenu?: ((position: number, x: number, y: number) => boolean) | undefined;
}

const setFixHighlight = StateEffect.define<{ from: number; to: number } | undefined>();
const fixHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection) value = Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(setFixHighlight)) continue;
      const range = effect.value;
      value = !range
        ? Decoration.none
        : Decoration.set([
            range.from === range.to
              ? Decoration.line({ class: "cm-fix-insertion-target" }).range(
                  transaction.state.doc.lineAt(range.from).from,
                )
              : Decoration.mark({ class: "cm-fix-target" }).range(range.from, range.to),
          ]);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const setSymbolHighlights = StateEffect.define<Array<{ from: number; to: number; active?: boolean }>>();
const setRemoteParticipants = StateEffect.define<CollaborationParticipant[]>();
const setRemoteEditFlash = StateEffect.define<{ name: string; color: string; from: number; to: number } | undefined>();

class RemoteEditFlashWidget extends WidgetType {
  constructor(
    private readonly name: string,
    private readonly color: string,
  ) {
    super();
  }

  eq(other: RemoteEditFlashWidget): boolean {
    return this.name === other.name && this.color === other.color;
  }

  toDOM(): HTMLElement {
    const label = document.createElement("span");
    label.className = "cm-remote-edit-label";
    label.style.backgroundColor = this.color;
    label.textContent = this.name;
    return label;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class RemoteCursorWidget extends WidgetType {
  constructor(
    private readonly participantId: string,
    private readonly name: string,
    private readonly color: string,
  ) {
    super();
  }

  eq(other: RemoteCursorWidget): boolean {
    return this.participantId === other.participantId && this.name === other.name && this.color === other.color;
  }

  toDOM(): HTMLElement {
    const cursor = document.createElement("span");
    cursor.className = "cm-remote-cursor";
    cursor.dataset.participantId = this.participantId;
    cursor.style.borderColor = this.color;
    const label = document.createElement("span");
    label.className = "cm-remote-cursor-label";
    label.style.backgroundColor = this.color;
    label.textContent = this.name;
    cursor.append(label);
    return cursor;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const remoteParticipantField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setRemoteParticipants)) continue;
      const ranges: ReturnType<Decoration["range"]>[] = [];
      for (const participant of effect.value) {
        if (!participant.selection) continue;
        const anchor = Math.min(Math.max(0, participant.selection.anchor), transaction.state.doc.length);
        const head = Math.min(Math.max(0, participant.selection.head), transaction.state.doc.length);
        const from = Math.min(anchor, head);
        const to = Math.max(anchor, head);
        if (from !== to)
          ranges.push(
            Decoration.mark({
              class: "cm-remote-selection",
              attributes: {
                "data-participant-id": participant.id,
                style: `background-color: ${participant.color}33`,
              },
            }).range(from, to),
          );
        ranges.push(
          Decoration.widget({
            widget: new RemoteCursorWidget(participant.id, participant.name, participant.color),
            side: 1,
          }).range(head),
        );
      }
      return Decoration.set(ranges, true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const remoteEditFlashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setRemoteEditFlash)) continue;
      if (!effect.value) return Decoration.none;
      const from = Math.min(Math.max(0, effect.value.from), transaction.state.doc.length);
      const to = Math.min(Math.max(from, effect.value.to), transaction.state.doc.length);
      const ranges: ReturnType<Decoration["range"]>[] = [
        Decoration.widget({
          widget: new RemoteEditFlashWidget(effect.value.name, effect.value.color),
          side: -1,
        }).range(from),
      ];
      if (from !== to)
        ranges.push(
          Decoration.mark({
            class: "cm-remote-edit-flash",
            attributes: { style: `--remote-edit-color: ${effect.value.color}` },
          }).range(from, to),
        );
      return Decoration.set(ranges, true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const symbolHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSymbolHighlights)) continue;
      return Decoration.set(
        effect.value.map((range) =>
          Decoration.mark({
            class: range.active ? "cm-symbol-reference cm-symbol-reference-active" : "cm-symbol-reference",
          }).range(range.from, range.to),
        ),
        true,
      );
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function CodeEditor({
  documentId,
  diagramKind,
  value,
  onChange,
  onCursorChange,
  selectedRange,
  symbolHighlights,
  remoteParticipants,
  remoteEditFlash,
  readOnly = false,
  onRenameRequest,
  onSymbolContextMenu,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const fixPicker = useRef<HTMLDetailsElement>(null);
  const view = useRef<EditorView | null>(null);
  const navigateErrorRef = useRef<(direction: 1 | -1) => boolean>(() => false);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorChange);
  const onRenameRef = useRef(onRenameRequest);
  const onSymbolContextMenuRef = useRef(onSymbolContextMenu);
  const synchronizingValue = useRef(false);
  const initialValue = useRef(value);
  const initialKind = useRef(diagramKind);
  const initialReadOnly = useRef(readOnly);
  const kindRef = useRef(diagramKind);
  const documentIdRef = useRef(documentId);
  const sourceRevision = useRef(0);
  const language = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const errors = useMemo(() => errorLocations(diagnosticsForDiagram(diagramKind, value)), [diagramKind, value]);
  const [errorAnnouncement, setErrorAnnouncement] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [fixSnapshot, setFixSnapshot] = useState<FixSnapshot>(() => ({
    source: value,
    kind: diagramKind,
    documentId,
    revision: 0,
    fixes: quickFixesForDiagram(diagramKind, value),
  }));
  const refreshFixes = (kind: DiagramKind, source: string) =>
    setFixSnapshot({
      source,
      kind,
      documentId: documentIdRef.current,
      revision: sourceRevision.current,
      fixes: quickFixesForDiagram(kind, source),
    });
  onChangeRef.current = onChange;
  onCursorRef.current = onCursorChange;
  onRenameRef.current = onRenameRequest;
  onSymbolContextMenuRef.current = onSymbolContextMenu;
  kindRef.current = diagramKind;
  documentIdRef.current = documentId;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          codeEditorSetup,
          // The app's window shortcut handler performs undo and redo; keep the browser from acting on them.
          Prec.highest(
            keymap.of(["Mod-z", "Mod-Shift-z", "Mod-y"].map((key) => ({ key, run: () => true, preventDefault: true }))),
          ),
          Prec.highest(
            keymap.of([
              { key: "F8", run: () => navigateErrorRef.current(1), preventDefault: true },
              { key: "Shift-F8", run: () => navigateErrorRef.current(-1), preventDefault: true },
            ]),
          ),
          keymap.of([
            indentWithTab,
            {
              key: "Mod-.",
              run: () => {
                const picker = fixPicker.current;
                if (!picker) return false;
                picker.open = true;
                picker.querySelector<HTMLButtonElement>("button")?.focus();
                return true;
              },
            },
            {
              key: "F2",
              run: (currentView) => onRenameRef.current?.(currentView.state.selection.main.head) ?? false,
            },
          ]),
          symbolHighlightField,
          fixHighlightField,
          remoteParticipantField,
          remoteEditFlashField,
          editable.current.of([
            EditorState.readOnly.of(initialReadOnly.current),
            EditorView.editable.of(!initialReadOnly.current),
          ]),
          language.current.of(languageExtensions(initialKind.current)),
          lintGutter(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "PlantUML source editor" }),
          EditorView.domEventHandlers({
            click: (_event, currentView) => {
              const position = currentView.state.selection.main.head;
              const line = currentView.state.doc.lineAt(position);
              const selection = currentView.state.selection.main;
              onCursorRef.current(line.number, position - line.from + 1, position, selection.anchor, selection.head);
              return false;
            },
            contextmenu: (event, currentView) => {
              const position = currentView.posAtCoords({ x: event.clientX, y: event.clientY });
              if (position === null || !onSymbolContextMenuRef.current?.(position, event.clientX, event.clientY))
                return false;
              event.preventDefault();
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              sourceRevision.current++;
              const picker = fixPicker.current;
              const restoreEditorFocus = picker?.contains(document.activeElement);
              if (picker) picker.open = false;
              if (restoreEditorFocus) update.view.focus();
            }
            if (synchronizingValue.current) return;
            if (update.docChanged) {
              setErrorAnnouncement("");
              const source = update.state.doc.toString();
              onChangeRef.current(source);
              refreshFixes(kindRef.current, source);
            }
            if (update.selectionSet || update.docChanged) {
              const position = update.state.selection.main.head;
              setCursorPosition(position);
              const line = update.state.doc.lineAt(position);
              const selection = update.state.selection.main;
              onCursorRef.current(line.number, position - line.from + 1, position, selection.anchor, selection.head);
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
    refreshFixes(diagramKind, view.current.state.doc.toString());
  }, [diagramKind]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    if (fixPicker.current) fixPicker.current.open = false;
    editor.dispatch({ effects: setFixHighlight.of(undefined) });
    refreshFixes(kindRef.current, editor.state.doc.toString());
  }, [documentId, diagramKind, readOnly]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    });
  }, [readOnly]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    synchronizingValue.current = true;
    try {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    } finally {
      synchronizingValue.current = false;
    }
    // The update listener above skips synchronized changes, so recompute quick fixes here.
    // Otherwise a kind switch (which runs first, against the previous document) leaves stale fixes
    // behind — e.g. "Add @startwbs" on a freshly created, valid WBS document.
    setErrorAnnouncement("");
    setCursorPosition(editor.state.selection.main.head);
    refreshFixes(kindRef.current, value);
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

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: setSymbolHighlights.of(symbolHighlights ?? []) });
  }, [symbolHighlights]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: setRemoteParticipants.of(remoteParticipants ?? []) });
  }, [remoteParticipants]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      effects: setRemoteEditFlash.of(
        remoteEditFlash
          ? {
              name: remoteEditFlash.name,
              color: remoteEditFlash.color,
              from: remoteEditFlash.range.from,
              to: remoteEditFlash.range.to,
            }
          : undefined,
      ),
    });
  }, [remoteEditFlash]);

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

  const applyQuickFix = (fix: DiagramQuickFix) => {
    const editor = view.current;
    if (!editor || readOnly) return;
    if (
      !isCurrentFix(
        fixSnapshot,
        {
          source: editor.state.doc.toString(),
          kind: kindRef.current,
          documentId: documentIdRef.current,
          revision: sourceRevision.current,
        },
        fix,
      )
    ) {
      if (fixPicker.current) fixPicker.current.open = false;
      editor.dispatch({ effects: setFixHighlight.of(undefined) });
      refreshFixes(kindRef.current, editor.state.doc.toString());
      editor.focus();
      return;
    }
    if (fixPicker.current) fixPicker.current.open = false;
    editor.dispatch({
      changes: { from: fix.from, to: fix.to, insert: fix.replacement },
      selection: { anchor: fix.from + fix.replacement.length },
    });
    editor.focus();
  };

  const navigateError = (direction: 1 | -1) => {
    const editor = view.current;
    if (!editor) return false;
    const currentErrors = errorLocations(diagnosticsForDiagram(kindRef.current, editor.state.doc.toString()));
    const index = nextErrorIndex(currentErrors, editor.state.selection.main.head, direction);
    const error = currentErrors[index];
    if (!error) return false;
    if (fixPicker.current) fixPicker.current.open = false;
    editor.dispatch({
      selection: { anchor: error.from },
      effects: [setFixHighlight.of(undefined), EditorView.scrollIntoView(error.from, { y: "center" })],
    });
    editor.focus();
    setErrorAnnouncement(
      `Error ${index + 1} of ${currentErrors.length}, line ${editor.state.doc.lineAt(error.from).number}: ${error.message}`,
    );
    return true;
  };
  navigateErrorRef.current = navigateError;

  const quickFixes =
    fixSnapshot.kind === diagramKind &&
    fixSnapshot.documentId === documentId &&
    fixSnapshot.source === (view.current?.state.doc.toString() ?? value) &&
    fixSnapshot.revision === sourceRevision.current
      ? fixSnapshot.fixes
      : [];
  const relationshipRepair = quickFixes.length === 1 && quickFixes[0]?.message.startsWith("Repair ");
  const previewSource = view.current?.state.doc.toString() ?? value;
  const fixGroups = new Map<string, DiagramQuickFix[]>();
  for (const fix of quickFixes) {
    const key = fix.choiceGroup ?? `${fix.from}:${fix.to}:${fix.message}`;
    const group = fixGroups.get(key) ?? [];
    group.push(fix);
    fixGroups.set(key, group);
  }

  const cursorLine = view.current?.state.doc.lineAt(Math.min(cursorPosition, previewSource.length));
  const onCursorLine = (fix: DiagramQuickFix) => cursorLine && fix.from <= cursorLine.to && fix.to >= cursorLine.from;
  const orderedGroups = [...fixGroups.values()].sort(
    (left, right) => Number(right.some(onCursorLine)) - Number(left.some(onCursorLine)),
  );
  const highlightFix = (fix?: DiagramQuickFix) => {
    const editor = view.current;
    if (!editor) return;
    if (
      fix &&
      !isCurrentFix(
        fixSnapshot,
        {
          source: editor.state.doc.toString(),
          kind: kindRef.current,
          documentId: documentIdRef.current,
          revision: sourceRevision.current,
        },
        fix,
      )
    )
      return;
    editor.dispatch({ effects: setFixHighlight.of(fix && { from: fix.from, to: fix.to }) });
    if (fix) editor.dispatch({ effects: EditorView.scrollIntoView(fix.from, { y: "nearest" }) });
  };

  return (
    <section className="editor-pane" aria-label="Code editor section">
      <div className="editor-actions">
        <button
          type="button"
          aria-label="Previous error"
          title="Previous error (Shift+F8)"
          disabled={!errors.length}
          onClick={() => navigateError(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Next error"
          title="Next error (F8)"
          disabled={!errors.length}
          onClick={() => navigateError(1)}
        >
          ↓
        </button>
        <span className="source-error-announcement" role="status">
          {errorAnnouncement}
        </span>
        {quickFixes.length > 0 && !readOnly && (
          <details
            className="source-fixes"
            ref={fixPicker}
            onToggle={(event) => {
              if (!event.currentTarget.open) highlightFix();
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) highlightFix();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.open = false;
                highlightFix();
                view.current?.focus();
                return;
              }
              if (event.key === "Tab") {
                const target = event.target as HTMLElement;
                const row = target.closest("li");
                const preview = row?.querySelector<HTMLElement>(".source-fix-full-preview summary");
                const apply = row?.querySelector<HTMLButtonElement>("button");
                if ((!event.shiftKey && target === apply && preview) || (event.shiftKey && target === preview)) {
                  event.preventDefault();
                  (event.shiftKey ? apply : preview)?.focus();
                }
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
              const index = buttons.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }}
          >
            <summary
              aria-label="Show source fix suggestions"
              title="Ctrl/⌘ + . opens fixes; arrows choose, Enter applies, Tab reaches previews, Escape closes"
            >
              {relationshipRepair
                ? "Repair relationships"
                : `Fix issue${quickFixes.length > 1 ? ` (${quickFixes.length})` : ""}`}
            </summary>
            <ul aria-label="Source fix suggestions">
              {orderedGroups.flatMap((group) =>
                group.map((fix, index) => {
                  const preview = sourceFixPreview(previewSource, fix);
                  return (
                    <li
                      key={`${fix.choiceGroup ?? fix.message}:${fix.from}:${fix.to}:${fix.replacement}:${index}`}
                      onFocus={() => highlightFix(fix)}
                      onMouseEnter={() => highlightFix(fix)}
                      onMouseLeave={(event) => {
                        if (!event.currentTarget.contains(document.activeElement)) highlightFix();
                      }}
                    >
                      {group.length > 1 && index === 0 && (
                        <p role="note">
                          Choose one of {group.length} alternatives. Compare the changes before applying.
                        </p>
                      )}
                      <button type="button" onClick={() => applyQuickFix(fix)}>
                        <span>
                          Line {preview.line}: {fix.label ?? fix.message}
                          {onCursorLine(fix) ? " (current line)" : ""}
                        </span>
                        {(group.length > 1 || preview.expandable) && (
                          <span>
                            Before: <del>{preview.compactBefore.trim() || "(empty line)"}</del>
                          </span>
                        )}
                        {(group.length > 1 || preview.expandable) && <span>After:</span>}
                        <code>{preview.compactAfter.trim() || "Remove this text"}</code>
                      </button>
                      {preview.expandable && (
                        <details className="source-fix-full-preview">
                          <summary>Show full change</summary>
                          <strong>Before</strong>
                          <pre>{preview.before || "(empty line)"}</pre>
                          <strong>After</strong>
                          <pre>{preview.after || "(removed)"}</pre>
                        </details>
                      )}
                    </li>
                  );
                }),
              )}
            </ul>
          </details>
        )}
        <button type="button" onClick={() => void copySource()}>
          {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy code"}
        </button>
      </div>
      <div className="editor-host" ref={host} aria-label="PlantUML source editor" data-inspector-trigger />
    </section>
  );
}
