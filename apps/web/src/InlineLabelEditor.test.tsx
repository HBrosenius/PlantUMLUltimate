// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InlineLabelEditor } from "./InlineLabelEditor";
afterEach(cleanup);
const anchor = { left: 20, bottom: 50 };
it("selects the label, validates drafts and applies only on submission", () => {
  const apply = vi.fn(() => true),
    close = vi.fn();
  render(
    <InlineLabelEditor
      value="Order"
      anchor={anchor}
      current
      validate={(value) => (value.trim() ? undefined : "Label required")}
      onApply={apply}
      onClose={close}
    />,
  );
  const input = screen.getByRole("textbox", { name: "Label" }) as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(input.selectionEnd).toBe(5);
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByRole("alert").textContent).toBe("Label required");
  fireEvent.submit(input.closest("form")!);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Purchase" } });
  fireEvent.submit(input.closest("form")!);
  expect(apply).toHaveBeenCalledWith("Purchase");
  expect(close).toHaveBeenCalledOnce();
});
it("cancels Escape without propagating it to the inspector", () => {
  const close = vi.fn(),
    apply = vi.fn();
  render(
    <InlineLabelEditor
      value="Order"
      anchor={anchor}
      current
      validate={() => undefined}
      onApply={apply}
      onClose={close}
    />,
  );
  const listener = vi.fn();
  document.addEventListener("keydown", listener);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  document.removeEventListener("keydown", listener);
  expect(close).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});
it("blocks a stale draft and cancels when clicking outside", () => {
  const close = vi.fn(),
    apply = vi.fn();
  render(
    <InlineLabelEditor
      value="Order"
      anchor={anchor}
      current={false}
      validate={() => undefined}
      onApply={apply}
      onClose={close}
    />,
  );
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(apply).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("diagram changed");
  fireEvent.pointerDown(document.body);
  expect(close).toHaveBeenCalledOnce();
});
