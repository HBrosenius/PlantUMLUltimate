import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

type InspectorFocusSnapshot = {
  inspectorLabel: string;
  controlIndex: number;
  selectionStart?: number;
  selectionEnd?: number;
};

function captureInspectorFocus(): InspectorFocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return undefined;
  const inspector = active.closest<HTMLElement>(".task-inspector");
  const inspectorLabel = inspector?.getAttribute("aria-label");
  if (!inspector || !inspectorLabel) return undefined;
  const controls = [...inspector.querySelectorAll<HTMLElement>("input, select, textarea, button")];
  const controlIndex = controls.indexOf(active);
  if (controlIndex < 0) return undefined;
  const selectionControl =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : undefined;
  return {
    inspectorLabel,
    controlIndex,
    ...(selectionControl?.selectionStart !== null && selectionControl?.selectionStart !== undefined
      ? { selectionStart: selectionControl.selectionStart }
      : {}),
    ...(selectionControl?.selectionEnd !== null && selectionControl?.selectionEnd !== undefined
      ? { selectionEnd: selectionControl.selectionEnd }
      : {}),
  };
}

export function useWorkspaceFocus(source: string, workspaceElement: RefObject<HTMLElement | null>) {
  const pendingInspectorFocus = useRef<InspectorFocusSnapshot | undefined>(undefined);

  const captureBeforeCommit = useCallback(() => {
    pendingInspectorFocus.current = captureInspectorFocus();
  }, []);

  useLayoutEffect(() => {
    const snapshot = pendingInspectorFocus.current;
    if (!snapshot) return;
    pendingInspectorFocus.current = undefined;
    const inspector = [...document.querySelectorAll<HTMLElement>(".task-inspector")].find(
      (item) => item.getAttribute("aria-label") === snapshot.inspectorLabel,
    );
    const control = inspector?.querySelectorAll<HTMLElement>("input, select, textarea, button")[snapshot.controlIndex];
    if (!control) {
      workspaceElement.current?.focus({ preventScroll: true });
      return;
    }
    control.focus({ preventScroll: true });
    if (
      snapshot.selectionStart !== undefined &&
      snapshot.selectionEnd !== undefined &&
      (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)
    )
      control.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }, [source, workspaceElement]);

  return { captureBeforeCommit };
}
