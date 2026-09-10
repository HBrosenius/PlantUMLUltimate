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
