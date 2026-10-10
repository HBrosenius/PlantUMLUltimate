import { useEffect, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { savePreference } from "./browser-preferences";

export interface EditorPreferences {
  adaptPreview: boolean;
  fontSize: number;
  wordWrap: boolean;
  tabSize: number;
  lineNumbers: boolean;
  defaultView: "current" | "code" | "split" | "diagram";
  defaultZoom: "fit" | number;
}
export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  adaptPreview: false,
  fontSize: 14,
  wordWrap: true,
  tabSize: 4,
  lineNumbers: true,
  defaultView: "current",
  defaultZoom: "fit",
};
const key = "plantuml-studio.editor-preferences";
const eventName = "editor-preferences-changed";
export function normalizeEditorPreferences(value: Partial<EditorPreferences>): EditorPreferences {
  return {
    adaptPreview: value.adaptPreview === true,
    fontSize: Number.isFinite(value.fontSize) ? Math.max(10, Math.min(32, Math.round(value.fontSize!))) : 14,
    wordWrap: typeof value.wordWrap === "boolean" ? value.wordWrap : true,
    tabSize: [2, 4, 8].includes(value.tabSize!) ? value.tabSize! : 4,
    lineNumbers: typeof value.lineNumbers === "boolean" ? value.lineNumbers : true,
    defaultView: ["code", "split", "diagram"].includes(value.defaultView!) ? value.defaultView! : "current",
    defaultZoom:
      typeof value.defaultZoom === "number" && Number.isFinite(value.defaultZoom)
        ? Math.max(0.25, Math.min(10, value.defaultZoom))
        : "fit",
  };
}
export function loadEditorPreferences(): EditorPreferences {
  try {
    return normalizeEditorPreferences(JSON.parse(localStorage.getItem(key) ?? "{}") ?? {});
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
}
export function saveEditorPreferences(value: EditorPreferences) {
  const preferences = normalizeEditorPreferences(value);
  savePreference(key, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent(eventName, { detail: preferences }));
}
export function useEditorPreferences() {
  const [preferences, setPreferences] = useState(loadEditorPreferences);
  useEffect(() => {
    const update = (event: Event) =>
      setPreferences(event instanceof CustomEvent ? event.detail : loadEditorPreferences());
    window.addEventListener(eventName, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(eventName, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return preferences;
}
export function editorPreferenceExtensions(preferences: EditorPreferences) {
  return [
    ...(preferences.wordWrap ? [EditorView.lineWrapping] : []),
    ...(preferences.lineNumbers ? [lineNumbers()] : []),
    EditorState.tabSize.of(preferences.tabSize),
    indentUnit.of(" ".repeat(preferences.tabSize)),
    EditorView.theme({ "&.cm-editor": { fontSize: `${preferences.fontSize}px` } }),
  ];
}
