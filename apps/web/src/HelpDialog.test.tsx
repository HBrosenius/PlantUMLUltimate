// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HelpDialog } from "./HelpDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("prioritizes the current diagram and keeps other diagrams available", () => {
  render(<HelpDialog kind="sequence" onClose={vi.fn()} />);
  const sections = document.querySelectorAll(".help-content > section");
  expect(sections[0]?.getAttribute("aria-label")).toBe("Sequence help");
  expect(screen.queryByText("Add milestone…")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "Add milestone" } });
  expect(screen.getByText(/No matching help/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Show help for"), { target: { value: "all" } });
  expect(screen.getByText("Add milestone…")).toBeTruthy();
  expect(screen.queryByText("Add message…")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "All shortcuts & gestures" }));
  expect(screen.getByText("Add message…")).toBeTruthy();
  expect(screen.getByText(/Drag a node onto another node/)).toBeTruthy();
});

it.each(["MacIntel", "Win32"])("finds shortcuts by typed modifiers on %s", (platform) => {
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
  render(<HelpDialog onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "cmd+shift+p" } });
  expect(screen.getByText("Commands / Command palette").previousElementSibling?.textContent).toBe(
    platform === "MacIntel" ? "⇧⌘P" : "Ctrl+Shift+P",
  );
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "option+m" } });
  expect(screen.getByText("Add milestone…").previousElementSibling?.textContent).toBe(
    platform === "MacIntel" ? "⌥M" : "Alt+M",
  );
});

it("searches prose and reveals matching collapsed guidance", () => {
  const close = vi.fn();
  render(<HelpDialog kind="wbs" onClose={close} />);
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "named diagrams" } });
  expect(screen.getByText("What’s new").closest("details")?.open).toBe(true);
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "subtree" } });
  expect(screen.getByText(/Drag a node onto another node/)).toBeTruthy();
  expect(screen.queryByText("Workspace controls")).toBeNull();
  expect(screen.queryByText(/Use repeated \* markers/)).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
