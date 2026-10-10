// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  editorPreferenceExtensions,
  loadEditorPreferences,
  saveEditorPreferences,
  DEFAULT_EDITOR_PREFERENCES,
} from "./editor-preferences";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import { activeWorkspace, normalizeSession } from "./workspace-storage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("recovers invalid preferences and configures editor indentation without editing source", () => {
  localStorage.setItem("plantuml-studio.editor-preferences", "invalid");
  expect(loadEditorPreferences()).toEqual(DEFAULT_EDITOR_PREFERENCES);
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, fontSize: 99, tabSize: 8, wordWrap: false });
  expect(loadEditorPreferences().fontSize).toBe(32);
  const state = EditorState.create({
    doc: "@startuml\n@enduml",
    extensions: editorPreferenceExtensions(loadEditorPreferences()),
  });
  expect(state.facet(EditorState.tabSize)).toBe(8);
  expect(state.doc.toString()).toBe("@startuml\n@enduml");
});
it("applies defaults only to new tabs and retains explicit choices through recovery", async () => {
  const { result } = renderHook(usePersistedWorkspace);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const original = result.current[0];
  const originalId = result.current[3].activeId;
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, defaultView: "diagram", defaultZoom: 1.5 });
  let id = "";
  act(() => {
    id = result.current[3].addDocument({ source: "@startuml\n@enduml" });
  });
  expect(result.current[0].viewMode).toBe("diagram");
  expect(result.current[0].zoom).toBe(1.5);
  act(() => result.current[1]((current) => ({ ...current, viewMode: "code", zoom: 2 })));
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, defaultView: "split", defaultZoom: "fit" });
  act(() => result.current[3].activateDocument(originalId));
  expect(result.current[0].viewMode).toBe(original.viewMode);
  expect(result.current[0].source).toBe(original.source);
  act(() => result.current[3].activateDocument(id));
  expect(result.current[0].viewMode).toBe("code");
  expect(result.current[0].zoom).toBe(2);
  expect(activeWorkspace(normalizeSession(result.current[3].session)).viewMode).toBe("code");
  act(() => result.current[3].addDocument({ zoom: 0.75, viewMode: "diagram" }));
  expect(result.current[0].zoom).toBe(0.75);
  expect(result.current[0].viewMode).toBe("diagram");
});
