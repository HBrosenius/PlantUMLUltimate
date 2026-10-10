/** Programmatic transitions use the same draft review as pointer/keyboard dismissal. */
export function requestSidePanelChange(): boolean {
  return window.dispatchEvent(new Event("before-side-panel-change", { cancelable: true }));
}

export function sidePanelOverlayOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][aria-modal="true"], [role="menu"], [role="listbox"], .color-field-panel, .icon-field-panel, .diagram-outline-dialog:focus-within, .diagram-outline-find, .inline-label-editor',
    ),
  );
}
