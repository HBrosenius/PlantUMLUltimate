import { useCallback, type RefObject } from "react";
import type { SemanticSymbolOccurrence } from "../semantic-symbol-provider";

export interface useFocusRestorationInputs {
  lastDiagramFocus: RefObject<HTMLElement | SVGElement | undefined>;
  lastDiagramFocusSelector: RefObject<string | undefined>;
  pendingDiagramFocusSelector: RefObject<string | undefined>;
  renameReturnFocus: RefObject<HTMLElement | SVGElement | undefined>;
  workspaceElement: RefObject<HTMLElement | null>;
}

export function useFocusRestoration({
  lastDiagramFocus,
  lastDiagramFocusSelector,
  pendingDiagramFocusSelector,
  renameReturnFocus,
  workspaceElement,
}: useFocusRestorationInputs) {
  const restorePreviousFocus = useCallback((preferred?: HTMLElement | SVGElement) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const remembered = lastDiagramFocusSelector.current
          ? document.querySelector<HTMLElement | SVGElement>(lastDiagramFocusSelector.current)
          : undefined;
        const target = preferred?.isConnected ? preferred : (remembered ?? lastDiagramFocus.current);
        if (target?.isConnected) target.focus({ preventScroll: true });
        else workspaceElement.current?.focus({ preventScroll: true });
      }),
    );
  }, []);
  const restoreRenamedDiagramFocus = useCallback(
    (kind: SemanticSymbolOccurrence["kind"], key: string | undefined) => {
      if (!key || !renameReturnFocus.current?.closest(".diagram")) {
        restorePreviousFocus(renameReturnFocus.current);
        return;
      }
      const attribute =
        kind === "task"
          ? "data-task-id"
          : kind === "participant"
            ? "data-sequence-participant-id"
            : kind === "actor" || kind === "usecase" || kind === "usecase-package"
              ? "data-usecase-object-id"
              : kind === "class-entity" || kind === "class-package"
                ? "data-class-object-id"
                : kind === "activity-action" || kind === "activity-partition"
                  ? "data-activity-object-id"
                  : kind === "wbs-node"
                    ? "data-wbs-node-id"
                    : undefined;
      const selector = attribute
        ? `[${attribute}="${CSS.escape(key)}"][tabindex], [${attribute}="${CSS.escape(key)}"] [tabindex]`
        : undefined;
      pendingDiagramFocusSelector.current = selector;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          const target = selector ? document.querySelector<HTMLElement | SVGElement>(selector) : undefined;
          if (target) {
            pendingDiagramFocusSelector.current = undefined;
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = selector;
            target.focus({ preventScroll: true });
          } else restorePreviousFocus();
        }),
      );
    },
    [restorePreviousFocus],
  );

  return { restorePreviousFocus, restoreRenamedDiagramFocus };
}
