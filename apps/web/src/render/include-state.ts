import { useSyncExternalStore } from "react";
import type { IncludeDiagnostic, IncludeEntry } from "./includes";

/**
 * What the open diagram's includes did on its last render, and what the user can do about it. The renderer
 * publishes it, the editor (diagnostics, Ctrl/Cmd-click), the status bar (the includes list) and the app
 * (adding and opening diagrams) read it. It lives only in memory.
 */
export interface ActiveIncludes {
  documentId: string;
  includes: IncludeEntry[];
  diagnostics: IncludeDiagnostic[];
  /** The repository or folder the included files come from, to read them again. */
  scope?: string | undefined;
  /** Where files come from, for messages: `octo/diagrams at main`. */
  scopeDescription?: string | undefined;
}

export interface IncludeActions {
  /** Whether the open diagram is part of a document that can take another diagram. */
  canAddDiagram: boolean;
  /** Adds a diagram with this name to the document, with a short starter body. */
  addDiagram(name: string): void;
  /** Opens the document's diagram with this name. False when there is none. */
  openDiagram(name: string): boolean;
  /** Shows a short message to the user. */
  notify(message: string): void;
}

let active: ActiveIncludes | undefined;
let actions: IncludeActions | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function publishActiveIncludes(next: ActiveIncludes | undefined): void {
  if (sameJson(active, next)) return;
  active = next;
  emit();
}

export function setIncludeActions(next: IncludeActions | undefined): void {
  actions = next;
  emit();
}

export const includeActions = () => actions;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The includes of `documentId`, when it is the diagram being shown. */
export function useActiveIncludes(documentId?: string): ActiveIncludes | undefined {
  const current = useSyncExternalStore(subscribe, () => active);
  return current && current.documentId === documentId ? current : undefined;
}

export function useIncludeActions(): IncludeActions | undefined {
  return useSyncExternalStore(subscribe, () => actions);
}
