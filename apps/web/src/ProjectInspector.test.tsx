// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectInspector } from "./ProjectInspector";
import { parseProjectSettings } from "./project-settings";

afterEach(cleanup);

const source = "@startgantt\nProject starts 2026-09-01\n[Build] lasts 2 days\n@endgantt";

describe("ProjectInspector drafts", () => {
  it("preserves edits when the parent reparses unchanged source", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <ProjectInspector settings={parseProjectSettings(source)} onApply={onApply} onClose={onClose} />,
    );
    fireEvent.change(screen.getByLabelText("Diagram title"), { target: { value: "Release roadmap — 2026" } });
    rerender(<ProjectInspector settings={parseProjectSettings(source)} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ title: "Release roadmap — 2026" }));
  });

  it("refreshes the draft when source settings change", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <ProjectInspector settings={parseProjectSettings(source)} onApply={onApply} onClose={onClose} />,
    );
    fireEvent.change(screen.getByLabelText("Diagram title"), { target: { value: "Draft title" } });
    rerender(
      <ProjectInspector
        settings={parseProjectSettings(source.replace("@startgantt", "@startgantt\ntitle Updated source title"))}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    expect((screen.getByLabelText("Diagram title") as HTMLInputElement).value).toBe("Updated source title");
  });
});
