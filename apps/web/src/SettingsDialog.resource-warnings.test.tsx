// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

afterEach(cleanup);
const current = { theme: "system" as const, advancedMode: true, defaultDiagramTheme: "" };

it("applies the warning override only when Settings is submitted", async () => {
  const change = vi.fn();
  const apply = vi.fn();
  render(
    <SettingsDialog
      mode="settings"
      current={current}
      onApply={apply}
      onClose={vi.fn()}
      onResourceWarningsChange={change}
    />,
  );
  const user = userEvent.setup();
  const checkbox = screen.getByRole("checkbox", { name: "Show resource over-allocation warnings" });
  expect(checkbox).toBeChecked();
  await user.click(checkbox);
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(change).toHaveBeenCalledWith(false);
  expect(apply).toHaveBeenCalledWith(current);
});

it("keeps the saved preference when the draft is cancelled", async () => {
  const change = vi.fn();
  const close = vi.fn();
  render(
    <SettingsDialog
      mode="settings"
      current={current}
      onApply={vi.fn()}
      onClose={close}
      resourceWarningsEnabled={false}
      onResourceWarningsChange={change}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Show resource over-allocation warnings" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(change).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
