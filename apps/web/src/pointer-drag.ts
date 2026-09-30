export type WindowPointerDragHandlers = {
  move: (event: PointerEvent) => void;
  /** Called once on pointerup; the gesture should be applied. */
  end: (event: PointerEvent) => void;
  /** Called once on pointercancel or when disposed early; the gesture must be aborted without applying. */
  cancel: () => void;
  /** Register the pointerup/pointercancel listeners in the capture phase. */
  capture?: boolean;
};

/**
 * Tracks a pointer drag through window listeners. Returns a dispose function that
 * removes the listeners and aborts (calls `cancel`) if the drag has not finished yet.
 */
export function trackWindowPointerDrag(
  { move, end, cancel, capture = false }: WindowPointerDragHandlers,
  target: Window = window,
): () => void {
  let finished = false;
  const detach = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", onUp, capture);
    target.removeEventListener("pointercancel", onCancel, capture);
  };
  const onUp = (event: PointerEvent) => {
    if (finished) return;
    finished = true;
    detach();
    end(event);
  };
  const onCancel = () => {
    if (finished) return;
    finished = true;
    detach();
    cancel();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", onUp, capture);
  target.addEventListener("pointercancel", onCancel, capture);
  return onCancel;
}
