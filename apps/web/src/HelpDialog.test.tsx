// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HelpDialog } from "./HelpDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("always exposes app address, environment and version under About this app", () => {
  render(<HelpDialog onClose={vi.fn()} />);
  const about = screen.getByText("About this app").closest("details")!;
  expect(about.textContent).toContain(window.location.origin);
  expect(about.textContent).toContain("Environment");
  expect(about.textContent).toContain("Version");
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

it("shows videos for the current diagram with safe external links and a full course index", () => {
  render(<HelpDialog kind="class" onClose={vi.fn()} />);
  const link = screen.getByRole("link", { name: "12 · Class diagrams" });
  expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=pvPYcWLqb_E");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(screen.queryByRole("link", { name: "10 · Sequence diagrams" })).toBeNull();
  expect(screen.getByRole("link", { name: /Video course and practice files/ }).getAttribute("href")).toBe("/training/");
});

it("finds a video by a chapter topic even when no prose or shortcut matches", () => {
  render(<HelpDialog kind="sequence" onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "duration source constructs" } });
  const video = screen.getByRole("link", { name: "10 · Sequence diagrams" });
  expect(video.closest("details")?.open).toBe(true);
  expect(screen.queryByText(/No matching help/)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("1 videos");
});

it("keeps other diagram videos available through All diagrams", () => {
  render(<HelpDialog kind="class" onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "People and workload" } });
  expect(screen.queryByRole("link", { name: "05 · People and workload" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Show help for"), { target: { value: "all" } });
  expect(screen.getByRole("link", { name: "05 · People and workload" })).toBeTruthy();
});

it("links the refreshed demos alongside the full course", () => {
  render(<HelpDialog kind="gantt" onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Show help for"), { target: { value: "all" } });
  const demos = [
    ["Gantt planning, people and history", "eL66XUKBV7Y"],
    ["Diagram outline", "7V6AVE_eLaQ"],
    ["What-if scenarios", "G85LFQaHwbc"],
    ["Progress forecast", "bEn-q79MS7U"],
    ["Task check-in", "Qd7sdOdmSlw"],
    ["Connected WBS and Gantt", "jbpdiGrMu0A"],
  ];
  for (const [title, id] of demos) {
    expect(screen.getByRole("link", { name: `Demo · ${title}` }).getAttribute("href")).toBe(
      `https://www.youtube.com/watch?v=${id}`,
    );
  }
  expect(screen.getByRole("link", { name: "03 · Gantt tasks and progress" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search Help"), { target: { value: "demo" } });
  expect(screen.getAllByRole("link", { name: /^Demo ·/ })).toHaveLength(6);
  expect(screen.queryByRole("link", { name: "03 · Gantt tasks and progress" })).toBeNull();
});
