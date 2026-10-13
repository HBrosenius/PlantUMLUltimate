// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogFocus } from "./use-dialog-focus";

afterEach(cleanup);

function TestDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div ref={dialog} role="dialog" aria-label="Test dialog" tabIndex={-1}>
      <button type="button" autoFocus>
        First
      </button>
      <button type="button">Last</button>
    </div>
  );
}

describe("useDialogFocus", () => {
  it("finds the same diagram object if rendering replaced the SVG while the dialog was open", () => {
    const preview = document.createElement("section");
    preview.className = "preview";
    preview.innerHTML = '<svg><g tabindex="0" aria-label="Select task" data-task-id="task-1"/></svg>';
    document.body.append(preview);
    preview.querySelector<SVGElement>("g")!.focus();
    const view = render(<TestDialog onClose={vi.fn()} />);
    preview.innerHTML =
      '<svg><g tabindex="0" aria-label="Select task" data-task-id="task-2"/><g tabindex="0" aria-label="Select task" data-task-id="task-1"/></svg>';
    view.unmount();
    expect(preview.querySelector('[data-task-id="task-1"]')).toHaveFocus();
    preview.remove();
  });
  it("returns focus to a diagram SVG object after closing a dialog", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const object = document.createElementNS("http://www.w3.org/2000/svg", "g");
    object.setAttribute("tabindex", "0");
    svg.append(object);
    document.body.append(svg);
    object.focus();
    const view = render(<TestDialog onClose={vi.fn()} />);
    view.unmount();
    expect(object).toHaveFocus();
    svg.remove();
  });

  it("keeps Tab inside the dialog when the focused control becomes disabled", () => {
    const offsetParent = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    render(<TestDialog onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    first.focus();
    (first as HTMLButtonElement).disabled = true;
    fireEvent.keyDown(first, { key: "Tab" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    offsetParent.mockRestore();
  });

  it("lets a dialog control consume Escape without closing its dialog", () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    const first = screen.getByRole("button", { name: "First" });
    first.addEventListener("keydown", (event) => event.preventDefault());
    fireEvent.keyDown(first, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
  it("does not steal focus after the user starts interacting before the animation frame", () => {
    let focusFrame: FrameRequestCallback | undefined;
    const animationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      focusFrame = callback;
      return 1;
    });
    render(<TestDialog onClose={() => undefined} />);
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    focusFrame?.(0);
    expect(last).toHaveFocus();
    animationFrame.mockRestore();
  });

  it("focuses the preferred control, traps Tab, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const restore = document.createElement("button");
    document.body.append(restore);
    restore.focus();
    const offsetParent = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);

    const view = render(<TestDialog onClose={onClose} />);
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(restore).toHaveFocus();

    offsetParent.mockRestore();
    restore.remove();
  });
});
