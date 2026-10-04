import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import {
  changeDiagramItems,
  copyDiagramItems,
  diagramBulkItems,
  pasteDiagramItems,
  type BulkDiagramKind,
  type DiagramClipboard,
  type DiagramBulkItem,
} from "./diagram-bulk-operations";
import type { DiagramKind } from "./model";

export function useDiagramMultiSelection({
  kind,
  source,
  documentId,
  root,
  commit,
  report,
  readOnly,
  onSelect,
}: {
  kind: DiagramKind;
  source: string;
  documentId: string;
  root: React.RefObject<HTMLElement | null>;
  commit(source: string, description: string): boolean;
  report(message: string): void;
  readOnly: boolean;
  onSelect?(item: DiagramBulkItem): void;
}) {
  const [selection, setSelection] = useState<{
    documentId: string;
    kind: DiagramKind;
    source: string;
    keys: string[];
    reveal: boolean;
  }>({
    documentId,
    kind,
    source,
    keys: [],
    reveal: true,
  });
  const clipboard = useRef<DiagramClipboard | undefined>(undefined);
  const plainSelection = useRef<{ documentId: string; kind: DiagramKind; source: string; key: string } | undefined>(
    undefined,
  );
  const pressedItem = useRef<{ key: string; source: string; x: number; y: number; toggled: boolean } | undefined>(
    undefined,
  );
  const items = useMemo(() => (kind === "gantt" ? [] : diagramBulkItems(kind, source)), [kind, source]);
  const pendingPlainKey =
    plainSelection.current?.documentId === documentId &&
    plainSelection.current.kind === kind &&
    plainSelection.current.source === source
      ? plainSelection.current.key
      : undefined;
  const selected = useMemo(
    () =>
      pendingPlainKey
        ? items.filter((item) => item.key === pendingPlainKey)
        : selection.documentId === documentId && selection.kind === kind && selection.source === source
          ? items.filter((item) => selection.keys.includes(item.key))
          : [],
    [selection, documentId, kind, source, items, pendingPlainKey],
  );
  const selectItem = useRef(onSelect);
  selectItem.current = onSelect;
  useLayoutEffect(() => {
    if (!pendingPlainKey && selection.reveal && selected.length === 1) selectItem.current?.(selected[0]!);
  }, [selected, selection.reveal, pendingPlainKey]);
  const keys = selected.map((item) => item.key);
  const selectionKeys = () => {
    const plain = plainSelection.current;
    return plain?.documentId === documentId &&
      plain.kind === kind &&
      plain.source === source &&
      items.some((item) => item.key === plain.key)
      ? [plain.key]
      : keys;
  };
  const clear = () => {
    plainSelection.current = undefined;
    setSelection({ documentId, kind, source, keys: [], reveal: true });
  };
  const choose = (next: string[], nextSource = source, reveal = true) => {
    plainSelection.current = undefined;
    setSelection({ documentId, kind, source: nextSource, keys: next, reveal });
  };
  const targetItem = (target: EventTarget | null) => {
    if (!(target instanceof Element) || !target.closest(".diagram")) return undefined;
    return items.find((item) => {
      const attributes =
        item.attribute === "data-class-object-id" ? [item.attribute, "data-class-hit-id"] : [item.attribute];
      return attributes.some((attribute) => target.closest(`[${attribute}]`)?.getAttribute(attribute) === item.id);
    });
  };
  const modifier = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
    event.shiftKey || event.ctrlKey || event.metaKey;
  const toggle = (itemKey: string) => {
    const currentKeys = selectionKeys();
    choose(currentKeys.includes(itemKey) ? currentKeys.filter((key) => key !== itemKey) : [...currentKeys, itemKey]);
  };
  const onPointerDownCapture = (event: React.PointerEvent) => {
    pressedItem.current = undefined;
    if (kind === "gantt" || event.button !== 0) return;
    const item = targetItem(event.target);
    if (!item) return;
    pressedItem.current = { key: item.key, source, x: event.clientX, y: event.clientY, toggled: modifier(event) };
    if (!modifier(event)) {
      // Retain the semantic anchor without rerendering or changing drag coordinates.
      plainSelection.current = { documentId, kind, source, key: item.key };
      return;
    }
    if (kind === "wbs" && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      // WBS Shift-drag places a branch before its target. Toggle only on a click.
      pressedItem.current.toggled = false;
      return;
    }
    toggle(item.key);
    // Modifier selection must never start a reorder or connection gesture.
    event.stopPropagation();
  };
  const onClickCapture = (event: React.MouseEvent) => {
    if (kind === "gantt") return;
    // Preview selection can recreate SVG hit targets between pointerdown and click.
    const pressed = pressedItem.current;
    pressedItem.current = undefined;
    if (pressed && (pressed.source !== source || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5))
      return;
    const item = targetItem(event.target) ?? items.find((item) => item.key === pressed?.key);
    if (item) {
      if (modifier(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (!pressed?.toggled) toggle(item.key);
      } else plainSelection.current = { documentId, kind, source, key: item.key };
    } else if (event.target instanceof Element && event.target.closest(".diagram svg")) clear();
  };
  const onPointerUp = (event: PointerEvent) => {
    const pressed = pressedItem.current;
    if (
      kind !== "wbs" ||
      !pressed ||
      pressed.toggled ||
      !modifier(event) ||
      pressed.source !== source ||
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5
    )
      return;
    // WBS prevents the native click after pointer-down; resolve a stationary Shift gesture here.
    toggle(pressed.key);
    pressed.toggled = true;
  };
  const pointerUp = useRef(onPointerUp);
  pointerUp.current = onPointerUp;
  useEffect(() => {
    // WBS selects on window capture and may replace the hit target before React receives pointer-up.
    const handle = (event: PointerEvent) => pointerUp.current(event);
    window.addEventListener("pointerup", handle, true);
    return () => window.removeEventListener("pointerup", handle, true);
  }, []);
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (kind === "gantt" || !["Enter", " "].includes(event.key)) return;
    const item = targetItem(event.target);
    if (!item) return;
    if (modifier(event)) {
      event.preventDefault();
      event.stopPropagation();
      toggle(item.key);
    } else plainSelection.current = { documentId, kind, source, key: item.key };
  };
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error instanceof Error ? error.message : "Could not apply selection change.");
    }
  };
  const copy = () => {
    if (kind === "gantt") return;
    const currentKeys = selectionKeys();
    const copied = copyDiagramItems(kind, source, currentKeys);
    if (!copied) return;
    clipboard.current = copied;
    void navigator.clipboard?.writeText(copied.text).catch(() => undefined);
    report(`Copied ${currentKeys.length} elements · paste with Ctrl/⌘+V in a ${kind} diagram`);
  };
  const paste = (duplicate = false, duplicateKeys = selectionKeys()) =>
    attempt(() => {
      if (readOnly || kind === "gantt") return;
      const copied = duplicate ? copyDiagramItems(kind, source, duplicateKeys) : clipboard.current;
      if (!copied) return;
      const selectedNode = (duplicate ? items.filter((item) => duplicateKeys.includes(item.key)) : selected).find(
        (item) => item.attribute === "data-wbs-node-id",
      );
      const parent =
        kind === "wbs"
          ? duplicate
            ? parseWbs(source).nodes.find((node) => node.id === selectedNode?.id)?.parentId
            : selectedNode?.id
          : undefined;
      const result = pasteDiagramItems(kind, source, copied, parent);
      if (!result.keys.length || !commit(result.source, `${duplicate ? "Duplicate" : "Paste"} diagram elements`))
        return;
      choose(result.keys, result.source);
      report(`${duplicate ? "Duplicated" : "Pasted"} ${result.keys.length} elements`);
    });
  const itemAt = (range: { from: number; to: number }) =>
    items
      .filter((item) => item.range.from <= range.from && item.range.to >= range.to)
      .sort((a, b) => a.range.to - a.range.from - (b.range.to - b.range.from))[0];
  const change = (mode: "color" | "stereotype", value: string) =>
    attempt(() => {
      if (readOnly || kind === "gantt") return;
      const result = changeDiagramItems(kind as BulkDiagramKind, source, keys, mode, value);
      if (!result.applied || !commit(result.source, `Set ${mode} on ${result.applied} elements`)) return;
      // Resolve positional IDs after style edits from the unchanged semantic ordering.
      const indexes = selected.map((item) => items.indexOf(item));
      const nextItems = diagramBulkItems(kind, result.source);
      choose(
        indexes.flatMap((index) => (nextItems[index] ? [nextItems[index]!.key] : [])),
        result.source,
      );
      report(
        `Updated ${result.applied} elements${result.skipped ? ` · ${result.skipped} do not support ${mode}` : ""}`,
      );
    });
  const current = useRef({ kind, selectionKeys, items, readOnly, copy, paste, clear, choose });
  current.current = { kind, selectionKeys, items, readOnly, copy, paste, clear, choose };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = current.current;
      if (state.kind === "gantt") return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], .cm-editor'))
        return;
      if (window.document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key === "Escape") {
        state.clear();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      const activeKeys = state.selectionKeys();
      const diagramFocus = target instanceof Element && !!target.closest(".diagram");
      if (key === "a" && diagramFocus) {
        event.preventDefault();
        event.stopPropagation();
        state.choose(state.items.map((item) => item.key));
      } else if (key === "c" && activeKeys.length) {
        event.preventDefault();
        event.stopPropagation();
        state.copy();
      } else if (key === "v" && clipboard.current && !state.readOnly && (diagramFocus || activeKeys.length)) {
        event.preventDefault();
        event.stopPropagation();
        state.paste();
      } else if (key === "d" && activeKeys.length && !state.readOnly) {
        event.preventDefault();
        event.stopPropagation();
        state.paste(true);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
  useLayoutEffect(() => {
    const workspace = root.current;
    if (!workspace || kind === "gantt") return;
    const highlight = () => {
      workspace.querySelectorAll(".diagram-bulk-selected").forEach((element) => {
        element.classList.remove("diagram-bulk-selected");
        element.removeAttribute("aria-pressed");
      });
      for (const item of selected) {
        workspace.querySelectorAll(`[${item.attribute}="${CSS.escape(item.id)}"]`).forEach((element) => {
          element.classList.add("diagram-bulk-selected");
          if (element.getAttribute("role") === "button") element.setAttribute("aria-pressed", "true");
        });
      }
    };
    highlight();
    const observer = new MutationObserver(highlight);
    observer.observe(workspace, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root, kind, source, selection, selected]);
  return {
    selected,
    multiple: selected.length > 1,
    clear,
    copy,
    paste: () => paste(),
    duplicate: () => paste(true),
    canDuplicateAt: (range: { from: number; to: number }) => !!itemAt(range),
    duplicateAt: (range: { from: number; to: number }) => {
      const item = itemAt(range);
      if (!item) return;
      const activeKeys = selectionKeys();
      paste(true, activeKeys.includes(item.key) ? activeKeys : [item.key]);
    },
    change,
    onPointerDownCapture,
    onClickCapture,
    onKeyDownCapture,
    readOnly,
  };
}
