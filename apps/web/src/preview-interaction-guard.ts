import type { SyntheticEvent, KeyboardEvent } from "react";

/** Old positional IDs must never edit a different object in the current source. Navigation remains available. */
export function previewInteractionGuard(enabled: boolean) {
  const blockObject = (event: SyntheticEvent) => {
    if (enabled || !(event.target instanceof Element) || !event.target.closest('[role="button"], [data-draggable]'))
      return;
    event.preventDefault();
    event.stopPropagation();
  };
  return {
    "aria-disabled": !enabled,
    onClickCapture: blockObject,
    onDoubleClickCapture: blockObject,
    onPointerDownCapture: blockObject,
    onKeyDownCapture: (event: KeyboardEvent) => {
      if (!enabled && (["F2", "Delete", "Backspace", "Enter", " "].includes(event.key) || event.altKey))
        blockObject(event);
    },
  };
}
