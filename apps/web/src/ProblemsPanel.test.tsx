// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProblemsPanel } from "./ProblemsPanel";
import { groupDiagnostics } from "./diagnostic-groups";

vi.mock("./diagnostic-groups", () => ({ groupDiagnostics: vi.fn() }));
it("keeps related diagnostics revealable and refreshes groups after source changes", async () => {
  const rootDiagnostic = { from: 0, to: 1, severity: "error" as const, message: "Root error" };
  const related = { from: 2, to: 3, severity: "error" as const, message: "Follow-on error" };
  vi.mocked(groupDiagnostics).mockReturnValue([{ root: rootDiagnostic, related: [related] }]);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onReveal = vi.fn();
  const props = {
    diagramKind: "gantt" as const,
    source: "a\nb",
    diagnostics: [rootDiagnostic, related],
    quickFixes: [],
    onReveal,
    onPreviewFix: vi.fn(),
    onPreviewDiagnostic: vi.fn(),
    onClose: vi.fn(),
  };
  try {
    await act(async () => root.render(<ProblemsPanel {...props} />));
    expect(container.textContent).toContain("Likely root error");
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    details.open = true;
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Related diagnostics"] button')!.click(),
    );
    expect(onReveal).toHaveBeenCalledWith(related);
    vi.mocked(groupDiagnostics).mockReturnValue([]);
    await act(async () => root.render(<ProblemsPanel {...props} source="fixed" diagnostics={[]} />));
    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).toContain("0 parser diagnostics");
  } finally {
    await act(async () => root.unmount());
  }
});

it("offers matching previews beside errors and hides them for read-only documents", async () => {
  const diagnostic = { from: 0, to: 3, severity: "error" as const, message: "Misspelled tag" };
  vi.mocked(groupDiagnostics).mockReturnValue([{ root: diagnostic, related: [] }]);
  const onPreviewDiagnostic = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  const props = {
    diagramKind: "gantt" as const,
    source: "bad",
    diagnostics: [diagnostic],
    quickFixes: [{ from: 0, to: 3, replacement: "@startgantt", message: "Correct tag" }],
    onReveal: vi.fn(),
    onPreviewDiagnostic,
    onPreviewFix: vi.fn(),
    onClose: vi.fn(),
  };
  try {
    await act(async () => root.render(<ProblemsPanel {...props} />));
    const preview = container.querySelector<HTMLButtonElement>('[aria-label="Preview fixes for line 1"]')!;
    expect(preview).not.toBeNull();
    await act(async () => preview.click());
    expect(onPreviewDiagnostic).toHaveBeenCalledWith(diagnostic);
    expect(props.onPreviewFix).not.toHaveBeenCalled();
    expect(props.onReveal).not.toHaveBeenCalled();
    await act(async () => root.render(<ProblemsPanel {...props} readOnly />));
    expect(container.querySelector('[aria-label="Preview fixes for line 1"]')).toBeNull();
    await act(async () => root.render(<ProblemsPanel {...props} quickFixes={[]} />));
    expect(container.querySelector('[aria-label="Preview fixes for line 1"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it("navigates visible diagnostics and previews the focused error with Alt Enter", async () => {
  const first = { from: 0, to: 1, severity: "error" as const, message: "First" };
  const related = { ...first, from: 2, to: 3, message: "Related" };
  const last = { ...first, from: 4, to: 5, message: "Last" };
  vi.mocked(groupDiagnostics).mockReturnValue([
    { root: first, related: [related] },
    { root: last, related: [] },
  ]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onPreviewDiagnostic = vi.fn();
  const props = {
    diagramKind: "gantt" as const,
    source: "a\nb\nc",
    diagnostics: [first, related, last],
    quickFixes: [{ from: 0, to: 1, replacement: "fixed", message: "Fix first" }],
    onReveal: vi.fn(),
    onPreviewDiagnostic,
    onPreviewFix: vi.fn(),
    onClose: vi.fn(),
  };
  const press = async (button: HTMLButtonElement, key: string, altKey = false) => {
    await act(async () =>
      button.dispatchEvent(new KeyboardEvent("keydown", { key, altKey, bubbles: true, cancelable: true })),
    );
  };
  try {
    await act(async () => root.render(<ProblemsPanel {...props} />));
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-problem-diagnostic]");
    buttons[0]!.focus();
    await press(buttons[0]!, "ArrowDown");
    expect(document.activeElement).toBe(buttons[2]);
    await press(buttons[2]!, "ArrowDown");
    expect(document.activeElement).toBe(buttons[2]);
    await press(buttons[2]!, "Home");
    expect(document.activeElement).toBe(buttons[0]);
    container.querySelector("details")!.open = true;
    await press(buttons[0]!, "ArrowDown");
    expect(document.activeElement).toBe(buttons[1]);
    await press(buttons[1]!, "ArrowUp");
    expect(document.activeElement).toBe(buttons[0]);
    await press(buttons[0]!, "Enter", true);
    expect(onPreviewDiagnostic).toHaveBeenCalledWith(first);
    expect(props.onReveal).not.toHaveBeenCalled();
    await press(buttons[0]!, "End");
    expect(document.activeElement).toBe(buttons[2]);
    onPreviewDiagnostic.mockClear();
    await press(buttons[2]!, "Enter", true);
    expect(onPreviewDiagnostic).not.toHaveBeenCalled();
    await act(async () => root.render(<ProblemsPanel {...props} readOnly />));
    await press(buttons[0]!, "Enter", true);
    expect(onPreviewDiagnostic).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
